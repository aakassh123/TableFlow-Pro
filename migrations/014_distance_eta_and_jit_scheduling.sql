-- Migration 014: Distance-Aware ETA, Dynamic JIT Kitchen Scheduling & Burger Catalog
-- Supports remote customer ordering (e.g. 1km away), transit travel time sync, and smooth multi-order kitchen interleaving

-- 1. Alter Orders Table with Distance and JIT Fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS travel_time_seconds INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS jit_status VARCHAR(50) DEFAULT 'NORMAL';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS jit_fire_at TIMESTAMPTZ;

-- 2. Seed Burgers & Quick Bites Category
INSERT INTO categories (id, outlet_id, name, display_order) VALUES
    ('88888888-8888-8888-8888-888888888807', '33333333-3333-3333-3333-333333333301', 'Burgers & Quick Bites', 7)
ON CONFLICT (outlet_id, name) DO NOTHING;

-- 3. Seed Burgers Menu Items
INSERT INTO menu_items (
    id, outlet_id, category_id, code, name, description, is_veg, is_beverage, base_price_paise, gst_rate_percentage
) VALUES
    ('99999999-9999-9999-9999-999999999920', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888807', 'BG-001', 'Classic Chicken Burger', 'Crispy grilled chicken patty with fresh lettuce, molten cheese and smoked paprika mayo', false, false, 18000, 5.00),
    ('99999999-9999-9999-9999-999999999921', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888807', 'BG-002', 'Crispy Veggie Burger', 'Golden spiced potato & corn patty with pickled gherkins, crunchy coleslaw and herb drizzle', true, false, 14000, 5.00)
ON CONFLICT (outlet_id, code) DO NOTHING;

-- 4. Burger Variants
INSERT INTO menu_item_variants (id, menu_item_id, name, sku, price_paise, is_default) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa20', '99999999-9999-9999-9999-999999999920', 'Single Patty', 'BG-CHK-SINGLE', 18000, true),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa21', '99999999-9999-9999-9999-999999999920', 'Double Patty Supreme', 'BG-CHK-DOUBLE', 24000, false),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22', '99999999-9999-9999-9999-999999999921', 'Single Patty', 'BG-VEG-SINGLE', 14000, true),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa23', '99999999-9999-9999-9999-999999999921', 'Double Cheese Patty', 'BG-VEG-DOUBLE', 19000, false)
ON CONFLICT (sku) DO NOTHING;

-- 5. Station Routing for Burgers (Route to GRILL station)
INSERT INTO station_items (station_id, menu_item_id) VALUES
    ('dddddddd-dddd-dddd-dddd-ddddddddddd5', '99999999-9999-9999-9999-999999999920'), -- Chicken Burger -> Grill
    ('dddddddd-dddd-dddd-dddd-ddddddddddd5', '99999999-9999-9999-9999-999999999921')  -- Veggie Burger -> Grill
ON CONFLICT DO NOTHING;
