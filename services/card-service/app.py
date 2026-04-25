from flask import Flask, request, jsonify, send_from_directory
from middleware.auth import require_auth
import os
import json
import time
import requests

app = Flask(__name__)

STATS_SERVICE_URL = os.environ.get("STATS_SERVICE_URL", "http://stats-service:5002")
AUTH_SERVICE_URL = os.environ.get("AUTH_SERVICE_URL", "http://auth-service:5001")
LOBBY_SERVICE_URL = os.environ.get("LOBBY_SERVICE_URL", "http://lobby-service:5003")
FRONTEND = "/app/frontend"
IMAGES = "/app/images"

# ===============================
# STATS HELPERS
# ===============================


def log_api_event(status_code, latency_ms):
    """Fire and forget, never block the main request"""
    try:
        requests.post(
            f"{STATS_SERVICE_URL}/log/api",
            json={
                "user_id": request.user_id,
                "username": request.username,
                "endpoint": request.path,
                "method": request.method,
                "status_code": status_code,
                "latency_ms": latency_ms,
            },
            timeout=0.5,
        )
    except Exception:
        pass  # stats logging should never take down card-service


def log_activity_event(event_type, payload):
    try:
        requests.post(
            f"{STATS_SERVICE_URL}/log/activity",
            json={
                "user_id": request.user_id,
                "username": request.username,
                "event_type": event_type,
                "payload": payload,
            },
            timeout=0.5,
        )
    except Exception:
        pass


# ===============================
# API MIDDLEWARE
# ===============================


@app.before_request
def start_timer():
    request.start_time = time.time()


# ===============================
# STATIC FILES
# ===============================


@app.route("/")
def index():
    return send_from_directory(FRONTEND, "lobby.html")


@app.route("/lobby.html")
def lobby_page():
    return send_from_directory(FRONTEND, "lobby.html")


@app.route("/login.html")
def login_page():
    return send_from_directory(FRONTEND, "login.html")


@app.route("/card_pages/<path:filename>")
def card_pages(filename):
    return send_from_directory(FRONTEND + "/card_pages", filename)


@app.route("/flip_deck")
def flip_deck_page():
    return send_from_directory(FRONTEND + "/flip_deck", "index.html")


@app.route("/flip_deck/<path:filename>")
def flip_deck_static(filename):
    return send_from_directory(FRONTEND + "/flip_deck", filename)


@app.route("/images/<path:filename>")
def images(filename):
    return send_from_directory(IMAGES, filename)


# ===============================
# PROXY ROUTES
# ===============================


@app.route("/lobby/create", methods=["POST"])
def lobby_create():
    res = requests.post(
        f"{LOBBY_SERVICE_URL}/lobby/create",
        json=request.get_json(),
        headers={"Authorization": request.headers.get("Authorization", "")},
    )
    return jsonify(res.json()), res.status_code


# ===============================
# AUTH ROUTES
# ===============================


@app.route("/auth/login", methods=["POST"])
def auth_login():
    res = requests.post(f"{AUTH_SERVICE_URL}/login", json=request.get_json())
    return jsonify(res.json()), res.status_code


@app.route("/auth/register", methods=["POST"])
def auth_register():
    res = requests.post(f"{AUTH_SERVICE_URL}/register", json=request.get_json())
    return jsonify(res.json()), res.status_code


# ===============================
# API ROUTES
# ===============================


@app.route("/characters")
@require_auth
def characters():
    start = request.start_time
    path = os.path.join(IMAGES, "character_images")
    chars = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]
    latency = (time.time() - start) * 1000
    log_api_event(200, latency)
    return jsonify(sorted(chars)), 200


@app.route("/cards")
@require_auth
def cards():
    start = request.start_time
    character = request.args.get("character", "plagueherald")

    favorites = set()
    if os.path.exists("favorites.txt"):
        with open("favorites.txt", "r") as f:
            [favorites.add(line.strip().lower()) for line in f]

    path = os.path.join(IMAGES, "character_images", character, "ability_cards")
    cards_json = []

    dir_walk = os.walk(path)
    levels = next(dir_walk)[1]
    for dir, level in zip(dir_walk, levels):
        for filename in dir[2]:
            name = filename.split(".")[0].replace("-", " ")
            cards_json.append(
                {
                    "filename": os.path.join(dir[0], filename)
                    .replace("\\", "/")
                    .replace("/app/images/", "/images/"),
                    "name": name + level,
                    "level": level,
                    "favorite": name in favorites,
                }
            )

    latency = (time.time() - start) * 1000
    log_api_event(200, latency)
    log_activity_event("character_loaded", {"character": character})
    return jsonify(cards_json), 200


@app.route("/flips")
@require_auth
def flips():
    start = request.start_time
    character = request.args.get("character", "plagueherald")

    modifiers_path = os.path.join(
        IMAGES, "character_images", character, "attack_modifiers"
    )
    modifiers = [
        os.path.join(modifiers_path, m)
        .replace("\\", "/")
        .replace("/app/images/", "/images/")
        for m in os.listdir(modifiers_path)
    ]
    flips_json = [{"card": m, "reshuffle": "x2" in m or "x0" in m} for m in modifiers]

    latency = (time.time() - start) * 1000
    log_api_event(200, latency)
    return jsonify(flips_json), 200


@app.route("/activity", methods=["POST"])
@require_auth
def activity():
    """Receives activity events from the frontend and forwards to stats-service"""
    start = request.start_time
    data = request.get_json()

    log_activity_event(data["event_type"], data["payload"])

    latency = (time.time() - start) * 1000
    log_api_event(201, latency)
    return jsonify({"status": "ok"}), 201


# ===============================
# INIT
# ===============================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
