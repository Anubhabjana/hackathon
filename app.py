import os
import requests
import sqlite3
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_caching import Cache

from config import Config
from database import init_db, close_db, get_db
from modules.safety_score import calculate_safety_score
from modules.geo_utils import haversine_distance

app = Flask(__name__, static_folder='.', static_url_path='')
app.config.from_object(Config)

# Enable CORS 
CORS(app)

# Initialize Cache
cache = Cache(config={'CACHE_TYPE': 'SimpleCache', 'CACHE_DEFAULT_TIMEOUT': 30})
cache.init_app(app)

# Register teardown function
app.teardown_appcontext(close_db)

@app.route('/')
def index():
    # Serve the main frontend application
    return app.send_static_file('index.html')

@app.route('/api/safe-spots', methods=['GET'])
@cache.cached(timeout=30)
def get_all_safe_spots():
    """
    Returns all safe spots with safety_score included
    """
    db = get_db()
    try:
        # Fetch active incidents
        cursor = db.execute('''
            SELECT * FROM incident_reports 
            WHERE expiry > datetime('now')
        ''')
        incidents = [dict(row) for row in cursor.fetchall()]

        cursor = db.execute('SELECT * FROM safe_spots')
        rows = cursor.fetchall()
        
        spots = []
        for row in rows:
            spot_dict = dict(row)
            spot_dict['safety_score'] = calculate_safety_score(spot_dict, incidents)
            spots.append(spot_dict)
            
        return jsonify(spots), 200
        
    except sqlite3.Error as e:
        app.logger.error(f"Database error in get_all_safe_spots: {e}")
        return jsonify({"error": "Failed to retrieve safe spots from database"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in get_all_safe_spots: {e}")
        return jsonify({"error": "An unexpected server error occurred"}), 500

@app.route('/api/nearby', methods=['GET'])
def get_nearby_spots():
    """
    Calculate distance from user to each spot within a default 5km radius.
    Return sorted list by composite score merging Safety Score and Distance proximity.
    """
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    
    if lat is None or lng is None:
        return jsonify({"error": "Query parameters 'lat' and 'lng' are required."}), 400
        
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return jsonify({"error": "Invalid latitude or longitude range"}), 400
        
    radius = request.args.get('radius', default=5.0, type=float) # Default to 5km
    
    db = get_db()
    try:
        # Fetch active incidents
        cursor = db.execute('''
            SELECT * FROM incident_reports 
            WHERE expiry > datetime('now')
        ''')
        incidents = [dict(row) for row in cursor.fetchall()]

        cursor = db.execute('SELECT * FROM safe_spots')
        rows = cursor.fetchall()
        
        nearby_spots = []
        for row in rows:
            spot_dict = dict(row)
            dist = haversine_distance(lat, lng, spot_dict['latitude'], spot_dict['longitude'])
            
            if dist <= radius:
                spot_dict['safety_score'] = calculate_safety_score(spot_dict, incidents)
                spot_dict['distance'] = round(dist, 2)
                
                # Composite score
                # Normalize distance inversely: Closer is better (e.g., max 5km)
                # Ensure we don't divide by absolutely zero distance
                safe_dist = max(0.1, dist) 
                
                # Distance normalization factor (1/1 if 1km out, 1/5 if 5km out)
                # So a very close location gets a massive boost
                dist_normalized = 1 / safe_dist
                
                composite_score = (
                    0.7 * spot_dict['safety_score'] + 
                    0.3 * (dist_normalized * 100) # Scaling up the distance weight matching 0-100 rating roughly
                )
                spot_dict['composite_score'] = round(composite_score, 2)
                
                nearby_spots.append(spot_dict)
            
        # Sort by best composite score descending
        nearby_spots.sort(key=lambda x: x['composite_score'], reverse=True)
            
        return jsonify(nearby_spots), 200
        
    except sqlite3.Error as e:
        app.logger.error(f"Database error in get_nearby_spots: {e}")
        return jsonify({"error": "Failed to calculate nearby spots from database"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in get_nearby_spots: {e}")
        return jsonify({"error": "An unexpected server error occurred"}), 500

@app.route('/api/safe-spots', methods=['POST'])
def add_safe_spot():
    """Add new safe spot. Validate all inputs."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400
        
    required_fields = ['name', 'latitude', 'longitude', 'lighting', 'crowd_density', 'cctv', 'police_distance']
    if not all(field in data for field in required_fields):
        return jsonify({"error": f"Missing required fields. Required: {required_fields}"}), 400
        
    try:
        # Validate types and ranges
        name = str(data['name'])
        lat = float(data['latitude'])
        lng = float(data['longitude'])
        lighting = int(data['lighting'])
        crowd_density = int(data['crowd_density'])
        cctv = int(data['cctv'])
        police_distance = float(data['police_distance'])
        
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return jsonify({"error": "Invalid latitude or longitude range"}), 400
            
        if not (1 <= lighting <= 10 and 1 <= crowd_density <= 10 and 1 <= cctv <= 10):
            return jsonify({"error": "lighting, crowd_density, and cctv must be between 1 and 10"}), 400
            
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid data types provided."}), 400
        
    db = get_db()
    try:
        cursor = db.execute('''
            INSERT INTO safe_spots (name, latitude, longitude, lighting, crowd_density, cctv, police_distance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (name, lat, lng, lighting, crowd_density, cctv, police_distance))
        db.commit()
        return jsonify({"message": "Safe spot added successfully", "id": cursor.lastrowid}), 201
        
    except sqlite3.Error as e:
        app.logger.error(f"Database error in add_safe_spot: {e}")
        return jsonify({"error": "Failed to save the safe spot to the database"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in add_safe_spot: {e}")
        return jsonify({"error": "An unexpected server error occurred while adding"}), 500

@app.route('/api/emergency', methods=['POST'])
def trigger_emergency():
    """Store entry in emergency_logs"""
    data = request.get_json()
    if not data or 'latitude' not in data or 'longitude' not in data:
        return jsonify({"error": "Missing 'latitude' or 'longitude' in POST body"}), 400
        
    try:
        lat = float(data['latitude'])
        lng = float(data['longitude'])
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return jsonify({"error": "Invalid latitude or longitude range"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid latitude/longitude types"}), 400
        
    db = get_db()
    try:
        cursor = db.execute('INSERT INTO emergency_logs (latitude, longitude) VALUES (?, ?)', (lat, lng))
        db.commit()
        return jsonify({"message": "Emergency logged successfully", "log_id": cursor.lastrowid}), 201
    except sqlite3.Error as e:
        app.logger.error(f"Database error in trigger_emergency: {e}")
        return jsonify({"error": "Failed to log emergency in database"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in trigger_emergency: {e}")
        return jsonify({"error": "An unexpected server error occurred while logging the emergency"}), 500

@app.route('/api/incidents', methods=['GET'])
def get_incidents():
    """Get active incident reports from the last 24 hours."""
    db = get_db()
    try:
        cursor = db.execute('''
            SELECT * FROM incident_reports 
            WHERE expiry > datetime('now')
        ''')
        rows = cursor.fetchall()
        incidents = [dict(row) for row in rows]
        return jsonify(incidents), 200
    except sqlite3.Error as e:
        app.logger.error(f"Database error in get_incidents: {e}")
        return jsonify({"error": "Failed to retrieve incidents"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in get_incidents: {e}")
        return jsonify({"error": "An unexpected server error occurred"}), 500

@app.route('/api/incidents', methods=['POST'])
def add_incident():
    """Submit a new crowdsourced incident report"""
    data = request.get_json()
    if not data or not all(k in data for k in ('latitude', 'longitude', 'type')):
        return jsonify({"error": "Missing latitude, longitude, or type"}), 400
        
    try:
        lat = float(data['latitude'])
        lng = float(data['longitude'])
        incident_type = str(data['type'])
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return jsonify({"error": "Invalid latitude or longitude range"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid data format"}), 400
        
    db = get_db()
    try:
        cursor = db.execute('''
            INSERT INTO incident_reports (latitude, longitude, type) 
            VALUES (?, ?, ?)
        ''', (lat, lng, incident_type))
        db.commit()
        return jsonify({"message": "Incident logged successfully", "id": cursor.lastrowid}), 201
    except sqlite3.Error as e:
        app.logger.error(f"Database error in add_incident: {e}")
        return jsonify({"error": "Failed to log incident"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in add_incident: {e}")
        return jsonify({"error": "An unexpected server error occurred"}), 500

if __name__ == '__main__':
    # Initialize the database on startup
    init_db(app)
    
    # Insert some dummy safe spots for testing if the table is empty
    with app.app_context():
        db = get_db()
        count = db.execute('SELECT COUNT(*) FROM safe_spots').fetchone()[0]
        if count == 0:
            print("Populating dummy data...")
            dummy_data = [
                ('Women Police Station', 22.5726, 88.3639, 10, 5, 8, 0.0),
                ('24/7 Pharmacy', 22.58, 88.40, 9, 3, 10, 1.2),
                ('Metro Station Transit', 22.56, 88.35, 8, 8, 9, 0.5)
            ]
            db.executemany('''
                INSERT INTO safe_spots (name, latitude, longitude, lighting, crowd_density, cctv, police_distance)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', dummy_data)
            db.commit()
            
    print("Startup complete. Running server...")
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
