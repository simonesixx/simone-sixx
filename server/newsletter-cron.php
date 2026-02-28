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

define('SIMONE_NEWSLETTER_CRON_VERSION', '2026-02-28-01');

function safe_job_id(string $id): string {
    $id = trim($id);
    if ($id === '') return 'article';
    $id = preg_replace('/[^a-zA-Z0-9_-]+/', '_', $id);
    $id = trim((string)$id, '_');
    if ($id === '') $id = 'article';
    return substr($id, 0, 80);
}

function ensure_dir(string $dir): void {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}

function parse_article_date_to_ts(string $raw): int {
    $raw = trim($raw);
    if ($raw === '') return 0;

    // dd/mm/yy or dd/mm/yyyy
    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/', $raw, $m)) {
        $d = (int)$m[1];
        $mo = (int)$m[2];
        $y = (int)$m[3];
        if ($y < 100) $y += 2000;
        $ts = @mktime(12, 0, 0, $mo, $d, $y);
        return is_int($ts) ? $ts : 0;
    }

    // e.g. "19 février 2026"
    $months = [
        'janvier' => 1,
        'fevrier' => 2,
        'février' => 2,
        'mars' => 3,
        'avril' => 4,
        'mai' => 5,
        'juin' => 6,
        'juillet' => 7,
        'aout' => 8,
        'août' => 8,
        'septembre' => 9,
        'octobre' => 10,
        'novembre' => 11,
        'decembre' => 12,
        'décembre' => 12,
    ];

    $lower = mb_strtolower($raw);
    if (preg_match('/^(\d{1,2})\s+([\p{L}]+)\s+(\d{4})$/u', $lower, $m)) {
        $d = (int)$m[1];
        $mon = (string)$m[2];
        $y = (int)$m[3];
        $mo = (int)($months[$mon] ?? 0);
        if ($mo >= 1 && $mo <= 12) {
            $ts = @mktime(12, 0, 0, $mo, $d, $y);
            return is_int($ts) ? $ts : 0;
        }
    }

    return 0;
}

function http_get(string $url, int $timeoutSeconds = 25): array {
    if (function_exists('curl_init')) {
        $ch = curl_init();
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'body' => null, 'error' => 'curl_init failed'];
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $timeoutSeconds);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSeconds);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);

        $respBody = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if (!is_string($respBody)) {
            return ['ok' => false, 'status' => $status, 'body' => null, 'error' => $err ?: 'curl_exec failed'];
        }

        return ['ok' => true, 'status' => $status, 'body' => $respBody, 'error' => null];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\n",
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

// Fallback to the public URL if the server-side file is missing or invalid.
if (!is_array($data)) {
    $articlesUrl = $baseUrl . '/assets/data/articles.json?v=' . rawurlencode(gmdate('YmdHis'));
    $res = http_get($articlesUrl, 25);
    if (($res['ok'] ?? false) === true && (int)($res['status'] ?? 0) === 200 && is_string($res['body'] ?? null)) {
        $data = json_decode((string)$res['body'], true);
        if (is_array($data)) {
            echo "[newsletter-cron] Using remote articles URL (local invalid): {$articlesUrl}\n";
        }
    }
}

if (!is_array($data)) {
    fwrite(STDERR, "[newsletter-cron] Cannot read articles JSON (local or remote). Local={$articlesPath}\n");
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

$jobsDir = __DIR__ . '/newsletter/jobs';
ensure_dir($jobsDir);

// Sort newest first (best-effort using parsed date, fallback to insertion order).
foreach ($articles as $i => $row) {
    $dateRaw = is_string($row['date'] ?? null) ? (string)$row['date'] : '';
    $articles[$i]['__ts'] = parse_article_date_to_ts($dateRaw);
    $articles[$i]['__i'] = $i;
}

usort($articles, function (array $a, array $b): int {
    $ta = (int)($a['__ts'] ?? 0);
    $tb = (int)($b['__ts'] ?? 0);
    if ($ta !== 0 || $tb !== 0) {
        if ($ta === $tb) return (int)($b['__i'] ?? 0) <=> (int)($a['__i'] ?? 0);
        return $tb <=> $ta;
    }
    return (int)($b['__i'] ?? 0) <=> (int)($a['__i'] ?? 0);
});

// Pick the most recent articles that are not already done.
$candidates = [];
foreach ($articles as $article) {
    if (count($candidates) >= $maxArticles) break;
    $articleId = trim((string)($article['id'] ?? ''));
    if ($articleId === '') continue;

    if (!$force) {
        $jobId = safe_job_id($articleId);
        $jobPath = $jobsDir . '/' . $jobId . '.json';
        if (is_file($jobPath)) {
            $rawJob = @file_get_contents($jobPath);
            $job = is_string($rawJob) ? json_decode($rawJob, true) : null;
            if (is_array($job) && ($job['done'] ?? false) === true) {
                continue;
            }
        }
    }

    $candidates[] = $article;
}

$endpoint = $baseUrl . '/server/newsletter-article-notify.php';

echo "[newsletter-cron] version=" . SIMONE_NEWSLETTER_CRON_VERSION . " endpoint={$endpoint} candidates=" . count($candidates) . " steps={$maxSteps} max_articles={$maxArticles}\n";

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
