<?php

declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/form-mail.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo 'Method not allowed';
    exit;
}

$to = getenv('SIMONE_CONTACT_EMAIL_TO');
if (!is_string($to) || $to === '') {
    $to = 'contact@simonesixx.com';
}

$name = trim((string)($_POST['name'] ?? ''));
$emailRaw = (string)($_POST['email'] ?? '');
$email = normalize_email($emailRaw);
$message = trim((string)($_POST['message'] ?? ''));

if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    header('Location: /contact/?error=1', true, 303);
    exit;
}

$subject = 'Contact — Simone Sixx';

$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

$body = "Nouveau message via le formulaire Contact\n\n";
$body .= "Nom: {$name}\n";
$body .= "Email: {$email}\n\n";
$body .= "Message:\n{$message}\n\n";
$body .= "---\n";
$body .= "IP: {$ip}\n";
$body .= "UA: {$ua}\n";
$body .= "Date (UTC): " . gmdate('c') . "\n";

$fromEmail = 'contact@simonesixx.com';
$fromHeader = 'Simone Sixx <' . $fromEmail . '>';

$headers = [
    'From: ' . $fromHeader,
    'Reply-To: ' . header_safe($email),
];

$ok = send_plain_email($to, $subject, $body, $headers, $fromEmail);

if (!$ok) {
    header('Location: /contact/?error=1', true, 303);
    exit;
}

header('Location: /contact/?sent=1', true, 303);
exit;
