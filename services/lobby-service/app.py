import sys

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_sock import Sock
import jwt, os, json, threading, uuid
from datetime import timezone, datetime
from kafka import KafkaProducer, KafkaConsumer
import uuid

app = Flask(__name__)
CORS(app, origins=["http://localhost", "http://localhost:80"])
sock = Sock(app)

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
KAFKA_BROKER = os.environ.get("KAFKA_BROKER", "kafka:9092")
TOPIC = "lobby-events"

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BROKER,
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
)

# ===============================
# COLOR POOL — same order as lobby.js frontend
# ===============================

COLOR_POOL = [
    "#ff6f61",  # coral
    "#4fc3f7",  # sky blue
    "#81c784",  # sage green
    "#ffb74d",  # amber
    "#ce93d8",  # lavender
    "#f06292",  # pink
    "#4db6ac",  # teal
    "#fff176",  # yellow
]

# ===============================
# ROOM STATE
# room_id -> {
#   "connections": { username: ws },
#   "colors":      { username: hex },
#   "color_index": int
# }
# ===============================

rooms: dict[str, dict] = {}
rooms_lock = threading.Lock()


def get_room(room_id):
    """Get or create room state dict. Must be called under rooms_lock."""
    if room_id not in rooms:
        rooms[room_id] = {"connections": {}, "colors": {}, "color_index": 0}
    return rooms[room_id]


def assign_color(room, username):
    """Assign next available color to username if not already assigned."""
    if username not in room["colors"]:
        idx = room["color_index"] % len(COLOR_POOL)
        room["colors"][username] = COLOR_POOL[idx]
        room["color_index"] += 1
    return room["colors"][username]


def broadcast(room_id, message: dict, exclude_username=None):
    """Send message to all connections in a room, optionally skipping one user."""
    with rooms_lock:
        room = rooms.get(room_id)
        if not room:
            return
        conns = list(room["connections"].items())  # [(conn_id, (uname, ws))]

    dead = []
    for conn_id, (uname, ws) in conns:
        if uname == exclude_username:
            continue
        try:
            ws.send(json.dumps(message))
        except Exception:
            dead.append(conn_id)

    if dead:
        with rooms_lock:
            room = rooms.get(room_id)
            if room:
                for conn_id in dead:
                    room["connections"].pop(conn_id, None)


# ===============================
# HELPERS
# ===============================


def get_current_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None


# ===============================
# REST ROUTES
# ===============================


@app.route("/")
def lobby_page():
    return send_from_directory("/app/frontend", "lobby.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory("/app/frontend", filename)


@app.route("/lobby/create", methods=["POST"])
def create_lobby():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    room_id = str(uuid.uuid4())[:8].upper()
    with rooms_lock:
        get_room(room_id)  # initialise

    return jsonify({"room_id": room_id}), 201


@app.route("/lobby/<room_id>/action", methods=["POST"])
def send_action(room_id):
    """REST fallback for sending a card action."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    event = _build_event(room_id, user, data)
    producer.send(TOPIC, value=event)
    producer.flush()
    return jsonify({"status": "queued"}), 202


def _build_event(room_id, user, data):
    return {
        "room_id": room_id,
        "user_id": user["user_id"],
        "username": user["username"],
        "type": data.get("action", "cards_played"),
        "action": data.get("action"),
        "card_id": data.get("card_id"),
        "payload": data.get("payload", {}),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ===============================
# WEBSOCKET
# ===============================


@sock.route("/lobby/<room_id>/ws")
def lobby_ws(ws, room_id):
    conn_id = str(uuid.uuid4())
    # --- Auth handshake ---
    try:
        auth_raw = ws.receive(timeout=5)
        auth_data = json.loads(auth_raw)
        user = jwt.decode(auth_data["token"], JWT_SECRET, algorithms=["HS256"])
    except Exception:
        ws.send(json.dumps({"error": "Unauthorized"}))
        ws.close()
        return

    uname = user["username"]
    room_id = room_id.upper()

    with rooms_lock:
        room = get_room(room_id)
        color = assign_color(room, uname)
        room["connections"][conn_id] = (
            uname,
            ws,
        )  # key by conn_id, store (username, ws)
        players = [
            {"username": u, "color": room["colors"][u]}
            for _, (u, _) in room["connections"].items()
        ]

    # Confirm join to this client — include their color + full player list
    ws.send(
        json.dumps(
            {
                "type": "joined",
                "room_id": room_id,
                "username": uname,
                "color": color,
                "players": players,
            }
        )
    )

    # Notify everyone else
    broadcast(
        room_id,
        {
            "type": "player_joined",
            "username": uname,
            "color": color,
        },
        exclude_username=uname,
    )

    # --- Message loop ---
    try:
        while True:
            msg = ws.receive(timeout=300)
            if msg is None:
                break

            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                continue

            if data.get("action") == "ping":
                continue  # keepalive, don't publish to Kafka

            event = {
                "room_id": room_id,
                "user_id": user["user_id"],
                "username": uname,
                "conn_id": conn_id,
                "color": color,
                "type": data.get("action", "cards_played"),
                "action": data.get("action"),
                "card_id": data.get("card_id"),
                "payload": data.get("payload", {}),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            producer.send(TOPIC, value=event)

    finally:
        with rooms_lock:
            room = rooms.get(room_id)
            if room:
                room["connections"].pop(conn_id, None)

        broadcast(room_id, {"type": "player_left", "username": uname})


# ===============================
# KAFKA CONSUMER (background thread)
# Each instance gets a unique group_id so every instance
# receives every message and can fan-out to its local WS connections.
# ===============================


def kafka_consumer_thread():
    group_id = f"lobby-broadcast-{uuid.uuid4()}"
    consumer = KafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BROKER,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        group_id=group_id,
        auto_offset_reset="latest",
    )

    for message in consumer:
        event = message.value
        room_id = event.get("room_id", "").upper()
        sender_conn_id = event.get("conn_id")

        if not room_id:
            continue

        with rooms_lock:
            conns = list(rooms.get(room_id, {}).get("connections", {}).items())

        dead = []
        for conn_id, (uname, ws) in conns:
            # Don't send to since they already know what they played
            if conn_id == sender_conn_id:
                continue
            try:
                ws.send(json.dumps(event))
            except Exception:
                dead.append(conn_id)

        if dead:
            with rooms_lock:
                room = rooms.get(room_id)
                if room:
                    for conn_id in dead:
                        room["connections"].pop(conn_id, None)


consumer_thread = threading.Thread(target=kafka_consumer_thread, daemon=True)
consumer_thread.start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5003, debug=False)
