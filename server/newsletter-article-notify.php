<?php

declare(strict_types=1);

@set_time_limit(12);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
define('SIMONE_NEWSLETTER_NOTIFY_VERSION', '2026-02-27-01');
header('X-Simone-Newsletter-Notify: ' . SIMONE_NEWSLETTER_NOTIFY_VERSION);

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

function load_config(): array {
    $default = [
        'export_token' => null,
        'notify_token' => null,
        'email_from' => null,
        'email_from_name' => null,
        'reply_to' => null,
        'unsubscribe_secret' => null,
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

function normalize_email(string $email): string {
    $email = trim(mb_strtolower($email));
    $email = trim($email, "<> \t\n\r\0\x0B");
    return $email;
}

function request_base_url(): string {
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    if ($host === '') return '';
    $https = (string)($_SERVER['HTTPS'] ?? '');
    $proto = ($https !== '' && $https !== 'off') ? 'https' : 'http';
    return $proto . '://' . $host;
}

function unsubscribe_sig(string $secret, string $email): string {
    $email = normalize_email($email);
    return hash_hmac('sha256', $email, $secret);
}

function parse_from_header(string $raw, ?string $nameOverride = null): array {
    $raw = trim($raw);
    $nameOverride = is_string($nameOverride) ? trim($nameOverride) : null;
    if ($nameOverride === '') $nameOverride = null;

    $name = null;
    $addr = $raw;

    // Supports: Name <email@domain.tld>
    if (preg_match('/^\s*(.+?)\s*<\s*([^>]+)\s*>\s*$/', $raw, $m)) {
        $name = trim((string)($m[1] ?? ''));
        $addr = trim((string)($m[2] ?? ''));
        if ($name === '') $name = null;
    }

    $addr = trim($addr);
    if ($addr !== '') {
        $addrNorm = normalize_email($addr);
        if (filter_var($addrNorm, FILTER_VALIDATE_EMAIL) !== false) {
            $addr = $addrNorm;
        }
    }

    if ($nameOverride !== null) {
        $name = $nameOverride;
    }

    $envelopeFrom = (filter_var($addr, FILTER_VALIDATE_EMAIL) !== false) ? $addr : '';

    if ($name !== null && $envelopeFrom !== '') {
        // Keep it simple (ASCII name), mail() will pass it through.
        $fromHeader = $name . ' <' . $envelopeFrom . '>';
        return [$fromHeader, $envelopeFrom];
    }

    return [$envelopeFrom !== '' ? $envelopeFrom : $raw, $envelopeFrom];
}

function normalize_eol(string $s): string {
    $s = str_replace("\r\n", "\n", $s);
    $s = str_replace("\r", "\n", $s);
    return str_replace("\n", "\r\n", $s);
}

function safe_job_id(string $id): string {
    $id = trim($id);
    if ($id === '') return 'article';
    $id = preg_replace('/[^a-zA-Z0-9_-]+/', '_', $id);
    $id = trim((string)$id, '_');
    if ($id === '') $id = 'article';
    return substr($id, 0, 80);
}

function encode_subject_utf8(string $subject): string {
    $subject = trim($subject);
    if ($subject === '') return $subject;
    // RFC 2047 encoded-word (base64)
    $b64 = base64_encode($subject);
    return '=?UTF-8?B?' . $b64 . '?=';
}

function build_article_email_body(array $article, string $url, ?string $unsubscribeUrl = null): string {
    $title = is_string($article['title'] ?? null) ? trim((string)$article['title']) : '';
    $date = is_string($article['date'] ?? null) ? trim((string)$article['date']) : '';
    $excerpt = is_string($article['excerpt'] ?? null) ? trim((string)$article['excerpt']) : '';

    // Keep excerpt short for email.
    $excerpt = preg_replace('/\s+/', ' ', $excerpt);
    if (is_string($excerpt) && strlen($excerpt) > 380) {
        $excerpt = substr($excerpt, 0, 377) . '...';
    }

    $lines = [];
    $lines[] = 'Journal de Simone Sixx';
    $lines[] = '';
    if ($title !== '') $lines[] = $title;
    if ($date !== '') $lines[] = $date;
    $lines[] = '';
    if ($excerpt !== '') {
        $lines[] = $excerpt;
        $lines[] = '';
    }
    $lines[] = 'Lire l\'article :';
    $lines[] = $url;
    $lines[] = '';
    $lines[] = '—';
    $lines[] = 'Simone Sixx';

    if (is_string($unsubscribeUrl) && trim($unsubscribeUrl) !== '') {
        $lines[] = '';
        $lines[] = 'Se désabonner :';
        $lines[] = $unsubscribeUrl;
    }

    return implode("\n", $lines);
}

function build_article_email_html(array $article, string $url, ?string $unsubscribeUrl = null, ?string $logoUrl = null): string {
    $title = is_string($article['title'] ?? null) ? trim((string)$article['title']) : '';
    $date = is_string($article['date'] ?? null) ? trim((string)$article['date']) : '';
    $excerpt = is_string($article['excerpt'] ?? null) ? trim((string)$article['excerpt']) : '';

    $titleEsc = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $dateEsc = htmlspecialchars($date, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $excerptEsc = htmlspecialchars($excerpt, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $urlEsc = htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $unsubEsc = is_string($unsubscribeUrl) ? htmlspecialchars($unsubscribeUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') : '';
    $logoUrlEsc = is_string($logoUrl) ? htmlspecialchars($logoUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') : '';

    $hasUnsub = is_string($unsubscribeUrl) && trim($unsubscribeUrl) !== '';
    $hasLogo = is_string($logoUrl) && trim($logoUrl) !== '';

    $html = '';
    $html .= '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>';
    $html .= '<body style="margin:0;padding:0;background:#ffffff;">';
    $html .= '<div style="max-width:640px;margin:0 auto;padding:34px 22px;font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;">';

    if ($hasLogo) {
        $html .= '<div style="text-align:center;margin:2px 0 22px;">';
        $html .= '<img src="' . $logoUrlEsc . '" alt="Simone Sixx" style="display:inline-block;max-width:160px;width:100%;height:auto;">';
        $html .= '</div>';
    }

    $html .= '<div style="text-align:center;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#111;">Journal de Simone Sixx</div>';

    if ($titleEsc !== '') {
        $html .= '<h1 style="margin:18px 0 8px;text-align:center;font-size:28px;line-height:1.2;font-weight:600;">' . $titleEsc . '</h1>';
    }
    if ($dateEsc !== '') {
        $html .= '<div style="text-align:center;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#666;margin-bottom:18px;">' . $dateEsc . '</div>';
    } else {
        $html .= '<div style="margin-bottom:18px;"></div>';
    }

    $html .= '<div style="border-top:1px solid #eee;margin:0 auto 22px;max-width:520px;"></div>';

    if ($excerptEsc !== '') {
        $html .= '<div style="max-width:520px;margin:0 auto 22px;font-size:14px;color:#222;">' . nl2br($excerptEsc) . '</div>';
    }

    $html .= '<div style="text-align:center;margin:10px 0 26px;">';
    $html .= '<a href="' . $urlEsc . '" style="display:inline-block;padding:12px 18px;text-decoration:none;border:1px solid #111;color:#111;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">Lire l\'article</a>';
    $html .= '</div>';

    $html .= '<div style="border-top:1px solid #eee;margin-top:26px;padding-top:14px;font-size:11px;color:#666;">';
    $html .= '<div style="text-align:center;letter-spacing:0.08em;text-transform:uppercase;color:#666;">Simone Sixx</div>';
    if ($hasUnsub) {
        $html .= '<div style="margin-top:10px;text-align:center;color:#777;">';
        $html .= '<a href="' . $unsubEsc . '" style="color:#777;text-decoration:none;">Se désabonner</a>';
        $html .= '</div>';
    }
    $html .= '</div>';

    $html .= '</div></body></html>';
    return $html;
}

function send_email(
    string $to,
    string $subject,
    string $textBody,
    ?string $htmlBody,
    string $fromHeader,
    string $returnPath,
    ?string $replyTo = null,
    ?string $listUnsubscribeUrl = null
): bool {
    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'From: ' . $fromHeader;
    $headers[] = 'Return-Path: ' . $returnPath;
    if (is_string($replyTo) && $replyTo !== '') {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    if (is_string($listUnsubscribeUrl) && trim($listUnsubscribeUrl) !== '') {
        $headers[] = 'List-Unsubscribe: <' . trim($listUnsubscribeUrl) . '>';
    }

    $textBody = normalize_eol($textBody);

    if (!is_string($htmlBody) || trim($htmlBody) === '') {
        $headers[] = 'Content-Type: text/plain; charset=utf-8';
        $headersStr = implode("\r\n", $headers);
        return (bool)@mail($to, $subject, $textBody, $headersStr, '-f' . $returnPath);
    }

    $htmlBody = normalize_eol($htmlBody);

    $boundary = 'simone_' . bin2hex(function_exists('random_bytes') ? random_bytes(12) : (string)uniqid('', true));
    $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';

    $headersStr = implode("\r\n", $headers);

    $msg = '';
    $msg .= "--{$boundary}\r\n";
    $msg .= "Content-Type: text/plain; charset=utf-8\r\n";
    $msg .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $msg .= $textBody . "\r\n\r\n";
    $msg .= "--{$boundary}\r\n";
    $msg .= "Content-Type: text/html; charset=utf-8\r\n";
    $msg .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $msg .= $htmlBody . "\r\n\r\n";
    $msg .= "--{$boundary}--\r\n";

    return (bool)@mail($to, $subject, $msg, $headersStr, '-f' . $returnPath);
}

function load_subscriber_emails(string $path): array {
    if (!is_file($path)) return [];
    $json = file_get_contents($path);
    $data = is_string($json) ? json_decode($json, true) : null;
    $rows = is_array($data) && is_array($data['subscribers'] ?? null) ? $data['subscribers'] : [];

    $emails = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $email = is_string($row['email'] ?? null) ? trim((string)$row['email']) : '';
        if ($email === '') continue;
        $emails[] = mb_strtolower($email);
    }

    $emails = array_values(array_unique($emails));
    sort($emails);
    return $emails;
}

function ensure_dir(string $dir): void {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';
if ($method === 'GET' && (string)($_GET['probe'] ?? '') === '1') {
    $cfg = load_config();
    $token = is_string($cfg['notify_token'] ?? null) ? (string)$cfg['notify_token'] : '';
    if ($token === '') {
        $token = getenv('NEWSLETTER_NOTIFY_TOKEN') ?: '';
    }

    json_response(200, [
        'ok' => true,
        'probe' => true,
        'version' => SIMONE_NEWSLETTER_NOTIFY_VERSION,
        'configured' => $token !== '',
        'config_path' => is_string($cfg['__config_path'] ?? null) ? $cfg['__config_path'] : null,
        'time' => gmdate('c'),
    ]);
}

if ($method !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed', 'method' => $method]);
}

$payload = read_json_body();
if (!is_array($payload)) {
    $payload = $_POST;
}

$config = load_config();

$token = is_string($config['notify_token'] ?? null) ? (string)$config['notify_token'] : '';
if ($token === '') {
    $token = getenv('NEWSLETTER_NOTIFY_TOKEN') ?: '';
}

$providedToken = '';
if (isset($_SERVER['HTTP_X_NEWSLETTER_TOKEN'])) {
    $providedToken = (string)$_SERVER['HTTP_X_NEWSLETTER_TOKEN'];
} elseif (is_string($payload['token'] ?? null)) {
    $providedToken = (string)$payload['token'];
}

if ($token === '' || $providedToken === '' || !hash_equals($token, $providedToken)) {
    json_response(403, ['ok' => false, 'error' => 'Forbidden']);
}

$article = is_array($payload['article'] ?? null) ? $payload['article'] : [];
$articleId = is_string($article['id'] ?? null) ? trim((string)$article['id']) : '';
$title = is_string($article['title'] ?? null) ? trim((string)$article['title']) : '';

if ($articleId === '' || $title === '') {
    json_response(400, ['ok' => false, 'error' => 'Missing article id/title']);
}

$url = is_string($payload['url'] ?? null) ? trim((string)$payload['url']) : '';
if ($url === '') {
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    $https = (string)($_SERVER['HTTPS'] ?? '');
    $proto = ($https !== '' && $https !== 'off') ? 'https' : 'http';
    $url = $host !== ''
        ? ($proto . '://' . $host . '/articles/article.html?id=' . rawurlencode($articleId))
        : ('/articles/article.html?id=' . rawurlencode($articleId));
}

$force = ($payload['force'] ?? null) === true || (string)($payload['force'] ?? '') === '1';
$dryRun = ($payload['dry_run'] ?? null) === true || (string)($payload['dry_run'] ?? '') === '1';

$emailFromRaw = is_string($config['email_from'] ?? null) ? trim((string)$config['email_from']) : '';
if ($emailFromRaw === '') {
    $emailFromRaw = getenv('NEWSLETTER_EMAIL_FROM') ?: '';
}

$emailFromName = is_string($config['email_from_name'] ?? null) ? trim((string)$config['email_from_name']) : null;
if ($emailFromName === null || $emailFromName === '') {
    $n = getenv('NEWSLETTER_EMAIL_FROM_NAME') ?: '';
    $emailFromName = $n !== '' ? $n : null;
}

[$fromHeader, $returnPath] = parse_from_header($emailFromRaw, $emailFromName);
if (!is_string($returnPath) || $returnPath === '') {
    json_response(501, ['ok' => false, 'error' => 'Newsletter sender not configured (email_from must be a valid email)']);
}

$replyTo = is_string($config['reply_to'] ?? null) ? trim((string)$config['reply_to']) : null;
if ($replyTo === null || $replyTo === '') {
    $rt = getenv('NEWSLETTER_REPLY_TO') ?: '';
    $replyTo = $rt !== '' ? $rt : null;
}

$storagePath = is_string($config['storage_path'] ?? null) && (string)$config['storage_path'] !== ''
    ? (string)$config['storage_path']
    : (__DIR__ . '/newsletter/subscribers.json');

$emails = load_subscriber_emails($storagePath);
if (count($emails) === 0) {
    json_response(200, [
        'ok' => true,
        'done' => true,
        'sent' => 0,
        'total' => 0,
        'remaining' => 0,
        'message' => 'No subscribers yet',
    ]);
}

$jobsDir = __DIR__ . '/newsletter/jobs';
ensure_dir($jobsDir);

$jobId = safe_job_id($articleId);
$jobPath = $jobsDir . '/' . $jobId . '.json';

if ($force && is_file($jobPath)) {
    @unlink($jobPath);
}

$job = null;
if (is_file($jobPath)) {
    $raw = file_get_contents($jobPath);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (is_array($decoded)) {
        $job = $decoded;
    }
}

if (!is_array($job)) {
    $job = [
        'version' => SIMONE_NEWSLETTER_NOTIFY_VERSION,
        'article_id' => $articleId,
        'article' => $article,
        'url' => $url,
        'created_at' => gmdate('c'),
        'updated_at' => gmdate('c'),
        'done' => false,
        'cursor' => 0,
        'emails' => $emails,
        'sent' => 0,
        'errors' => 0,
        'last_error' => null,
    ];
}

if (($job['done'] ?? false) === true) {
    json_response(200, [
        'ok' => true,
        'done' => true,
        'sent' => (int)($job['sent'] ?? 0),
        'total' => is_array($job['emails'] ?? null) ? count($job['emails']) : count($emails),
        'remaining' => 0,
        'message' => 'Already sent',
    ]);
}

$jobEmails = is_array($job['emails'] ?? null) ? $job['emails'] : $emails;
$cursor = isset($job['cursor']) ? (int)$job['cursor'] : 0;
if ($cursor < 0) $cursor = 0;

$total = count($jobEmails);
if ($cursor >= $total) {
    $job['done'] = true;
    $job['updated_at'] = gmdate('c');
    @file_put_contents($jobPath, json_encode($job, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    json_response(200, [
        'ok' => true,
        'done' => true,
        'sent' => (int)($job['sent'] ?? 0),
        'total' => $total,
        'remaining' => 0,
    ]);
}

$batchSize = 30;
$batch = array_slice($jobEmails, $cursor, $batchSize);

$subjectRaw = 'Nouveau Journal — ' . $title;
$subject = encode_subject_utf8($subjectRaw);

$unsubscribeSecret = is_string($config['unsubscribe_secret'] ?? null) ? trim((string)$config['unsubscribe_secret']) : '';
if ($unsubscribeSecret === '') {
    $unsubscribeSecret = getenv('NEWSLETTER_UNSUBSCRIBE_SECRET') ?: '';
}

$baseUrl = request_base_url();
$unsubscribeBase = $baseUrl !== '' ? ($baseUrl . '/server/newsletter-unsubscribe.php') : '';
$logoUrl = $baseUrl !== '' ? ($baseUrl . '/assets/images/logo.png') : null;

$sentNow = 0;
$errorsNow = 0;
$lastError = null;

foreach ($batch as $emailTo) {
    if (!is_string($emailTo) || trim($emailTo) === '') continue;

    $unsubscribeUrl = null;
    if ($unsubscribeBase !== '' && is_string($unsubscribeSecret) && $unsubscribeSecret !== '') {
        $emailNorm = normalize_email($emailTo);
        $sig = unsubscribe_sig($unsubscribeSecret, $emailNorm);
        $unsubscribeUrl = $unsubscribeBase . '?e=' . rawurlencode($emailNorm) . '&sig=' . rawurlencode($sig);
    }

    $textBody = build_article_email_body($article, $url, $unsubscribeUrl);
    $htmlBody = build_article_email_html($article, $url, $unsubscribeUrl, $logoUrl);

    if ($dryRun) {
        $sentNow += 1;
        continue;
    }

    $ok = send_email($emailTo, $subject, $textBody, $htmlBody, $fromHeader, $returnPath, $replyTo, $unsubscribeUrl);
    if ($ok) {
        $sentNow += 1;
    } else {
        $errorsNow += 1;
        $lastError = 'mail() failed';
    }

    // Light pacing on shared hosting.
    usleep(35000);
}

$job['cursor'] = $cursor + count($batch);
$job['sent'] = (int)($job['sent'] ?? 0) + $sentNow;
$job['errors'] = (int)($job['errors'] ?? 0) + $errorsNow;
$job['last_error'] = $lastError;
$job['updated_at'] = gmdate('c');

if ($job['cursor'] >= $total) {
    $job['done'] = true;
}

@file_put_contents($jobPath, json_encode($job, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);

json_response(200, [
    'ok' => true,
    'done' => (bool)($job['done'] ?? false),
    'sent_now' => $sentNow,
    'sent_total' => (int)($job['sent'] ?? 0),
    'errors_total' => (int)($job['errors'] ?? 0),
    'total' => $total,
    'remaining' => max(0, $total - (int)($job['cursor'] ?? 0)),
    'job_id' => $jobId,
    'dry_run' => $dryRun,
]);
