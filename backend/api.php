<?php
declare(strict_types=1);

require __DIR__ . '/db.php';
require __DIR__ . '/helpers.php';
require __DIR__ . '/providers.php';

bootstrapCors();

$config = require __DIR__ . '/config.php';
$pdo = db();
$provider = communicationProvider($config);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = routePath();

function getUserByPhone(PDO $pdo, string $phoneE164): ?array
{
    $stmt = $pdo->prepare('SELECT id, name, phone_e164 FROM users WHERE phone_e164 = ?');
    $stmt->execute([$phoneE164]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function assertConsentReadable(PDO $pdo, int $consentId, int $userId): array
{
    $stmt = $pdo->prepare('SELECT * FROM consent_requests WHERE id = ?');
    $stmt->execute([$consentId]);
    $consent = $stmt->fetch();
    if (!$consent) {
        fail('Consent not found', 404);
    }

    if ((int) $consent['requester_user_id'] !== $userId && (int) ($consent['recipient_user_id'] ?? 0) !== $userId) {
        fail('Not allowed for this consent', 403);
    }
    return $consent;
}

function assertConsentOwnedByRequester(PDO $pdo, int $consentId, int $requesterId): array
{
    $stmt = $pdo->prepare('SELECT * FROM consent_requests WHERE id = ? AND requester_user_id = ?');
    $stmt->execute([$consentId, $requesterId]);
    $consent = $stmt->fetch();
    if (!$consent) {
        fail('Consent not found or not owned by requester', 404);
    }
    return $consent;
}

function evaluateGeofences(PDO $pdo, int $trackedUserId, int $locationId, float $lat, float $lng): void
{
    $stmt = $pdo->prepare(
        'SELECT cr.id AS consent_id, cr.requester_user_id, g.id AS geofence_id, g.name, g.center_lat, g.center_lng, g.radius_m,
                g.notify_on_enter, g.notify_on_exit
         FROM consent_requests cr
         JOIN geofences g ON g.consent_id = cr.id
         WHERE cr.recipient_user_id = ? AND cr.status = "active"'
    );
    $stmt->execute([$trackedUserId]);
    $rows = $stmt->fetchAll();
    if (!$rows) {
        return;
    }

    $stateSelect = $pdo->prepare(
        'SELECT id, is_inside FROM geofence_states WHERE consent_id = ? AND geofence_id = ? AND tracked_user_id = ?'
    );
    $stateInsert = $pdo->prepare(
        'INSERT INTO geofence_states (consent_id, geofence_id, tracked_user_id, is_inside, last_location_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stateUpdate = $pdo->prepare(
        'UPDATE geofence_states SET is_inside = ?, last_location_id = ?, updated_at = ? WHERE id = ?'
    );
    $alertInsert = $pdo->prepare(
        'INSERT INTO alerts (user_id, consent_id, geofence_id, tracked_user_id, alert_type, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    foreach ($rows as $row) {
        $distance = haversineMeters($lat, $lng, (float) $row['center_lat'], (float) $row['center_lng']);
        $insideNow = $distance <= (float) $row['radius_m'] ? 1 : 0;

        $stateSelect->execute([(int) $row['consent_id'], (int) $row['geofence_id'], $trackedUserId]);
        $state = $stateSelect->fetch();

        if (!$state) {
            $stateInsert->execute([
                (int) $row['consent_id'],
                (int) $row['geofence_id'],
                $trackedUserId,
                $insideNow,
                $locationId,
                nowUtc(),
            ]);
            continue;
        }

        $insideBefore = (int) $state['is_inside'];
        if ($insideBefore !== $insideNow) {
            $alertType = $insideNow ? 'geofence_enter' : 'geofence_exit';
            $shouldNotify = $insideNow ? (int) $row['notify_on_enter'] === 1 : (int) $row['notify_on_exit'] === 1;
            if ($shouldNotify) {
                $message = sprintf(
                    'Tracked user %d %s geofence "%s"',
                    $trackedUserId,
                    $insideNow ? 'entered' : 'exited',
                    (string) $row['name']
                );
                $alertInsert->execute([
                    (int) $row['requester_user_id'],
                    (int) $row['consent_id'],
                    (int) $row['geofence_id'],
                    $trackedUserId,
                    $alertType,
                    $message,
                    nowUtc(),
                ]);
            }
        }

        $stateUpdate->execute([$insideNow, $locationId, nowUtc(), (int) $state['id']]);
    }
}

if ($method === 'GET' && $path === '/health') {
    respond(['ok' => true, 'service' => 'safetrack-php', 'time' => nowUtc()]);
}

// Auth
if ($method === 'POST' && $path === '/auth/register') {
    $input = jsonBody();
    $name = trim((string) ($input['name'] ?? ''));
    $phone = normalizePhone((string) ($input['phone'] ?? ''));
    $password = (string) ($input['password'] ?? '');

    if ($name === '' || $password === '') {
        fail('Name and password are required', 422);
    }
    if (strlen($password) < 8) {
        fail('Password must be at least 8 characters', 422);
    }
    if (!isValidE164($phone)) {
        fail('Phone must be valid E.164 format', 422);
    }

    if (getUserByPhone($pdo, $phone)) {
        fail('Phone already registered', 409);
    }

    $stmt = $pdo->prepare('INSERT INTO users (name, phone_e164, password_hash, created_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$name, $phone, password_hash($password, PASSWORD_DEFAULT), nowUtc()]);
    $userId = (int) $pdo->lastInsertId();
    $token = issueToken($pdo, $userId, (int) $config['auth']['token_ttl_seconds']);

    respond([
        'ok' => true,
        'token' => $token,
        'user' => ['id' => $userId, 'name' => $name, 'phone_e164' => $phone],
    ], 201);
}

if ($method === 'POST' && $path === '/auth/login') {
    $input = jsonBody();
    $phone = normalizePhone((string) ($input['phone'] ?? ''));
    $password = (string) ($input['password'] ?? '');
    if (!isValidE164($phone) || $password === '') {
        fail('Phone and password are required', 422);
    }

    $stmt = $pdo->prepare('SELECT id, name, phone_e164, password_hash FROM users WHERE phone_e164 = ?');
    $stmt->execute([$phone]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, (string) $user['password_hash'])) {
        fail('Invalid credentials', 401);
    }

    $token = issueToken($pdo, (int) $user['id'], (int) $config['auth']['token_ttl_seconds']);
    respond([
        'ok' => true,
        'token' => $token,
        'user' => ['id' => (int) $user['id'], 'name' => (string) $user['name'], 'phone_e164' => (string) $user['phone_e164']],
    ]);
}

if ($method === 'POST' && $path === '/auth/logout') {
    $auth = requireAuth($pdo);
    $stmt = $pdo->prepare('DELETE FROM auth_tokens WHERE id = ?');
    $stmt->execute([$auth['token_id']]);
    respond(['ok' => true]);
}

// Consent flow
if ($method === 'POST' && $path === '/consents/request') {
    $auth = requireAuth($pdo);
    $input = jsonBody();
    $recipientPhone = normalizePhone((string) ($input['recipient_phone'] ?? ''));
    $permissions = $input['permissions'] ?? ['location'];
    if (!is_array($permissions) || $permissions === []) {
        fail('permissions must be a non-empty array', 422);
    }
    if (!isValidE164($recipientPhone)) {
        fail('recipient_phone must be valid E.164', 422);
    }

    $recipient = getUserByPhone($pdo, $recipientPhone);
    $recipientId = $recipient ? (int) $recipient['id'] : null;

    $stmt = $pdo->prepare(
        'INSERT INTO consent_requests
         (requester_user_id, recipient_user_id, recipient_phone, permissions_json, status, requested_at, updated_at)
         VALUES (?, ?, ?, ?, "pending", ?, ?)'
    );
    $now = nowUtc();
    $stmt->execute([
        $auth['id'],
        $recipientId,
        $recipientPhone,
        json_encode(array_values($permissions), JSON_UNESCAPED_UNICODE),
        $now,
        $now,
    ]);

    respond([
        'ok' => true,
        'consent_id' => (int) $pdo->lastInsertId(),
        'status' => 'pending',
        'recipient_phone' => $recipientPhone,
        'permissions' => array_values($permissions),
    ], 201);
}

if ($method === 'GET' && $path === '/consents') {
    $auth = requireAuth($pdo);
    $stmt = $pdo->prepare(
        'SELECT cr.*, rq.name AS requester_name, rp.name AS recipient_name
         FROM consent_requests cr
         JOIN users rq ON rq.id = cr.requester_user_id
         LEFT JOIN users rp ON rp.id = cr.recipient_user_id
         WHERE cr.requester_user_id = ? OR cr.recipient_user_id = ?
         ORDER BY cr.id DESC'
    );
    $stmt->execute([$auth['id'], $auth['id']]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['permissions'] = json_decode((string) $row['permissions_json'], true) ?: [];
        unset($row['permissions_json']);
    }
    respond(['ok' => true, 'consents' => $rows]);
}

if ($method === 'POST' && preg_match('#^/consents/(\d+)/respond$#', $path, $m)) {
    $auth = requireAuth($pdo);
    $consentId = (int) $m[1];
    $input = jsonBody();
    $action = strtolower((string) ($input['action'] ?? ''));
    if (!in_array($action, ['accept', 'decline'], true)) {
        fail('action must be accept or decline', 422);
    }

    $stmt = $pdo->prepare('SELECT * FROM consent_requests WHERE id = ?');
    $stmt->execute([$consentId]);
    $consent = $stmt->fetch();
    if (!$consent) {
        fail('Consent not found', 404);
    }

    $recipientUserId = (int) ($consent['recipient_user_id'] ?? 0);
    $recipientPhone = (string) $consent['recipient_phone'];
    if ($recipientUserId > 0 && $recipientUserId !== $auth['id']) {
        fail('Only the recipient can respond', 403);
    }
    if ($recipientUserId === 0 && $recipientPhone !== $auth['phone_e164']) {
        fail('Recipient phone mismatch', 403);
    }

    $newStatus = $action === 'accept' ? 'active' : 'declined';
    $acceptedAt = $action === 'accept' ? nowUtc() : null;
    $declinedAt = $action === 'decline' ? nowUtc() : null;
    $recipientAssign = $recipientUserId === 0 ? $auth['id'] : $recipientUserId;

    $update = $pdo->prepare(
        'UPDATE consent_requests
         SET recipient_user_id = ?, status = ?, accepted_at = ?, declined_at = ?, updated_at = ?
         WHERE id = ?'
    );
    $update->execute([$recipientAssign, $newStatus, $acceptedAt, $declinedAt, nowUtc(), $consentId]);

    respond(['ok' => true, 'consent_id' => $consentId, 'status' => $newStatus]);
}

if ($method === 'POST' && preg_match('#^/consents/(\d+)/revoke$#', $path, $m)) {
    $auth = requireAuth($pdo);
    $consentId = (int) $m[1];
    $stmt = $pdo->prepare('SELECT * FROM consent_requests WHERE id = ?');
    $stmt->execute([$consentId]);
    $consent = $stmt->fetch();
    if (!$consent) {
        fail('Consent not found', 404);
    }
    if ((int) $consent['requester_user_id'] !== $auth['id']) {
        fail('Only requester can revoke this consent', 403);
    }

    $update = $pdo->prepare('UPDATE consent_requests SET status = "revoked", updated_at = ? WHERE id = ?');
    $update->execute([nowUtc(), $consentId]);
    respond(['ok' => true, 'consent_id' => $consentId, 'status' => 'revoked']);
}

// Geofences
if ($method === 'POST' && $path === '/geofences') {
    $auth = requireAuth($pdo);
    $input = jsonBody();
    $consentId = (int) ($input['consent_id'] ?? 0);
    $name = trim((string) ($input['name'] ?? ''));
    $lat = (float) ($input['lat'] ?? 0);
    $lng = (float) ($input['lng'] ?? 0);
    $radius = (float) ($input['radius_m'] ?? 0);
    $notifyEnter = boolField($input, 'notify_on_enter', true);
    $notifyExit = boolField($input, 'notify_on_exit', true);

    if ($consentId <= 0 || $name === '' || $radius <= 0) {
        fail('consent_id, name and radius_m are required', 422);
    }
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        fail('Invalid latitude/longitude', 422);
    }

    $consent = assertConsentOwnedByRequester($pdo, $consentId, $auth['id']);
    if ((string) $consent['status'] !== 'active') {
        fail('Consent must be active before adding geofences', 409);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO geofences
         (consent_id, name, center_lat, center_lng, radius_m, notify_on_enter, notify_on_exit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $now = nowUtc();
    $stmt->execute([$consentId, $name, $lat, $lng, $radius, $notifyEnter ? 1 : 0, $notifyExit ? 1 : 0, $now, $now]);

    respond(['ok' => true, 'geofence_id' => (int) $pdo->lastInsertId()], 201);
}

if ($method === 'GET' && $path === '/geofences') {
    $auth = requireAuth($pdo);
    $consentId = (int) ($_GET['consent_id'] ?? 0);
    if ($consentId <= 0) {
        fail('consent_id is required', 422);
    }

    assertConsentReadable($pdo, $consentId, $auth['id']);
    $stmt = $pdo->prepare('SELECT * FROM geofences WHERE consent_id = ? ORDER BY id DESC');
    $stmt->execute([$consentId]);
    respond(['ok' => true, 'geofences' => $stmt->fetchAll()]);
}

// Location + tracking
if ($method === 'POST' && $path === '/location/update') {
    $auth = requireAuth($pdo);
    $input = jsonBody();
    $lat = (float) ($input['lat'] ?? 0);
    $lng = (float) ($input['lng'] ?? 0);
    $accuracy = isset($input['accuracy']) ? (float) $input['accuracy'] : null;
    $speed = isset($input['speed']) ? (float) $input['speed'] : null;
    $battery = isset($input['battery']) ? (int) $input['battery'] : null;
    $activity = trim((string) ($input['activity'] ?? 'unknown'));

    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        fail('Invalid latitude/longitude', 422);
    }
    if ($battery !== null && ($battery < 0 || $battery > 100)) {
        fail('battery must be between 0 and 100', 422);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO locations (user_id, lat, lng, accuracy_m, speed_mps, battery_percent, activity_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$auth['id'], $lat, $lng, $accuracy, $speed, $battery, $activity, nowUtc()]);
    $locationId = (int) $pdo->lastInsertId();

    evaluateGeofences($pdo, $auth['id'], $locationId, $lat, $lng);

    respond([
        'ok' => true,
        'location_id' => $locationId,
        'lat' => $lat,
        'lng' => $lng,
        'created_at' => nowUtc(),
    ], 201);
}

if ($method === 'GET' && $path === '/tracking/live') {
    $auth = requireAuth($pdo);
    $consentId = (int) ($_GET['consent_id'] ?? 0);
    $historyLimit = (int) ($_GET['history_limit'] ?? 20);
    if ($historyLimit < 1 || $historyLimit > 200) {
        $historyLimit = 20;
    }

    if ($consentId > 0) {
        $consent = assertConsentReadable($pdo, $consentId, $auth['id']);
        $trackedUserId = (int) ($consent['recipient_user_id'] ?? 0);
        if ($trackedUserId <= 0) {
            respond(['ok' => true, 'consent' => $consent, 'latest_location' => null, 'history' => []]);
        }
        $latestStmt = $pdo->prepare('SELECT * FROM locations WHERE user_id = ? ORDER BY id DESC LIMIT 1');
        $latestStmt->execute([$trackedUserId]);
        $latest = $latestStmt->fetch() ?: null;

        $histStmt = $pdo->prepare('SELECT * FROM locations WHERE user_id = ? ORDER BY id DESC LIMIT ' . $historyLimit);
        $histStmt->execute([$trackedUserId]);
        $history = $histStmt->fetchAll();

        respond(['ok' => true, 'consent' => $consent, 'latest_location' => $latest, 'history' => $history]);
    }

    // Dashboard mode: all active consents owned by requester.
    $stmt = $pdo->prepare(
        'SELECT cr.id, cr.recipient_user_id, u.name AS recipient_name, u.phone_e164 AS recipient_phone
         FROM consent_requests cr
         JOIN users u ON u.id = cr.recipient_user_id
         WHERE cr.requester_user_id = ? AND cr.status = "active"
         ORDER BY cr.id DESC'
    );
    $stmt->execute([$auth['id']]);
    $consents = $stmt->fetchAll();
    $latestStmt = $pdo->prepare('SELECT * FROM locations WHERE user_id = ? ORDER BY id DESC LIMIT 1');
    foreach ($consents as &$c) {
        $latestStmt->execute([(int) $c['recipient_user_id']]);
        $c['latest_location'] = $latestStmt->fetch() ?: null;
    }
    respond(['ok' => true, 'active_tracks' => $consents]);
}

if ($method === 'GET' && $path === '/alerts') {
    $auth = requireAuth($pdo);
    $sinceId = (int) ($_GET['since_id'] ?? 0);
    $stmt = $pdo->prepare(
        'SELECT * FROM alerts WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT 200'
    );
    $stmt->execute([$auth['id'], $sinceId]);
    respond(['ok' => true, 'alerts' => $stmt->fetchAll()]);
}

if ($method === 'GET' && $path === '/updates/poll') {
    $auth = requireAuth($pdo);
    $sinceAlertId = (int) ($_GET['since_alert_id'] ?? 0);
    $sinceLocationId = (int) ($_GET['since_location_id'] ?? 0);

    $alertsStmt = $pdo->prepare('SELECT * FROM alerts WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT 200');
    $alertsStmt->execute([$auth['id'], $sinceAlertId]);
    $alerts = $alertsStmt->fetchAll();

    $locationsStmt = $pdo->prepare(
        'SELECT l.*, cr.id AS consent_id
         FROM locations l
         JOIN consent_requests cr ON cr.recipient_user_id = l.user_id
         WHERE cr.requester_user_id = ? AND cr.status = "active" AND l.id > ?
         ORDER BY l.id ASC
         LIMIT 500'
    );
    $locationsStmt->execute([$auth['id'], $sinceLocationId]);
    $locations = $locationsStmt->fetchAll();

    $lastAlertId = $sinceAlertId;
    foreach ($alerts as $a) {
        $lastAlertId = max($lastAlertId, (int) $a['id']);
    }
    $lastLocationId = $sinceLocationId;
    foreach ($locations as $l) {
        $lastLocationId = max($lastLocationId, (int) $l['id']);
    }

    respond([
        'ok' => true,
        'alerts' => $alerts,
        'locations' => $locations,
        'cursor' => [
            'since_alert_id' => $lastAlertId,
            'since_location_id' => $lastLocationId,
        ],
    ]);
}

// SMS / Calls hooks
if ($method === 'POST' && $path === '/communications/sms') {
    $auth = requireAuth($pdo);
    $input = jsonBody();
    $toPhone = normalizePhone((string) ($input['to_phone'] ?? ''));
    $message = trim((string) ($input['message'] ?? ''));
    if (!isValidE164($toPhone)) {
        fail('to_phone must be valid E.164', 422);
    }
    if ($message === '') {
        fail('message is required', 422);
    }

    $insert = $pdo->prepare(
        'INSERT INTO outbound_messages
         (user_id, to_phone, message_text, provider_name, provider_message_id, status, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, "queued", NULL, ?, ?)'
    );
    $now = nowUtc();
    $insert->execute([$auth['id'], $toPhone, $message, $config['provider']['name'], $now, $now]);
    $id = (int) $pdo->lastInsertId();

    $result = $provider->sendSms($toPhone, $message);
    $update = $pdo->prepare(
        'UPDATE outbound_messages SET provider_message_id = ?, status = ?, metadata_json = ?, updated_at = ? WHERE id = ?'
    );
    $update->execute([
        $result['provider_message_id'] ?? null,
        $result['status'] ?? ($result['ok'] ? 'sent' : 'failed'),
        json_encode($result['meta'] ?? [], JSON_UNESCAPED_UNICODE),
        nowUtc(),
        $id,
    ]);

    respond(['ok' => true, 'message_id' => $id, 'provider_result' => $result], 201);
}

if ($method === 'POST' && $path === '/communications/call') {
    $auth = requireAuth($pdo);
    $input = jsonBody();
    $toPhone = normalizePhone((string) ($input['to_phone'] ?? ''));
    $messageUrl = isset($input['message_url']) ? trim((string) $input['message_url']) : null;
    if (!isValidE164($toPhone)) {
        fail('to_phone must be valid E.164', 422);
    }

    $insert = $pdo->prepare(
        'INSERT INTO outbound_calls
         (user_id, to_phone, message_url, provider_name, provider_call_id, status, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, "queued", NULL, ?, ?)'
    );
    $now = nowUtc();
    $insert->execute([$auth['id'], $toPhone, $messageUrl, $config['provider']['name'], $now, $now]);
    $id = (int) $pdo->lastInsertId();

    $result = $provider->placeCall($toPhone, $messageUrl);
    $update = $pdo->prepare(
        'UPDATE outbound_calls SET provider_call_id = ?, status = ?, metadata_json = ?, updated_at = ? WHERE id = ?'
    );
    $update->execute([
        $result['provider_call_id'] ?? null,
        $result['status'] ?? ($result['ok'] ? 'queued' : 'failed'),
        json_encode($result['meta'] ?? [], JSON_UNESCAPED_UNICODE),
        nowUtc(),
        $id,
    ]);

    respond(['ok' => true, 'call_id' => $id, 'provider_result' => $result], 201);
}

fail('Route not found', 404, ['method' => $method, 'path' => $path]);
