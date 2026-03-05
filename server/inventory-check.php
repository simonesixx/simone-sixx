<?php

declare(strict_types=1);

require_once __DIR__ . '/inventory.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

@set_time_limit(10);

function json_response(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    json_response(405, ['error' => 'Method not allowed']);
}

function load_config(): array {
    $default = [
        'inventory_path' => getenv('INVENTORY_PATH') ?: '',
    ];

    $candidates = [
        __DIR__ . '/stripe-config.php',
    ];

    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? null;
    if (is_string($docRoot) && $docRoot !== '') {
        $homeConfig = rtrim(dirname($docRoot), '/') . '/stripe-config.php';
        $candidates[] = $homeConfig;
    }

    $envPath = getenv('STRIPE_CONFIG_PATH');
    if (is_string($envPath) && trim($envPath) !== '') {
        $candidates[] = trim($envPath);
    }

    foreach ($candidates as $path) {
        if (!is_string($path) || $path === '') continue;
        if (!is_file($path)) continue;
        $cfg = require $path;
        if (is_array($cfg)) {
            return array_replace($default, $cfg);
        }
    }

    return $default;
}

$raw = $_GET['price_ids'] ?? '';
if (!is_string($raw)) $raw = '';
$raw = trim($raw);

$priceIds = [];
if ($raw !== '') {
    foreach (explode(',', $raw) as $chunk) {
        $pid = trim($chunk);
        if ($pid === '') continue;
        // Keep it simple: accept Stripe-like IDs.
        if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $pid)) continue;
        $priceIds[] = $pid;
    }
}

$priceIds = array_values(array_unique($priceIds));
if (count($priceIds) === 0) {
    json_response(200, ['ok' => true, 'items' => new stdClass()]);
}

$config = load_config();

try {
    $locked = simone_inventory_open_locked($config);
    $inv = $locked['data'];

    $items = [];
    foreach ($priceIds as $pid) {
        $avail = simone_inventory_available($inv, $pid);
        $items[$pid] = [
            'available' => is_int($avail) ? $avail : null,
        ];
    }

    // No changes are intended, but open_locked may have pruned expired reservations.
    simone_inventory_save_and_close($locked['fh'], $locked['path'], $inv);

    json_response(200, ['ok' => true, 'items' => $items]);
} catch (Throwable $e) {
    json_response(200, ['ok' => false, 'error' => 'inventory_unavailable']);
}
