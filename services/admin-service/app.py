from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
import jwt, os, requests
from datetime import datetime, timedelta, timezone
from functools import wraps

app = Flask(__name__, static_folder="templates")
CORS(app)

JWT_SECRET = os.environ.get("JWT_SECRET")
STATS_URL = os.environ.get("STATS_SERVICE_URL", "http://stats-service:5002")


# ===============================
# AUTH HELPERS
# ===============================


def make_admin_token(username: str) -> str:
    payload = {
        "username": username,
        "admin": True,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_admin_token(token: str):
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if not token:
            return jsonify({"error": "Unauthorized"}), 401
        try:
            payload = decode_admin_token(token)
            if not payload.get("is_admin"):
                raise ValueError("not admin")
        except Exception as e:
            print("JWT ERROR:", e)
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)

    return decorated


# ===============================
# PAGES
# ===============================


@app.route("/admin_panel")
def admin_panel():
    return send_from_directory("templates", "admin.html")


# ===============================
# DATA PROXY ROUTES
# These forward to stats-service with a service-level JWT
# so stats-service require_admin is satisfied.
# ===============================


def _stats_headers(admin_token: str):
    """Pass the admin token through to stats-service."""
    return {"Authorization": f"Bearer {admin_token}"}


def _get_token_from_request():
    return request.headers.get("Authorization", "").removeprefix("Bearer ")


@app.route("/admin/data/stats")
@require_admin
def proxy_stats():
    token = _get_token_from_request()
    # stats-service /admin/stats only checks valid JWT, reuse admin token
    r = requests.get(
        f"{STATS_URL}/admin/stats", headers=_stats_headers(token), timeout=5
    )
    return jsonify(r.json()), r.status_code


@app.route("/admin/data/activity")
@require_admin
def proxy_activity():
    token = _get_token_from_request()
    params = {k: v for k, v in request.args.items()}  # forward filters
    r = requests.get(
        f"{STATS_URL}/admin/activity",
        headers=_stats_headers(token),
        params=params,
        timeout=5,
    )
    return jsonify(r.json()), r.status_code


@app.route("/admin/data/users")
@require_admin
def proxy_users():
    """Derive unique user list from activity summary."""
    token = _get_token_from_request()
    r = requests.get(
        f"{STATS_URL}/admin/activity", headers=_stats_headers(token), timeout=5
    )
    if not r.ok:
        return jsonify({"error": "upstream error"}), 502
    data = r.json()
    users = sorted({row["username"] for row in data.get("summary", [])})
    return jsonify({"users": users}), 200


@app.route("/admin/stats")
@require_admin
def proxy_stats_short():
    token = _get_token_from_request()
    r = requests.get(
        f"{STATS_URL}/admin/stats", headers=_stats_headers(token), timeout=5
    )
    return jsonify(r.json()), r.status_code


@app.route("/admin/activity")
@require_admin
def proxy_activity_short():
    token = _get_token_from_request()
    params = {k: v for k, v in request.args.items()}
    r = requests.get(
        f"{STATS_URL}/admin/activity",
        headers=_stats_headers(token),
        params=params,
        timeout=5,
    )
    return jsonify(r.json()), r.status_code


# ===============================
# INIT
# ===============================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5004, debug=False)
