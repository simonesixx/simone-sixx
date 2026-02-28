<?php

declare(strict_types=1);

require_once __DIR__ . '/inventory.php';

@set_time_limit(12);

header('Cache-Control: no-store');

function json_response(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function load_config(): array {
    $default = [
        'stripe_secret_key' => getenv('STRIPE_SECRET_KEY') ?: '',
        'stripe_webhook_secret' => getenv('STRIPE_WEBHOOK_SECRET') ?: '',
        'orders_email_to' => getenv('ORDERS_EMAIL_TO') ?: '',
        'orders_email_from' => getenv('ORDERS_EMAIL_FROM') ?: '',
        'orders_dir' => __DIR__ . '/orders',
        '__config_path' => null,
    ];

    $configCandidates = [
        __DIR__ . '/stripe-config.php',
    ];

    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? null;
    if (is_string($docRoot) && $docRoot !== '') {
        $homeConfig = rtrim(dirname($docRoot), '/') . '/stripe-config.php';
        $configCandidates[] = $homeConfig;
    }

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

    return $default;
}

function timing_safe_equals(string $a, string $b): bool {
    if (function_exists('hash_equals')) {
        return hash_equals($a, $b);
    }
    if (strlen($a) !== strlen($b)) return false;
    $res = 0;
    for ($i = 0; $i < strlen($a); $i++) {
        $res |= ord($a[$i]) ^ ord($b[$i]);
    }
    return $res === 0;
}

function verify_stripe_signature(string $payload, string $sigHeader, string $secret, int $toleranceSeconds = 300): bool {
    // Header format: t=timestamp,v1=signature(,v1=...)
    $parts = array_map('trim', explode(',', $sigHeader));
    $timestamp = null;
    $signatures = [];

    foreach ($parts as $part) {
        if ($part === '') continue;
        $kv = explode('=', $part, 2);
        if (count($kv) !== 2) continue;
        [$k, $v] = $kv;
        if ($k === 't') {
            $timestamp = ctype_digit($v) ? (int)$v : null;
        } elseif ($k === 'v1') {
            $signatures[] = $v;
        }
    }

    if (!is_int($timestamp) || $timestamp <= 0) return false;
    if (count($signatures) === 0) return false;

    $now = time();
    if (abs($now - $timestamp) > $toleranceSeconds) {
        return false;
    }

    $signedPayload = $timestamp . '.' . $payload;
    $expected = hash_hmac('sha256', $signedPayload, $secret);

    foreach ($signatures as $sig) {
        if (timing_safe_equals($expected, $sig)) {
            return true;
        }
    }

    return false;
}

function stripe_get(string $url, string $secretKey): array {
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Unable to init Stripe GET request');
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_NOSIGNAL => 1,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 4,
        CURLOPT_IPRESOLVE => defined('CURL_IPRESOLVE_V4') ? CURL_IPRESOLVE_V4 : 0,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $secretKey,
            'Expect:',
        ],
    ]);

    if (defined('CURL_HTTP_VERSION_1_1')) {
        curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
    }

    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if (!is_string($resp) || $resp === '') {
        throw new RuntimeException('Stripe GET failed: ' . ($err ?: 'empty response'));
    }

    $data = json_decode($resp, true);
    if (!is_array($data)) {
        throw new RuntimeException('Invalid Stripe JSON response');
    }

    if ($http < 200 || $http >= 300) {
        $msg = $data['error']['message'] ?? 'Stripe error';
        throw new RuntimeException($msg);
    }

    return $data;
}

function format_money(?int $amount, ?string $currency): string {
    if (!is_int($amount) || $amount < 0 || !is_string($currency) || $currency === '') {
        return '';
    }
    $cur = strtoupper($currency);
    $value = number_format($amount / 100, 2, ',', ' ');
    return $value . ' ' . $cur;
}

function normalize_address($addr): array {
    if (!is_array($addr)) return [];
    $out = [];
    foreach (['line1','line2','postal_code','city','state','country'] as $k) {
        if (isset($addr[$k]) && is_string($addr[$k]) && trim($addr[$k]) !== '') {
            $out[$k] = trim($addr[$k]);
        }
    }
    return $out;
}

function address_to_lines(array $addr): array {
    $lines = [];
    if (!empty($addr['line1'])) $lines[] = $addr['line1'];
    if (!empty($addr['line2'])) $lines[] = $addr['line2'];
    $cityLine = trim((string)($addr['postal_code'] ?? '') . ' ' . (string)($addr['city'] ?? ''));
    if ($cityLine !== '') $lines[] = $cityLine;
    $country = (string)($addr['country'] ?? '');
    if ($country !== '') $lines[] = $country;
    return $lines;
}

function ensure_dir(string $dir): void {
    if (is_dir($dir)) return;
    @mkdir($dir, 0755, true);
}

$config = load_config();

// Probe endpoint for quick validation in browser without triggering Stripe.
// Use: GET /server/stripe-webhook.php?probe=1
if (($_GET['probe'] ?? null) === '1') {
    $secretKey = (string)($config['stripe_secret_key'] ?? '');
    $webhookSecret = (string)($config['stripe_webhook_secret'] ?? '');
    $stripeMode = 'unknown';
    if (str_starts_with($secretKey, 'sk_test_')) {
        $stripeMode = 'test';
    } elseif (str_starts_with($secretKey, 'sk_live_')) {
        $stripeMode = 'live';
    }
    json_response(200, [
        'ok' => true,
        'probe' => true,
        'service' => 'simonesixx-webhook',
        'stripe_mode' => $stripeMode,
        'secret_prefix' => $secretKey !== '' ? substr($secretKey, 0, 8) : null,
        'webhook_secret_set' => $webhookSecret !== '',
        'config_path' => is_string($config['__config_path'] ?? null) ? $config['__config_path'] : null,
        'orders_email_to_set' => ((string)($config['orders_email_to'] ?? '')) !== '',
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

if (!function_exists('curl_init')) {
    json_response(500, ['error' => 'Server is missing PHP cURL extension (required).']);
}

$secretKey = (string)($config['stripe_secret_key'] ?? '');
$webhookSecret = (string)($config['stripe_webhook_secret'] ?? '');
if ($secretKey === '' || $webhookSecret === '') {
    json_response(500, ['error' => 'Webhook not configured (missing Stripe secret key or webhook secret).']);
}

$payload = file_get_contents('php://input');
if (!is_string($payload) || $payload === '') {
    json_response(400, ['error' => 'Empty payload']);
}

$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
if (!is_string($sigHeader) || trim($sigHeader) === '') {
    json_response(400, ['error' => 'Missing Stripe-Signature header']);
}

if (!verify_stripe_signature($payload, $sigHeader, $webhookSecret)) {
    json_response(400, ['error' => 'Invalid signature']);
}

$event = json_decode($payload, true);
if (!is_array($event)) {
    json_response(400, ['error' => 'Invalid JSON']);
}

$eventId = is_string($event['id'] ?? null) ? $event['id'] : '';
$eventType = is_string($event['type'] ?? null) ? $event['type'] : '';
$eventCreated = isset($event['created']) && is_int($event['created']) ? $event['created'] : null;

if ($eventId === '' || $eventType === '') {
    json_response(400, ['error' => 'Invalid event shape']);
}

// Only handle the events we care about.
$handled = [
    'checkout.session.completed' => true,
    'checkout.session.async_payment_succeeded' => true,
];

if (!isset($handled[$eventType])) {
    // Acknowledge but ignore.
    http_response_code(200);
    header('Content-Type: text/plain; charset=utf-8');
    echo "ignored";
    exit;
}

$session = $event['data']['object'] ?? null;
if (!is_array($session) || !is_string($session['id'] ?? null)) {
    json_response(400, ['error' => 'Missing Checkout Session in event']);
}

$sessionId = (string)$session['id'];

$ordersDir = (string)($config['orders_dir'] ?? (__DIR__ . '/orders'));
if ($ordersDir === '') $ordersDir = __DIR__ . '/orders';
ensure_dir($ordersDir);
ensure_dir($ordersDir . '/events');

$eventPath = $ordersDir . '/events/' . preg_replace('/[^a-zA-Z0-9_\-]/', '_', $eventId) . '.json';

$existing = null;
if (is_file($eventPath)) {
    $rawExisting = @file_get_contents($eventPath);
    $existing = is_string($rawExisting) ? json_decode($rawExisting, true) : null;
    if (!is_array($existing)) $existing = null;
}

// Build order payload only once.
$order = $existing;
$firstWrite = false;

if (!is_array($order)) {
    $firstWrite = true;

    $metadata = is_array($session['metadata'] ?? null) ? $session['metadata'] : null;

    // Fetch line items from Stripe for a complete packing slip.
    $lineItems = [];
    try {
        $li = stripe_get('https://api.stripe.com/v1/checkout/sessions/' . urlencode($sessionId) . '/line_items?limit=100', $secretKey);
        $list = $li['data'] ?? [];
        if (is_array($list)) {
            foreach ($list as $row) {
                if (!is_array($row)) continue;
                $desc = is_string($row['description'] ?? null) ? $row['description'] : '';
                $qty = isset($row['quantity']) ? (int)$row['quantity'] : null;
                $amount = isset($row['amount_total']) && is_int($row['amount_total']) ? $row['amount_total'] : null;
                $currency = is_string($row['currency'] ?? null) ? $row['currency'] : (is_string($session['currency'] ?? null) ? $session['currency'] : null);
                $lineItems[] = [
                    'description' => $desc,
                    'quantity' => $qty,
                    'amount_total' => $amount,
                    'currency' => $currency,
                ];
            }
        }
    } catch (Throwable $e) {
        $lineItems[] = ['error' => 'Unable to fetch line items', 'details' => $e->getMessage()];
    }

    // Fetch customer details (shipping address comes from the Customer we created in checkout).
    $customer = [
        'id' => null,
        'email' => null,
        'name' => null,
        'phone' => null,
        'shipping' => null,
    ];

    $customerId = is_string($session['customer'] ?? null) ? $session['customer'] : null;
    if (is_string($customerId) && $customerId !== '') {
        $customer['id'] = $customerId;
        try {
            $cust = stripe_get('https://api.stripe.com/v1/customers/' . urlencode($customerId), $secretKey);
            $customer['email'] = is_string($cust['email'] ?? null) ? $cust['email'] : null;
            $customer['name'] = is_string($cust['name'] ?? null) ? $cust['name'] : null;
            $customer['phone'] = is_string($cust['phone'] ?? null) ? $cust['phone'] : null;

            $ship = $cust['shipping'] ?? null;
            if (is_array($ship)) {
                $shipName = is_string($ship['name'] ?? null) ? trim($ship['name']) : null;
                $shipAddr = normalize_address($ship['address'] ?? null);
                $customer['shipping'] = [
                    'name' => $shipName,
                    'address' => $shipAddr,
                ];
            }
        } catch (Throwable $e) {
            $customer['error'] = $e->getMessage();
        }
    } else {
        $details = $session['customer_details'] ?? null;
        if (is_array($details)) {
            $customer['email'] = is_string($details['email'] ?? null) ? $details['email'] : null;
            $customer['name'] = is_string($details['name'] ?? null) ? $details['name'] : null;
            $customer['phone'] = is_string($details['phone'] ?? null) ? $details['phone'] : null;
        }
    }

    $order = [
        'event_id' => $eventId,
        'event_type' => $eventType,
        'event_created' => $eventCreated,
        'event_created_iso' => is_int($eventCreated) ? gmdate('c', $eventCreated) : null,
        'livemode' => $event['livemode'] ?? null,
        'checkout_session_id' => $sessionId,
        'payment_intent' => $session['payment_intent'] ?? null,
        'payment_status' => $session['payment_status'] ?? null,
        'amount_total' => $session['amount_total'] ?? null,
        'currency' => $session['currency'] ?? null,
        'metadata' => $metadata,
        'customer' => $customer,
        'line_items' => $lineItems,
        'stored_at' => gmdate('c'),
        'email_sent' => false,
        'email_to' => null,
        'orders_log_appended' => false,
        'inventory' => null,
    ];
}

// Inventory finalize (idempotent via reservation id + file locking).
try {
    $paymentStatus = is_string($session['payment_status'] ?? null) ? (string)$session['payment_status'] : '';
    $isPaid = ($paymentStatus === 'paid');
    $meta = is_array($order['metadata'] ?? null) ? $order['metadata'] : (is_array($session['metadata'] ?? null) ? $session['metadata'] : null);
    $reservationId = is_array($meta) && is_string($meta['inventory_reservation_id'] ?? null) ? (string)$meta['inventory_reservation_id'] : '';

    if ($isPaid && $reservationId !== '') {
        $locked = simone_inventory_open_locked($config);
        $inv = $locked['data'];
        $res = simone_inventory_finalize_reservation($inv, $reservationId);
        simone_inventory_save_and_close($locked['fh'], $locked['path'], $inv);

        $order['inventory'] = [
            'reservation_id' => $reservationId,
            'finalize_result' => $res,
            'finalized_at' => gmdate('c'),
        ];
    }
} catch (Throwable $e) {
    $order['inventory'] = [
        'error' => $e->getMessage(),
        'failed_at' => gmdate('c'),
    ];
}

// Append to a monthly JSONL log once (easy history).
if (empty($order['orders_log_appended'])) {
    $month = gmdate('Y-m');
    $logPath = $ordersDir . '/orders-' . $month . '.jsonl';
    $line = json_encode($order, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (is_string($line)) {
        @file_put_contents($logPath, $line . "\n", FILE_APPEND | LOCK_EX);
    }
    $order['orders_log_appended'] = true;
}

// Send email (idempotent based on event file state).
$emailTo = (string)($config['orders_email_to'] ?? '');
$emailTo = trim($emailTo);

if ($emailTo !== '' && empty($order['email_sent'])) {
    $host = is_string($_SERVER['HTTP_HOST'] ?? null) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';
    $emailFrom = (string)($config['orders_email_from'] ?? '');
    $emailFrom = trim($emailFrom);
    if ($emailFrom === '') {
        $emailFrom = 'no-reply@' . preg_replace('/:.*/', '', $host);
    }

    $amountStr = format_money(is_int($order['amount_total'] ?? null) ? $order['amount_total'] : null, is_string($order['currency'] ?? null) ? $order['currency'] : null);

    $cust = is_array($order['customer'] ?? null) ? $order['customer'] : [];
    $custName = is_string($cust['name'] ?? null) ? $cust['name'] : '';
    $custEmail = is_string($cust['email'] ?? null) ? $cust['email'] : '';
    $custPhone = is_string($cust['phone'] ?? null) ? $cust['phone'] : '';

    $ship = is_array($cust['shipping'] ?? null) ? $cust['shipping'] : null;
    $shipName = is_array($ship) && is_string($ship['name'] ?? null) ? $ship['name'] : '';
    $shipAddr = is_array($ship) ? (is_array($ship['address'] ?? null) ? $ship['address'] : []) : [];

    $subject = 'Nouvelle commande — Simone Sixx';
    if ($amountStr !== '') {
        $subject .= ' — ' . $amountStr;
    }

    $lines = [];
    $lines[] = 'Nouvelle commande confirmée (Stripe)';
    $lines[] = '';
    $lines[] = 'Session: ' . $sessionId;
    $lines[] = 'Paiement: ' . (is_string($order['payment_status'] ?? null) ? $order['payment_status'] : '');
    if ($amountStr !== '') $lines[] = 'Total: ' . $amountStr;
    $lines[] = '';
    $lines[] = 'Client:';
    if ($custName !== '') $lines[] = '  Nom: ' . $custName;
    if ($custEmail !== '') $lines[] = '  Email: ' . $custEmail;
    if ($custPhone !== '') $lines[] = '  Téléphone: ' . $custPhone;
    $lines[] = '';
    $lines[] = 'Livraison:';
    if ($shipName !== '') $lines[] = '  Nom: ' . $shipName;
    foreach (address_to_lines($shipAddr) as $l) {
        $lines[] = '  ' . $l;
    }

    $meta = is_array($order['metadata'] ?? null) ? $order['metadata'] : null;
    $shipMethod = is_array($meta) && is_string($meta['shipping_method'] ?? null) ? (string)$meta['shipping_method'] : '';
    if ($shipMethod === 'mondial_relay') {
        $mrName = is_string($meta['mr_name'] ?? null) ? (string)$meta['mr_name'] : '';
        $mrAddr = is_string($meta['mr_address'] ?? null) ? (string)$meta['mr_address'] : '';
        $mrPostal = is_string($meta['mr_postal_code'] ?? null) ? (string)$meta['mr_postal_code'] : '';
        $mrCity = is_string($meta['mr_city'] ?? null) ? (string)$meta['mr_city'] : '';
        $mrId = is_string($meta['mr_id'] ?? null) ? (string)$meta['mr_id'] : '';
        $lines[] = '';
        $lines[] = 'Point Relais (Mondial Relay):';
        if ($mrName !== '') $lines[] = '  Nom: ' . $mrName;
        if ($mrAddr !== '') $lines[] = '  Adresse: ' . $mrAddr;
        if ($mrPostal !== '' || $mrCity !== '') $lines[] = '  Ville: ' . trim($mrPostal . ' ' . $mrCity);
        if ($mrId !== '') $lines[] = '  ID: ' . $mrId;
    }
    $lines[] = '';
    $lines[] = 'Articles:';

    $li = is_array($order['line_items'] ?? null) ? $order['line_items'] : [];
    foreach ($li as $row) {
        if (!is_array($row)) continue;
        if (isset($row['error'])) {
            $lines[] = '  (Erreur) ' . (string)($row['details'] ?? '');
            continue;
        }
        $desc = is_string($row['description'] ?? null) ? $row['description'] : '';
        $qty = isset($row['quantity']) ? (int)$row['quantity'] : 0;
        $lines[] = '  - ' . $desc . ($qty > 1 ? (' x' . $qty) : '');
    }

    $body = implode("\n", $lines);

    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/plain; charset=utf-8';
    $headers[] = 'From: ' . $emailFrom;
    // Helps some MTAs; actual envelope sender is set via -f below when possible.
    $headers[] = 'Return-Path: ' . $emailFrom;
    if ($custEmail !== '') {
        $headers[] = 'Reply-To: ' . $custEmail;
    }

    $headersStr = implode("\r\n", $headers);

    // Improve deliverability on shared hosting by setting the envelope sender.
    // Many providers require a domain-local sender matching SPF/DKIM.
    $envelopeFrom = null;
    if (preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $emailFrom)) {
        $envelopeFrom = $emailFrom;
    }

    if ($envelopeFrom !== null) {
        $ok = @mail($emailTo, $subject, $body, $headersStr, '-f' . $envelopeFrom);
    } else {
        $ok = @mail($emailTo, $subject, $body, $headersStr);
    }
    $order['email_to'] = $emailTo;
    $order['email_from'] = $emailFrom;
    $order['email_envelope_from'] = $envelopeFrom;
    $order['email_method'] = 'mail';
    $order['email_sent'] = (bool)$ok;
    $order['email_sent_at'] = $ok ? gmdate('c') : null;
    if (!$ok) {
        $order['email_error'] = 'mail() failed';
    }
}

// Persist event file (create or update with email status / log status).
@file_put_contents($eventPath, json_encode($order, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);

http_response_code(200);
header('Content-Type: text/plain; charset=utf-8');
echo "ok";
