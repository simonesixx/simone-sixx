<?php

declare(strict_types=1);

@set_time_limit(6);

header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

define('SIMONE_NEWSLETTER_UNSUB_VERSION', '2026-02-28-01');

function load_config(): array {
    $default = [
        'storage_path' => __DIR__ . '/newsletter/subscribers.json',
        'unsubscribe_secret' => null,
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

function hmac_sig(string $secret, string $email): string {
    $email = normalize_email($email);
    return hash_hmac('sha256', $email, $secret);
}

function html_page(int $status, string $title, string $message): void {
    http_response_code($status);
    $titleEsc = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $msgEsc = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    echo "<!doctype html>\n";
    echo "<html lang=\"fr\">\n";
    echo "<head>\n";
    echo "  <meta charset=\"utf-8\">\n";
    echo "  <meta name=\"robots\" content=\"noindex,nofollow\">\n";
    echo "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n";
    echo "  <title>{$titleEsc}</title>\n";
    echo "  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;max-width:720px;margin:0 auto;line-height:1.5}h1{font-size:20px;margin:0 0 12px}p{margin:0 0 10px;color:#222}small{color:#666}</style>\n";
    echo "</head>\n";
    echo "<body>\n";
    echo "  <h1>{$titleEsc}</h1>\n";
    echo "  <p>{$msgEsc}</p>\n";
    echo "  <small>Simone Sixx — Journal (v" . SIMONE_NEWSLETTER_UNSUB_VERSION . ")</small>\n";
    echo "</body>\n";
    echo "</html>\n";
    exit;
}

$config = load_config();

$secret = is_string($config['unsubscribe_secret'] ?? null) ? trim((string)$config['unsubscribe_secret']) : '';
if ($secret === '') {
    $secret = (string)(getenv('NEWSLETTER_UNSUBSCRIBE_SECRET') ?: '');
}

$emailRaw = is_string($_GET['e'] ?? null) ? (string)$_GET['e'] : '';
$sigRaw = is_string($_GET['sig'] ?? null) ? (string)$_GET['sig'] : '';

$email = normalize_email($emailRaw);
$sig = trim($sigRaw);

if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    html_page(400, 'Désinscription', 'Adresse e-mail invalide.');
}

if ($secret === '') {
    html_page(501, 'Désinscription', 'La désinscription n\'est pas configurée (secret manquant).');
}

$expected = hmac_sig($secret, $email);
if ($sig === '' || !hash_equals($expected, $sig)) {
    html_page(403, 'Désinscription', 'Lien de désinscription invalide ou expiré.');
}

$path = is_string($config['storage_path'] ?? null) && (string)$config['storage_path'] !== ''
    ? (string)$config['storage_path']
    : (__DIR__ . '/newsletter/subscribers.json');

if (!is_file($path)) {
    html_page(200, 'Désinscription confirmée', 'Vous étiez déjà désinscrit(e).');
}

$fp = @fopen($path, 'c+');
if ($fp === false) {
    html_page(500, 'Désinscription', 'Erreur serveur (stockage indisponible).');
}

try {
    if (!flock($fp, LOCK_EX)) {
        html_page(500, 'Désinscription', 'Erreur serveur (verrouillage impossible).');
    }

    rewind($fp);
    $json = stream_get_contents($fp);
    $data = is_string($json) ? json_decode($json, true) : null;

    if (!is_array($data)) {
        $data = ['subscribers' => []];
    }

    $subs = is_array($data['subscribers'] ?? null) ? $data['subscribers'] : [];

    $newSubs = [];
    $removed = 0;

    foreach ($subs as $row) {
        if (!is_array($row)) continue;
        $rowEmail = is_string($row['email'] ?? null) ? normalize_email((string)$row['email']) : '';
        if ($rowEmail !== '' && hash_equals($rowEmail, $email)) {
            $removed += 1;
            continue;
        }
        $newSubs[] = $row;
    }

    $data['subscribers'] = $newSubs;
    $data['updated_at'] = gmdate('c');
    $data['version'] = SIMONE_NEWSLETTER_UNSUB_VERSION;

    $out = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (!is_string($out)) {
        html_page(500, 'Désinscription', 'Erreur serveur (encode).');
    }

    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, $out);
    fflush($fp);

    if ($removed > 0) {
        html_page(200, 'Désinscription confirmée', 'Vous êtes bien désinscrit(e) du Journal.');
    }

    html_page(200, 'Désinscription confirmée', 'Vous étiez déjà désinscrit(e).');
} finally {
    @flock($fp, LOCK_UN);
    @fclose($fp);
}
