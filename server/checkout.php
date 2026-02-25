<?php

declare(strict_types=1);

// Wrapper endpoint to avoid potential proxy/WAF rules on the original filename.
require __DIR__ . '/create-checkout-session.php';
