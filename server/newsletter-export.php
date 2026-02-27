<?php

declare(strict_types=1);

@set_time_limit(6);

header('Cache-Control: no-store');

define('SIMONE_NEWSLETTER_EXPORT_VERSION', '2026-02-27-01');

function deny(int $status, string $message): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'error' => $message,
        'version' => SIMONE_NEWSLETTER_EXPORT_VERSION,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function load_config(): array {
    $default = [
        'export_token' => null,
        'storage_path' => __DIR__ . '/newsletter/subscribers.json',
    ];

    $paths = [
        __DIR__ . '/newsletter-config.local.php',
        __DIR__ . '/newsletter-config.php',
    ];

    foreach ($paths as $path) {
        if (!is_file($path)) continue;
        $cfg = require $path;
        if (!is_array($cfg)) continue;
        return array_merge($default, $cfg, ['__config_path' => $path]);
    }

    return $default;
}

$config = load_config();
$token = is_string($config['export_token'] ?? null) ? (string)$config['export_token'] : '';

if ($token === '') {
    $token = getenv('NEWSLETTER_EXPORT_TOKEN') ?: '';
}

if (!is_string($token) || $token === '') {
    deny(501, 'Export not configured (missing export_token or NEWSLETTER_EXPORT_TOKEN)');
}

$provided = (string)($_GET['token'] ?? '');
if ($provided === '' || !hash_equals($token, $provided)) {
    deny(403, 'Forbidden');
}

$path = is_string($config['storage_path'] ?? null) && $config['storage_path'] !== ''
    ? (string)$config['storage_path']
    : (__DIR__ . '/newsletter/subscribers.json');
if (!is_file($path)) {
    // Empty export is fine.
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="newsletter-subscribers.csv"');
    echo "email,created_at,source\n";
    exit;
}

$json = file_get_contents($path);
$data = is_string($json) ? json_decode($json, true) : null;
$rows = is_array($data) && is_array($data['subscribers'] ?? null) ? $data['subscribers'] : [];

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="newsletter-subscribers.csv"');

echo "email,created_at,source\n";

foreach ($rows as $row) {
    if (!is_array($row)) continue;
    $email = is_string($row['email'] ?? null) ? $row['email'] : '';
    $created = is_string($row['created_at'] ?? null) ? $row['created_at'] : '';
    $source = is_string($row['source'] ?? null) ? $row['source'] : '';

    if ($email === '') continue;

    // Basic CSV escaping.
    $emailCsv = '"' . str_replace('"', '""', $email) . '"';
    $createdCsv = '"' . str_replace('"', '""', $created) . '"';
    $sourceCsv = '"' . str_replace('"', '""', $source) . '"';

    echo $emailCsv . ',' . $createdCsv . ',' . $sourceCsv . "\n";
}
