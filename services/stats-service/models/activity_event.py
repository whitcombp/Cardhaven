from .api_event import db
from datetime import datetime
import json


class ActivityEvent(db.Model):
    __tablename__ = "activity_events"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    username = db.Column(db.String(80), nullable=False)
    event_type = db.Column(db.String(64), nullable=False)
    payload = db.Column(db.Text, nullable=False)  # stored as JSON string
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.username,
            "event_type": self.event_type,
            "payload": json.loads(self.payload),
            "timestamp": self.timestamp.isoformat(),
        }
