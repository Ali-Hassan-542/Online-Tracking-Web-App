// SafeTrack frontend wired to PHP + MySQL backend.
document.addEventListener('DOMContentLoaded', async () => {
    initApp();
    setupEventListeners();
    initMap();
    await bootstrapData();
});

const API_BASE = window.location.pathname.startsWith('/backend/')
    ? '/api.php'
    : '/backend/api.php';

const STORAGE_KEYS = {
    token: 'safetrack_auth_token',
    user: 'safetrack_auth_user'
};

const state = {
    mode: 'backend',
    token: localStorage.getItem(STORAGE_KEYS.token) || '',
    authUser: null,
    consents: [],
    history: [],
    alerts: [],
    pollCursor: { since_alert_id: 0, since_location_id: 0 },
    pollTimer: null
};

let map;
let markers = [];

const sampleConsents = [
    {
        id: 1,
        name: 'John Smith',
        phone: '+15551234567',
        status: 'active',
        permissions: ['location', 'activity'],
        lastUpdate: new Date().toISOString(),
        lastLocation: { lat: 40.7128, lng: -74.0060 },
        avatar: 'JS'
    }
];

function initApp() {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    if (raw) {
        try {
            state.authUser = JSON.parse(raw);
        } catch (_error) {}
    }
}

function getConsents() {
    return state.consents;
}

function saveConsents(consents) {
    state.consents = Array.isArray(consents) ? consents : [];
}

function getLocationHistory() {
    return state.history;
}

function saveLocationHistory(history) {
    state.history = Array.isArray(history) ? history : [];
}

async function bootstrapData() {
    const authed = await ensureAuthSession();
    if (!authed) {
        state.mode = 'local';
        saveConsents(sampleConsents);
        loadConsents();
        updateDashboard();
        showNotification('Backend auth skipped. Running in local demo mode.', 'warning');
        return;
    }

    await refreshFromServer();
    startPolling();
}

function setupEventListeners() {
    const addListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        }
    };

    addListener('trackingForm', 'submit', async (e) => {
        e.preventDefault();
        await requestConsent();
    });

    addListener('simulateUpdate', 'click', async () => await simulateLocationUpdate());
    addListener('addDemoContact', 'click', async () => await addDemoContact());
    addListener('clearData', 'click', () => clearAllData());

    document.addEventListener('click', async (event) => {
        const target = event.target.closest('[data-action="simulate-update"]');
        if (target) await simulateLocationUpdate();
    });

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({ top: targetElement.offsetTop - 80, behavior: 'smooth' });
            }
        });
    });
}

async function ensureAuthSession() {
    if (state.token) return true;

    const mode = (prompt('Backend login required. Type "login" or "register" (cancel for local demo mode):', 'login') || '')
        .trim()
        .toLowerCase();
    if (!mode) return false;

    const phoneInput = prompt('Enter your phone in E.164 format (example +923001234567):', '');
    const password = prompt('Enter your password:', '');
    if (!phoneInput || !password) {
        showNotification('Auth cancelled', 'warning');
        return false;
    }

    const payload = {
        phone: normalizePhone(phoneInput),
        password: password
    };
    let endpoint = '/auth/login';
    if (mode === 'register') {
        const name = prompt('Enter your full name:', '') || '';
        if (!name.trim()) {
            showNotification('Name is required for registration', 'danger');
            return false;
        }
        endpoint = '/auth/register';
        payload.name = name.trim();
    }

    try {
        const result = await apiRequest(endpoint, 'POST', payload, false);
        if (!result.ok || !result.token) {
            throw new Error(result.error || 'Auth failed');
        }
        state.token = result.token;
        state.authUser = result.user || null;
        localStorage.setItem(STORAGE_KEYS.token, state.token);
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(state.authUser || {}));
        showNotification('Authenticated successfully', 'success');
        return true;
    } catch (error) {
        showNotification(`Auth failed: ${error.message}`, 'danger');
        return false;
    }
}

async function apiRequest(path, method = 'GET', body = null, withAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (withAuth && state.token) headers.Authorization = `Bearer ${state.token}`;

    const options = { method, headers };
    if (body !== null) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
        const message = data.error || `HTTP ${response.status}`;
        throw new Error(message);
    }
    return data;
}

async function refreshFromServer() {
    if (state.mode !== 'backend') return;

    const consentsResult = await apiRequest('/consents');
    const liveResult = await apiRequest('/tracking/live');
    const activeByConsent = {};
    (liveResult.active_tracks || []).forEach((track) => {
        activeByConsent[Number(track.id)] = track.latest_location || null;
    });

    const mapped = (consentsResult.consents || []).map((row) => {
        const isRequester = Number(row.requester_user_id) === Number(state.authUser?.id || 0);
        const displayName = isRequester
            ? (row.recipient_name || row.recipient_phone || 'Unknown')
            : (row.requester_name || 'Unknown');
        const phone = isRequester ? row.recipient_phone : (state.authUser?.phone_e164 || row.recipient_phone);
        const location = activeByConsent[Number(row.id)] || null;

        return {
            id: Number(row.id),
            name: displayName,
            phone: phone,
            status: String(row.status || 'pending') === 'declined' ? 'expired' : String(row.status || 'pending'),
            permissions: Array.isArray(row.permissions) ? row.permissions : [],
            lastUpdate: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            lastLocation: location
                ? {
                    lat: Number(location.lat),
                    lng: Number(location.lng)
                }
                : null,
            avatar: initials(displayName),
            raw: row
        };
    });

    saveConsents(mapped);
    loadConsents();
    updateMapMarkers();
}

function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
        try {
            await pollUpdates();
        } catch (_error) {}
    }, 7000);
}

async function pollUpdates() {
    if (state.mode !== 'backend' || !state.token) return;
    const q = `?since_alert_id=${state.pollCursor.since_alert_id}&since_location_id=${state.pollCursor.since_location_id}`;
    const result = await apiRequest(`/updates/poll${q}`);
    state.pollCursor = result.cursor || state.pollCursor;

    const alerts = Array.isArray(result.alerts) ? result.alerts : [];
    alerts.forEach((a) => {
        showNotification(a.message, 'info');
    });

    const locations = Array.isArray(result.locations) ? result.locations : [];
    if (locations.length > 0) {
        const consents = getConsents().map((consent) => {
            const latest = locations
                .filter((loc) => Number(loc.consent_id) === Number(consent.id))
                .pop();
            if (!latest) return consent;
            return {
                ...consent,
                lastLocation: { lat: Number(latest.lat), lng: Number(latest.lng) },
                lastUpdate: latest.created_at ? new Date(latest.created_at).toISOString() : new Date().toISOString()
            };
        });
        saveConsents(consents);

        const history = getLocationHistory();
        locations.forEach((loc) => {
            const owner = consents.find((c) => Number(c.id) === Number(loc.consent_id));
            history.push({
                name: owner?.name || `User ${loc.user_id}`,
                lat: Number(loc.lat),
                lng: Number(loc.lng),
                timestamp: loc.created_at ? new Date(loc.created_at).toISOString() : new Date().toISOString(),
                activity: loc.activity_status || 'unknown'
            });
        });
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
        saveLocationHistory(history);

        loadConsents();
        updateMapMarkers();
        updateLocationHistory();
    }
}

function initMap() {
    if (!window.L) {
        showNotification('Map library failed to load. Check your internet connection.', 'danger');
        return;
    }
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    map = L.map('map').setView([30.3753, 69.3451], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);
    updateMapMarkers();
}

function updateMapMarkers() {
    if (!map) return;
    markers.forEach((marker) => map.removeLayer(marker));
    markers = [];

    getConsents().forEach((consent) => {
        if (consent.status === 'active' && consent.lastLocation) {
            const marker = L.marker([consent.lastLocation.lat, consent.lastLocation.lng])
                .addTo(map)
                .bindPopup(
                    `<strong>${consent.name}</strong><br>${consent.phone}<br><small>Last updated: ${formatTime(consent.lastUpdate)}</small>`
                );
            markers.push(marker);
        }
    });
}

function loadConsents() {
    const consents = getConsents();
    const tbody = document.querySelector('#consentsTable tbody');
    updateStats(consents);
    tbody.innerHTML = '';

    consents.forEach((consent) => {
        const row = document.createElement('tr');
        const status = String(consent.status);
        const badge = status === 'active'
            ? '<span class="badge bg-success">Active</span>'
            : status === 'pending'
                ? '<span class="badge bg-warning">Pending</span>'
                : '<span class="badge bg-secondary">Inactive</span>';
        const permissionBadges = (consent.permissions || []).map((perm) =>
            `<span class="badge bg-info me-1">${perm}</span>`).join('');

        row.innerHTML = `
            <td><strong>${consent.name}</strong><br><small class="text-muted">${consent.phone}</small></td>
            <td>${badge}</td>
            <td>${permissionBadges}</td>
            <td>${formatTime(consent.lastUpdate)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewConsent(${consent.id})"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-outline-warning" onclick="editConsent(${consent.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="revokeConsent(${consent.id})"><i class="fas fa-ban"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    updateTrackedContacts();
    updateDashboard();
}

function updateStats(consents) {
    const active = consents.filter((c) => c.status === 'active').length;
    const pending = consents.filter((c) => c.status === 'pending').length;
    const expired = consents.filter((c) => c.status !== 'active' && c.status !== 'pending').length;
    document.getElementById('activeConsents').textContent = String(active);
    document.getElementById('pendingConsents').textContent = String(pending);
    document.getElementById('expiredConsents').textContent = String(expired);
    document.getElementById('totalConsents').textContent = String(consents.length);
}

function updateTrackedContacts() {
    const container = document.getElementById('trackedContacts');
    const activeConsents = getConsents().filter((c) => c.status === 'active');
    container.innerHTML = '';

    if (activeConsents.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-users fa-3x text-muted mb-3"></i>
                <p class="text-muted">No active trackings</p>
                <button class="btn btn-sm btn-primary" onclick="document.querySelector('#track').scrollIntoView()">Request Tracking</button>
            </div>
        `;
        return;
    }

    activeConsents.forEach((consent) => {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.innerHTML = `
            <div class="contact-avatar">${consent.avatar}</div>
            <div class="contact-info">
                <div class="contact-name">${consent.name}</div>
                <div class="contact-number">${consent.phone}</div>
            </div>
            <div class="contact-status status-online"></div>
        `;
        div.addEventListener('click', () => {
            if (map && consent.lastLocation) {
                map.setView([consent.lastLocation.lat, consent.lastLocation.lng], 13);
                showNotification(`Centered map on ${consent.name}`, 'info');
            }
        });
        container.appendChild(div);
    });
}

function updateDashboard() {
    updateLocationHistory();
    updateLiveUpdates();
}

function updateLocationHistory() {
    const container = document.getElementById('locationHistory');
    const history = getLocationHistory();
    if (history.length === 0) {
        container.innerHTML = `
            <div class="text-center py-3">
                <i class="fas fa-history fa-2x text-muted mb-2"></i>
                <p class="text-muted">No location history yet</p>
                <button class="btn btn-sm btn-primary" data-action="simulate-update">Simulate Update</button>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    history.slice(-5).reverse().forEach((entry) => {
        const div = document.createElement('div');
        div.className = 'location-entry mb-3 p-3 border rounded';
        div.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>${entry.name}</strong>
                <small class="text-muted">${formatTime(entry.timestamp)}</small>
            </div>
            <div class="mt-2">
                <i class="fas fa-map-marker-alt text-danger me-2"></i>
                <span class="small">${Number(entry.lat).toFixed(4)}, ${Number(entry.lng).toFixed(4)}</span>
            </div>
            ${entry.activity ? `<div class="small mt-1"><i class="fas fa-walking me-2"></i>${entry.activity}</div>` : ''}
        `;
        container.appendChild(div);
    });
}

function updateLiveUpdates() {
    const container = document.getElementById('liveUpdates');
    container.innerHTML = '';
    getConsents().filter((c) => c.status === 'active').forEach((consent) => {
        const div = document.createElement('div');
        div.className = 'update-item mb-2 p-2 border-start border-primary';
        div.innerHTML = `
            <div class="small">
                <i class="fas fa-user-circle me-2"></i>
                <strong>${consent.name}</strong> is active
                <br>
                <span class="text-muted">Last seen ${formatRelativeTime(consent.lastUpdate)}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

async function requestConsent() {
    const phoneInput = document.getElementById('phoneNumber');
    const relationshipSelect = document.getElementById('relationship');
    if (!phoneInput.value.trim() || !relationshipSelect.value) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }

    const legal1 = document.getElementById('legal1').checked;
    const legal2 = document.getElementById('legal2').checked;
    const legal3 = document.getElementById('legal3').checked;
    if (!legal1 || !legal2 || !legal3) {
        showNotification('You must agree to all legal requirements', 'danger');
        return;
    }

    const permissions = [];
    document.querySelectorAll('.permission-check:checked').forEach((cb) => permissions.push(cb.id.replace('perm-', '')));
    if (permissions.length === 0) {
        showNotification('Please select at least one permission', 'warning');
        return;
    }

    if (state.mode !== 'backend') {
        showNotification('Backend is not connected. Please login to send consent requests.', 'warning');
        return;
    }

    try {
        const result = await apiRequest('/consents/request', 'POST', {
            recipient_phone: normalizePhone(phoneInput.value),
            relationship: relationshipSelect.value,
            permissions: permissions
        });
        showNotification(`Consent request #${result.consent_id} created`, 'success');
        phoneInput.value = '';
        relationshipSelect.value = '';
        document.getElementById('legal1').checked = false;
        document.getElementById('legal2').checked = false;
        document.getElementById('legal3').checked = false;
        await refreshFromServer();
    } catch (error) {
        showNotification(`Failed to request consent: ${error.message}`, 'danger');
    }
}

async function revokeConsent(consentId) {
    if (!confirm('Are you sure you want to revoke this consent?')) return;
    if (state.mode !== 'backend') {
        showNotification('Revoke requires backend mode', 'warning');
        return;
    }
    try {
        await apiRequest(`/consents/${consentId}/revoke`, 'POST', {});
        showNotification('Consent revoked successfully', 'info');
        await refreshFromServer();
    } catch (error) {
        showNotification(`Failed to revoke: ${error.message}`, 'danger');
    }
}

function viewConsent(consentId) {
    const consent = getConsents().find((c) => Number(c.id) === Number(consentId));
    if (!consent) return;
    const existingModal = document.getElementById('consentModal');
    if (existingModal) existingModal.remove();

    const modalContent = `
        <div class="modal fade" id="consentModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${consent.name}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p><strong>Phone:</strong> ${consent.phone}</p>
                        <p><strong>Status:</strong> <span class="badge bg-${consent.status === 'active' ? 'success' : 'warning'}">${consent.status}</span></p>
                        <p><strong>Permissions:</strong></p>
                        <ul>${consent.permissions.map((p) => `<li>${capitalize(p)}</li>`).join('')}</ul>
                        ${consent.lastLocation ? `<p><strong>Last Location:</strong><br>${consent.lastLocation.lat.toFixed(4)}, ${consent.lastLocation.lng.toFixed(4)}</p>` : ''}
                        <p><strong>Last Updated:</strong> ${formatTime(consent.lastUpdate)}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalContent;
    document.body.appendChild(wrapper);
    const modal = new bootstrap.Modal(document.getElementById('consentModal'));
    modal.show();
    document.getElementById('consentModal').addEventListener('hidden.bs.modal', () => wrapper.remove());
}

async function simulateLocationUpdate() {
    if (state.mode !== 'backend') {
        showNotification('Location simulation requires backend mode', 'warning');
        return;
    }
    try {
        const location = await getCurrentOrSimulatedLocation();
        const activities = ['walking', 'driving', 'stationary'];
        const activity = activities[Math.floor(Math.random() * activities.length)];
        await apiRequest('/location/update', 'POST', {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            speed: location.speed || 0,
            battery: Math.floor(Math.random() * 60) + 40,
            activity: activity
        });
        showNotification('Location update sent', 'success');

        const history = getLocationHistory();
        history.push({
            name: state.authUser?.name || 'You',
            lat: location.lat,
            lng: location.lng,
            timestamp: new Date().toISOString(),
            activity: activity
        });
        if (history.length > 100) history.shift();
        saveLocationHistory(history);
        updateLocationHistory();

        await refreshFromServer();
    } catch (error) {
        showNotification(`Failed to update location: ${error.message}`, 'danger');
    }
}

async function addDemoContact() {
    const phone = prompt('Enter recipient phone in E.164 (example +923001234567):', '');
    if (!phone) return;
    document.getElementById('phoneNumber').value = phone;
    document.getElementById('relationship').value = 'family';
    document.getElementById('legal1').checked = true;
    document.getElementById('legal2').checked = true;
    document.getElementById('legal3').checked = true;
    await requestConsent();
}

async function clearAllData() {
    if (!confirm('This will clear your local session. Continue?')) return;
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
    showNotification('Session cleared. Reloading...', 'info');
    setTimeout(() => location.reload(), 800);
}

async function runDemo() {
    if (state.mode !== 'backend') {
        showNotification('Demo requires backend mode', 'warning');
        return;
    }
    if (!state.authUser?.phone_e164) {
        showNotification('Missing authenticated user phone', 'danger');
        return;
    }

    try {
        const req = await apiRequest('/consents/request', 'POST', {
            recipient_phone: state.authUser.phone_e164,
            permissions: ['location', 'activity', 'battery']
        });
        await apiRequest(`/consents/${req.consent_id}/respond`, 'POST', { action: 'accept' });
        await simulateLocationUpdate();
        await refreshFromServer();
        document.querySelector('#dashboard').scrollIntoView({ behavior: 'smooth' });
        showNotification('Demo created: self-consent accepted and location sent', 'success');
    } catch (error) {
        showNotification(`Demo failed: ${error.message}`, 'danger');
    }
}

function showConsentFlow() {
    alert('Consent Flow:\n\n1. Request consent\n2. Recipient logs in and accepts\n3. Recipient sends location updates\n4. Requester sees live updates');
}

function showSourceCode() {
    alert('Frontend: HTML/CSS/JS\nBackend: PHP + MySQL API\nRealtime: polling updates endpoint');
}

function formatTime(isoString) {
    const date = new Date(isoString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top:20px;right:20px;z-index:9999;min-width:300px;box-shadow:0 5px 15px rgba(0,0,0,0.2);';
    notification.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.parentNode && notification.remove(), 5000);
}

function resetApp() {
    if (confirm('Reset app session?')) {
        localStorage.removeItem(STORAGE_KEYS.token);
        localStorage.removeItem(STORAGE_KEYS.user);
        location.reload();
    }
}

function exportData() {
    const data = {
        consents: getConsents(),
        history: getLocationHistory(),
        exportDate: new Date().toISOString()
    };
    const uri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const a = document.createElement('a');
    a.href = uri;
    a.download = 'safetrack-data.json';
    a.click();
    showNotification('Data exported successfully', 'success');
}

function importData() {
    showNotification('Import from JSON is disabled in backend mode. Use API endpoints.', 'warning');
}

function normalizePhone(phone) {
    const trimmed = (phone || '').trim();
    if (trimmed.startsWith('+')) {
        return `+${trimmed.slice(1).replace(/\D/g, '')}`;
    }
    if (trimmed.startsWith('00')) {
        return `+${trimmed.slice(2).replace(/\D/g, '')}`;
    }

    const digits = trimmed.replace(/\D/g, '');

    // Rule for Pakistan: 03xx yyyyyyy (11 digits total) -> +92 3xx yyyyyyy
    if (digits.length === 11 && digits.startsWith('03')) {
        return `+92${digits.slice(1)}`;
    }

    // Fallback for other numbers, prepending '+'. This can be ambiguous.
    // For full international support, a library like Google's libphonenumber is recommended.
    return `+${digits}`;
}

function initials(name) {
    return (name || 'U')
        .split(' ')
        .filter(Boolean)
        .map((x) => x[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

async function getCurrentOrSimulatedLocation() {
    if (!navigator.geolocation) {
        return randomLocationFallback();
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy || 20,
                    speed: position.coords.speed || 0
                });
            },
            () => resolve(randomLocationFallback()),
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
        );
    });
}

function randomLocationFallback() {
    return {
        lat: 24.8607 + (Math.random() - 0.5) * 0.2,
        lng: 67.0011 + (Math.random() - 0.5) * 0.2,
        accuracy: 30,
        speed: 0
    };
}

window.viewConsent = viewConsent;
window.editConsent = viewConsent;
window.revokeConsent = revokeConsent;
window.runDemo = runDemo;
window.showConsentFlow = showConsentFlow;
window.showSourceCode = showSourceCode;
window.resetApp = resetApp;
window.exportData = exportData;
window.importData = importData;
