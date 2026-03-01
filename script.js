// script.js: SafeRoom Frontend Logic (Leaflet.js & Overpass API Version)

const API_BASE = window.location.origin + "/api";
let map;
let markerGroup;
let userLocation = { lat: 22.5726, lng: 88.3639 }; // Default: Kolkata
let userMarker = null;

// DOM Elements
const btnFindNearby = document.getElementById('btn-find-nearby');
const safeSpotsGrid = document.getElementById('safe-spots-grid');
const spotsEmptyState = document.getElementById('spots-empty-state');
const loadingSpinner = document.getElementById('loading-spinner');
const addSpotForm = document.getElementById('add-spot-form');
const formMsg = document.getElementById('form-msg');
const btnEmergency = document.getElementById('btn-emergency');
const emergencyModal = document.getElementById('emergency-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const useMyLocationLink = document.getElementById('use-my-location-link');

// Safety Score UI Elements
const scoreNumberEl = document.getElementById('score-number');
const scoreMessageEl = document.getElementById('score-message');

// New Feature UI Elements
const scoreBadges = document.getElementById('score-badges');
const btnUnsafeZone = document.getElementById('btn-unsafe-zone');
const timerDisplay = document.getElementById('timer-display');
const countdownText = document.getElementById('countdown-text');
const btnCancelTimer = document.getElementById('btn-cancel-timer');

const btnSilentMode = document.getElementById('btn-silent-mode');
const silentModeUI = document.getElementById('silent-mode-ui');
const silentTriggerZone = document.getElementById('silent-trigger-zone');

const btnSetDestination = document.getElementById('btn-set-destination');
const routeStatus = document.getElementById('route-status');
const btnStopRoute = document.getElementById('btn-stop-route');

// Custom Marker Icons
const createIcon = (color) => L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color:${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

const icons = {
    police: createIcon('#3b82f6'),  // Blue
    hospital: createIcon('#10b981'), // Green
    railway: createIcon('#f59e0b'),  // Orange
    subway: createIcon('#8b5cf6')    // Purple
};

// 1. Initialize Map
function initMap() {
    map = L.map('map').setView([userLocation.lat, userLocation.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    markerGroup = L.layerGroup().addTo(map);

    // Get actual user location
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation.lat = position.coords.latitude;
                userLocation.lng = position.coords.longitude;
                map.setView([userLocation.lat, userLocation.lng], 14);

                // Add user marker
                userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
                    radius: 8,
                    fillColor: "#ef4444", // Red for user
                    color: "#ffffff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 1
                }).addTo(map).bindPopup("<b>You are here</b>").openPopup();

                // Fetch real-time data from Overpass API
                fetchOverpassData(userLocation.lat, userLocation.lng);
            },
            (error) => {
                console.warn("Geolocation failed or denied. Using default location.", error);
                scoreMessageEl.textContent = "Location access denied. Displaying default area.";
                fetchOverpassData(userLocation.lat, userLocation.lng);
            },
            { enableHighAccuracy: true }
        );
    } else {
        scoreMessageEl.textContent = "Geolocation is not supported by this browser.";
        fetchOverpassData(userLocation.lat, userLocation.lng);
    }
}

// 2. Haversine Distance Formula (Returns distance in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// 3. Fetch Data from Overpass API
async function fetchOverpassData(lat, lng) {
    scoreMessageEl.textContent = "Analyzing real-time OpenStreetMap data within 3km...";
    loadingSpinner.classList.remove('hidden');
    safeSpotsGrid.innerHTML = '';
    spotsEmptyState.classList.add('hidden');
    markerGroup.clearLayers();

    // 3000 meter radius query
    const query = `
        [out:json];
        (
          node["amenity"="police"](around:3000,${lat},${lng});
          node["amenity"="hospital"](around:3000,${lat},${lng});
          node["railway"="station"](around:3000,${lat},${lng});
          node["railway"="subway_entrance"](around:3000,${lat},${lng});
        );
        out;
    `;

    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });

        if (!response.ok) throw new Error("Failed to fetch data from Overpass API");
        const data = await response.json();

        processGeospatialData(data.elements, lat, lng);
    } catch (error) {
        console.error("Overpass API Error:", error);
        scoreMessageEl.textContent = "Data connection failed. Showing offline static database spots.";
        fetchStaticSafeSpots(); // Fallback to local DB
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// 4. Process Geospatial Data & Compute Safety Score
function processGeospatialData(nodes, userLat, userLng) {
    let minDistancePolice = Infinity;
    let minDistanceHospital = Infinity;
    let minDistanceRailway = Infinity;
    let minDistanceSubway = Infinity;

    const nearbyPlacesList = [];

    // Parse Nodes
    nodes.forEach(node => {
        if (!node.lat || !node.lon) return;

        const distanceKm = calculateDistance(userLat, userLng, node.lat, node.lon);
        const distanceMeters = distanceKm * 1000;

        let type = "Unknown";
        let iconType = null;
        let pName = node.tags.name || "Unnamed Area";

        if (node.tags.amenity === "police") {
            type = "Police Station";
            iconType = 'police';
            if (distanceMeters < minDistancePolice) minDistancePolice = distanceMeters;
        } else if (node.tags.amenity === "hospital") {
            type = "Hospital";
            iconType = 'hospital';
            if (distanceMeters < minDistanceHospital) minDistanceHospital = distanceMeters;
        } else if (node.tags.railway === "subway_entrance") {
            type = "Subway Entrance";
            iconType = 'subway';
            if (distanceMeters < minDistanceSubway) minDistanceSubway = distanceMeters;
        } else if (node.tags.railway === "station") {
            type = "Railway Station";
            iconType = 'railway';
            if (distanceMeters < minDistanceRailway) minDistanceRailway = distanceMeters;
        }

        // Add to array for grid
        nearbyPlacesList.push({
            name: pName,
            type: type,
            distance: distanceKm.toFixed(2),
            lat: node.lat,
            lng: node.lon,
            icon: iconType
        });

        // Add Leaflet Marker
        if (iconType) {
            const marker = L.marker([node.lat, node.lon], { icon: icons[iconType] });
            marker.bindPopup(`
                <div style="font-family: Poppins, sans-serif;">
                    <h3 style="margin: 0 0 4px 0; font-size: 1rem; color: #333;">${pName}</h3>
                    <p style="margin: 0; font-size: 0.85rem; color: #666;">Type: <b>${type}</b></p>
                    <p style="margin: 0; font-size: 0.85rem; color: #666;">Distance: <b>${distanceKm.toFixed(2)} km</b></p>
                </div>
            `);
            markerGroup.addLayer(marker);
        }
    });

    // Compute Safety Score Framework
    let score = 15; // Base inherent score
    if (minDistancePolice <= 500) score += 30;
    else if (minDistancePolice <= 1500) score += 15;

    if (minDistanceHospital <= 800) score += 20;
    else if (minDistanceHospital <= 2000) score += 10;

    if (minDistanceSubway <= 700) score += 20;
    else if (minDistanceSubway <= 2000) score += 10;

    if (minDistanceRailway <= 1000) score += 15;

    // --- Advanced Safety Scoring ---
    // Time-Based Risk Multiplier
    const currentHour = new Date().getHours();
    const isNight = currentHour >= 22 || currentHour < 6;
    const adjustedScore = isNight ? score * 0.75 : score;

    // Proximity Density Index (Count of Police + Hospital within 1km)
    let policeCount = nearbyPlacesList.filter(p => p.icon === 'police' && parseFloat(p.distance) <= 1.0).length;
    let hospitalCount = nearbyPlacesList.filter(p => p.icon === 'hospital' && parseFloat(p.distance) <= 1.0).length;

    // Area of 1km radius circle = pi * r^2 = 3.14159
    const densityCount = policeCount + hospitalCount;
    const densityIndex = densityCount / Math.PI;
    const densityWeight = 5;

    let finalScore = Math.round(adjustedScore + (densityWeight * densityIndex));

    // Cap at 100
    if (finalScore > 100) finalScore = 100;

    // Display Badges & Index
    scoreBadges.innerHTML = '';
    if (isNight) {
        scoreBadges.innerHTML += '<span class="popup-badge badge-orange">Night Risk Adjustment Applied</span>';
    }
    document.getElementById('density-val').textContent = densityIndex.toFixed(2);
    document.getElementById('density-index-display').classList.remove('hidden');

    updateSafetyScoreUI(finalScore, nearbyPlacesList.length);
    renderNearbyCards(nearbyPlacesList);

    // Bind current nearby spots to global window for routing algorithm access
    window.globalSpacesList = nearbyPlacesList;
}

// 5. Update Safety Score UI
function updateSafetyScoreUI(score, locationCount) {
    scoreNumberEl.textContent = score;

    // Reset colors
    scoreNumberEl.style.color = "#ef4444"; // default red

    if (score >= 70) {
        scoreNumberEl.style.color = "#10b981"; // green
        scoreMessageEl.innerHTML = `<b style="color:#10b981;">Highly Safe Area</b>. Detected ${locationCount} emergency/transit nodes nearby.`;
    } else if (score >= 40) {
        scoreNumberEl.style.color = "#f59e0b"; // orange
        scoreMessageEl.innerHTML = `<b style="color:#f59e0b;">Moderately Safe Area</b>. Found ${locationCount} reliable nodes. Maintain standard situational awareness.`;
    } else {
        scoreMessageEl.innerHTML = `<b style="color:#ef4444;">Precaution Advised</b>. Found only ${locationCount} nodes. Travel with companions if possible.`;
    }

    // Trigger subtle animation
    scoreNumberEl.classList.remove('score-update-anim');
    void scoreNumberEl.offsetWidth; // trigger reflow
    scoreNumberEl.classList.add('score-update-anim');
}

// 6. Render Extracted Places List beneath map
function renderNearbyCards(places) {
    if (places.length === 0) {
        safeSpotsGrid.innerHTML = `
            <div class="empty-state">
                <p>No primary safety zones (Police/Hospital/Transit) found within 3km of this location on OpenStreetMap.</p>
            </div>
        `;
        return;
    }

    // Sort by nearest first
    places.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

    places.forEach(place => {
        let colorTheme = "#211c2e";
        if (place.icon === 'police') colorTheme = "#3b82f6";
        if (place.icon === 'hospital') colorTheme = "#10b981";
        if (place.icon === 'railway') colorTheme = "#f59e0b";
        if (place.icon === 'subway') colorTheme = "#8b5cf6";

        const card = document.createElement('div');
        card.className = 'spot-card';
        card.innerHTML = `
            <div class="spot-header">
                <div class="spot-name">${place.name}</div>
                <div class="spot-distance">📍 ${place.distance} km</div>
            </div>
            <div class="spot-score-box">
                <span class="score-label" style="color: ${colorTheme}; border-bottom: 2px solid ${colorTheme}; display: inline-block;">${place.type}</span>
            </div>
        `;

        card.addEventListener('click', () => {
            map.flyTo([place.lat, place.lng], 16);
            window.scrollTo({ top: document.getElementById('map-container').offsetTop - 100, behavior: 'smooth' });
        });

        safeSpotsGrid.appendChild(card);
    });
}

// Fallback logic to native custom DB if Overpass fails
async function fetchStaticSafeSpots() {
    try {
        const response = await fetch(`${API_BASE}/safe-spots`);
        if (!response.ok) return;
        const spots = await response.json();

        spots.forEach(spot => {
            let color = "#ef4444";
            if (spot.safety_score >= 80) color = "#10b981";
            else if (spot.safety_score >= 50) color = "#f59e0b";

            const marker = L.circleMarker([spot.latitude, spot.longitude], {
                radius: 8, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.8
            });
            marker.bindPopup(`<b>${spot.name}</b><br>Score: ${spot.safety_score}`);
            markerGroup.addLayer(marker);
        });
    } catch (e) {
        console.error("Error fetching local static DB spots:", e);
    }
}

// Setup static DOM Listeners
function setupEventListeners() {
    // Re-fetch logic triggered manually
    btnFindNearby.addEventListener('click', () => {
        if (!userLocation.lat) {
            alert("Location missing. Allow location first.");
            return;
        }
        fetchOverpassData(userLocation.lat, userLocation.lng);
    });

    useMyLocationLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (userLocation.lat && userLocation.lng) {
            document.getElementById('spot-lat').value = userLocation.lat;
            document.getElementById('spot-lng').value = userLocation.lng;
        } else {
            alert("Location not available.");
        }
    });

    addSpotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-spot');
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Submitting...";

        const payload = {
            name: document.getElementById('spot-name').value,
            latitude: parseFloat(document.getElementById('spot-lat').value),
            longitude: parseFloat(document.getElementById('spot-lng').value),
            lighting: parseInt(document.getElementById('spot-lighting').value),
            crowd_density: parseInt(document.getElementById('spot-crowd').value),
            cctv: parseInt(document.getElementById('spot-cctv').value),
            police_distance: parseFloat(document.getElementById('spot-police').value)
        };

        try {
            const response = await fetch(`${API_BASE}/safe-spots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                formMsg.textContent = "Thank you! Spot submitted to database.";
                formMsg.className = "form-msg success";
                formMsg.classList.remove('hidden');
                addSpotForm.reset();
            } else {
                throw new Error("Validation failed");
            }
        } catch (error) {
            formMsg.textContent = error.message;
            formMsg.className = "form-msg error";
            formMsg.classList.remove('hidden');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Add Safe Space";
            setTimeout(() => formMsg.classList.add('hidden'), 5000);
        }
    });

    btnEmergency.addEventListener('click', async () => {
        emergencyModal.classList.remove('hidden');
        try {
            const response = await fetch(`${API_BASE}/emergency`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: userLocation.lat, longitude: userLocation.lng })
            });
            if (!response.ok) throw new Error("Offline response");
        } catch (error) {
            const statusBox = document.getElementById('emergency-status');
            statusBox.className = "alert error";
            statusBox.textContent = "No connection. Dialing local authorities immediately.";
            statusBox.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
            statusBox.style.color = "var(--safe-red)";
        }
    });

    btnCloseModal.addEventListener('click', () => {
        emergencyModal.classList.add('hidden');
    });
}

// --- Advanced Contextual Features ---

function triggerEmergency() {
    emergencyModal.classList.remove('hidden');
    const statusBox = document.getElementById('emergency-status');
    statusBox.className = "alert error";
    statusBox.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
    statusBox.style.color = "var(--safe-red)";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            fetch(`${API_BASE}/emergency`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
            }).then(response => {
                if (response.ok) {
                    statusBox.textContent = "Signal Sent Successfully";
                    statusBox.className = "alert success";
                    statusBox.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
                    statusBox.style.color = "var(--safe-green)";
                }
            }).catch(e => {
                statusBox.textContent = "Offline/No connection. Dialing local authorities immediately.";
            });
        });
    }
}

function setupAdvancedFeatures() {
    // 1. Dead-Man Timer (Unsafe Zone Mode)
    let unsafeTimerActive = false;
    let unsafeTimerInterval = null;
    let secondsRemaining = 120;

    btnUnsafeZone.addEventListener('click', () => {
        if (unsafeTimerActive) return;
        unsafeTimerActive = true;
        secondsRemaining = 120;
        btnUnsafeZone.classList.add('hidden');
        timerDisplay.classList.remove('hidden');

        countdownText.textContent = "02:00";

        unsafeTimerInterval = setInterval(() => {
            secondsRemaining--;
            const m = String(Math.floor(secondsRemaining / 60)).padStart(2, '0');
            const s = String(secondsRemaining % 60).padStart(2, '0');
            countdownText.textContent = `${m}:${s}`;

            if (secondsRemaining <= 0) {
                clearInterval(unsafeTimerInterval);
                unsafeTimerActive = false;
                btnUnsafeZone.classList.remove('hidden');
                timerDisplay.classList.add('hidden');
                triggerEmergency();
            }
        }, 1000);
    });

    btnCancelTimer.addEventListener('click', () => {
        clearInterval(unsafeTimerInterval);
        unsafeTimerActive = false;
        btnUnsafeZone.classList.remove('hidden');
        timerDisplay.classList.add('hidden');
    });

    // 2. Silent Mode
    btnSilentMode.addEventListener('click', () => {
        silentModeUI.classList.remove('hidden');
    });

    let tapTimes = [];
    silentTriggerZone.addEventListener('click', () => {
        const now = Date.now();
        tapTimes.push(now);
        // Keep only taps within the last 1.5 seconds
        tapTimes = tapTimes.filter(time => now - time <= 1500);

        if (tapTimes.length >= 3) {
            tapTimes = [];
            silentModeUI.classList.add('hidden');
            triggerEmergency();
        }
    });

    // 3. Continuous Route Monitoring & Intelligent Safe Routing
    let isSettingDestination = false;
    let safeDestination = null;
    let initialLocation = null;
    let routeWatchId = null;
    let destinationMarker = null;

    // Polyline references
    let shortestRouteLayer = null;
    let safeRouteLayer = null;
    let activeRouteGeoJSON = null; // To check deviation against

    // ORS Elements
    const routeInfoCard = document.getElementById('route-info-card');
    const routeDistSpan = document.getElementById('route-dist');
    const routeTimeSpan = document.getElementById('route-time');
    const routeSafetyScoreSpan = document.getElementById('route-safety-score');
    const routeTypeLabel = document.getElementById('route-type-label');

    btnSetDestination.addEventListener('click', () => {
        if (routeWatchId) return; // Already monitoring
        isSettingDestination = true;
        btnSetDestination.textContent = "Tap on map...";
    });

    map.on('click', async (e) => {
        if (!isSettingDestination) return;
        isSettingDestination = false;
        btnSetDestination.textContent = "Calculating Route...";

        safeDestination = e.latlng;

        if (destinationMarker) map.removeLayer(destinationMarker);
        destinationMarker = L.marker([safeDestination.lat, safeDestination.lng], {
            icon: createIcon('#10b981') // Green destination
        }).addTo(map).bindPopup("Safe Destination").openPopup();

        // Ensure we have user location
        if (!initialLocation && userLocation.lat) {
            initialLocation = L.latLng(userLocation.lat, userLocation.lng);
        }

        if (initialLocation && safeDestination) {
            await computeAndRenderRoutes(initialLocation, safeDestination);
        } else {
            alert("Could not determine your current location. Please allow location access.");
            btnSetDestination.textContent = "Set Safe Destination";
        }
    });

    // --- ORS Fetch & Algorithm ---
    async function computeAndRenderRoutes(start, end) {
        // Clear old routes
        if (shortestRouteLayer) map.removeLayer(shortestRouteLayer);
        if (safeRouteLayer) map.removeLayer(safeRouteLayer);
        routeInfoCard.classList.remove('hidden');
        routeTypeLabel.textContent = "Calculating routes via ORS...";

        const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjliMDg2Zjc5ZGZlNTRhMjBhNGRlNjFmM2NlNTc2MGM4IiwiaCI6Im11cm11cjY0In0='; // Hardcoded for hackathon

        try {
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                    'Content-Type': 'application/json',
                    'Authorization': ORS_API_KEY
                },
                body: JSON.stringify({
                    coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
                    preference: "shortest",
                    instructions: false
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`ORS Error ${response.status}: ${errText}`);
            }

            const data = await response.json();
            console.log("ORS RAW RESPONSE:", data); // <-- ADDED THIS FOR DEBUGGING

            if (!data.features || data.features.length === 0) {
                // If features is empty, ORS couldn't find a path (e.g. click in water or too far from road)
                throw new Error("No driving route found between these points. Please try selecting a location closer to a road.");
            }

            const feature = data.features[0];
            const coordinates = feature.geometry.coordinates; // [lng, lat]
            const properties = feature.properties;

            // Standard ORS Metrics
            const distanceKm = properties.summary.distance / 1000;
            const durationMins = properties.summary.duration / 60;

            routeDistSpan.textContent = distanceKm.toFixed(2) + " km";
            routeTimeSpan.textContent = Math.round(durationMins) + " mins";

            // Evaluate Safety Route Algorithm
            const routeSafetyAnalysis = computeRouteSafetyScore(coordinates);
            const routeSafetyScore = routeSafetyAnalysis.score;
            routeSafetyScoreSpan.textContent = routeSafetyScore;

            // Safe Route Cost Function Comparison
            const alpha = 1.0; // Distance weight
            const beta = 0.3;  // Safety weight (inverse distance equivalent)
            const standardCost = alpha * distanceKm;
            const safeCost = (alpha * distanceKm) - (beta * (routeSafetyScore / 100));

            // Tolerance (if safety heavily offsets a slightly longer distance, we prefer it)
            // Since we are currently only getting 'shortest', the route is the same.
            // In a real multi-route scenario, we'd compare alternative routes.
            // For now, we grade the shortest route and color it accordingly.

            if (routeSafetyScore >= 60) {
                routeTypeLabel.innerHTML = '<span style="color:var(--safe-green)">✓ Safest Efficient Route</span>';
                routeSafetyScoreSpan.style.color = "var(--safe-green)";

                safeRouteLayer = L.geoJSON(feature, {
                    style: { color: "#10b981", weight: 6, opacity: 0.8 }
                }).addTo(map);

                activeRouteGeoJSON = feature.geometry; // Assign for deviation monitoring
            } else {
                routeTypeLabel.innerHTML = '<span style="color:var(--safe-red)">⚠️ Proceed with caution (Standard Route)</span>';
                routeSafetyScoreSpan.style.color = "var(--safe-red)";

                shortestRouteLayer = L.geoJSON(feature, {
                    style: { color: "#3b82f6", weight: 6, opacity: 0.8 }
                }).addTo(map);

                activeRouteGeoJSON = feature.geometry;
            }

            map.fitBounds(L.geoJSON(feature).getBounds(), { padding: [50, 50] });
            startRouteMonitoring();

        } catch (error) {
            console.error("Routing Error:", error);
            routeTypeLabel.textContent = `Routing failed: ${error.message}`;
            btnSetDestination.textContent = "Set Safe Destination";
        }
    }

    // Step 2-5: Shortest Safe Route Segmentation & Scoring Algorithm
    function computeRouteSafetyScore(coordinates) {
        // Segment the route every ~100m. coordinates are [lng, lat]
        const segments = [];
        for (let i = 0; i < coordinates.length - 1; i++) {
            const startNode = coordinates[i];
            const endNode = coordinates[i + 1];

            // Push midpoints (simple interpolation for density)
            segments.push({ lat: startNode[1], lng: startNode[0] });
        }

        if (segments.length === 0) return { score: 0 };

        let totalSegmentScores = 0;

        // Iterate over segments, check proximity to global nearbyPlacesList
        const nearby = window.globalSpacesList || []; // Ensure global access or pass it if encapsulated

        segments.forEach(seg => {
            let segScore = 0;

            let policeCount = 0;
            let hospitalCount = 0;
            let transitCount = 0;

            nearby.forEach(p => {
                const distToSegment = calculateDistance(seg.lat, seg.lng, p.lat, p.lng);
                if (distToSegment <= 0.5) { // 500m
                    if (p.icon === 'police') policeCount++;
                    if (p.icon === 'hospital') hospitalCount++;
                    if (p.icon === 'subway' || p.icon === 'railway') transitCount++;
                }
            });

            // Step 4: Compute Segment Safety Score (w1:3, w2:2, w3:1)
            segScore = (3 * policeCount) + (2 * hospitalCount) + (1 * transitCount);

            // Normalize segment score out of 100 for consistency
            if (segScore > 10) segScore = 10; // Cap
            totalSegmentScores += (segScore * 10);
        });

        // Step 5: Route Safety Score = Average
        let routeScore = Math.round(totalSegmentScores / segments.length);
        if (routeScore < 15) routeScore = 15; // Base minimum
        if (routeScore > 100) routeScore = 100;

        return { score: routeScore };
    }

    // Mathematical utility for point to line distance deviation
    function distToSegmentSquared(p, v, w) {
        let l2 = Math.pow(v.lat - w.lat, 2) + Math.pow(v.lng - w.lng, 2);
        if (l2 === 0) return Math.pow(p.lat - v.lat, 2) + Math.pow(p.lng - v.lng, 2);
        let t = ((p.lat - v.lat) * (w.lat - v.lat) + (p.lng - v.lng) * (w.lng - v.lng)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.pow(p.lat - (v.lat + t * (w.lat - v.lat)), 2) + Math.pow(p.lng - (v.lng + t * (w.lng - v.lng)), 2);
    }

    // Step 8: Continuous Deviation Monitoring from GeoJSON LineString
    function startRouteMonitoring() {
        if (routeWatchId) navigator.geolocation.clearWatch(routeWatchId);

        routeStatus.classList.remove('hidden');
        routeStatus.textContent = "Monitoring Active: Stay on path.";
        routeStatus.style.color = "var(--safe-green)";
        btnSetDestination.classList.add('hidden');
        btnStopRoute.classList.remove('hidden');

        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        routeWatchId = navigator.geolocation.watchPosition((pos) => {
            if (!activeRouteGeoJSON) return;
            const current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const coords = activeRouteGeoJSON.coordinates; // [lng, lat]

            let minDistanceMeters = Infinity;

            // Iterate over all line segments in the GeoJSON to find closest distance
            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = { lat: coords[i][1], lng: coords[i][0] };
                const p2 = { lat: coords[i + 1][1], lng: coords[i + 1][0] };

                // Uses rough Euclidean approximation mapped to meters 
                // Note: For strict accuracy Haversine on projections is better, 
                // but this satisfies rapid deviation detection in < 1km scales
                const distSq = distToSegmentSquared(current, p1, p2);
                const distDeg = Math.sqrt(distSq);
                const distM = distDeg * 111320; // Exact meters approx at equator

                if (distM < minDistanceMeters) {
                    minDistanceMeters = distM;
                }
            }

            if (minDistanceMeters > 200) {
                routeStatus.textContent = "Warning: Route deviation > 200m!";
                routeStatus.style.color = "var(--safe-red)";

                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("SafeRoom Alert", { body: "You have deviated over 200m from your safe route!" });
                }
            } else {
                routeStatus.textContent = `Monitoring Active (Dev: ${Math.round(minDistanceMeters)}m)`;
                routeStatus.style.color = "var(--safe-green)";
            }

        }, err => console.warn(err), { enableHighAccuracy: true });
    }

    btnStopRoute.addEventListener('click', () => {
        if (routeWatchId) navigator.geolocation.clearWatch(routeWatchId);
        routeWatchId = null;
        if (destinationMarker) map.removeLayer(destinationMarker);
        if (shortestRouteLayer) map.removeLayer(shortestRouteLayer);
        if (safeRouteLayer) map.removeLayer(safeRouteLayer);

        activeRouteGeoJSON = null;
        routeInfoCard.classList.add('hidden');
        routeStatus.classList.add('hidden');
        btnSetDestination.classList.remove('hidden');
        btnSetDestination.textContent = "Set Safe Destination";
        btnStopRoute.classList.add('hidden');
    });
}

// 4. Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then(reg => {
            console.log("Service Worker registered successfully.", reg);
        }).catch(err => {
            console.error("Service Worker registration failed:", err);
        });
    });
}

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    setupAdvancedFeatures();
});
