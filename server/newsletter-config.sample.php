<?php

// Copy this file to newsletter-config.local.php on the server (do NOT commit secrets).
// This file is blocked from public access by server/.htaccess.

declare(strict_types=1);

return [
    // Protects /server/newsletter-export.php?token=...
    // Use a long random token.
    'export_token' => 'CHANGE_ME_LONG_RANDOM_TOKEN',

    // Protects the admin-triggered email notifications when an article is published.
    // This token should be kept secret (do not commit it).
    'notify_token' => 'CHANGE_ME_LONG_RANDOM_TOKEN',

    // Sender email address used for newsletter emails (must match your domain SPF/DKIM if possible).
    // Example: 'journal@simonesixx.com'
    'email_from' => 'CHANGE_ME_SENDER@YOUR_DOMAIN',

    // Secret used to sign unsubscribe links.
    // Generate a long random token and keep it secret.
    // 'unsubscribe_secret' => 'CHANGE_ME_LONG_RANDOM_SECRET',

    // Base URL of the website (used by the cron script to generate absolute links).
    // Example: 'https://simonesixx.com'
    // 'site_base_url' => 'https://simonesixx.com',

    // Optional: reply-to address for newsletter emails.
    // Example: 'contact@simonesixx.com'
    // 'reply_to' => 'contact@simonesixx.com',

    // Optional: custom storage path (defaults to server/newsletter/subscribers.json)
    // 'storage_path' => __DIR__ . '/newsletter/subscribers.json',
];
