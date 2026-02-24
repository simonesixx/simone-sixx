<?php

// Copy this file to `server/stripe-config.php` (NOT committed) and fill values.
// This file is a sample and safe to commit.

return [
    // Required (Secret key): sk_live_... or sk_test_...
    'stripe_secret_key' => 'sk_test_REPLACE_ME',

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
