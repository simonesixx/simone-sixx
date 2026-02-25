<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

http_response_code(200);
echo json_encode([
    'ok' => true,
    'service' => 'simonesixx-stripe',
    'version' => '2026-02-25-04',
    'php' => PHP_VERSION,
    'curl' => function_exists('curl_init'),
    'time' => gmdate('c'),
], JSON_UNESCAPED_UNICODE);
