<?php

declare(strict_types=1);

// Avoid long/hanging requests (reverse proxies may 504 first).
@set_time_limit(12);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
define('SIMONE_STRIPE_VERSION', '2026-02-28-01');
header('X-Simone-Stripe: ' . SIMONE_STRIPE_VERSION);

function append_checkout_log(array $row): void {
    $dir = __DIR__ . '/orders';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $path = $dir . '/checkout-log.jsonl';
    $row['ts'] = gmdate('c');
    if (!isset($row['version'])) {
        $row['version'] = defined('SIMONE_STRIPE_VERSION') ? SIMONE_STRIPE_VERSION : null;
    }
    $line = json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (is_string($line)) {
        @file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
    }
}

// Quick deployment/route check that should always return immediately.
// Use: GET /server/create-checkout-session.php?probe=1
if (($_GET['probe'] ?? null) === '1') {
    $config = load_config();
    $secretKey = (string)($config['stripe_secret_key'] ?? '');
    $stripeMode = 'unknown';
    if (str_starts_with($secretKey, 'sk_test_')) {
        $stripeMode = 'test';
    } elseif (str_starts_with($secretKey, 'sk_live_')) {
        $stripeMode = 'live';
    }
    $secretPrefix = $secretKey !== '' ? substr($secretKey, 0, 8) : null;

    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'probe' => true,
        'service' => 'simonesixx-stripe',
        'version' => defined('SIMONE_STRIPE_VERSION') ? SIMONE_STRIPE_VERSION : null,
        'stripe_mode' => $stripeMode,
        'secret_prefix' => $secretPrefix,
        'config_path' => is_string($config['__config_path'] ?? null) ? $config['__config_path'] : null,
        'allowed_price_ids_count' => is_array($config['allowed_price_ids'] ?? null) ? count($config['allowed_price_ids']) : 0,
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

function normalize_string($value): ?string {
    if (!is_string($value)) return null;
    $s = trim($value);
    return $s === '' ? null : $s;
}

function format_eur_cents(int $cents): string {
    if ($cents < 0) $cents = 0;
    $euros = $cents / 100;
    return number_format($euros, 2, ',', ' ') . ' EUR';
}

function compute_cart_weight_grams(array $lineItems, array $config): int {
    $weights = $config['weights_by_price_id'] ?? null;
    $defaultWeight = (int)($config['default_weight_grams'] ?? 0);
    if (!is_array($weights)) $weights = [];
    if ($defaultWeight < 0) $defaultWeight = 0;

    $total = 0;
    foreach ($lineItems as $li) {
        if (!is_array($li)) continue;
        $priceId = $li['price'] ?? null;
        if (!is_string($priceId) || $priceId === '') continue;
        $qty = (int)($li['quantity'] ?? 1);
        if ($qty < 1) $qty = 1;
        $w = isset($weights[$priceId]) ? (int)$weights[$priceId] : $defaultWeight;
        if ($w < 0) $w = 0;
        $total += ($w * $qty);
    }
    return $total;
}

function stripe_fetch_price_unit_amount_cents(string $priceId, string $secretKey): ?int {
    $priceId = trim($priceId);
    if ($priceId === '') return null;
    if (!str_starts_with($priceId, 'price_')) return null;

    $ch = curl_init('https://api.stripe.com/v1/prices/' . rawurlencode($priceId));
    if ($ch === false) return null;

    curl_setopt_array($ch, [
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
    ]);

    if (defined('CURL_HTTP_VERSION_1_1')) {
        curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
    }

    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!is_string($resp) || $resp === '' || $http < 200 || $http >= 300) return null;
    $data = json_decode($resp, true);
    if (!is_array($data)) return null;

    $amount = $data['unit_amount'] ?? null;
    if (is_int($amount) && $amount >= 0) return $amount;
    if (is_numeric($amount)) {
        $a = (int)$amount;
        return $a >= 0 ? $a : null;
    }
    return null;
}

function compute_cart_subtotal_cents_via_stripe(array $lineItems, string $secretKey): ?int {
    // Cache by price id to avoid repeated API calls.
    $cache = [];
    $total = 0;
    foreach ($lineItems as $li) {
        if (!is_array($li)) continue;
        $priceId = $li['price'] ?? null;
        if (!is_string($priceId) || trim($priceId) === '') continue;
        $qty = (int)($li['quantity'] ?? 1);
        if ($qty < 1) $qty = 1;

        $pid = trim($priceId);
        if (!array_key_exists($pid, $cache)) {
            $cache[$pid] = stripe_fetch_price_unit_amount_cents($pid, $secretKey);
        }
        $unit = $cache[$pid];
        if ($unit === null) return null;
        $total += ($unit * $qty);
    }
    return $total;
}

function compute_mondial_relay_shipping_cents(int $weightGrams, array $config): ?int {
    $rates = $config['mondial_relay_rates'] ?? null;
    if (!is_array($rates) || count($rates) === 0) return null;

    $normalized = [];
    foreach ($rates as $row) {
        if (!is_array($row)) continue;
        $max = $row['max_weight_grams'] ?? null;
        $amount = $row['amount_cents'] ?? null;
        if (!is_int($amount)) {
            $amount = is_numeric($amount) ? (int)$amount : null;
        }
        if ($amount === null || $amount < 0) continue;

        $maxInt = null;
        if ($max !== null) {
            $maxInt = is_numeric($max) ? (int)$max : null;
            if ($maxInt !== null && $maxInt <= 0) $maxInt = null;
        }

        $normalized[] = ['max' => $maxInt, 'amount' => $amount];
    }

    if (count($normalized) === 0) return null;

    usort($normalized, function ($a, $b) {
        $am = $a['max'];
        $bm = $b['max'];
        if ($am === null && $bm === null) return 0;
        if ($am === null) return 1;
        if ($bm === null) return -1;
        return $am <=> $bm;
    });

    foreach ($normalized as $row) {
        $max = $row['max'];
        if ($max === null) continue;
        if ($weightGrams <= $max) {
            return (int)$row['amount'];
        }
    }

    // Fallback: open-ended rate (max=null) if provided, else the last bracket.
    foreach ($normalized as $row) {
        if ($row['max'] === null) return (int)$row['amount'];
    }
    return (int)$normalized[count($normalized) - 1]['amount'];
}

function compute_home_shipping_cents(int $weightGrams, array $config): ?int {
    $rates = $config['home_shipping_rates'] ?? null;
    if (!is_array($rates) || count($rates) === 0) return null;

    $normalized = [];
    foreach ($rates as $row) {
        if (!is_array($row)) continue;
        $max = $row['max_weight_grams'] ?? null;
        $amount = $row['amount_cents'] ?? null;
        if (!is_int($amount)) {
            $amount = is_numeric($amount) ? (int)$amount : null;
        }
        if ($amount === null || $amount < 0) continue;

        $maxInt = null;
        if ($max !== null) {
            $maxInt = is_numeric($max) ? (int)$max : null;
            if ($maxInt !== null && $maxInt <= 0) $maxInt = null;
        }

        $normalized[] = ['max' => $maxInt, 'amount' => $amount];
    }

    if (count($normalized) === 0) return null;

    usort($normalized, function ($a, $b) {
        $am = $a['max'];
        $bm = $b['max'];
        if ($am === null && $bm === null) return 0;
        if ($am === null) return 1;
        if ($bm === null) return -1;
        return $am <=> $bm;
    });

    foreach ($normalized as $row) {
        $max = $row['max'];
        if ($max === null) continue;
        if ($weightGrams <= $max) {
            return (int)$row['amount'];
        }
    }

    // Fallback: open-ended rate (max=null) if provided, else the last bracket.
    foreach ($normalized as $row) {
        if ($row['max'] === null) return (int)$row['amount'];
    }
    return (int)$normalized[count($normalized) - 1]['amount'];
}

function compute_home_shipping_cents_by_country(int $weightGrams, string $country, array $config): ?int {
    $c = strtoupper(trim($country));
    if ($c === '') $c = 'FR';

    // France uses configured rates (if present)
    if ($c === 'FR') {
        $v = compute_home_shipping_cents($weightGrams, $config);
        if ($v !== null) return $v;
    }

    // Europe table (HT) — 7 Janvier 2026
    // Groups: BE/LU, NL/DE, ES/PT/IT, AT
    $ratesByGroup = [
        'BE_LU' => [
            ['max_weight_grams' => 250, 'amount_cents' => 992],
            ['max_weight_grams' => 500, 'amount_cents' => 992],
            ['max_weight_grams' => 1000, 'amount_cents' => 992],
            ['max_weight_grams' => 2000, 'amount_cents' => 1172],
            ['max_weight_grams' => 5000, 'amount_cents' => 1372],
            ['max_weight_grams' => 10000, 'amount_cents' => 2103],
            ['max_weight_grams' => 15000, 'amount_cents' => 2654],
            ['max_weight_grams' => 25000, 'amount_cents' => 3623],
            ['max_weight_grams' => 30000, 'amount_cents' => 3623],
        ],
        'NL_DE' => [
            ['max_weight_grams' => 250, 'amount_cents' => 992],
            ['max_weight_grams' => 500, 'amount_cents' => 992],
            ['max_weight_grams' => 1000, 'amount_cents' => 992],
            ['max_weight_grams' => 2000, 'amount_cents' => 1172],
            ['max_weight_grams' => 5000, 'amount_cents' => 1372],
            ['max_weight_grams' => 10000, 'amount_cents' => 2103],
            ['max_weight_grams' => 15000, 'amount_cents' => 2654],
            ['max_weight_grams' => 25000, 'amount_cents' => 3623],
            ['max_weight_grams' => 30000, 'amount_cents' => 3623],
        ],
        'ES_PT_IT' => [
            ['max_weight_grams' => 250, 'amount_cents' => 1012],
            ['max_weight_grams' => 500, 'amount_cents' => 1012],
            ['max_weight_grams' => 1000, 'amount_cents' => 1012],
            ['max_weight_grams' => 2000, 'amount_cents' => 1192],
            ['max_weight_grams' => 5000, 'amount_cents' => 1392],
            ['max_weight_grams' => 10000, 'amount_cents' => 2123],
            ['max_weight_grams' => 15000, 'amount_cents' => 2674],
            ['max_weight_grams' => 25000, 'amount_cents' => 3643],
            ['max_weight_grams' => 30000, 'amount_cents' => 3643],
        ],
        'AT' => [
            ['max_weight_grams' => 250, 'amount_cents' => 1272],
            ['max_weight_grams' => 500, 'amount_cents' => 1272],
            ['max_weight_grams' => 1000, 'amount_cents' => 1272],
            ['max_weight_grams' => 2000, 'amount_cents' => 1422],
            ['max_weight_grams' => 5000, 'amount_cents' => 1682],
            ['max_weight_grams' => 10000, 'amount_cents' => 2343],
            ['max_weight_grams' => 15000, 'amount_cents' => 3264],
            ['max_weight_grams' => 25000, 'amount_cents' => 4223],
            ['max_weight_grams' => 30000, 'amount_cents' => 4223],
        ],
    ];

    $group = null;
    if ($c === 'BE' || $c === 'LU') $group = 'BE_LU';
    if ($c === 'NL' || $c === 'DE') $group = 'NL_DE';
    if ($c === 'ES' || $c === 'PT' || $c === 'IT') $group = 'ES_PT_IT';
    if ($c === 'AT') $group = 'AT';

    if ($group === null) {
        // Unknown country: default to France rates (or 0 if missing)
        return compute_home_shipping_cents($weightGrams, $config) ?? 0;
    }

    // Reuse existing bracket logic by temporarily overriding config.
    $tmp = $config;
    $tmp['home_shipping_rates'] = $ratesByGroup[$group];
    return compute_home_shipping_cents($weightGrams, $tmp);
}

function load_config(): array {
    $default = [
        'stripe_secret_key' => getenv('STRIPE_SECRET_KEY') ?: '',
        'allowed_price_ids' => [],
        'allowed_countries' => ['FR', 'BE', 'LU', 'NL', 'DE', 'ES', 'PT', 'IT', 'AT'],
        'shipping_rate_ids' => [],
        'allow_promotion_codes' => true,
        // Default free-shipping threshold: 90,00 EUR (in cents)
        'free_shipping_threshold_cents' => 9000,
        '__config_path' => null,
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
            $merged = array_replace($default, $cfg);
            $merged['__config_path'] = $configPath;
            return $merged;
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

function get_site_origin(array $config): string {
    // Optional override: set a canonical origin so redirects always use the correct domain.
    // Prefer config, then env. Example: https://simonesixx.com
    $override = $config['site_origin'] ?? null;
    if (!is_string($override) || trim($override) === '') {
        $override = getenv('STRIPE_SITE_ORIGIN');
    }
    if (!is_string($override) || trim($override) === '') {
        $override = getenv('SITE_ORIGIN');
    }
    if (is_string($override) && trim($override) !== '') {
        $o = rtrim(trim($override), '/');
        if (preg_match('/^https?:\/\//i', $o)) {
            return $o;
        }
    }

    $host = $_SERVER['HTTP_HOST'] ?? '';

    // Respect common reverse-proxy headers (cPanel/OpenResty).
    $xfProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    if (is_string($xfProto) && $xfProto !== '') {
        $proto = strtolower(trim(explode(',', $xfProto)[0]));
        if ($proto === 'https' || $proto === 'http') {
            return $proto . '://' . $host;
        }
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scheme = $https ? 'https' : 'http';
    return $scheme . '://' . $host;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

$reqId = bin2hex(random_bytes(6));
$t0 = microtime(true);
append_checkout_log([
    'req_id' => $reqId,
    'stage' => 'start',
    'host' => $_SERVER['HTTP_HOST'] ?? null,
    'uri' => $_SERVER['REQUEST_URI'] ?? null,
]);

if (!function_exists('curl_init')) {
    json_response(500, ['error' => 'Server is missing PHP cURL extension (required for Stripe).']);
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw ?: '', true);
if (!is_array($payload)) {
    append_checkout_log(['req_id' => $reqId, 'stage' => 'bad_json']);
    json_response(400, ['error' => 'Invalid JSON body']);
}

$clientSubtotalCents = $payload['cart_subtotal_cents'] ?? null;
if (is_int($clientSubtotalCents)) {
    // ok
} elseif (is_numeric($clientSubtotalCents)) {
    $clientSubtotalCents = (int)$clientSubtotalCents;
} else {
    $clientSubtotalCents = null;
}
if (is_int($clientSubtotalCents) && $clientSubtotalCents < 0) {
    $clientSubtotalCents = 0;
}

$customerEmail = $payload['customer_email'] ?? null;
if (is_string($customerEmail)) {
    $customerEmail = trim($customerEmail);
    if ($customerEmail === '') {
        $customerEmail = null;
    }
} else {
    $customerEmail = null;
}

$customerName = $payload['customer_name'] ?? null;
if (is_string($customerName)) {
    $customerName = trim($customerName);
    if ($customerName === '') {
        $customerName = null;
    }
} else {
    $customerName = null;
}

$customerPhone = $payload['customer_phone'] ?? null;
if (is_string($customerPhone)) {
    $customerPhone = trim($customerPhone);
    if ($customerPhone === '') {
        $customerPhone = null;
    }
} else {
    $customerPhone = null;
}

$shipping = $payload['shipping'] ?? null;
if (!is_array($shipping)) {
    $shipping = null;
}

$shippingCountry = 'FR';
if (is_array($shipping) && is_array($shipping['address'] ?? null)) {
    $country = normalize_string($shipping['address']['country'] ?? null);
    if (is_string($country) && trim($country) !== '') {
        $shippingCountry = strtoupper(trim($country));
    }
}

$supportedCountries = ['FR', 'BE', 'LU', 'NL', 'DE', 'ES', 'PT', 'IT', 'AT'];
$allowedCountries = $config['allowed_countries'] ?? [];
if (!is_array($allowedCountries)) $allowedCountries = [];
$allowedCountries = array_values(array_unique(array_merge($supportedCountries, $allowedCountries)));
if (!in_array($shippingCountry, $allowedCountries, true)) {
    append_checkout_log(['req_id' => $reqId, 'stage' => 'country_not_allowed', 'country' => $shippingCountry]);
    json_response(400, ['error' => 'Pays non pris en charge pour la livraison']);
}

$shippingMethod = $payload['shipping_method'] ?? null;
$shippingMethod = normalize_string($shippingMethod) ?? 'home';
if ($shippingMethod !== 'home' && $shippingMethod !== 'mondial_relay') {
    $shippingMethod = 'home';
}

$mondialRelay = $payload['mondial_relay'] ?? null;
if (!is_array($mondialRelay)) {
    $mondialRelay = null;
}

$items = $payload['items'] ?? null;
if (!is_array($items) || count($items) === 0) {
    append_checkout_log(['req_id' => $reqId, 'stage' => 'empty_cart']);
    json_response(400, ['error' => 'Cart is empty']);
}

$config = load_config();
$secretKey = (string)($config['stripe_secret_key'] ?? '');
if ($secretKey === '') {
    append_checkout_log(['req_id' => $reqId, 'stage' => 'missing_secret']);
    json_response(500, ['error' => 'Stripe is not configured (missing STRIPE secret key)']);
}

$stripeMode = 'unknown';
if (str_starts_with($secretKey, 'sk_test_')) {
    $stripeMode = 'test';
} elseif (str_starts_with($secretKey, 'sk_live_')) {
    $stripeMode = 'live';
}

$secretPrefix = null;
if (is_string($secretKey) && $secretKey !== '') {
    $secretPrefix = substr($secretKey, 0, 8);
}

// Known mappings for the current catalog (parfum 30ml/50ml).
// This avoids common misconfig (using test key with live Price IDs, or the reverse).
$liveToTestPriceId = [
    // live => test
    'price_1T4Ypg1pW7akGXOM8wnRfRar' => 'price_1T4LB60XZVE1puxSTKgblJPz', // 30 ml
    'price_1T4Yph1pW7akGXOM9qTPSGtH' => 'price_1T4Vko0XZVE1puxSJUSVeBjD', // 50 ml
];
$testToLivePriceId = array_flip($liveToTestPriceId);

// Debug: dry-run to validate request/config/line_items without calling Stripe.
// Use: POST /server/create-checkout-session.php?dryrun=1
$dryrun = ($_GET['dryrun'] ?? null) === '1';

// Minimal mode to ensure reliability: only uses required Checkout params.
// Default is minimal; enable full features with: ?full=1
$full = ($_GET['full'] ?? null) === '1';
$minimal = ($_GET['minimal'] ?? null) === '1' ? true : !$full;

// Note: shipping address is collected on-site (panier form) and sent as Customer shipping.
// We intentionally do NOT enable Stripe Checkout shipping address collection to avoid duplicates.
$ship = ($_GET['ship'] ?? null) === '1';

// Step-by-step enablement: collect phone number without enabling other optional fields.
// Use: POST /server/create-checkout-session.php?phone=1
$phone = ($_GET['phone'] ?? null) === '1';

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
$lineItemsBeforeTranslation = [];
foreach ($items as $item) {
    if (!is_array($item)) continue;

    $price = $item['price'] ?? $item['stripePriceId'] ?? null;
    $qty = $item['quantity'] ?? 1;

    if (!is_string($price) || trim($price) === '') {
        json_response(400, ['error' => 'Missing price id in cart items']);
    }

    $price = trim($price);

    $lineItemsBeforeTranslation[] = [
        'price' => $price,
        'quantity' => (int)($qty ?? 1),
    ];

    // Translate Price IDs to match the configured Stripe mode.
    if ($stripeMode === 'test' && isset($liveToTestPriceId[$price])) {
        $price = $liveToTestPriceId[$price];
    } elseif ($stripeMode === 'live' && isset($testToLivePriceId[$price])) {
        $price = $testToLivePriceId[$price];
    }

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

// Optional: Mondial Relay shipping line chosen on-site.
$cartWeightGrams = null;
$mrShippingCents = null;
$cartSubtotalCents = null;
$freeShippingThresholdCents = (int)($config['free_shipping_threshold_cents'] ?? 9000);
if ($freeShippingThresholdCents < 0) $freeShippingThresholdCents = 0;

// Europe threshold override (default 120,00 EUR) when not France.
if ($shippingCountry !== 'FR') {
    $euThreshold = (int)($config['free_shipping_threshold_eu_cents'] ?? 12000);
    if ($euThreshold > 0) $freeShippingThresholdCents = $euThreshold;
}

if ($freeShippingThresholdCents > 0) {
    $cartSubtotalCents = compute_cart_subtotal_cents_via_stripe($lineItems, $secretKey);

    // Fallback: if the hosting blocks/limits extra Stripe API calls, use client subtotal.
    // This can only make shipping cheaper (never more expensive), which is acceptable.
    if ($cartSubtotalCents === null && is_int($clientSubtotalCents)) {
        $cartSubtotalCents = $clientSubtotalCents;
        append_checkout_log([
            'req_id' => $reqId,
            'stage' => 'subtotal_fallback_client',
            'client_subtotal_cents' => $clientSubtotalCents,
        ]);
    } elseif ($cartSubtotalCents === null) {
        append_checkout_log([
            'req_id' => $reqId,
            'stage' => 'subtotal_unavailable',
        ]);
    }
}

$isFreeShipping = ($freeShippingThresholdCents > 0 && $cartSubtotalCents !== null && $cartSubtotalCents >= $freeShippingThresholdCents);
if ($shippingMethod === 'mondial_relay') {
    if ($shippingCountry !== 'FR') {
        json_response(400, ['error' => 'Mondial Relay est disponible uniquement en France']);
    }
    if (!is_array($mondialRelay)) {
        json_response(400, ['error' => 'Missing Mondial Relay Point Relais selection']);
    }

    $mrName = normalize_string($mondialRelay['name'] ?? null);
    $mrAddress = normalize_string($mondialRelay['address'] ?? null);
    $mrPostal = normalize_string($mondialRelay['postal_code'] ?? null);
    $mrCity = normalize_string($mondialRelay['city'] ?? null);
    $mrCountry = normalize_string($mondialRelay['country'] ?? null) ?? 'FR';
    if ($mrName === null || $mrAddress === null || $mrPostal === null || $mrCity === null) {
        json_response(400, ['error' => 'Invalid Mondial Relay Point Relais (missing fields)']);
    }
    if (strtoupper($mrCountry) !== 'FR') {
        json_response(400, ['error' => 'Mondial Relay is only available for France']);
    }

    $currency = is_string($config['currency'] ?? null) && trim((string)$config['currency']) !== ''
        ? strtolower(trim((string)$config['currency']))
        : 'eur';

    $cartWeightGrams = compute_cart_weight_grams($lineItems, $config);
    $mrShippingCents = $isFreeShipping ? 0 : compute_mondial_relay_shipping_cents($cartWeightGrams, $config);
    if ($mrShippingCents === null) {
        append_checkout_log(['req_id' => $reqId, 'stage' => 'mr_missing_rates']);
        json_response(500, ['error' => 'Mondial Relay shipping is not configured (missing mondial_relay_rates).']);
    }

    if ($isFreeShipping) {
        $desc = $freeShippingThresholdCents > 0 ? ('Offerte dès ' . format_eur_cents($freeShippingThresholdCents) . '.') : 'Offerte.';
        $lineItems[] = [
            'price_data' => [
                'currency' => $currency,
                'product_data' => [
                    'name' => 'Livraison Mondial Relay (Point Relais) — offerte',
                    'description' => $desc,
                ],
                'unit_amount' => 0,
            ],
            'quantity' => 1,
        ];
    } elseif ((int)$mrShippingCents > 0) {
        $lineItems[] = [
            'price_data' => [
                'currency' => $currency,
                'product_data' => [
                    'name' => 'Livraison Mondial Relay (Point Relais)',
                ],
                'unit_amount' => (int)$mrShippingCents,
            ],
            'quantity' => 1,
        ];
    }
}

// Optional: home delivery shipping line chosen on-site.
$homeShippingCents = null;
if ($shippingMethod === 'home') {
    $currency = is_string($config['currency'] ?? null) && trim((string)$config['currency']) !== ''
        ? strtolower(trim((string)$config['currency']))
        : 'eur';

    $cartWeightGrams = compute_cart_weight_grams($lineItems, $config);
    $homeShippingCents = $isFreeShipping ? 0 : compute_home_shipping_cents_by_country($cartWeightGrams, $shippingCountry, $config);
    if ($homeShippingCents === null) {
        // If not configured, default to 0 to avoid blocking checkout.
        $homeShippingCents = 0;
    }

    if ($isFreeShipping) {
        $desc = $freeShippingThresholdCents > 0 ? ('Offerte dès ' . format_eur_cents($freeShippingThresholdCents) . '.') : 'Offerte.';
        $lineItems[] = [
            'price_data' => [
                'currency' => $currency,
                'product_data' => [
                    'name' => 'Livraison à domicile — offerte',
                    'description' => $desc,
                ],
                'unit_amount' => 0,
            ],
            'quantity' => 1,
        ];
    } elseif ((int)$homeShippingCents > 0) {
        $lineItems[] = [
            'price_data' => [
                'currency' => $currency,
                'product_data' => [
                    'name' => 'Livraison à domicile',
                ],
                'unit_amount' => (int)$homeShippingCents,
            ],
            'quantity' => 1,
        ];
    }
}

if (count($lineItems) === 0) {
    json_response(400, ['error' => 'No valid items']);
}

append_checkout_log([
    'req_id' => $reqId,
    'stage' => 'items',
    'stripe_mode' => $stripeMode,
    'secret_prefix' => $secretPrefix,
    'line_items_before' => $lineItemsBeforeTranslation,
    'line_items' => array_map(function ($li) {
        return [
            'price' => is_array($li) ? ($li['price'] ?? null) : null,
            'quantity' => is_array($li) ? ($li['quantity'] ?? null) : null,
        ];
    }, $lineItems),
]);

if ($dryrun) {
    append_checkout_log(['req_id' => $reqId, 'stage' => 'dryrun_ok', 'duration_ms' => (int)round((microtime(true) - $t0) * 1000)]);
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

$origin = get_site_origin($config);
$successUrl = $origin . '/panier/?success=1&session_id={CHECKOUT_SESSION_ID}';
$cancelUrl = $origin . '/panier/?canceled=1';

$params = [
    'mode' => 'payment',
    'success_url' => $successUrl,
    'cancel_url' => $cancelUrl,
    'line_items' => $lineItems,
];

// Attach minimal metadata for fulfillment (also visible in webhook payload).
$metadata = [];
$metadata['shipping_method'] = $shippingMethod;
$metadata['shipping_country'] = $shippingCountry;
if ($cartSubtotalCents !== null) {
    $metadata['cart_subtotal_cents'] = (string)$cartSubtotalCents;
}
if ($freeShippingThresholdCents > 0) {
    $metadata['free_shipping_threshold_cents'] = (string)$freeShippingThresholdCents;
    $metadata['is_free_shipping'] = $isFreeShipping ? '1' : '0';
}
if ($shippingMethod === 'mondial_relay') {
    $metadata['cart_weight_grams'] = $cartWeightGrams !== null ? (string)$cartWeightGrams : '';
    $metadata['mr_shipping_cents'] = $mrShippingCents !== null ? (string)$mrShippingCents : '';

    if (is_array($mondialRelay)) {
        $metadata['mr_id'] = (string)($mondialRelay['id'] ?? '');
        $metadata['mr_name'] = (string)($mondialRelay['name'] ?? '');
        $metadata['mr_address'] = (string)($mondialRelay['address'] ?? '');
        $metadata['mr_postal_code'] = (string)($mondialRelay['postal_code'] ?? '');
        $metadata['mr_city'] = (string)($mondialRelay['city'] ?? '');
        $metadata['mr_country'] = (string)($mondialRelay['country'] ?? 'FR');
    }
}

if ($shippingMethod === 'home') {
    $metadata['cart_weight_grams'] = $cartWeightGrams !== null ? (string)$cartWeightGrams : '';
    $metadata['home_shipping_cents'] = $homeShippingCents !== null ? (string)$homeShippingCents : '';
}

// Stripe expects scalar metadata values.
$params['metadata'] = array_map(function ($v) {
    if ($v === null) return '';
    if (is_bool($v)) return $v ? '1' : '0';
    if (is_scalar($v)) return (string)$v;
    $j = json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return is_string($j) ? $j : '';
}, $metadata);

// Stripe Checkout collection for phone triggered timeouts on this hosting.
// Alternative: create a Stripe Customer with contact/shipping and attach it to the session.
$shouldCreateCustomer = ($customerEmail !== null) || ($customerName !== null) || ($customerPhone !== null) || ($shipping !== null);
if ($shouldCreateCustomer) {
    $chCustomer = curl_init('https://api.stripe.com/v1/customers');
    if ($chCustomer === false) {
        json_response(500, ['error' => 'Unable to init Stripe customer request']);
    }

    $customerParams = [];
    if (is_string($customerEmail) && $customerEmail !== '') {
        $customerParams['email'] = $customerEmail;
    }
    if (is_string($customerName) && $customerName !== '') {
        $customerParams['name'] = $customerName;
    }
    if (is_string($customerPhone) && $customerPhone !== '') {
        $customerParams['phone'] = $customerPhone;
    }

    if (is_array($shipping)) {
        $shipName = $shipping['name'] ?? null;
        $shipAddr = $shipping['address'] ?? null;
        if (is_string($shipName) && trim($shipName) !== '' && is_array($shipAddr)) {
            $customerParams['shipping'] = [
                'name' => trim($shipName),
                'address' => $shipAddr,
            ];
        }
    }

    curl_setopt_array($chCustomer, [
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
        CURLOPT_POSTFIELDS => http_build_query($customerParams),
    ]);

    if (defined('CURL_HTTP_VERSION_1_1')) {
        curl_setopt($chCustomer, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
    }

    $respCustomer = curl_exec($chCustomer);
    $custErr = curl_error($chCustomer);
    $custErrNo = function_exists('curl_errno') ? curl_errno($chCustomer) : null;
    $custHttp = (int)curl_getinfo($chCustomer, CURLINFO_HTTP_CODE);
    curl_close($chCustomer);

    if (!is_string($respCustomer) || $respCustomer === '') {
        append_checkout_log([
            'req_id' => $reqId,
            'stage' => 'stripe_customer_failed',
            'http_code' => $custHttp,
            'curl_errno' => $custErrNo,
        ]);
        json_response(502, [
            'error' => 'Stripe customer request failed',
            'details' => $custErr ?: null,
            'curl_errno' => $custErrNo,
            'http_code' => $custHttp,
        ]);
    }

    $custData = json_decode($respCustomer, true);
    $custId = is_array($custData) ? ($custData['id'] ?? null) : null;
    if ($custHttp < 200 || $custHttp >= 300 || !is_string($custId) || $custId === '') {
        $msg = is_array($custData) ? ($custData['error']['message'] ?? 'Stripe customer error') : 'Stripe customer error';
        append_checkout_log([
            'req_id' => $reqId,
            'stage' => 'stripe_customer_error',
            'http_code' => $custHttp,
            'stripe_type' => is_array($custData) ? ($custData['error']['type'] ?? null) : null,
            'stripe_code' => is_array($custData) ? ($custData['error']['code'] ?? null) : null,
        ]);
        json_response(502, [
            'error' => $msg,
            'stripe_type' => is_array($custData) ? ($custData['error']['type'] ?? null) : null,
            'stripe_code' => is_array($custData) ? ($custData['error']['code'] ?? null) : null,
            'http_code' => $custHttp,
            'response_sample' => substr($respCustomer, 0, 250),
        ]);
    }

    $params['customer'] = $custId;
}

if ($phone) {
    $params['phone_number_collection'] = ['enabled' => true];
}

if (!$minimal) {
    $params['phone_number_collection'] = ['enabled' => true];
}

if (!$minimal && !empty($config['allow_promotion_codes'])) {
    $params['allow_promotion_codes'] = true;
}

// Shipping options are disabled here because Checkout shipping address collection is disabled.
// If you want shipping pricing, implement a shipping line item chosen on-site.

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
$curlErrNo = function_exists('curl_errno') ? curl_errno($ch) : null;
$httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    append_checkout_log([
        'req_id' => $reqId,
        'stage' => 'stripe_session_failed',
        'http_code' => $httpCode,
        'curl_errno' => $curlErrNo,
        'duration_ms' => $durationMs,
    ]);
    json_response(502, [
        'error' => 'Stripe request failed',
        'details' => $curlErr,
        'curl_errno' => $curlErrNo,
        'http_code' => $httpCode,
        'duration_ms' => $durationMs,
    ]);
}

$data = json_decode($response, true);
if (!is_array($data)) {
    append_checkout_log(['req_id' => $reqId, 'stage' => 'stripe_bad_json', 'http_code' => $httpCode, 'duration_ms' => $durationMs]);
    json_response(502, ['error' => 'Invalid Stripe response']);
}

if ($httpCode < 200 || $httpCode >= 300) {
    $msg = $data['error']['message'] ?? 'Stripe error';
    append_checkout_log([
        'req_id' => $reqId,
        'stage' => 'stripe_error',
        'http_code' => $httpCode,
        'stripe_type' => $data['error']['type'] ?? null,
        'stripe_code' => $data['error']['code'] ?? null,
        'stripe_param' => $data['error']['param'] ?? null,
        'stripe_message' => $msg,
        'duration_ms' => $durationMs,
    ]);
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
    append_checkout_log(['req_id' => $reqId, 'stage' => 'missing_url', 'http_code' => $httpCode, 'duration_ms' => $durationMs]);
    json_response(502, [
        'error' => 'Stripe did not return a checkout URL',
        'http_code' => $httpCode,
        'duration_ms' => $durationMs,
        'response_sample' => substr($response, 0, 250),
    ]);
}

append_checkout_log([
    'req_id' => $reqId,
    'stage' => 'ok',
    'stripe_duration_ms' => $durationMs,
    'total_duration_ms' => (int)round((microtime(true) - $t0) * 1000),
]);

json_response(200, ['url' => $url, 'duration_ms' => $durationMs]);
