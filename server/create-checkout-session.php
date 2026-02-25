<?php

declare(strict_types=1);

// Avoid long/hanging requests (reverse proxies may 504 first).
@set_time_limit(12);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Simone-Stripe: 2026-02-25-03');

// Quick deployment/route check that should always return immediately.
// Use: GET /server/create-checkout-session.php?probe=1
if (($_GET['probe'] ?? null) === '1') {
    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'probe' => true,
        'service' => 'simonesixx-stripe',
        'version' => '2026-02-25-03',
        'time' => gmdate('c'),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// Return JSON even on fatal errors (helps debugging on shared hosting).
register_shutdown_function(function (): void {
    $error = error_get_last();
    if ($error === null) return;
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if (!in_array($error['type'] ?? 0, $fatalTypes, true)) return;
    if (headers_sent()) return;

    http_response_code(500);
    echo json_encode([
        'error' => 'Server error (fatal)',
        'details' => $error['message'] ?? null,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
});

function json_response(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function load_config(): array {
    $default = [
        'stripe_secret_key' => getenv('STRIPE_SECRET_KEY') ?: '',
        'allowed_price_ids' => [],
        'allowed_countries' => ['FR'],
        'shipping_rate_ids' => [],
        'allow_promotion_codes' => true,
    ];

    $configCandidates = [
        // Standard location (inside /server)
        __DIR__ . '/stripe-config.php',
    ];

    // Safer location (outside public_html) if available.
    // When DOCUMENT_ROOT is like /home/<user>/public_html, this becomes /home/<user>/stripe-config.php
    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? null;
    if (is_string($docRoot) && $docRoot !== '') {
        $homeConfig = rtrim(dirname($docRoot), '/') . '/stripe-config.php';
        $configCandidates[] = $homeConfig;
    }

    // Optional: explicit path
    $envPath = getenv('STRIPE_CONFIG_PATH');
    if (is_string($envPath) && trim($envPath) !== '') {
        $configCandidates[] = trim($envPath);
    }

    foreach ($configCandidates as $configPath) {
        if (!is_string($configPath) || $configPath === '') continue;
        if (!is_file($configPath)) continue;
        $cfg = require $configPath;
        if (is_array($cfg)) {
            return array_replace($default, $cfg);
        }
    }

    // Optional env fallbacks
    $allowed = getenv('STRIPE_ALLOWED_PRICE_IDS');
    if (is_string($allowed) && trim($allowed) !== '') {
        $default['allowed_price_ids'] = array_values(array_filter(array_map('trim', explode(',', $allowed))));
    }

    $countries = getenv('STRIPE_ALLOWED_COUNTRIES');
    if (is_string($countries) && trim($countries) !== '') {
        $default['allowed_countries'] = array_values(array_filter(array_map('trim', explode(',', $countries))));
    }

    $shippingRates = getenv('STRIPE_SHIPPING_RATE_IDS');
    if (is_string($shippingRates) && trim($shippingRates) !== '') {
        $default['shipping_rate_ids'] = array_values(array_filter(array_map('trim', explode(',', $shippingRates))));
    }

    $promo = getenv('STRIPE_ALLOW_PROMO_CODES');
    if (is_string($promo) && trim($promo) !== '') {
        $default['allow_promotion_codes'] = in_array(strtolower(trim($promo)), ['1', 'true', 'yes', 'on'], true);
    }

    return $default;
}

function get_site_origin(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    return $scheme . '://' . $host;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

if (!function_exists('curl_init')) {
    json_response(500, ['error' => 'Server is missing PHP cURL extension (required for Stripe).']);
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw ?: '', true);
if (!is_array($payload)) {
    json_response(400, ['error' => 'Invalid JSON body']);
}

$items = $payload['items'] ?? null;
if (!is_array($items) || count($items) === 0) {
    json_response(400, ['error' => 'Cart is empty']);
}

$config = load_config();
$secretKey = (string)($config['stripe_secret_key'] ?? '');
if ($secretKey === '') {
    json_response(500, ['error' => 'Stripe is not configured (missing STRIPE secret key)']);
}

// Debug: dry-run to validate request/config/line_items without calling Stripe.
// Use: POST /server/create-checkout-session.php?dryrun=1
$dryrun = ($_GET['dryrun'] ?? null) === '1';

$allowedPriceIds = $config['allowed_price_ids'] ?? [];
$hasAllowlist = is_array($allowedPriceIds) && count($allowedPriceIds) > 0;
$allowedLookup = [];
if ($hasAllowlist) {
    foreach ($allowedPriceIds as $pid) {
        if (is_string($pid) && $pid !== '') {
            $allowedLookup[$pid] = true;
        }
    }
}

$lineItems = [];
foreach ($items as $item) {
    if (!is_array($item)) continue;

    $price = $item['price'] ?? $item['stripePriceId'] ?? null;
    $qty = $item['quantity'] ?? 1;

    if (!is_string($price) || trim($price) === '') {
        json_response(400, ['error' => 'Missing price id in cart items']);
    }

    $price = trim($price);
    $qty = (int)$qty;

    if ($qty < 1 || $qty > 20) {
        json_response(400, ['error' => 'Invalid quantity']);
    }

    if ($hasAllowlist && !isset($allowedLookup[$price])) {
        json_response(400, ['error' => 'This product is not allowed for checkout']);
    }

    $lineItems[] = [
        'price' => $price,
        'quantity' => $qty,
    ];
}

if (count($lineItems) === 0) {
    json_response(400, ['error' => 'No valid items']);
}

if ($dryrun) {
    json_response(200, [
        'ok' => true,
        'dryrun' => true,
        'line_items' => $lineItems,
        'allowed_countries' => $config['allowed_countries'] ?? ['FR'],
        'shipping_rate_ids_count' => is_array($config['shipping_rate_ids'] ?? null) ? count($config['shipping_rate_ids']) : 0,
        'allow_promotion_codes' => !empty($config['allow_promotion_codes']),
        'time' => gmdate('c'),
    ]);
}

$origin = get_site_origin();
$successUrl = $origin . '/panier/?success=1&session_id={CHECKOUT_SESSION_ID}';
$cancelUrl = $origin . '/panier/?canceled=1';

$params = [
    'mode' => 'payment',
    'success_url' => $successUrl,
    'cancel_url' => $cancelUrl,
    'line_items' => $lineItems,
    'shipping_address_collection' => [
        'allowed_countries' => $config['allowed_countries'] ?? ['FR'],
    ],
    'billing_address_collection' => 'required',
    'phone_number_collection' => ['enabled' => true],
];

if (!empty($config['allow_promotion_codes'])) {
    $params['allow_promotion_codes'] = true;
}

$shippingRateIds = $config['shipping_rate_ids'] ?? [];
if (is_array($shippingRateIds) && count($shippingRateIds) > 0) {
    $shippingOptions = [];
    foreach ($shippingRateIds as $shr) {
        if (is_string($shr) && trim($shr) !== '') {
            $shippingOptions[] = ['shipping_rate' => trim($shr)];
        }
    }
    if (count($shippingOptions) > 0) {
        $params['shipping_options'] = $shippingOptions;
    }
}

$ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
if ($ch === false) {
    json_response(500, ['error' => 'Unable to init Stripe request']);
}

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    // Keep timeouts very short so we can return JSON before the proxy 504s.
    CURLOPT_NOSIGNAL => 1,
    CURLOPT_CONNECTTIMEOUT => 2,
    CURLOPT_TIMEOUT => 4,
    // Some shared hosts have IPv6 DNS/routing issues; prefer IPv4.
    CURLOPT_IPRESOLVE => defined('CURL_IPRESOLVE_V4') ? CURL_IPRESOLVE_V4 : 0,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $secretKey,
        'Content-Type: application/x-www-form-urlencoded',
        // Avoid delays from "Expect: 100-continue" on some proxies.
        'Expect:',
    ],
    CURLOPT_POSTFIELDS => http_build_query($params),
]);

// Some environments have flaky HTTP/2; force HTTP/1.1 when supported.
if (defined('CURL_HTTP_VERSION_1_1')) {
    curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
}

$start = microtime(true);
$response = curl_exec($ch);
$durationMs = (int)round((microtime(true) - $start) * 1000);
$curlErr = curl_error($ch);
$httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    json_response(502, [
        'error' => 'Stripe request failed',
        'details' => $curlErr,
        'curl_errno' => function_exists('curl_errno') ? curl_errno($ch) : null,
        'http_code' => $httpCode,
        'duration_ms' => $durationMs,
    ]);
}

$data = json_decode($response, true);
if (!is_array($data)) {
    json_response(502, ['error' => 'Invalid Stripe response']);
}

if ($httpCode < 200 || $httpCode >= 300) {
    $msg = $data['error']['message'] ?? 'Stripe error';
    json_response(502, [
        'error' => $msg,
        'stripe_type' => $data['error']['type'] ?? null,
        'stripe_code' => $data['error']['code'] ?? null,
        'http_code' => $httpCode,
        'duration_ms' => $durationMs,
        'response_sample' => substr($response, 0, 250),
    ]);
}

$url = $data['url'] ?? null;
if (!is_string($url) || $url === '') {
    json_response(502, [
        'error' => 'Stripe did not return a checkout URL',
        'http_code' => $httpCode,
        'duration_ms' => $durationMs,
        'response_sample' => substr($response, 0, 250),
    ]);
}

json_response(200, ['url' => $url, 'duration_ms' => $durationMs]);
