<?php

// Copy this file to `server/stripe-config.php` (NOT committed) and fill values.
// This file is a sample and safe to commit.

return [
    // Optional: canonical site origin (used for Checkout success/cancel URLs)
    // If your hosting sometimes resolves to another host, set this.
    // Example: 'https://simonesixx.com'
    // 'site_origin' => 'https://simonesixx.com',

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

    // Currency used for dynamic line items (ex: shipping). Must match your Stripe Prices currency.
    // Example: 'eur'
    'currency' => 'eur',

    // Optional: weight mapping (grams) per Stripe Price ID, used to compute shipping brackets.
    // Fill this with your real Price IDs.
    // Example: ['price_123' => 250, 'price_456' => 900]
    'weights_by_price_id' => [
        // 'price_...' => 0,
    ],

    // Used when a cart item has no mapping in weights_by_price_id.
    // Keep at 0 if you prefer to never overcharge by mistake.
    'default_weight_grams' => 0,

    // Optional: free shipping threshold (products subtotal, in cents).
    // Example: 9000 means free shipping from 90.00 EUR.
    'free_shipping_threshold_cents' => 9000,

    // Mondial Relay shipping brackets (France only in this project).
    // First matching bracket where weight <= max_weight_grams is used.
    // amount_cents is the shipping price in cents.
    'mondial_relay_rates' => [
        // ['max_weight_grams' => 500,  'amount_cents' => 495],
        // ['max_weight_grams' => 1000, 'amount_cents' => 595],
        // ['max_weight_grams' => 2000, 'amount_cents' => 695],
        // ['max_weight_grams' => null, 'amount_cents' => 895], // open-ended
    ],

    // Home delivery shipping brackets (France).
    // First matching bracket where weight <= max_weight_grams is used.
    // amount_cents is the shipping price in cents.
    'home_shipping_rates' => [
        // ['max_weight_grams' => 250,  'amount_cents' => 441],
        // ['max_weight_grams' => 500,  'amount_cents' => 624],
        // ['max_weight_grams' => 1000, 'amount_cents' => 790],
        // ['max_weight_grams' => 2000, 'amount_cents' => 913],
        // ['max_weight_grams' => null, 'amount_cents' => 3583], // open-ended
    ],
];
