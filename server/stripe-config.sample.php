<?php

// Copy this file to `server/stripe-config.php` (NOT committed) and fill values.
// This file is a sample and safe to commit.

return [
    // Required (Secret key): sk_live_... or sk_test_...
    'stripe_secret_key' => 'sk_test_REPLACE_ME',

    // Required for webhooks (signing secret): whsec_...
    // Stripe Dashboard → Developers → Webhooks → (your endpoint) → Signing secret
    'stripe_webhook_secret' => 'whsec_REPLACE_ME',

    // Where to email new paid orders (recommended)
    'orders_email_to' => 'simonesixx.email@gmail.com',

    // Optional: override email sender (defaults to no-reply@<your-domain>)
    // 'orders_email_from' => 'no-reply@simonesixx.com',

    // Optional: where to store incoming orders (webhook will create subfolders)
    // 'orders_dir' => __DIR__ . '/orders',

    // Optional: restrict which Stripe Price IDs can be purchased (recommended).
    // Example: ['price_123', 'price_456']
    'allowed_price_ids' => [],

    // Shipping address collection (Checkout)
    // Example: ['FR', 'BE', 'DE']
    'allowed_countries' => ['FR'],

    // Optional: shipping rate IDs created in Stripe Dashboard (Shipping rates)
    // Example: ['shr_123', 'shr_456']
    'shipping_rate_ids' => [],

    // Optional: allow promo codes in Checkout
    'allow_promotion_codes' => true,
];
