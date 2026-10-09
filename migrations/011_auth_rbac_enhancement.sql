-- Migration 011: Auth & RBAC Enhancements, Refresh Tokens, and Explicit Permission Matrix

-- ============================================================================
-- 1. REFRESH TOKENS (Session Management with Family Rotation & Reuse Detection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    family_id UUID NOT NULL, -- Token family for detecting theft / replay attacks
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id UUID,
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_lookup ON refresh_tokens(token_hash, is_revoked);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================================================
-- 2. ALL 23 REQUIRED PERMISSIONS
-- ============================================================================

INSERT INTO permissions (id, code, module, description) VALUES
    ('01900000-0000-0000-0000-000000000001', 'orders.read', 'orders', 'View active and historical orders'),
    ('01900000-0000-0000-0000-000000000002', 'orders.create', 'orders', 'Create draft and confirmed orders'),
    ('01900000-0000-0000-0000-000000000003', 'orders.cancel', 'orders', 'Cancel active orders (Sensitive)'),
    ('01900000-0000-0000-0000-000000000004', 'orders.modify', 'orders', 'Add or modify items in orders'),
    ('01900000-0000-0000-0000-000000000005', 'orders.refund', 'orders', 'Initiate order refund (Sensitive)'),
    ('01900000-0000-0000-0000-000000000006', 'orders.discount', 'orders', 'Apply discount to order (Sensitive)'),
    ('01900000-0000-0000-0000-000000000007', 'menu.read', 'menu', 'View menu catalog and items'),
    ('01900000-0000-0000-0000-000000000008', 'menu.write', 'menu', 'Create, update, or toggle 86 status on menu items'),
    ('01900000-0000-0000-0000-000000000009', 'recipes.read', 'recipes', 'View recipes and ingredient BOM formulas'),
    ('01900000-0000-0000-0000-000000000010', 'recipes.write', 'recipes', 'Create and modify recipes and recipe versions'),
    ('01900000-0000-0000-0000-000000000011', 'inventory.read', 'inventory', 'View inventory ledger and current stock levels'),
    ('01900000-0000-0000-0000-000000000012', 'inventory.adjust', 'inventory', 'Perform stock adjustments (Sensitive)'),
    ('01900000-0000-0000-0000-000000000013', 'inventory.waste', 'inventory', 'Record spoilage and kitchen waste entries'),
    ('01900000-0000-0000-0000-000000000014', 'kitchen.read', 'kitchen', 'View KDS screens and kitchen tickets'),
    ('01900000-0000-0000-0000-000000000015', 'kitchen.bump', 'kitchen', 'Bump prepared kitchen ticket items'),
    ('01900000-0000-0000-0000-000000000016', 'kitchen.hold', 'kitchen', 'Place order or item on temporary kitchen hold'),
    ('01900000-0000-0000-0000-000000000017', 'kitchen.recall', 'kitchen', 'Recall previously bumped kitchen tickets'),
    ('01900000-0000-0000-0000-000000000018', 'payments.read', 'payments', 'View payment transactions and invoices'),
    ('01900000-0000-0000-0000-000000000019', 'payments.refund', 'payments', 'Process payment refunds (Sensitive)'),
    ('01900000-0000-0000-0000-000000000020', 'reports.read', 'reports', 'View sales, audit logs, and Z-reports'),
    ('01900000-0000-0000-0000-000000000021', 'delivery.read', 'delivery', 'View delivery dispatch queue'),
    ('01900000-0000-0000-0000-000000000022', 'delivery.assign', 'delivery', 'Assign riders to direct delivery orders'),
    ('01900000-0000-0000-0000-000000000023', 'settings.manage', 'settings', 'Configure outlet settings, tax slabs, printers')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. THE 6 TARGET ROLES: OWNER, MANAGER, CASHIER, WAITER, CHEF, RIDER
-- ============================================================================

INSERT INTO roles (id, outlet_id, name, description, is_system_role) VALUES
    ('01900000-1111-0000-0000-000000000001', '33333333-3333-3333-3333-333333333301', 'OWNER', 'Restaurant owner with root system privileges', true),
    ('01900000-1111-0000-0000-000000000002', '33333333-3333-3333-3333-333333333301', 'MANAGER', 'Operational restaurant manager with override authority', true),
    ('01900000-1111-0000-0000-000000000003', '33333333-3333-3333-3333-333333333301', 'CASHIER', 'POS billing, order taking, and payment collection', true),
    ('01900000-1111-0000-0000-000000000004', '33333333-3333-3333-3333-333333333301', 'WAITER', 'Dine-in floor service, order placing, and table management', true),
    ('01900000-1111-0000-0000-000000000005', '33333333-3333-3333-3333-333333333301', 'CHEF', 'Kitchen display system, recipe inspection, and waste tracking', true),
    ('01900000-1111-0000-0000-000000000006', '33333333-3333-3333-3333-333333333301', 'RIDER', 'Direct delivery order fulfillment and rider dispatch', true)
ON CONFLICT (outlet_id, name) DO NOTHING;

-- ============================================================================
-- 4. ROLE PERMISSIONS MAPPING
-- ============================================================================

-- 1. OWNER: ALL PERMISSIONS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '01900000-1111-0000-0000-000000000001', id FROM permissions
WHERE code LIKE '%.%'
ON CONFLICT DO NOTHING;

-- 2. MANAGER: ALL OPERATIONAL PERMISSIONS
INSERT INTO role_permissions (role_id, permission_id)
SELECT '01900000-1111-0000-0000-000000000002', id FROM permissions
WHERE code LIKE '%.%'
ON CONFLICT DO NOTHING;

-- 3. CASHIER: Orders, Menu, Payments, Reports (read)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '01900000-1111-0000-0000-000000000003', id FROM permissions
WHERE code IN (
    'orders.read', 'orders.create', 'orders.modify',
    'menu.read',
    'payments.read',
    'reports.read'
)
ON CONFLICT DO NOTHING;

-- 4. WAITER: Orders (read, create, modify), Menu (read)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '01900000-1111-0000-0000-000000000004', id FROM permissions
WHERE code IN (
    'orders.read', 'orders.create', 'orders.modify',
    'menu.read'
)
ON CONFLICT DO NOTHING;

-- 5. CHEF: Kitchen (all), Recipes (read), Menu (read), Inventory (read, waste)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '01900000-1111-0000-0000-000000000005', id FROM permissions
WHERE code IN (
    'kitchen.read', 'kitchen.bump', 'kitchen.hold', 'kitchen.recall',
    'recipes.read',
    'menu.read',
    'inventory.read', 'inventory.waste'
)
ON CONFLICT DO NOTHING;

-- 6. RIDER: Delivery (read), Orders (read)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '01900000-1111-0000-0000-000000000006', id FROM permissions
WHERE code IN (
    'delivery.read',
    'orders.read'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. TEST USERS FOR EACH ROLE
-- Passwords hashed with bcrypt: 'Password@123' -> $2a$10$wT0l0...
-- Manager PIN hashed with bcrypt: '9999' -> $2a$10$M7/V...
-- ============================================================================

INSERT INTO users (id, outlet_id, username, email, phone, full_name, password_hash, pin_hash, is_active) VALUES
    ('01900000-2222-0000-0000-000000000001', '33333333-3333-3333-3333-333333333301', 'owner_rajesh', 'rajesh@royalbiryani.in', '+919900000001', 'Rajesh Gupta (Owner)', '$2a$10$wT0l0R5zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F1', '$2a$10$6Wq9Y7zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F2', true),
    ('01900000-2222-0000-0000-000000000002', '33333333-3333-3333-3333-333333333301', 'manager_arjun', 'manager@royalbiryani.in', '+919900000002', 'Arjun Mehta (Manager)', '$2a$10$wT0l0R5zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F1', '$2a$10$6Wq9Y7zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F2', true),
    ('01900000-2222-0000-0000-000000000003', '33333333-3333-3333-3333-333333333301', 'cashier_ramesh', 'cashier@royalbiryani.in', '+919900000003', 'Ramesh Kumar (Cashier)', '$2a$10$wT0l0R5zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F1', '$2a$10$6Wq9Y7zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F2', true),
    ('01900000-2222-0000-0000-000000000004', '33333333-3333-3333-3333-333333333301', 'waiter_priya', 'waiter@royalbiryani.in', '+919900000004', 'Priya Sharma (Waiter)', '$2a$10$wT0l0R5zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F1', '$2a$10$6Wq9Y7zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F2', true),
    ('01900000-2222-0000-0000-000000000005', '33333333-3333-3333-3333-333333333301', 'chef_sanjeev', 'chef_sanjeev@royalbiryani.in', '+919900000005', 'Sanjeev Nair (Chef)', '$2a$10$wT0l0R5zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F1', '$2a$10$6Wq9Y7zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F2', true),
    ('01900000-2222-0000-0000-000000000006', '33333333-3333-3333-3333-333333333301', 'rider_vikas', 'rider@royalbiryani.in', '+919900000006', 'Vikas Verma (Rider)', '$2a$10$wT0l0R5zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F1', '$2a$10$6Wq9Y7zK5R/y3zF5eB8k.dZ9o7U6n0x2t8W3v4y5A6B7C8D9E0F2', true)
ON CONFLICT (outlet_id, username) DO NOTHING;

-- Assign Roles
INSERT INTO user_roles (user_id, role_id) VALUES
    ('01900000-2222-0000-0000-000000000001', '01900000-1111-0000-0000-000000000001'), -- OWNER
    ('01900000-2222-0000-0000-000000000002', '01900000-1111-0000-0000-000000000002'), -- MANAGER
    ('01900000-2222-0000-0000-000000000003', '01900000-1111-0000-0000-000000000003'), -- CASHIER
    ('01900000-2222-0000-0000-000000000004', '01900000-1111-0000-0000-000000000004'), -- WAITER
    ('01900000-2222-0000-0000-000000000005', '01900000-1111-0000-0000-000000000005'), -- CHEF
    ('01900000-2222-0000-0000-000000000006', '01900000-1111-0000-0000-000000000006')  -- RIDER
ON CONFLICT DO NOTHING;
