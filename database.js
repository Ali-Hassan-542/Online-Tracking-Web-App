// database.js - Mock database using localStorage

const DB_KEYS = {
    users: 'safetrack_users',
    consents: 'safetrack_consents',
    locations: 'safetrack_locations'
};

// Initialize database with some default data if it's empty
function initializeDatabase() {
    if (!localStorage.getItem(DB_KEYS.users)) {
        localStorage.setItem(DB_KEYS.users, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_KEYS.consents)) {
        localStorage.setItem(DB_KEYS.consents, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_KEYS.locations)) {
        localStorage.setItem(DB_KEYS.locations, JSON.stringify([]));
    }
}

// --- User Management ---

function getUsers() {
    return JSON.parse(localStorage.getItem(DB_KEYS.users)) || [];
}

function saveUsers(users) {
    localStorage.setItem(DB_KEYS.users, JSON.stringify(users));
}

function findUserByPhone(phone) {
    const users = getUsers();
    return users.find(user => user.phone_e164 === phone);
}

function findUserById(id) {
    const users = getUsers();
    return users.find(user => user.id === id);
}

function createUser(name, phone, password) {
    const users = getUsers();
    const newUser = {
        id: Date.now(),
        name,
        phone_e164: phone,
        password, // In a real app, this should be hashed
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);
    return newUser;
}


// --- Consent Management ---

function getConsents() {
    return JSON.parse(localStorage.getItem(DB_KEYS.consents)) || [];
}

function saveConsents(consents) {
    localStorage.setItem(DB_KEYS.consents, JSON.stringify(consents));
}

function findConsentById(id) {
    const consents = getConsents();
    return consents.find(consent => consent.id === id);
}

function createConsent(requesterId, recipientPhone, relationship, permissions) {
    const consents = getConsents();
    const newConsent = {
        id: Date.now(),
        requester_user_id: requesterId,
        recipient_phone: recipientPhone,
        relationship,
        permissions,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    consents.push(newConsent);
    saveConsents(consents);
    return newConsent;
}

// --- Location Management ---

function getLocations() {
    return JSON.parse(localStorage.getItem(DB_KEYS.locations)) || [];
}

function saveLocations(locations) {
    localStorage.setItem(DB_KEYS.locations, JSON.stringify(locations));
}

function addLocation(consentId, userId, locationData) {
    const locations = getLocations();
    const newLocation = {
        id: Date.now(),
        consent_id: consentId,
        user_id: userId,
        ...locationData,
        created_at: new Date().toISOString()
    };
    locations.push(newLocation);
    saveLocations(locations);
    return newLocation;
}

initializeDatabase();

// Export all functions
window.db = {
    getUsers,
    saveUsers,
    findUserByPhone,
    findUserById,
    createUser,
    getConsents,
    saveConsents,
    findConsentById,
    createConsent,
    getLocations,
    saveLocations,
    addLocation
};
