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

$order = trim((string)($_POST['order'] ?? ''));
$emailRaw = (string)($_POST['email'] ?? '');
$email = normalize_email($emailRaw);
$name = trim((string)($_POST['name'] ?? ''));
$type = trim((string)($_POST['type'] ?? ''));
$reason = trim((string)($_POST['reason'] ?? ''));
$details = trim((string)($_POST['details'] ?? ''));
$confirm = (string)($_POST['confirm'] ?? '');

if (
    $order === '' ||
    $name === '' ||
    !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    $type === '' ||
    $reason === '' ||
    $confirm === ''
) {
    header('Location: /retours/?error=1', true, 303);
    exit;
}

$subject = 'Demande de retour — Simone Sixx';

$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

$body = "Nouvelle demande de retour\n\n";
$body .= "Commande: {$order}\n";
$body .= "Nom: {$name}\n";
$body .= "Email: {$email}\n";
$body .= "Type: {$type}\n";
$body .= "Motif: {$reason}\n";
$body .= "Precisions: " . ($details !== '' ? $details : '(aucune)') . "\n\n";
$body .= "Confirmation: OK\n\n";
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
    header('Location: /retours/?error=1', true, 303);
    exit;
}

header('Location: /retours/?sent=1', true, 303);
exit;
