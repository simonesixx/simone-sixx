<?php

declare(strict_types=1);

@set_time_limit(6);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
define('SIMONE_NEWSLETTER_VERSION', '2026-02-27-01');
header('X-Simone-Newsletter: ' . SIMONE_NEWSLETTER_VERSION);

// Return JSON even on fatal errors (helps debugging on shared hosting).
register_shutdown_function(function (): void {
    $error = error_get_last();
    if ($error === null) return;
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if (!in_array($error['type'] ?? 0, $fatalTypes, true)) return;
    if (headers_sent()) return;

    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Server error (fatal)',
        'details' => $error['message'] ?? null,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
});

function json_response(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json_body(): ?array {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') return null;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function normalize_email(string $email): string {
    $email = trim(mb_strtolower($email));
    // Remove surrounding angle brackets sometimes pasted.
    $email = trim($email, "<> \t\n\r\0\x0B");
    return $email;
}

function storage_path(): string {
    return __DIR__ . '/newsletter/subscribers.json';
}

function ensure_storage_dir(): void {
    $dir = __DIR__ . '/newsletter';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}

function load_subscribers_locked($fp): array {
    // Expect lock already held.
    rewind($fp);
    $json = stream_get_contents($fp);
    if (!is_string($json) || trim($json) === '') {
        return [
            'version' => SIMONE_NEWSLETTER_VERSION,
            'updated_at' => null,
            'subscribers' => [],
        ];
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        return [
            'version' => SIMONE_NEWSLETTER_VERSION,
            'updated_at' => null,
            'subscribers' => [],
        ];
    }
    if (!isset($data['subscribers']) || !is_array($data['subscribers'])) {
        $data['subscribers'] = [];
    }
    return $data;
}

function save_subscribers_locked($fp, array $data): void {
    // Expect lock already held.
    $data['version'] = SIMONE_NEWSLETTER_VERSION;
    $data['updated_at'] = gmdate('c');

    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (!is_string($json)) {
        throw new RuntimeException('Failed to encode JSON');
    }

    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, $json);
    fflush($fp);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';
if ($method !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed', 'method' => $method]);
}

$payload = read_json_body();
if (!is_array($payload)) {
    // Fallback: accept form post.
    $payload = $_POST;
}

$emailRaw = is_string($payload['email'] ?? null) ? $payload['email'] : '';
$email = normalize_email($emailRaw);

if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    json_response(400, ['ok' => false, 'error' => 'Invalid email']);
}

$source = is_string($payload['source'] ?? null) ? trim($payload['source']) : null;
if ($source !== null && $source === '') $source = null;

ensure_storage_dir();
$path = storage_path();

// Lock + read + write.
$fp = @fopen($path, 'c+');
if ($fp === false) {
    json_response(500, ['ok' => false, 'error' => 'Storage open failed']);
}

try {
    if (!flock($fp, LOCK_EX)) {
        json_response(500, ['ok' => false, 'error' => 'Storage lock failed']);
    }

    $data = load_subscribers_locked($fp);

    $existing = [];
    foreach ($data['subscribers'] as $row) {
        if (is_array($row) && is_string($row['email'] ?? null)) {
            $existing[$row['email']] = true;
        }
    }

    if (isset($existing[$email])) {
        json_response(409, ['ok' => false, 'error' => 'Already subscribed']);
    }

    $data['subscribers'][] = [
        'email' => $email,
        'created_at' => gmdate('c'),
        'source' => $source,
    ];

    save_subscribers_locked($fp, $data);

    json_response(200, [
        'ok' => true,
        'version' => SIMONE_NEWSLETTER_VERSION,
    ]);
} finally {
    @flock($fp, LOCK_UN);
    @fclose($fp);
}
