def calculate_safety_score(spot):
    """
    Formula:
    police_factor = max(0, 10 - police_distance)
    score = (0.3 * lighting + 0.3 * crowd_density + 0.2 * cctv + 0.2 * police_factor)
    Normalize score to 0-100.
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
    
    return round(normalized_score)
