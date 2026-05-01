from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from models.user import db, User
import jwt
import os
from datetime import datetime, timedelta, timezone

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
JWT_EXPIRY_HOURS = 24


# ===============================
# ADMIN SEEDING
# ===============================


def _seed_admins():
    """
    Reads ADMIN_USERS from env — comma-separated username:password pairs.
    Example: ADMIN_USERS=alice:pass1,bob:pass2
    Creates or updates these accounts with is_admin=True on every startup.
    """
    admin_users_raw = os.environ.get("ADMIN_USERS", "")
    if not admin_users_raw.strip():
        return

    for entry in admin_users_raw.split(","):
        entry = entry.strip()
        if ":" not in entry:
            continue
        username, password = entry.split(":", 1)
        username = username.strip()
        password = password.strip()
        if not username or not password:
            continue

        existing = User.query.filter_by(username=username).first()
        if existing:
            # Update password and ensure admin flag is set
            existing.password_hash = generate_password_hash(password)
            existing.is_admin = True
        else:
            user = User(
                username=username,
                password_hash=generate_password_hash(password),
                is_admin=True,
            )
            db.session.add(user)

    db.session.commit()


app = Flask(__name__)

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "postgresql://auth_user:auth_pass@auth-db:5432/auth_db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

with app.app_context():
    db.create_all()
    _seed_admins()


# ===============================
# HELPERS
# ===============================


def make_token(user):
    payload = {
        "user_id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


# ===============================
# ROUTES
# ===============================


@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409

    # Prevent registering as admin username
    user = User(
        username=username,
        password_hash=generate_password_hash(password),
        is_admin=False,
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({"token": make_token(user), "user": user.to_dict()}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    user = User.query.filter_by(username=username).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid username or password"}), 401

    return jsonify({"token": make_token(user), "user": user.to_dict()}), 200


@app.route("/validate", methods=["GET"])
def validate():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Missing token"}), 401

    token = auth_header.split(" ", 1)[1]

    try:
        payload = decode_token(token)
        return (
            jsonify(
                {
                    "user_id": payload["user_id"],
                    "username": payload["username"],
                    "is_admin": payload.get("is_admin", False),
                }
            ),
            200,
        )
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401


@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200


# ===============================
# INIT
# ===============================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
