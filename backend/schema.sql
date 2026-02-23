CREATE DATABASE IF NOT EXISTS safetrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE safetrack;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone_e164 VARCHAR(16) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_auth_tokens_user_id (user_id),
    CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consent_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    requester_user_id BIGINT UNSIGNED NOT NULL,
    recipient_user_id BIGINT UNSIGNED NULL,
    recipient_phone VARCHAR(16) NOT NULL,
    permissions_json JSON NOT NULL,
    status ENUM('pending','active','declined','expired','revoked') NOT NULL DEFAULT 'pending',
    requested_at DATETIME NOT NULL,
    accepted_at DATETIME NULL,
    declined_at DATETIME NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_consents_requester (requester_user_id),
    INDEX idx_consents_recipient (recipient_user_id),
    INDEX idx_consents_status (status),
    CONSTRAINT fk_consents_requester FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_consents_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS geofences (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consent_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    center_lat DECIMAL(10,7) NOT NULL,
    center_lng DECIMAL(10,7) NOT NULL,
    radius_m DECIMAL(10,2) NOT NULL,
    notify_on_enter TINYINT(1) NOT NULL DEFAULT 1,
    notify_on_exit TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_geofences_consent (consent_id),
    CONSTRAINT fk_geofences_consent FOREIGN KEY (consent_id) REFERENCES consent_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS locations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    lat DECIMAL(10,7) NOT NULL,
    lng DECIMAL(10,7) NOT NULL,
    accuracy_m DECIMAL(8,2) NULL,
    speed_mps DECIMAL(8,2) NULL,
    battery_percent TINYINT UNSIGNED NULL,
    activity_status VARCHAR(64) NOT NULL DEFAULT 'unknown',
    created_at DATETIME NOT NULL,
    INDEX idx_locations_user_created (user_id, created_at),
    INDEX idx_locations_id (id),
    CONSTRAINT fk_locations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS geofence_states (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consent_id BIGINT UNSIGNED NOT NULL,
    geofence_id BIGINT UNSIGNED NOT NULL,
    tracked_user_id BIGINT UNSIGNED NOT NULL,
    is_inside TINYINT(1) NOT NULL,
    last_location_id BIGINT UNSIGNED NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_geofence_state (consent_id, geofence_id, tracked_user_id),
    CONSTRAINT fk_geofence_states_consent FOREIGN KEY (consent_id) REFERENCES consent_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_geofence_states_geofence FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE CASCADE,
    CONSTRAINT fk_geofence_states_tracked_user FOREIGN KEY (tracked_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_geofence_states_location FOREIGN KEY (last_location_id) REFERENCES locations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alerts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    consent_id BIGINT UNSIGNED NOT NULL,
    geofence_id BIGINT UNSIGNED NULL,
    tracked_user_id BIGINT UNSIGNED NOT NULL,
    alert_type VARCHAR(64) NOT NULL,
    message VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_alerts_user_id (user_id),
    INDEX idx_alerts_id (id),
    CONSTRAINT fk_alerts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_alerts_consent FOREIGN KEY (consent_id) REFERENCES consent_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_alerts_geofence FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE SET NULL,
    CONSTRAINT fk_alerts_tracked_user FOREIGN KEY (tracked_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbound_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    to_phone VARCHAR(16) NOT NULL,
    message_text TEXT NOT NULL,
    provider_name VARCHAR(64) NOT NULL,
    provider_message_id VARCHAR(128) NULL,
    status VARCHAR(32) NOT NULL,
    metadata_json JSON NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_messages_user (user_id),
    CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbound_calls (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    to_phone VARCHAR(16) NOT NULL,
    message_url VARCHAR(255) NULL,
    provider_name VARCHAR(64) NOT NULL,
    provider_call_id VARCHAR(128) NULL,
    status VARCHAR(32) NOT NULL,
    metadata_json JSON NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_calls_user (user_id),
    CONSTRAINT fk_calls_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
