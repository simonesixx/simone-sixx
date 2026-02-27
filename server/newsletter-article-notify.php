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
        'reply_to' => null,
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

function build_article_email_body(array $article, string $url): string {
    $title = is_string($article['title'] ?? null) ? trim((string)$article['title']) : '';
    $date = is_string($article['date'] ?? null) ? trim((string)$article['date']) : '';
    $excerpt = is_string($article['excerpt'] ?? null) ? trim((string)$article['excerpt']) : '';

    // Keep excerpt short for email.
    $excerpt = preg_replace('/\s+/', ' ', $excerpt);
    if (is_string($excerpt) && strlen($excerpt) > 380) {
        $excerpt = substr($excerpt, 0, 377) . '...';
    }

    $lines = [];
    $lines[] = 'Journal Simone Sixx';
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

    return implode("\n", $lines);
}

function send_email(string $to, string $subject, string $body, string $from, ?string $replyTo = null): bool {
    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/plain; charset=utf-8';
    $headers[] = 'From: ' . $from;
    $headers[] = 'Return-Path: ' . $from;
    if (is_string($replyTo) && $replyTo !== '') {
        $headers[] = 'Reply-To: ' . $replyTo;
    }

    $headersStr = implode("\r\n", $headers);

    $envelopeFrom = null;
    if (preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $from)) {
        $envelopeFrom = $from;
    }

    if ($envelopeFrom !== null) {
        return (bool)@mail($to, $subject, $body, $headersStr, '-f' . $envelopeFrom);
    }

    return (bool)@mail($to, $subject, $body, $headersStr);
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

$emailFrom = is_string($config['email_from'] ?? null) ? trim((string)$config['email_from']) : '';
if ($emailFrom === '') {
    $emailFrom = getenv('NEWSLETTER_EMAIL_FROM') ?: '';
}
if ($emailFrom === '') {
    json_response(501, ['ok' => false, 'error' => 'Newsletter sender not configured (email_from / NEWSLETTER_EMAIL_FROM)']);
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
$body = build_article_email_body($article, $url);

$sentNow = 0;
$errorsNow = 0;
$lastError = null;

foreach ($batch as $emailTo) {
    if (!is_string($emailTo) || trim($emailTo) === '') continue;

    if ($dryRun) {
        $sentNow += 1;
        continue;
    }

    $ok = send_email($emailTo, $subject, $body, $emailFrom, $replyTo);
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
