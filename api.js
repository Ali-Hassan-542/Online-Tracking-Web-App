// api.js - Mock backend API

// --- Auth ---

function register(name, phone, password) {
    if (db.findUserByPhone(phone)) {
        throw new Error('User with this phone number already exists.');
    }
    const user = db.createUser(name, phone, password);
    const token = `token_${user.id}_${Date.now()}`;
    return { ok: true, token, user };
}

function login(phone, password) {
    const user = db.findUserByPhone(phone);
    if (!user || user.password !== password) {
        throw new Error('Invalid credentials.');
    }
    const token = `token_${user.id}_${Date.now()}`;
    return { ok: true, token, user };
}

// --- Consents ---

function requestConsent(requester, recipientPhone, relationship, permissions) {
    const consent = db.createConsent(requester.id, recipientPhone, relationship, permissions);
    return { ok: true, consent_id: consent.id };
}

function getConsents(userId) {
    const allConsents = db.getConsents();
    const user = db.findUserById(userId);
    if (!user) return { ok: true, consents: [] };

    const consents = allConsents.filter(c => c.requester_user_id === userId || c.recipient_phone === user.phone_e164);
    
    const mappedConsents = consents.map(c => {
        const requester = db.findUserById(c.requester_user_id);
        const isRequester = c.requester_user_id === userId;
        const recipient = db.findUserByPhone(c.recipient_phone);

        return {
            ...c,
            requester_name: requester ? requester.name : 'Unknown',
            recipient_name: recipient ? recipient.name : 'Unknown'
        };
    });

    return { ok: true, consents: mappedConsents };
}

function respondToConsent(consentId, action) {
    const consents = db.getConsents();
    const consent = consents.find(c => c.id === consentId);
    if (!consent) {
        throw new Error('Consent not found.');
    }
    consent.status = action === 'accept' ? 'active' : 'declined';
    consent.updated_at = new Date().toISOString();
    db.saveConsents(consents);
    return { ok: true };
}

function revokeConsent(consentId) {
    const consents = db.getConsents();
    const consent = consents.find(c => c.id === consentId);
    if (consent) {
        consent.status = 'revoked';
        consent.updated_at = new Date().toISOString();
        db.saveConsents(consents);
    }
    return { ok: true };
}


// --- Tracking ---

function updateLocation(user, locationData) {
    const consentsToUpdate = db.getConsents().filter(c => c.recipient_phone === user.phone_e164 && c.status === 'active');
    
    if (consentsToUpdate.length === 0) {
        // If the user is a requester, let's find a consent they requested and simulate the recipient updating it.
        const requestedConsent = db.getConsents().find(c => c.requester_user_id === user.id && c.status === 'active');
        if (requestedConsent) {
             const recipient = db.findUserByPhone(requestedConsent.recipient_phone);
             if(recipient) {
                db.addLocation(requestedConsent.id, recipient.id, locationData);
             }
        } else {
            return { ok: true, message: 'No active consents to update.' };
        }
    } else {
        consentsToUpdate.forEach(consent => {
            db.addLocation(consent.id, user.id, locationData);
        });
    }

    return { ok: true };
}


function getLiveTrackingData(userId) {
    const userConsents = db.getConsents().filter(c => c.requester_user_id === userId && c.status === 'active');
    const consentIds = userConsents.map(c => c.id);
    const allLocations = db.getLocations();

    const activeTracks = consentIds.map(id => {
        const locations = allLocations.filter(l => l.consent_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return {
            id: id,
            latest_location: locations[0] || null
        };
    });

    return { ok: true, active_tracks: activeTracks };
}

function pollUpdates(userId, since_alert_id, since_location_id) {
    const user = db.findUserById(userId);
    if (!user) return { ok: true, alerts: [], locations: [], cursor: { since_alert_id, since_location_id } };

    const allLocations = db.getLocations();
    const consents = db.getConsents().filter(c => c.requester_user_id === userId || c.recipient_phone === user.phone_e164);
    const relevantConsentIds = consents.map(c => c.id);

    const newLocations = allLocations.filter(l => 
        l.id > since_location_id && relevantConsentIds.includes(l.consent_id)
    );
    
    const newAlerts = []; // Can simulate alerts here if needed

    const newCursor = {
        since_alert_id,
        since_location_id: newLocations.length > 0 ? newLocations[newLocations.length - 1].id : since_location_id
    };

    return { ok: true, alerts: newAlerts, locations: newLocations, cursor: newCursor };
}


// Export all functions
window.api = {
    register,
    login,
    requestConsent,
    getConsents,
    respondToConsent,
    revokeConsent,
    updateLocation,
    getLiveTrackingData,
    pollUpdates
};
