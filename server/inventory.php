<?php

declare(strict_types=1);

// Minimal inventory management for a small static shop.
// - Keeps stock on the server filesystem
// - Uses reservations to prevent double-selling during checkout
// - Finalizes stock on Stripe webhook when payment is confirmed

function simone_inventory_path(array $config): string {
    $path = $config['inventory_path'] ?? null;
    if (is_string($path) && trim($path) !== '') {
        return trim($path);
    }
    return __DIR__ . '/inventory.json';
}

function simone_inventory_default_items(): array {
    // Stock-limited item: Parfum 30 ml
    // Stripe Price ID used in the site.
    return [
        'price_1T4LB60XZVE1puxSTKgblJPz' => [
            'label' => 'Parfum 30 ml',
            'stock' => 4,
        ],
    ];
}

/**
 * @return array{fh:resource, data:array, path:string}
 */
function simone_inventory_open_locked(array $config): array {
    $path = simone_inventory_path($config);
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $fh = @fopen($path, 'c+');
    if ($fh === false) {
        throw new RuntimeException('Unable to open inventory file');
    }

    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        throw new RuntimeException('Unable to lock inventory file');
    }

    $raw = '';
    try {
        $raw = stream_get_contents($fh);
    } catch (Throwable $e) {
        $raw = '';
    }

    $data = [];
    if (is_string($raw) && trim($raw) !== '') {
        $parsed = json_decode($raw, true);
        if (is_array($parsed)) {
            $data = $parsed;
        }
    }

    if (!is_array($data)) $data = [];
    if (!isset($data['items']) || !is_array($data['items'])) $data['items'] = [];
    if (!isset($data['sold']) || !is_array($data['sold'])) $data['sold'] = [];
    if (!isset($data['reservations']) || !is_array($data['reservations'])) $data['reservations'] = [];

    // Ensure defaults exist (non-destructive).
    foreach (simone_inventory_default_items() as $priceId => $row) {
        if (!is_string($priceId) || $priceId === '') continue;
        if (!isset($data['items'][$priceId]) || !is_array($data['items'][$priceId])) {
            $data['items'][$priceId] = [];
        }
        if (!isset($data['items'][$priceId]['label']) && isset($row['label'])) {
            $data['items'][$priceId]['label'] = (string)$row['label'];
        }
        if (!isset($data['items'][$priceId]['stock']) && isset($row['stock'])) {
            $data['items'][$priceId]['stock'] = (int)$row['stock'];
        }
        if (!array_key_exists($priceId, $data['sold'])) {
            $data['sold'][$priceId] = 0;
        }
    }

    // Release expired reservations on open.
    simone_inventory_release_expired($data);

    return ['fh' => $fh, 'data' => $data, 'path' => $path];
}

function simone_inventory_save_and_close($fh, string $path, array $data): void {
    if (!is_resource($fh)) return;

    $data['updated_at'] = gmdate('c');

    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (!is_string($json)) {
        // Keep previous content if encoding fails.
        flock($fh, LOCK_UN);
        fclose($fh);
        return;
    }

    rewind($fh);
    @ftruncate($fh, 0);
    fwrite($fh, $json);
    fflush($fh);

    flock($fh, LOCK_UN);
    fclose($fh);
}

function simone_inventory_release_expired(array &$inv): void {
    $now = time();
    $reservations = $inv['reservations'] ?? null;
    if (!is_array($reservations)) {
        $inv['reservations'] = [];
        return;
    }

    foreach ($reservations as $rid => $row) {
        if (!is_array($row)) {
            unset($inv['reservations'][$rid]);
            continue;
        }
        $expires = $row['expires_at'] ?? null;
        $expiresInt = is_int($expires) ? $expires : (is_numeric($expires) ? (int)$expires : null);
        if (!is_int($expiresInt) || $expiresInt <= 0) {
            // Bad reservation shape; drop it.
            unset($inv['reservations'][$rid]);
            continue;
        }
        if ($expiresInt < $now) {
            unset($inv['reservations'][$rid]);
        }
    }
}

function simone_inventory_reserved_qty(array $inv, string $priceId): int {
    $total = 0;
    $reservations = $inv['reservations'] ?? null;
    if (!is_array($reservations)) return 0;

    foreach ($reservations as $row) {
        if (!is_array($row)) continue;
        $items = $row['items'] ?? null;
        if (!is_array($items)) continue;
        $q = $items[$priceId] ?? 0;
        $qty = is_int($q) ? $q : (is_numeric($q) ? (int)$q : 0);
        if ($qty > 0) $total += $qty;
    }

    return $total;
}

function simone_inventory_available(array $inv, string $priceId): ?int {
    $items = $inv['items'] ?? null;
    if (!is_array($items) || !isset($items[$priceId]) || !is_array($items[$priceId])) return null;

    $stock = $items[$priceId]['stock'] ?? null;
    $stockInt = is_int($stock) ? $stock : (is_numeric($stock) ? (int)$stock : null);
    if (!is_int($stockInt) || $stockInt < 0) return null;

    $sold = $inv['sold'][$priceId] ?? 0;
    $soldInt = is_int($sold) ? $sold : (is_numeric($sold) ? (int)$sold : 0);
    if ($soldInt < 0) $soldInt = 0;

    $reserved = simone_inventory_reserved_qty($inv, $priceId);
    $avail = $stockInt - $soldInt - $reserved;
    return $avail < 0 ? 0 : $avail;
}

/**
 * @param array<string,int> $reserveItems priceId => qty
 */
function simone_inventory_reserve(array &$inv, string $reservationId, array $reserveItems, int $ttlSeconds = 7200): array {
    $rid = trim($reservationId);
    if ($rid === '') {
        throw new InvalidArgumentException('Missing reservation id');
    }

    if (!isset($inv['reservations']) || !is_array($inv['reservations'])) {
        $inv['reservations'] = [];
    }

    // Idempotency: if reservation exists, return it.
    if (isset($inv['reservations'][$rid]) && is_array($inv['reservations'][$rid])) {
        return ['ok' => true, 'reservation_id' => $rid, 'existing' => true];
    }

    $needs = [];
    foreach ($reserveItems as $priceId => $qty) {
        if (!is_string($priceId) || trim($priceId) === '') continue;
        $q = is_int($qty) ? $qty : (is_numeric($qty) ? (int)$qty : 0);
        if ($q < 1) continue;

        $avail = simone_inventory_available($inv, $priceId);
        if ($avail === null) {
            // No stock tracking for that item.
            continue;
        }
        if ($avail < $q) {
            $label = $inv['items'][$priceId]['label'] ?? $priceId;
            return [
                'ok' => false,
                'error' => 'Rupture de stock',
                'price_id' => $priceId,
                'label' => (string)$label,
                'available' => $avail,
                'requested' => $q,
            ];
        }
        $needs[$priceId] = $q;
    }

    if (count($needs) === 0) {
        return ['ok' => true, 'reservation_id' => $rid, 'skipped' => true];
    }

    $inv['reservations'][$rid] = [
        'created_at' => time(),
        'expires_at' => time() + max(60, $ttlSeconds),
        'items' => $needs,
    ];

    return ['ok' => true, 'reservation_id' => $rid];
}

function simone_inventory_cancel_reservation(array &$inv, string $reservationId): void {
    $rid = trim($reservationId);
    if ($rid === '') return;
    if (isset($inv['reservations'][$rid])) {
        unset($inv['reservations'][$rid]);
    }
}

function simone_inventory_finalize_reservation(array &$inv, string $reservationId): array {
    $rid = trim($reservationId);
    if ($rid === '') return ['ok' => false, 'error' => 'Missing reservation id'];

    simone_inventory_release_expired($inv);

    $row = $inv['reservations'][$rid] ?? null;
    if (!is_array($row)) {
        // Possibly already finalized, expired, or created before inventory existed.
        return ['ok' => false, 'error' => 'Reservation not found'];
    }

    $items = $row['items'] ?? null;
    if (!is_array($items)) {
        unset($inv['reservations'][$rid]);
        return ['ok' => true, 'finalized' => true, 'empty' => true];
    }

    if (!isset($inv['sold']) || !is_array($inv['sold'])) {
        $inv['sold'] = [];
    }

    foreach ($items as $priceId => $qty) {
        if (!is_string($priceId) || trim($priceId) === '') continue;
        $q = is_int($qty) ? $qty : (is_numeric($qty) ? (int)$qty : 0);
        if ($q < 1) continue;

        $current = $inv['sold'][$priceId] ?? 0;
        $curInt = is_int($current) ? $current : (is_numeric($current) ? (int)$current : 0);
        if ($curInt < 0) $curInt = 0;
        $inv['sold'][$priceId] = $curInt + $q;
    }

    unset($inv['reservations'][$rid]);

    return ['ok' => true, 'finalized' => true];
}
