-- Migration 010: Production-Grade Seed Data for Single Restaurant Outlet in India
-- Restaurant: "The Royal Dum Biryani & Kebabs"
-- Location: Indiranagar, Bengaluru, Karnataka

-- ============================================================================
-- 1. BASE UNITS OF MEASURE (Invariant 11)
-- ============================================================================

INSERT INTO units (id, code, name, category, is_base_unit, conversion_to_base) VALUES
    ('11111111-1111-1111-1111-111111111101', 'GRAM', 'Gram', 'MASS', true, 1.000000),
    ('11111111-1111-1111-1111-111111111102', 'MILLILITRE', 'Millilitre', 'VOLUME', true, 1.000000),
    ('11111111-1111-1111-1111-111111111103', 'PIECE', 'Piece', 'COUNT', true, 1.000000),
    ('11111111-1111-1111-1111-111111111104', 'KILOGRAM', 'Kilogram', 'MASS', false, 1000.000000),
    ('11111111-1111-1111-1111-111111111105', 'LITRE', 'Litre', 'VOLUME', false, 1000.000000)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. RESTAURANT & OUTLET
-- ============================================================================

INSERT INTO restaurants (id, name, legal_entity_name, gstin, fssai_license, pan_number) VALUES
    ('22222222-2222-2222-2222-222222222201', 'DUM HOUSE', 'Royal Gourmet Hospitality LLP', '29AABCR1234F1Z5', '11223334000123', 'AABCR1234F')
ON CONFLICT (id) DO NOTHING;

INSERT INTO outlets (id, restaurant_id, code, name, address, city, state, postal_code, phone, email, currency, timezone) VALUES
    ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'BLR-IND-01', 'Indiranagar Flagship Outlet', 'Plot 402, 100ft Road, HAL 2nd Stage, Indiranagar', 'Bengaluru', 'Karnataka', '560038', '+918049876543', 'indiranagar@royalbiryani.in', 'INR', 'Asia/Kolkata')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. ROLES & PERMISSIONS
-- ============================================================================

INSERT INTO permissions (id, code, module, description) VALUES
    ('44444444-4444-4444-4444-444444444401', 'order:create', 'orders', 'Create draft and confirmed orders'),
    ('44444444-4444-4444-4444-444444444402', 'order:item_void', 'orders', 'Void items from active orders'),
    ('44444444-4444-4444-4444-444444444403', 'order:discount_apply', 'orders', 'Apply discount to order'),
    ('44444444-4444-4444-4444-444444444404', 'order:settle', 'payments', 'Accept payment and close bill'),
    ('44444444-4444-4444-4444-444444444405', 'kitchen:item_bump', 'kitchen', 'Bump prepared items on KDS'),
    ('44444444-4444-4444-4444-444444444406', 'inventory:adjust', 'inventory', 'Perform stock adjustments'),
    ('44444444-4444-4444-4444-444444444407', 'reports:view', 'reports', 'View daily sales and Z-reports')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (id, outlet_id, name, description, is_system_role) VALUES
    ('55555555-5555-5555-5555-555555555501', '33333333-3333-3333-3333-333333333301', 'Store Manager', 'Full outlet operational control', true),
    ('55555555-5555-5555-5555-555555555502', '33333333-3333-3333-3333-333333333301', 'Head Chef', 'KDS, BOM and kitchen inventory access', true),
    ('55555555-5555-5555-5555-555555555503', '33333333-3333-3333-3333-333333333301', 'Cashier', 'POS billing and payment settlement', true),
    ('55555555-5555-5555-5555-555555555504', '33333333-3333-3333-3333-333333333301', 'Captain / Waiter', 'Table ordering and guest service', true)
ON CONFLICT (outlet_id, name) DO NOTHING;

-- Grant all permissions to Store Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT '55555555-5555-5555-5555-555555555501', id FROM permissions
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. STAFF USERS
-- ============================================================================

INSERT INTO users (id, outlet_id, username, email, phone, full_name, password_hash, pin_hash, is_active) VALUES
    ('66666666-6666-6666-6666-666666666601', '33333333-3333-3333-3333-333333333301', 'arjun_manager', 'arjun@royalbiryani.in', '+919876500001', 'Arjun Mehta', '$2a$12$eA8b/X1...', '$2a$12$pin1234...', true),
    ('66666666-6666-6666-6666-666666666602', '33333333-3333-3333-3333-333333333301', 'sanjeev_chef', 'chef@royalbiryani.in', '+919876500002', 'Chef Sanjeev Nair', '$2a$12$eA8b/X2...', '$2a$12$pin5678...', true),
    ('66666666-6666-6666-6666-666666666603', '33333333-3333-3333-3333-333333333301', 'ramesh_cashier', 'billing@royalbiryani.in', '+919876500003', 'Ramesh Kumar', '$2a$12$eA8b/X3...', '$2a$12$pin9999...', true),
    ('66666666-6666-6666-6666-666666666604', '33333333-3333-3333-3333-333333333301', 'priya_captain', 'service@royalbiryani.in', '+919876500004', 'Priya Sharma', '$2a$12$eA8b/X4...', '$2a$12$pin1111...', true)
ON CONFLICT (outlet_id, username) DO NOTHING;

INSERT INTO user_roles (user_id, role_id) VALUES
    ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555501'),
    ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555502'),
    ('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555503'),
    ('66666666-6666-6666-6666-666666666604', '55555555-5555-5555-5555-555555555504')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. DINING TABLES
-- ============================================================================

INSERT INTO tables (id, outlet_id, table_number, section, capacity, status) VALUES
    ('77777777-7777-7777-7777-777777777701', '33333333-3333-3333-3333-333333333301', 'T-01', 'INDOOR_AC', 2, 'AVAILABLE'),
    ('77777777-7777-7777-7777-777777777702', '33333333-3333-3333-3333-333333333301', 'T-02', 'INDOOR_AC', 4, 'AVAILABLE'),
    ('77777777-7777-7777-7777-777777777703', '33333333-3333-3333-3333-333333333301', 'T-03', 'INDOOR_AC', 4, 'AVAILABLE'),
    ('77777777-7777-7777-7777-777777777704', '33333333-3333-3333-3333-333333333301', 'T-04', 'INDOOR_AC', 6, 'AVAILABLE'),
    ('77777777-7777-7777-7777-777777777705', '33333333-3333-3333-3333-333333333301', 'G-01', 'GARDEN_TERRACE', 4, 'AVAILABLE'),
    ('77777777-7777-7777-7777-777777777706', '33333333-3333-3333-3333-333333333301', 'G-02', 'GARDEN_TERRACE', 8, 'AVAILABLE'),
    ('77777777-7777-7777-7777-777777777707', '33333333-3333-3333-3333-333333333301', 'T-07', 'INDOOR_AC', 4, 'AVAILABLE')
ON CONFLICT (outlet_id, table_number) DO NOTHING;

-- ============================================================================
-- 6. MENU CATEGORIES & ITEMS
-- Prices stored strictly in integer paise (Invariant 10)
-- 50000 paise = 500.00 INR
-- ============================================================================

INSERT INTO categories (id, outlet_id, name, display_order) VALUES
    ('88888888-8888-8888-8888-888888888801', '33333333-3333-3333-3333-333333333301', 'Starters & Tandoor', 1),
    ('88888888-8888-8888-8888-888888888802', '33333333-3333-3333-3333-333333333301', 'Dum Biryanis', 2),
    ('88888888-8888-8888-8888-888888888803', '33333333-3333-3333-3333-333333333301', 'Main Course Curries', 3),
    ('88888888-8888-8888-8888-888888888804', '33333333-3333-3333-3333-333333333301', 'Tandoori Breads', 4),
    ('88888888-8888-8888-8888-888888888805', '33333333-3333-3333-3333-333333333301', 'Beverages & Mocktails', 5),
    ('88888888-8888-8888-8888-888888888806', '33333333-3333-3333-3333-333333333301', 'Chinese', 6)
ON CONFLICT (outlet_id, name) DO NOTHING;

INSERT INTO menu_items (id, outlet_id, category_id, code, name, description, is_veg, is_beverage, base_price_paise, gst_rate_percentage) VALUES
    ('99999999-9999-9999-9999-999999999901', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888801', 'ST-001', 'Paneer Tikka Angara', 'Charcoal smoked cottage cheese with bell peppers', true, false, 36000, 5.00),
    ('99999999-9999-9999-9999-999999999902', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888802', 'BR-001', 'Murgh Dum Biryani', 'Fragrant long-grain basmati with slow-cooked chicken', false, false, 42000, 5.00),
    ('99999999-9999-9999-9999-999999999903', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888803', 'CR-001', 'Butter Chicken', 'Tandoori chicken pulled and simmered in velvety makhani gravy', false, false, 32000, 5.00),
    ('99999999-9999-9999-9999-999999999904', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888804', 'RD-001', 'Garlic Naan', 'Clay oven leavened bread brushed with garlic & butter', true, false, 6000, 5.00),
    ('99999999-9999-9999-9999-999999999905', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888805', 'BV-001', 'Fresh Lime Soda', 'Carbonated beverage with freshly squeezed key lime', true, true, 12000, 5.00),
    ('99999999-9999-9999-9999-999999999906', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888806', 'CH-001', 'Chilli Paneer', 'Crispy cottage cheese cubes tossed in spicy soya-chilli glaze', true, false, 22000, 5.00),
    ('99999999-9999-9999-9999-999999999907', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888806', 'CH-002', 'Hakka Noodles', 'Wok tossed noodles with shredded crunchy vegetables', true, false, 18000, 5.00),
    ('99999999-9999-9999-9999-999999999908', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888803', 'CR-002', 'Dal Makhani', 'Slow simmered black lentils finished with fresh churned white butter and cream', true, false, 24000, 5.00),
    ('99999999-9999-9999-9999-999999999909', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888801', 'GR-001', 'Chicken Seekh Kebab', 'Minced chicken seasoned with fragrant herbs, skewered and charcoal grilled', false, false, 34000, 5.00),
    ('99999999-9999-9999-9999-999999999910', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888806', 'CH-003', 'Schezwan Fried Rice', 'Aromatic wok tossed rice with fiery Schezwan peppers and vegetables', true, false, 20000, 5.00)
ON CONFLICT (outlet_id, code) DO NOTHING;

-- Variants for Biryani
INSERT INTO menu_item_variants (id, menu_item_id, name, sku, price_paise, is_default) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '99999999-9999-9999-9999-999999999902', 'Half Portion', 'BR-001-HALF', 28000, false),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '99999999-9999-9999-9999-999999999902', 'Full Portion', 'BR-001-FULL', 42000, true),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '99999999-9999-9999-9999-999999999902', 'Boneless Special', 'BR-001-BONELESS', 49000, false)
ON CONFLICT (sku) DO NOTHING;

-- Modifiers for Fresh Lime Soda
INSERT INTO modifiers (id, outlet_id, name, is_mandatory, min_selections, max_selections) VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '33333333-3333-3333-3333-333333333301', 'Flavour Choice', true, 1, 1)
ON CONFLICT (outlet_id, name) DO NOTHING;

INSERT INTO modifier_options (id, modifier_id, name, price_delta_paise, is_default) VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccc01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Sweet', 0, false),
    ('cccccccc-cccc-cccc-cccc-cccccccccc02', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Salted', 0, false),
    ('cccccccc-cccc-cccc-cccc-cccccccccc03', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Sweet & Salt (Mixed)', 0, true)
ON CONFLICT (modifier_id, name) DO NOTHING;

-- ============================================================================
-- 7. KITCHEN STATIONS
-- ============================================================================

INSERT INTO kitchen_stations (id, outlet_id, code, name, description) VALUES
    ('dddddddd-dddd-dddd-dddd-ddddddddddd1', '33333333-3333-3333-3333-333333333301', 'TANDOOR', 'Tandoor & Charcoal Oven', 'Breads, Kebabs, Tikkas'),
    ('dddddddd-dddd-dddd-dddd-ddddddddddd2', '33333333-3333-3333-3333-333333333301', 'CURRY', 'Curry & Biryani Pot Line', 'Dum Biryanis, Gravies, Rice'),
    ('dddddddd-dddd-dddd-dddd-ddddddddddd3', '33333333-3333-3333-3333-333333333301', 'BEVERAGE', 'Pantry & Beverage Bar', 'Cold drinks, juices, mocktails'),
    ('dddddddd-dddd-dddd-dddd-ddddddddddd4', '33333333-3333-3333-3333-333333333301', 'EXPO', 'Master Pass & Expediter', 'Final aggregation & QA before dispatch'),
    ('dddddddd-dddd-dddd-dddd-ddddddddddd5', '33333333-3333-3333-3333-333333333301', 'GRILL', 'Live Charcoal Grill', 'Seekh kebabs, grilled skewers, barbecue'),
    ('dddddddd-dddd-dddd-dddd-ddddddddddd6', '33333333-3333-3333-3333-333333333301', 'WOK', 'Asian & Chinese Wok Station', 'Hakka noodles, fried rice, wok toss dishes'),
    ('dddddddd-dddd-dddd-dddd-ddddddddddd7', '33333333-3333-3333-3333-333333333301', 'PACKING', 'Packing & Dispatch Station', 'Takeaway bagging, delivery order boxing & QA')
ON CONFLICT (outlet_id, code) DO NOTHING;

INSERT INTO station_items (station_id, menu_item_id) VALUES
    ('dddddddd-dddd-dddd-dddd-ddddddddddd1', '99999999-9999-9999-9999-999999999901'), -- Paneer Tikka -> Tandoor
    ('dddddddd-dddd-dddd-dddd-ddddddddddd1', '99999999-9999-9999-9999-999999999904'), -- Naan -> Tandoor
    ('dddddddd-dddd-dddd-dddd-ddddddddddd2', '99999999-9999-9999-9999-999999999902'), -- Biryani -> Curry
    ('dddddddd-dddd-dddd-dddd-ddddddddddd2', '99999999-9999-9999-9999-999999999903'), -- Butter Chicken -> Curry
    ('dddddddd-dddd-dddd-dddd-ddddddddddd2', '99999999-9999-9999-9999-999999999908'), -- Dal Makhani -> Curry
    ('dddddddd-dddd-dddd-dddd-ddddddddddd3', '99999999-9999-9999-9999-999999999905'), -- Fresh Lime -> Beverage
    ('dddddddd-dddd-dddd-dddd-ddddddddddd5', '99999999-9999-9999-9999-999999999909'), -- Chicken Seekh -> Grill
    ('dddddddd-dddd-dddd-dddd-ddddddddddd6', '99999999-9999-9999-9999-999999999906'), -- Chilli Paneer -> Wok
    ('dddddddd-dddd-dddd-dddd-ddddddddddd6', '99999999-9999-9999-9999-999999999907'), -- Hakka Noodles -> Wok
    ('dddddddd-dddd-dddd-dddd-ddddddddddd6', '99999999-9999-9999-9999-999999999910')  -- Schezwan Fried Rice -> Wok
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. SUPPLIERS & RAW INGREDIENTS
-- Base units: MASS in GRAM, VOLUME in MILLILITRE, COUNT in PIECE
-- ============================================================================

INSERT INTO suppliers (id, outlet_id, name, contact_person, phone, email, gstin) VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '33333333-3333-3333-3333-333333333301', 'Metro Cash & Carry India', 'Vikram Sen', '+919845012345', 'orders@metro.co.in', '29AABCM1122D1Z1'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', '33333333-3333-3333-3333-333333333301', 'Nandini Dairy (KMF)', 'Suresh Gowda', '+919845067890', 'nandini@kmf.coop', '29AAABK0011C1ZO')
ON CONFLICT (outlet_id, name) DO NOTHING;

INSERT INTO ingredients (id, outlet_id, code, name, base_unit_id, cost_per_base_unit_paise, reorder_level_base_units, default_supplier_id) VALUES
    ('ffffffff-ffff-ffff-ffff-ffffffffff01', '33333333-3333-3333-3333-333333333301', 'ING-RICE', 'Royal Daawat Basmati Rice', '11111111-1111-1111-1111-111111111101', 12, 50000.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'), -- 12 paise/gram = 120 INR/kg
    ('ffffffff-ffff-ffff-ffff-ffffffffff02', '33333333-3333-3333-3333-333333333301', 'ING-CHICKEN', 'Fresh Broiler Chicken (Curry Cut)', '11111111-1111-1111-1111-111111111101', 22, 30000.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'), -- 22 paise/gram = 220 INR/kg
    ('ffffffff-ffff-ffff-ffff-ffffffffff03', '33333333-3333-3333-3333-333333333301', 'ING-PANEER', 'Nandini Fresh Malai Paneer', '11111111-1111-1111-1111-111111111101', 35, 10000.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'), -- 35 paise/gram = 350 INR/kg
    ('ffffffff-ffff-ffff-ffff-ffffffffff04', '33333333-3333-3333-3333-333333333301', 'ING-GHEE', 'Pure Desi Cow Ghee', '11111111-1111-1111-1111-111111111102', 65, 5000.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'),  -- 65 paise/ml = 650 INR/L
    ('ffffffff-ffff-ffff-ffff-ffffffffff05', '33333333-3333-3333-3333-333333333301', 'ING-BUTTER', 'Amul Butter Salted', '11111111-1111-1111-1111-111111111101', 52, 1500.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'),   -- 52 paise/gram = 520 INR/kg
    ('ffffffff-ffff-ffff-ffff-ffffffffff06', '33333333-3333-3333-3333-333333333301', 'ING-CREAM', 'Amul Fresh Dairy Cream', '11111111-1111-1111-1111-111111111102', 25, 5000.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2'),   -- 25 paise/ml = 250 INR/L
    ('ffffffff-ffff-ffff-ffff-ffffffffff07', '33333333-3333-3333-3333-333333333301', 'ING-MAIDA', 'Refined Wheat Flour (Maida)', '11111111-1111-1111-1111-111111111101', 4, 5000.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'), -- 4 paise/gram = 40 INR/kg
    ('ffffffff-ffff-ffff-ffff-ffffffffff08', '33333333-3333-3333-3333-333333333301', 'ING-OIL', 'Refined Sunflower Cooking Oil', '11111111-1111-1111-1111-111111111102', 15, 4000.0000, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1')  -- 15 paise/ml = 150 INR/L
ON CONFLICT (outlet_id, code) DO NOTHING;

-- ============================================================================
-- 9. RECIPES & LOCKED ACTIVE VERSIONS (BOM)
-- Invariant 6: Recipe version is locked in ACTIVE status
-- ============================================================================

-- Recipe for Murgh Dum Biryani (Full Portion)
INSERT INTO recipes (id, outlet_id, menu_item_id, variant_id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333301', '99999999-9999-9999-9999-999999999902', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Murgh Dum Biryani Full Recipe', 'Standard single portion BOM')
ON CONFLICT (menu_item_id, variant_id) DO NOTHING;

INSERT INTO recipe_versions (id, recipe_id, version_number, status, yield_quantity, notes, activated_at) VALUES
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 1, 'ACTIVE', 1.0000, 'Production standard formula approved by Chef Sanjeev', CURRENT_TIMESTAMP)
ON CONFLICT (recipe_id, version_number) DO NOTHING;

-- BOM Items: 350g Rice, 450g Chicken, 40ml Ghee per full biryani portion
INSERT INTO recipe_items (id, recipe_version_id, ingredient_id, quantity_base_units, wastage_percentage) VALUES
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'ffffffff-ffff-ffff-ffff-ffffffffff01', 350.0000, 3.00), -- 350g Basmati Rice
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'ffffffff-ffff-ffff-ffff-ffffffffff02', 450.0000, 5.00), -- 450g Chicken
    ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'ffffffff-ffff-ffff-ffff-ffffffffff04', 40.0000, 1.00)   -- 40ml Pure Ghee
ON CONFLICT (recipe_version_id, ingredient_id) DO NOTHING;

-- ============================================================================
-- 10. STOCK ITEMS, BATCHES & OPENING LEDGER
-- Enforces Invariants 1, 2, 10, 11
-- ============================================================================

INSERT INTO stock_items (id, outlet_id, ingredient_id, current_balance_base_units, average_unit_cost_paise) VALUES
    ('10101010-1010-1010-1010-101010101001', '33333333-3333-3333-3333-333333333301', 'ffffffff-ffff-ffff-ffff-ffffffffff01', 0.0000, 12), -- Basmati Rice
    ('10101010-1010-1010-1010-101010101002', '33333333-3333-3333-3333-333333333301', 'ffffffff-ffff-ffff-ffff-ffffffffff02', 0.0000, 22), -- Chicken
    ('10101010-1010-1010-1010-101010101003', '33333333-3333-3333-3333-333333333301', 'ffffffff-ffff-ffff-ffff-ffffffffff03', 900.0000, 35), -- Paneer (900g -> Critical)
    ('10101010-1010-1010-1010-101010101004', '33333333-3333-3333-3333-333333333301', 'ffffffff-ffff-ffff-ffff-ffffffffff04', 5000.0000, 65), -- Ghee
    ('10101010-1010-1010-1010-101010101005', '33333333-3333-3333-3333-333333333301', 'ffffffff-ffff-ffff-ffff-ffffffffff05', 600.0000, 52), -- Butter (600g -> Critical)
    ('10101010-1010-1010-1010-101010101007', '33333333-3333-3333-3333-333333333301', 'ffffffff-ffff-ffff-ffff-ffffffffff07', 4300.0000, 4), -- Maida (4300g = 4.3kg -> Warning)
    ('10101010-1010-1010-1010-101010101008', '33333333-3333-3333-3333-333333333301', 'ffffffff-ffff-ffff-ffff-ffffffffff08', 6000.0000, 15) -- Oil (6000ml = 6L -> Healthy)
ON CONFLICT (outlet_id, ingredient_id) DO NOTHING;

-- Initial Batches
INSERT INTO stock_batches (id, stock_item_id, batch_number, initial_quantity_base_units, current_quantity_base_units, unit_cost_paise, expiry_date) VALUES
    ('20202020-2020-2020-2020-202020202001', '10101010-1010-1010-1010-101010101001', 'BATCH-RICE-OCT01', 100000.0000, 0.0000, 12, '2027-10-01'), -- 100 kg
    ('20202020-2020-2020-2020-202020202002', '10101010-1010-1010-1010-101010101002', 'BATCH-CHK-OCT07', 50000.0000, 0.0000, 22, '2026-10-10')     -- 50 kg
ON CONFLICT (stock_item_id, batch_number) DO NOTHING;

-- Record Opening Balances in Append-Only Stock Ledger
-- Trigger fn_process_stock_ledger_entry will update current_balance_base_units and batch current_quantity automatically!
INSERT INTO stock_ledger (
    outlet_id, stock_item_id, batch_id, entry_type, quantity_delta_base_units,
    unit_cost_paise, running_balance_base_units, reference_type, reference_id,
    reason, created_by
) VALUES
    (
        '33333333-3333-3333-3333-333333333301', '10101010-1010-1010-1010-101010101001',
        '20202020-2020-2020-2020-202020202001', 'OPENING', 100000.0000, 12,
        0, 'OPENING_STOCK', '20202020-2020-2020-2020-202020202001',
        'Opening inventory intake on outlet commissioning', '66666666-6666-6666-6666-666666666601'
    ),
    (
        '33333333-3333-3333-3333-333333333301', '10101010-1010-1010-1010-101010101002',
        '20202020-2020-2020-2020-202020202002', 'OPENING', 50000.0000, 22,
        0, 'OPENING_STOCK', '20202020-2020-2020-2020-202020202002',
        'Fresh morning meat intake', '66666666-6666-6666-6666-666666666601'
    )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 11. PURCHASE ORDERS (Awaiting Approval)
-- ============================================================================
INSERT INTO purchase_orders (id, outlet_id, po_number, supplier_id, status, total_amount_paise, notes) VALUES
    ('40404040-4040-4040-4040-404040404001', '33333333-3333-3333-3333-333333333301', 'PO-20261007-001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'DRAFT', 1455000, 'Urgent dairy replenishment for Paneer (25kg) and Butter (15kg)'),
    ('40404040-4040-4040-4040-404040404002', '33333333-3333-3333-3333-333333333301', 'PO-20261007-002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'DRAFT', 1820000, 'Dry staples reorder for Maida (50kg) and Basmati Rice (100kg)')
ON CONFLICT (outlet_id, po_number) DO NOTHING;
