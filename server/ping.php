<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed', 'method' => $method], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');

http_response_code(200);
echo json_encode([
    'ok' => true,
    'method' => $method,
    'content_type' => $_SERVER['CONTENT_TYPE'] ?? null,
    'body_len' => is_string($raw) ? strlen($raw) : 0,
    'time' => gmdate('c'),
], JSON_UNESCAPED_UNICODE);
