<?php

declare(strict_types=1);

function normalize_email(string $email): string {
    $email = trim(mb_strtolower($email));
    $email = preg_replace('/\s+/', '', $email) ?? '';
    return $email;
}

function header_safe(string $value): string {
    // Prevent header injection
    $value = str_replace(["\r", "\n"], ' ', $value);
    $value = trim($value);
    return $value;
}

/**
 * Sends a UTF-8 plain text email using PHP mail().
 *
 * @param array<int,string> $headers
 */
function send_plain_email(string $to, string $subject, string $body, array $headers, ?string $envelopeFrom = null): bool {
    $to = header_safe($to);
    $subject = header_safe($subject);

    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/plain; charset=utf-8';

    $headersStr = implode("\r\n", array_map('header_safe', $headers));

    if (is_string($envelopeFrom) && $envelopeFrom !== '') {
        $envelopeFrom = header_safe($envelopeFrom);
        return (bool)@mail($to, $subject, $body, $headersStr, '-f' . $envelopeFrom);
    }

    return (bool)@mail($to, $subject, $body, $headersStr);
}
