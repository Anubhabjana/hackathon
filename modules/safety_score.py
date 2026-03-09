from modules.geo_utils import haversine_distance

def calculate_safety_score(spot, incidents=None):
    """
    Formula:
    police_factor = max(0, 10 - police_distance)
    score = (0.3 * lighting + 0.3 * crowd_density + 0.2 * cctv + 0.2 * police_factor)
    Normalize score to 0-100.
    Subtract points for recent incidents within 500m.
    Return rounded value.
    """
    try:
        lighting = float(spot['lighting'])
        crowd_density = float(spot['crowd_density'])
        cctv = float(spot['cctv'])
        police_distance = float(spot['police_distance'])
    except (KeyError, ValueError, TypeError):
        return 0
        
    police_factor = max(0, 10 - police_distance)
    
    # Calculate score out of 10
    raw_score = (
        0.3 * lighting +
        0.3 * crowd_density +
        0.2 * cctv +
        0.2 * police_factor
    )
    
    # Normalize to 0-100
    normalized_score = raw_score * 10
    
    # Calculate incident penalty
    penalty = 0
    if incidents:
        spot_lat = spot.get('latitude')
        spot_lng = spot.get('longitude')
        if spot_lat is not None and spot_lng is not None:
            for incident in incidents:
                dist = haversine_distance(spot_lat, spot_lng, incident['latitude'], incident['longitude'])
                if dist <= 0.5: # 500 meters
                    penalty += 15
            
    from datetime import datetime
    
    # Time-based penalty: 10 PM to 5 AM is considered higher risk
    hour = datetime.now().hour
    if hour >= 22 or hour < 5:
        penalty += 15

    # Apply penalty with a floor at 0
    final_score = max(0, normalized_score - penalty)
    
    return round(final_score)
