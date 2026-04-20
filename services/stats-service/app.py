from flask import Flask, request, jsonify
from models.api_event import db, ApiEvent
from models.activity_event import ActivityEvent
from sqlalchemy import func
import os
import json
import jwt
from datetime import timezone, datetime

app = Flask(__name__)

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "postgresql://stats_user:stats_pass@stats-db:5432/stats_db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")

db.init_app(app)

with app.app_context():
    db.create_all()

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


def require_admin(f):
    from functools import wraps

    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)

    return decorated


# ===============================
# LOGGING ROUTES
# ===============================


@app.route("/log/api", methods=["POST"])
def log_api():
    data = request.get_json()
    event = ApiEvent(
        user_id=data["user_id"],
        username=data["username"],
        endpoint=data["endpoint"],
        method=data["method"],
        status_code=data["status_code"],
        latency_ms=data["latency_ms"],
    )
    db.session.add(event)
    db.session.commit()
    return jsonify({"status": "ok"}), 201


@app.route("/log/activity", methods=["POST"])
def log_activity():
    data = request.get_json()
    event = ActivityEvent(
        user_id=data["user_id"],
        username=data["username"],
        event_type=data["event_type"],
        payload=json.dumps(data["payload"]),
    )
    db.session.add(event)
    db.session.commit()
    return jsonify({"status": "ok"}), 201


# ===============================
# ADMIN ROUTES
# ===============================


@app.route("/admin/stats", methods=["GET"])
@require_admin
def admin_stats():
    # Per-user, per-endpoint hit counts and average latency
    results = (
        db.session.query(
            ApiEvent.username,
            ApiEvent.endpoint,
            ApiEvent.method,
            func.count(ApiEvent.id).label("hits"),
            func.avg(ApiEvent.latency_ms).label("avg_latency_ms"),
            func.min(ApiEvent.latency_ms).label("min_latency_ms"),
            func.max(ApiEvent.latency_ms).label("max_latency_ms"),
        )
        .group_by(ApiEvent.username, ApiEvent.endpoint, ApiEvent.method)
        .order_by(ApiEvent.username, ApiEvent.endpoint)
        .all()
    )

    stats = [
        {
            "username": r.username,
            "endpoint": r.endpoint,
            "method": r.method,
            "hits": r.hits,
            "avg_latency_ms": round(r.avg_latency_ms, 2),
            "min_latency_ms": round(r.min_latency_ms, 2),
            "max_latency_ms": round(r.max_latency_ms, 2),
        }
        for r in results
    ]

    return jsonify(stats), 200


@app.route("/admin/activity", methods=["GET"])
@require_admin
def admin_activity():
    # Optional filters
    username = request.args.get("username")
    event_type = request.args.get("event_type")
    limit = int(request.args.get("limit", 100))

    query = db.session.query(ActivityEvent)

    if username:
        query = query.filter(ActivityEvent.username == username)
    if event_type:
        query = query.filter(ActivityEvent.event_type == event_type)

    events = query.order_by(ActivityEvent.timestamp.desc()).limit(limit).all()

    # Per-user activity summary
    summary = (
        db.session.query(
            ActivityEvent.username,
            ActivityEvent.event_type,
            func.count(ActivityEvent.id).label("count"),
        )
        .group_by(ActivityEvent.username, ActivityEvent.event_type)
        .order_by(ActivityEvent.username, ActivityEvent.event_type)
        .all()
    )

    return (
        jsonify(
            {
                "summary": [
                    {
                        "username": r.username,
                        "event_type": r.event_type,
                        "count": r.count,
                    }
                    for r in summary
                ],
                "recent_events": [e.to_dict() for e in events],
            }
        ),
        200,
    )


# ===============================
# INIT
# ===============================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=False)
