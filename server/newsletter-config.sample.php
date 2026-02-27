<?php

// Copy this file to newsletter-config.local.php on the server (do NOT commit secrets).
// This file is blocked from public access by server/.htaccess.

declare(strict_types=1);

return [
    // Protects /server/newsletter-export.php?token=...
    // Use a long random token.
    'export_token' => 'CHANGE_ME_LONG_RANDOM_TOKEN',

    // Optional: custom storage path (defaults to server/newsletter/subscribers.json)
    // 'storage_path' => __DIR__ . '/newsletter/subscribers.json',
];
