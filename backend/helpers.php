<?php
declare(strict_types=1);

function bootstrapCors(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function jsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function respond(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400, array $extra = []): void
{
    respond(array_merge(['ok' => false, 'error' => $message], $extra), $status);
}

function normalizePhone(string $phone): string
{
    $trimmed = trim($phone);
    if (str_starts_with($trimmed, '+')) {
        return '+' . (preg_replace('/\D+/', '', substr($trimmed, 1)) ?? '');
    }
    if (str_starts_with($trimmed, '00')) {
        return '+' . (preg_replace('/\D+/', '', substr($trimmed, 2)) ?? '');
    }

    // Get only digits for local number processing
    $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

    // Rule for Pakistan: 03xx yyyyyyy (11 digits total) -> +92 3xx yyyyyyy
    if (strlen($digits) === 11 && str_starts_with($digits, '03')) {
        return '+92' . substr($digits, 1);
    }

    // Fallback for other numbers, prepending '+'. This can be ambiguous.
    // For full international support, a library like libphonenumber is recommended.
    return '+' . $digits;
}

function isValidE164(string $phone): bool
{
    return (bool) preg_match('/^\+[1-9]\d{7,14}$/', $phone);
}

function nowUtc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function parseBearerToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.+)$/i', $header, $m)) {
        return null;
    }
    return trim($m[1]);
}

function issueToken(PDO $pdo, int $userId, int $ttlSeconds): string
{
    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $expiresAt = gmdate('Y-m-d H:i:s', time() + $ttlSeconds);

    $stmt = $pdo->prepare(
        'INSERT INTO auth_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$userId, $tokenHash, $expiresAt, nowUtc()]);

    return $token;
}

function requireAuth(PDO $pdo): array
{
    $token = parseBearerToken();
    if (!$token) {
        fail('Missing bearer token', 401);
    }

    $tokenHash = hash('sha256', $token);
    $stmt = $pdo->prepare(
        'SELECT t.id AS token_id, t.user_id, t.expires_at, u.name, u.phone_e164
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ?'
    );
    $stmt->execute([$tokenHash]);
    $row = $stmt->fetch();
    if (!$row) {
        fail('Invalid token', 401);
    }
    if (strtotime((string) $row['expires_at']) < time()) {
        fail('Token expired', 401);
    }

    return [
        'token_id' => (int) $row['token_id'],
        'id' => (int) $row['user_id'],
        'name' => (string) $row['name'],
        'phone_e164' => (string) $row['phone_e164'],
    ];
}

function routePath(): string
{
    $pathInfo = $_SERVER['PATH_INFO'] ?? null;
    if (is_string($pathInfo) && $pathInfo !== '') {
        return '/' . ltrim($pathInfo, '/');
    }

    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    if ($scriptName !== '' && str_starts_with($uriPath, $scriptName)) {
        $rest = substr($uriPath, strlen($scriptName));
        return $rest === '' ? '/' : $rest;
    }

    return $uriPath === '' ? '/' : $uriPath;
}

function haversineMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $earthRadius = 6371000.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2
        + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $earthRadius * $c;
}

function boolField(array $input, string $key, bool $default = false): bool
{
    if (!array_key_exists($key, $input)) {
        return $default;
    }
    return filter_var($input[$key], FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
}
