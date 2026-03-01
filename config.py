import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'safe-room-secret-key-123')
    # Path to the SQLite database
    DATABASE_URI = os.path.join(os.path.dirname(__file__), 'saferoom.db')
