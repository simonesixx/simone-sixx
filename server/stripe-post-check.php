<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

@set_time_limit(12);

function json_response(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

if (!function_exists('curl_init')) {
    json_response(500, ['error' => 'Server is missing PHP cURL extension (required for Stripe).']);
}

function load_config(): array {
    $default = [
        'stripe_secret_key' => getenv('STRIPE_SECRET_KEY') ?: '',
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

$config = load_config();
$secretKey = (string)($config['stripe_secret_key'] ?? '');
if ($secretKey === '') {
    json_response(500, ['error' => 'Stripe is not configured (missing secret key)']);
}

// Trivial Stripe POST request to test outbound POST reliability.
// Creates a test-mode customer (safe) and returns timing + http_code.
$params = http_build_query([
    'description' => 'simonesixx post check ' . gmdate('c'),
]);

$start = microtime(true);

$ch = curl_init('https://api.stripe.com/v1/customers');
if ($ch === false) {
    json_response(500, ['error' => 'Unable to init cURL']);
}

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_NOSIGNAL => 1,
    CURLOPT_CONNECTTIMEOUT => 2,
    CURLOPT_TIMEOUT => 4,
    CURLOPT_IPRESOLVE => defined('CURL_IPRESOLVE_V4') ? CURL_IPRESOLVE_V4 : 0,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $secretKey,
        'Content-Type: application/x-www-form-urlencoded',
        'Expect:',
    ],
    CURLOPT_POSTFIELDS => $params,
]);

if (defined('CURL_HTTP_VERSION_1_1')) {
    curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
}

$response = curl_exec($ch);
$durationMs = (int)round((microtime(true) - $start) * 1000);
$curlErr = curl_error($ch);
$curlErrNo = function_exists('curl_errno') ? curl_errno($ch) : null;
$httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

json_response(200, [
    'ok' => true,
    'endpoint' => '/v1/customers',
    'http_code' => $httpCode,
    'curl_errno' => $curlErrNo,
    'curl_error' => $curlErr ?: null,
    'duration_ms' => $durationMs,
    'response_sample' => is_string($response) ? substr($response, 0, 250) : null,
]);
