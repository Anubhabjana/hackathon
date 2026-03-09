import sqlite3
from flask import g
from config import Config

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(Config.DATABASE_URI)
        db.row_factory = sqlite3.Row
    return db

def close_db(e=None):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db(app):
    with app.app_context():
        db = get_db()
        
        # 1. safe_spots table
        db.execute('''
            CREATE TABLE IF NOT EXISTS safe_spots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                lighting INTEGER CHECK(lighting >= 1 AND lighting <= 10),
                crowd_density INTEGER CHECK(crowd_density >= 1 AND crowd_density <= 10),
                cctv INTEGER CHECK(cctv >= 1 AND cctv <= 10),
                police_distance REAL
            )
        ''')
        
        # 3. incident_reports table
        db.execute('''
            CREATE TABLE IF NOT EXISTS incident_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                type TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiry DATETIME DEFAULT (datetime('now', '+24 hours'))
            )
        ''')
        
        db.commit()
