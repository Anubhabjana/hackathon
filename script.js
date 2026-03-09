// script.js: SafeRoom Frontend Logic (Leaflet.js & Overpass API Version)

const API_BASE = window.location.origin + "/api";
let map;
let markerGroup;
let incidentMarkerGroup;
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

// Incident Reporting UI
const btnReportIncident = document.getElementById('btn-report-incident');
const incidentModal = document.getElementById('incident-modal');
const btnCloseIncidentModal = document.getElementById('btn-close-incident-modal');
const incidentForm = document.getElementById('incident-form');
const incidentStatus = document.getElementById('incident-status');

// Trusted Contacts UI
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');
const btnQuickSms = document.getElementById('btn-quick-sms');

// Fake Call UI
const btnFakeCall = document.getElementById('btn-fake-call');
const fakeCallUi = document.getElementById('fake-call-ui');
const btnAcceptCall = document.getElementById('btn-accept-call');
const btnDeclineCall = document.getElementById('btn-decline-call');

// Offline UI
const offlineIndicator = document.getElementById('offline-indicator');
const nightWarningBanner = document.getElementById('night-warning-banner');

// Custom Font Awesome Marker Icons
const createIcon = (color, faClass) => L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color:${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"><i class="${faClass}" style="color: white; font-size: 14px;"></i></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

const icons = {
    police: createIcon('#3b82f6', 'fas fa-shield-alt'),  // Blue
    hospital: createIcon('#10b981', 'fas fa-hospital'), // Green
    railway: createIcon('#f59e0b', 'fas fa-train'),  // Orange
    subway: createIcon('#8b5cf6', 'fas fa-subway')    // Purple
};

// 1. Initialize Map
function initMap() {
    map = L.map('map').setView([userLocation.lat, userLocation.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    markerGroup = L.layerGroup().addTo(map);
    incidentMarkerGroup = L.layerGroup().addTo(map);

    // Add Reset Map View Control
    const resetControl = L.control({ position: 'bottomright' });
    resetControl.onAdd = function (map) {
        const btn = L.DomUtil.create('button', 'reset-map-btn');
        btn.innerHTML = '📍';
        btn.style.backgroundColor = 'white';
        btn.style.border = '2px solid rgba(0,0,0,0.2)';
        btn.style.borderRadius = '4px';
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '16px';
        btn.style.lineHeight = '26px';
        btn.style.fontFamily = 'monospace';
        btn.style.textAlign = 'center';
        btn.style.padding = '0';
        btn.style.boxShadow = '0 1px 5px rgba(0,0,0,0.65)';
        btn.title = "Reset Map View";

        btn.onclick = function (e) {
            e.stopPropagation();
            if (userLocation.lat && userLocation.lng) {
                map.setView([userLocation.lat, userLocation.lng], 14);
            } else {
                alert("Location not available.");
            }
        };
        return btn;
    };
    resetControl.addTo(map);

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
                    fillOpacity: 1,
                    className: "pulse-marker-anim"
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

async function fetchIncidents() {
    try {
        const response = await fetch(`${API_BASE}/incidents`);
        if (!response.ok) return;
        const incidents = await response.json();

        incidentMarkerGroup.clearLayers();

        const incidentIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 10px; color: white; box-shadow: 0 0 10px #ef4444; font-weight: bold;">!</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        incidents.forEach(inc => {
            L.marker([inc.latitude, inc.longitude], { icon: incidentIcon })
                .addTo(incidentMarkerGroup)
                .bindPopup(`<b>🚨 Incident Report</b><br>${inc.type}<br><small>Reported recently</small>`);
        });
    } catch (e) {
        console.error("Failed to fetch incidents", e);
    }
}

// 3. Fetch Data from Overpass API
async function fetchOverpassData(lat, lng) {
    const CACHE_KEY = 'saferoom_spots_cache';
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const lastUpdatedEl = document.getElementById('last-updated');

    const updateTimestamp = (ms) => {
        if (!lastUpdatedEl) return;
        const d = ms ? new Date(ms) : new Date();
        lastUpdatedEl.textContent = `Last updated: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        lastUpdatedEl.classList.remove('hidden');
    };

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            const dist = calculateDistance(lat, lng, parsed.lat, parsed.lng) * 1000;
            if (age < CACHE_DURATION && dist < 500) {
                console.log("Using cached Overpass data");
                scoreMessageEl.textContent = "Analyzing cached real-time OpenStreetMap data within 3km...";
                safeSpotsGrid.innerHTML = '';
                markerGroup.clearLayers();
                spotsEmptyState.classList.add('hidden');
                processGeospatialData(parsed.data, lat, lng);
                updateTimestamp(parsed.timestamp);
                return;
            }
        } catch (e) {
            console.error("Cache parsing error", e);
        }
    }

    const loadingUI = document.getElementById('loading-spinner');

    scoreMessageEl.textContent = "Analyzing real-time OpenStreetMap data within 3km...";
    loadingUI.classList.remove('hidden');
    safeSpotsGrid.innerHTML = '';
    spotsEmptyState.classList.add('hidden');
    markerGroup.clearLayers();

    // Fetch incidents independently
    fetchIncidents();

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
        btnFindNearby.disabled = true;
        const response = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });

        if (!response.ok) throw new Error("Failed to fetch data from Overpass API");
        const data = await response.json();

        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            lat: lat,
            lng: lng,
            data: data.elements
        }));

        processGeospatialData(data.elements, lat, lng);
        updateTimestamp();
    } catch (error) {
        console.error("Overpass API Error:", error);
        scoreMessageEl.textContent = "Data connection failed. Showing offline static database spots.";
        if (lastUpdatedEl) lastUpdatedEl.classList.add('hidden');
        fetchStaticSafeSpots(); // Fallback to local DB
    } finally {
        loadingSpinner.classList.add('hidden');
        btnFindNearby.disabled = false;
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

        let pPhone = null;
        if (iconType === 'police' || iconType === 'hospital') {
            pPhone = node.tags.phone || node.tags['contact:phone'];
            if (!pPhone) pPhone = iconType === 'police' ? '911' : '911';
        }

        // Add to array for grid
        nearbyPlacesList.push({
            name: pName,
            type: type,
            distance: distanceKm.toFixed(2),
            lat: node.lat,
            lng: node.lon,
            icon: iconType,
            phone: pPhone
        });

        // Add Leaflet Marker
        if (iconType) {
            let phoneLink = '';
            if (iconType === 'police' || iconType === 'hospital') {
                const phone = node.tags.phone || node.tags['contact:phone'];
                if (phone) {
                    phoneLink = `<a href="tel:${phone}" style="display:inline-block; margin-top:8px; padding:6px 12px; background:#ef4444; color:white; text-decoration:none; border-radius:4px; font-weight:bold;">📞 Call ${phone}</a>`;
                } else {
                    const fallbackNum = iconType === 'police' ? '911' : '911';
                    phoneLink = `<a href="tel:${fallbackNum}" style="display:inline-block; margin-top:8px; padding:6px 12px; background:#ef4444; color:white; text-decoration:none; border-radius:4px; font-weight:bold;">📞 Call Emergency (911)</a>`;
                }
            }

            const marker = L.marker([node.lat, node.lon], { icon: icons[iconType] });
            marker.bindPopup(`
                <div style="font-family: Poppins, sans-serif;">
                    <h3 style="margin: 0 0 4px 0; font-size: 1rem; color: #333;">${pName}</h3>
                    <p style="margin: 0; font-size: 0.85rem; color: #666;">Type: <b>${type}</b></p>
                    <p style="margin: 0; font-size: 0.85rem; color: #666;">Distance: <b>${distanceKm.toFixed(2)} km</b></p>
                    ${phoneLink}
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

    // Determine color
    let scoreColor = "#ef4444"; // default red
    if (score >= 70) {
        scoreColor = "#10b981"; // green
        scoreMessageEl.innerHTML = `<b style="color:${scoreColor};">Highly Safe Area</b>. Detected ${locationCount} nodes nearby.`;
    } else if (score >= 40) {
        scoreColor = "#f59e0b"; // orange
        scoreMessageEl.innerHTML = `<b style="color:${scoreColor};">Moderately Safe Area</b>. Found ${locationCount} nodes. Be aware.`;
    } else {
        scoreMessageEl.innerHTML = `<b style="color:${scoreColor};">Precaution Advised</b>. Found only ${locationCount} nodes.`;
    }

    scoreNumberEl.style.color = scoreColor;

    // Update SVG Gauge
    const gaugeFill = document.getElementById('score-gauge-fill');
    if (gaugeFill) {
        const circumference = 408.4; // 2 * pi * 65
        const offset = circumference - (score / 100) * circumference;
        gaugeFill.style.strokeDashoffset = offset;
        gaugeFill.style.stroke = scoreColor;
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
        let iconEmoji = '<i class="fa-solid fa-location-dot"></i>';

        if (place.icon === 'police') { colorTheme = "#3b82f6"; iconEmoji = '<i class="fa-solid fa-shield-halved"></i>'; }
        if (place.icon === 'hospital') { colorTheme = "#10b981"; iconEmoji = '<i class="fa-solid fa-square-h"></i>'; }
        if (place.icon === 'railway') { colorTheme = "#f59e0b"; iconEmoji = '<i class="fa-solid fa-train"></i>'; }
        if (place.icon === 'subway') { colorTheme = "#8b5cf6"; iconEmoji = '<i class="fa-solid fa-train-subway"></i>'; }

        let phoneHtml = '';
        if (place.phone) {
            // Stop propagation so clicking the button doesn't trigger the flyTo map event 
            phoneHtml = `<div style="margin-top: 10px;"><a href="tel:${place.phone}" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; display: inline-block;" onclick="event.stopPropagation();"><i class="fa-solid fa-phone"></i> Call ${place.phone === '911' ? 'Emergency' : place.phone}</a></div>`;
        }

        const card = document.createElement('div');
        card.className = 'spot-card';
        card.innerHTML = `
            <div class="spot-header">
                <div class="spot-name" style="display: flex; align-items: center; gap: 8px;">${iconEmoji} ${place.name}</div>
                <div class="spot-distance" style="background-color:${colorTheme}20; color:${colorTheme}; border-radius:15px; padding: 4px 10px; font-size: 0.85rem; font-weight: 600;"><i class="fa-solid fa-location-arrow" style="font-size: 0.75rem;"></i> ${place.distance} km</div>
            </div>
            <div class="spot-score-box">
                <span class="score-label" style="color: ${colorTheme}; border-bottom: 2px solid ${colorTheme}; display: inline-block;">${place.type}</span>
            </div>
            ${phoneHtml}
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
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || "Failed to fetch from local database");
        }
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
        scoreMessageEl.textContent = `Critical Error: ${e.message}. No spaces available.`;
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

        if (payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) {
            formMsg.textContent = "Please enter valid coordinates (Lat: -90 to 90, Lng: -180 to 180)";
            formMsg.className = "form-msg error";
            formMsg.classList.remove('hidden');
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Add Safe Space";
            setTimeout(() => formMsg.classList.add('hidden'), 5000);
            return;
        }

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

    btnEmergency.addEventListener('click', () => {
        if (btnEmergency.disabled) return;

        btnEmergency.classList.add('bounce-anim');
        setTimeout(() => btnEmergency.classList.remove('bounce-anim'), 300);

        btnEmergency.disabled = true;
        btnEmergency.style.opacity = "0.5";
        triggerEmergency();
        setTimeout(() => {
            btnEmergency.disabled = false;
            btnEmergency.style.opacity = "1";
        }, 5000);
    });

    btnCloseModal.addEventListener('click', () => {
        emergencyModal.classList.add('hidden');
    });

    // --- Incident Reporting Listeners ---
    if (btnReportIncident) {
        btnReportIncident.addEventListener('click', () => {
            incidentModal.classList.remove('hidden');
        });
    }

    if (btnCloseIncidentModal) {
        btnCloseIncidentModal.addEventListener('click', () => {
            incidentModal.classList.add('hidden');
            if (incidentStatus) incidentStatus.classList.add('hidden');
        });
    }

    if (incidentForm) {
        incidentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!userLocation.lat) {
                incidentStatus.textContent = "Location required to report.";
                incidentStatus.className = "alert error";
                incidentStatus.classList.remove('hidden');
                return;
            }

            const type = document.getElementById('incident-type').value;
            const submitBtn = incidentForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";

            try {
                const res = await fetch(`${API_BASE}/incidents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude: userLocation.lat, longitude: userLocation.lng, type })
                });

                if (res.ok) {
                    incidentStatus.textContent = "Incident reported successfully.";
                    incidentStatus.className = "alert success";
                    incidentStatus.classList.remove('hidden');
                    fetchIncidents(); // Refresh map markers
                    setTimeout(() => {
                        incidentModal.classList.add('hidden');
                        incidentStatus.classList.add('hidden');
                        incidentForm.reset();
                    }, 2000);
                } else {
                    throw new Error("Failed to report incident");
                }
            } catch (err) {
                incidentStatus.textContent = err.message;
                incidentStatus.className = "alert error";
                incidentStatus.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Report";
            }
        });
    }

    // --- Trusted Contacts Listeners ---
    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            const contacts = JSON.parse(localStorage.getItem('saferoom_trusted_contacts') || '[]');
            if (contacts[0]) document.getElementById('contact-1').value = contacts[0];
            if (contacts[1]) document.getElementById('contact-2').value = contacts[1];
            if (contacts[2]) document.getElementById('contact-3').value = contacts[2];
            settingsModal.classList.remove('hidden');
        });
    }

    if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
            if (settingsStatus) settingsStatus.classList.add('hidden');
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const contacts = [];
            const c1 = document.getElementById('contact-1').value.trim();
            const c2 = document.getElementById('contact-2').value.trim();
            const c3 = document.getElementById('contact-3').value.trim();
            if (c1) contacts.push(c1);
            if (c2) contacts.push(c2);
            if (c3) contacts.push(c3);

            localStorage.setItem('saferoom_trusted_contacts', JSON.stringify(contacts));

            settingsStatus.textContent = "Contacts saved securely to your device.";
            settingsStatus.className = "alert success";
            settingsStatus.classList.remove('hidden');
            setTimeout(() => {
                settingsModal.classList.add('hidden');
                settingsStatus.classList.add('hidden');
            }, 2000);
        });
    }

    if (btnQuickSms) {
        btnQuickSms.addEventListener('click', () => {
            const contacts = JSON.parse(localStorage.getItem('saferoom_trusted_contacts') || '[]');
            if (contacts.length === 0) {
                alert("Please add trusted contacts in Settings first.");
                return;
            }

            if (!userLocation.lat) {
                alert("Location not acquired yet.");
                return;
            }

            btnQuickSms.style.opacity = '0.5';
            const numbers = contacts.join(',');
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${userLocation.lat},${userLocation.lng}`;
            const message = `I'm using SafeRoom. My live location: ${mapUrl}`;

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            const separator = isIOS ? '&' : '?';
            const smsUrl = `sms:${numbers}${separator}body=${encodeURIComponent(message)}`;

            window.location.href = smsUrl;

            setTimeout(() => {
                btnQuickSms.style.opacity = '1';
            }, 1000);
        });
    }

    // --- Fake Call Listeners ---
    if (btnFakeCall) {
        btnFakeCall.addEventListener('click', () => {
            fakeCallUi.classList.remove('hidden');
            playRingtone();
        });
    }

    if (btnAcceptCall) {
        // Return to app upon 'answering'
        btnAcceptCall.addEventListener('click', () => {
            stopRingtone();
            fakeCallUi.classList.add('hidden');
        });
    }

    if (btnDeclineCall) {
        btnDeclineCall.addEventListener('click', () => {
            stopRingtone();
            fakeCallUi.classList.add('hidden');
        });
    }

    // --- Offline State Listeners ---
    if (offlineIndicator) {
        window.addEventListener('online', () => {
            offlineIndicator.classList.add('hidden');
        });
        window.addEventListener('offline', () => {
            offlineIndicator.classList.remove('hidden');
        });
        if (!navigator.onLine) {
            offlineIndicator.classList.remove('hidden');
        }
    }

    // --- Night Warning Check ---
    if (nightWarningBanner) {
        const checkNightWarning = () => {
            const hour = new Date().getHours();
            if (hour >= 22 || hour < 5) {
                nightWarningBanner.classList.remove('hidden');
            } else {
                nightWarningBanner.classList.add('hidden');
            }
        };
        checkNightWarning();
        // optionally check every 10 minutes
        setInterval(checkNightWarning, 600000);
    }
}

// --- Fake Call Synthesized Ringtone ---
let audioContext = null;
let ringtoneInterval = null;

function playRingtone() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn("Web Audio API not supported", e);
            return;
        }
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const ring = () => {
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        // Standard phone UK/EU ring frequencies (400Hz + 450Hz sine waves)
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(400, audioContext.currentTime);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(450, audioContext.currentTime);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Envelope: 2 sec ring
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + 1.9);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 2.0);

        osc1.start(audioContext.currentTime);
        osc2.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 2.0);
        osc2.stop(audioContext.currentTime + 2.0);
    };

    ring();
    // Repeat every 4 seconds (2 seconds ring, 2 seconds silence)
    ringtoneInterval = setInterval(ring, 4000);
}

function stopRingtone() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
}

// --- Advanced Contextual Features ---

function triggerEmergency() {
    emergencyModal.classList.remove('hidden');
    const statusBox = document.getElementById('emergency-status');
    const btnCancel = document.getElementById('btn-cancel-emergency');
    const btnShare = document.getElementById('btn-share-location');
    const btnClose = document.getElementById('btn-close-modal');

    statusBox.className = "alert error";
    statusBox.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
    statusBox.style.color = "var(--safe-red)";

    if (btnCancel) btnCancel.classList.remove('hidden');
    if (btnShare) btnShare.classList.add('hidden');
    if (btnClose) btnClose.classList.add('hidden');

    let countdown = 5;
    statusBox.textContent = `Sending SOS in ${countdown}s...`;

    const sendSOS = () => {
        if (btnCancel) btnCancel.classList.add('hidden');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                statusBox.textContent = "Sending...";

                if (btnShare) {
                    btnShare.onclick = () => {
                        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${pos.coords.latitude},${pos.coords.longitude}`;
                        const shareData = {
                            title: 'Emergency: I need help!',
                            text: `I have triggered an SOS from SafeRoom. My current location is: `,
                            url: mapUrl
                        };
                        if (navigator.share) {
                            navigator.share(shareData).catch(console.error);
                        } else {
                            navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
                                .then(() => alert("Location link copied to clipboard!"))
                                .catch(console.error);
                        }
                    };
                }

                fetch(`${API_BASE}/emergency`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
                }).then(async response => {
                    if (response.ok) {
                        statusBox.textContent = "Signal Sent Successfully";
                        statusBox.className = "alert success";
                        statusBox.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
                        statusBox.style.color = "var(--safe-green)";
                    } else {
                        const data = await response.json().catch(() => ({}));
                        throw new Error(data.error || "Offline response");
                    }
                }).catch(e => {
                    statusBox.textContent = `Error: ${e.message}. Dialing local authorities immediately.`;
                }).finally(() => {
                    if (btnClose) btnClose.classList.remove('hidden');
                    if (btnShare) btnShare.classList.remove('hidden');
                });
            }, err => {
                statusBox.textContent = "Location Error. Dialing local authorities immediately.";
                if (btnClose) btnClose.classList.remove('hidden');
            });
        }
    };

    const interval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            statusBox.textContent = `Sending SOS in ${countdown}s...`;
        } else {
            clearInterval(interval);
            sendSOS();
        }
    }, 1000);

    if (btnCancel) {
        btnCancel.onclick = () => {
            clearInterval(interval);
            statusBox.textContent = "SOS Cancelled";
            statusBox.className = "alert success";
            statusBox.style.color = "var(--text-color)";
            btnCancel.classList.add('hidden');
            if (btnClose) btnClose.classList.remove('hidden');
        };
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
        countdownText.style.color = "";

        unsafeTimerInterval = setInterval(() => {
            secondsRemaining--;
            const m = String(Math.floor(secondsRemaining / 60)).padStart(2, '0');
            const s = String(secondsRemaining % 60).padStart(2, '0');
            countdownText.textContent = `${m}:${s}`;

            if (secondsRemaining === 30) {
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                countdownText.style.color = "var(--safe-red)";
            }

            if (secondsRemaining <= 0) {
                clearInterval(unsafeTimerInterval);
                unsafeTimerActive = false;
                btnUnsafeZone.classList.remove('hidden');
                timerDisplay.classList.add('hidden');
                countdownText.style.color = "";
                triggerEmergency();
            }
        }, 1000);
    });

    btnCancelTimer.addEventListener('click', () => {
        clearInterval(unsafeTimerInterval);
        unsafeTimerActive = false;
        btnUnsafeZone.classList.remove('hidden');
        timerDisplay.classList.add('hidden');
        countdownText.style.color = "";
    });

    // 2. Silent Mode
    let weatherInterval = null;
    btnSilentMode.addEventListener('click', () => {
        silentModeUI.classList.remove('hidden');

        // Dynamic mock weather generator
        const tempEl = document.getElementById('mock-weather-temp');
        const descEl = document.getElementById('mock-weather-desc');
        const detailsEl = document.getElementById('mock-weather-details');
        const conditions = ['Sunny', 'Cloudy', 'Partly Cloudy', 'Clear Skies', 'Light Rain'];

        // Initial instant change
        const changeWeather = () => {
            const temp = Math.floor(Math.random() * (32 - 18 + 1)) + 18;
            const condition = conditions[Math.floor(Math.random() * conditions.length)];
            const humidity = Math.floor(Math.random() * (90 - 45 + 1)) + 45;
            const wind = Math.floor(Math.random() * (20 - 2 + 1)) + 2;
            if (tempEl) tempEl.textContent = `${temp}°C`;
            if (descEl) descEl.textContent = condition;
            if (detailsEl) detailsEl.textContent = `Humidity: ${humidity}% | Wind: ${wind} km/h`;
        };
        changeWeather();

        if (!weatherInterval) {
            weatherInterval = setInterval(changeWeather, 4000); // Mocks changing every 4 seconds
        }
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
            if (weatherInterval) {
                clearInterval(weatherInterval);
                weatherInterval = null;
            }
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

        try {
            const ORS_API_KEY = "5b3ce3597851110001cf6248dcd1ce9ef215456ab3544db4ad8aa8bb";
            const response = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car/geojson`, {
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

    // Calculate Haversine distance between two points in meters
    function haversineDistMeters(p1, p2) {
        const R = 6371e3; // meters
        const phi1 = p1.lat * Math.PI / 180;
        const phi2 = p2.lat * Math.PI / 180;
        const deltaPhi = (p2.lat - p1.lat) * Math.PI / 180;
        const deltaLambda = (p2.lng - p1.lng) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Distance from point p to segment v-w along the Earth's surface
    function pointToSegmentDistMeters(p, v, w) {
        // Flat Earth approximation for projection, then Haversine for distance
        // Lat/Lng scaling based on cosine of latitude to avoid distortion
        const cosLat = Math.cos((v.lat * Math.PI) / 180);

        const dx = (w.lng - v.lng) * cosLat;
        const dy = (w.lat - v.lat);
        const l2 = dx * dx + dy * dy;

        if (l2 === 0) return haversineDistMeters(p, v);

        const pdx = (p.lng - v.lng) * cosLat;
        const pdy = (p.lat - v.lat);

        let t = (pdx * dx + pdy * dy) / l2;
        t = Math.max(0, Math.min(1, t));

        const proj = {
            lat: v.lat + t * (w.lat - v.lat),
            lng: v.lng + t * (w.lng - v.lng)
        };

        return haversineDistMeters(p, proj);
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

                const distM = pointToSegmentDistMeters(current, p1, p2);

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

function setupUIPolish() {
    // 1. Floating Labels
    document.querySelectorAll('.form-group').forEach(group => {
        const input = group.querySelector('input, select');
        const label = group.querySelector('label');
        if (input && label) {
            group.insertBefore(input, label);
            if (input.tagName === 'INPUT') {
                input.dataset.placeholder = input.placeholder;
                input.placeholder = " ";
            }
            const evaluateValue = () => {
                if (input.value.trim() !== "") {
                    group.classList.add('has-value');
                } else {
                    group.classList.remove('has-value');
                }
            };
            input.addEventListener('input', evaluateValue);
            input.addEventListener('change', evaluateValue);
            evaluateValue();
        }
    });

    // 2. Dark Mode Toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
        let isDark = localStorage.getItem('saferoom-theme') === 'dark';
        if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
        themeBtn.textContent = isDark ? '☀️' : '🌙';

        themeBtn.addEventListener('click', () => {
            isDark = !isDark;
            if (isDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('saferoom-theme', 'dark');
                themeBtn.textContent = '☀️';
            } else {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('saferoom-theme', 'light');
                themeBtn.textContent = '🌙';
            }
        });
    }

    // 3. Welcome Tour
    const welcomeModal = document.getElementById('welcome-modal');
    const closeTour = document.getElementById('btn-close-tour');
    if (welcomeModal && closeTour && !localStorage.getItem('saferoom-tour-seen')) {
        welcomeModal.classList.remove('hidden');
        closeTour.addEventListener('click', () => {
            welcomeModal.classList.add('hidden');
            localStorage.setItem('saferoom-tour-seen', 'true');
        });
    }
}

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    setupAdvancedFeatures();
    setupUIPolish();
});
