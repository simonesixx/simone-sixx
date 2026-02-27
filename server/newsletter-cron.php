<?php

declare(strict_types=1);

// Cron-only script: sends newsletter emails for newly published articles.
// Run from CLI (cPanel Cron Jobs). Web access is forbidden.

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
    http_response_code(403);
    echo "Forbidden\n";
    exit;
}

@set_time_limit(55);

define('SIMONE_NEWSLETTER_CRON_VERSION', '2026-02-27-01');

function load_config(): array {
    $default = [
        'notify_token' => null,
        'email_from' => null,
        'reply_to' => null,
        'storage_path' => __DIR__ . '/newsletter/subscribers.json',
        'site_base_url' => null,
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

function parse_args(array $argv): array {
    $out = [];
    foreach ($argv as $i => $arg) {
        if ($i === 0) continue;
        if (!is_string($arg)) continue;
        if (strpos($arg, '--') !== 0) continue;
        $arg = substr($arg, 2);
        $parts = explode('=', $arg, 2);
        $key = trim((string)($parts[0] ?? ''));
        if ($key === '') continue;
        $val = $parts[1] ?? true;
        $out[$key] = $val;
    }
    return $out;
}

function http_post_json(string $url, array $payload, array $headers = [], int $timeoutSeconds = 25): array {
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json)) {
        return ['ok' => false, 'status' => 0, 'body' => null, 'error' => 'json_encode failed'];
    }

    $baseHeaders = [
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    foreach ($headers as $h) {
        if (is_string($h) && $h !== '') $baseHeaders[] = $h;
    }

    if (function_exists('curl_init')) {
        $ch = curl_init();
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'body' => null, 'error' => 'curl_init failed'];
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $baseHeaders);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $timeoutSeconds);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSeconds);

        $respBody = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if (!is_string($respBody)) {
            return ['ok' => false, 'status' => $status, 'body' => null, 'error' => $err ?: 'curl_exec failed'];
        }

        return ['ok' => true, 'status' => $status, 'body' => $respBody, 'error' => null];
    }

    // Fallback: stream context (requires allow_url_fopen)
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $baseHeaders),
            'content' => $json,
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);

    $respBody = @file_get_contents($url, false, $context);
    $status = 0;

    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $line) {
            if (preg_match('/^HTTP\/[0-9.]+\s+(\d+)/', (string)$line, $m)) {
                $status = (int)$m[1];
                break;
            }
        }
    }

    if (!is_string($respBody)) {
        return ['ok' => false, 'status' => $status, 'body' => null, 'error' => 'file_get_contents failed'];
    }

    return ['ok' => true, 'status' => $status, 'body' => $respBody, 'error' => null];
}

$args = parse_args($argv);

$maxArticles = isset($args['max-articles']) ? (int)$args['max-articles'] : 3;
if ($maxArticles < 1) $maxArticles = 1;
if ($maxArticles > 10) $maxArticles = 10;

$maxSteps = isset($args['max-steps']) ? (int)$args['max-steps'] : 1;
if ($maxSteps < 1) $maxSteps = 1;
if ($maxSteps > 25) $maxSteps = 25;

$force = isset($args['force']) && ((string)$args['force'] === '1' || (string)$args['force'] === 'true');
$dryRun = isset($args['dry-run']) && ((string)$args['dry-run'] === '1' || (string)$args['dry-run'] === 'true');

$config = load_config();

$token = is_string($config['notify_token'] ?? null) ? trim((string)$config['notify_token']) : '';
if ($token === '') $token = (string)(getenv('NEWSLETTER_NOTIFY_TOKEN') ?: '');

$baseUrl = is_string($config['site_base_url'] ?? null) ? trim((string)$config['site_base_url']) : '';
if ($baseUrl === '') $baseUrl = (string)(getenv('NEWSLETTER_SITE_BASE_URL') ?: '');
$baseUrl = rtrim($baseUrl, '/');

if ($token === '') {
    fwrite(STDERR, "[newsletter-cron] Missing notify token (notify_token / NEWSLETTER_NOTIFY_TOKEN).\n");
    exit(2);
}

if ($baseUrl === '') {
    fwrite(STDERR, "[newsletter-cron] Missing site base URL (site_base_url / NEWSLETTER_SITE_BASE_URL).\n");
    fwrite(STDERR, "Example: https://simonesixx.com\n");
    exit(2);
}

$articlesPath = realpath(__DIR__ . '/../assets/data/articles.json') ?: (__DIR__ . '/../assets/data/articles.json');
$raw = @file_get_contents($articlesPath);
$data = is_string($raw) ? json_decode($raw, true) : null;

if (!is_array($data)) {
    fwrite(STDERR, "[newsletter-cron] Cannot read articles JSON: {$articlesPath}\n");
    exit(1);
}

$articles = [];
foreach ($data as $row) {
    if (!is_array($row)) continue;
    $id = is_string($row['id'] ?? null) ? trim((string)$row['id']) : '';
    $title = is_string($row['title'] ?? null) ? trim((string)$row['title']) : '';
    if ($id === '' || $title === '') continue;
    $articles[] = $row;
}

if (count($articles) === 0) {
    echo "[newsletter-cron] No published articles found.\n";
    exit(0);
}

$candidates = array_slice($articles, -$maxArticles);
$candidates = array_reverse($candidates); // newest first

$endpoint = $baseUrl . '/server/newsletter-article-notify.php';

echo "[newsletter-cron] version=" . SIMONE_NEWSLETTER_CRON_VERSION . " endpoint={$endpoint} candidates=" . count($candidates) . " steps={$maxSteps}\n";

foreach ($candidates as $article) {
    $articleId = trim((string)($article['id'] ?? ''));
    $title = trim((string)($article['title'] ?? ''));

    $url = $baseUrl . '/articles/article.html?id=' . rawurlencode($articleId);

    $payload = [
        'article' => [
            'id' => $articleId,
            'title' => $title,
            'date' => is_string($article['date'] ?? null) ? trim((string)$article['date']) : '',
            'excerpt' => is_string($article['excerpt'] ?? null) ? trim((string)$article['excerpt']) : '',
            'image' => is_string($article['image'] ?? null) ? trim((string)$article['image']) : '',
        ],
        'url' => $url,
        'force' => $force ? 1 : 0,
        'dry_run' => $dryRun ? 1 : 0,
    ];

    echo "[newsletter-cron] Article {$articleId} — {$title}\n";

    $step = 0;
    while ($step < $maxSteps) {
        $step += 1;

        $res = http_post_json($endpoint, $payload, ['X-Newsletter-Token: ' . $token], 35);
        if (($res['ok'] ?? false) !== true) {
            fwrite(STDERR, "[newsletter-cron] step={$step} http error: " . (string)($res['error'] ?? 'unknown') . "\n");
            break;
        }

        $status = (int)($res['status'] ?? 0);
        $body = is_string($res['body'] ?? null) ? (string)$res['body'] : '';

        if ($status !== 200) {
            fwrite(STDERR, "[newsletter-cron] step={$step} status={$status} body=" . substr($body, 0, 300) . "\n");
            break;
        }

        $json = json_decode($body, true);
        if (!is_array($json) || ($json['ok'] ?? null) !== true) {
            fwrite(STDERR, "[newsletter-cron] step={$step} invalid response body=" . substr($body, 0, 300) . "\n");
            break;
        }

        $done = ($json['done'] ?? false) === true;
        $sentTotal = (int)($json['sent_total'] ?? ($json['sent'] ?? 0));
        $total = (int)($json['total'] ?? 0);
        $remaining = (int)($json['remaining'] ?? 0);

        echo "[newsletter-cron] step={$step} sent={$sentTotal}/{$total} remaining={$remaining} done=" . ($done ? '1' : '0') . "\n";

        if ($done) break;

        // Short delay between batches (avoid hammering).
        usleep(120000);
    }
}

exit(0);
