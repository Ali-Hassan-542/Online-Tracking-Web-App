<?php
declare(strict_types=1);

return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('DB_PORT') ?: 3306),
        'name' => getenv('DB_NAME') ?: 'safetrack',
        'user' => getenv('DB_USER') ?: 'root',
        'pass' => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],
    'auth' => [
        'token_ttl_seconds' => 60 * 60 * 24 * 30,
    ],
    'provider' => [
        'name' => getenv('COMM_PROVIDER') ?: 'mock',
    ],
];
