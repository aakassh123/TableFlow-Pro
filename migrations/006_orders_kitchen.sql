-- Migration 006: Orders, Line Items, Kitchen Stations, and KOT Tickets

-- ============================================================================
-- 1. ORDERS
-- Invariants:
-- 7. Order status transitions validated by state machine trigger
-- 8. Idempotency keys prevent duplicate orders
-- 10. Monetary values never use floating point (stored in integer paise)
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    order_number VARCHAR(50) NOT NULL, -- Human-readable sequence, e.g. ORD-20261007-001
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL, -- Nullable for takeaway
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL DEFAULT 'DINE_IN' CHECK (channel IN ('WALK_IN', 'DINE_IN', 'QR', 'WEBSITE', 'WHATSAPP', 'DELIVERY')),
    order_type order_type_enum NOT NULL DEFAULT 'DINE_IN',
    status order_status_enum NOT NULL DEFAULT 'PLACED',
    
    -- Monetary amounts in integer paise (1 INR = 100 paise)
    subtotal_paise BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    tax_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    total_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_paise >= 0),
    round_off_paise INT NOT NULL DEFAULT 0, -- Round-off in paise (+/- 50 paise max)
    
    guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count > 0),
    notes TEXT,
    idempotency_key VARCHAR(255), -- Enforces Invariant 8
    accepted_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    promise_range_min INT,
    promise_range_max INT,
    promise_display VARCHAR(50),
    rush_level NUMERIC(3, 2) NOT NULL DEFAULT 1.0,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_orders_outlet_number UNIQUE (outlet_id, order_number)
);

-- Invariant 8: Unique index on idempotency key per outlet
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_outlet_idempotency 
    ON orders(outlet_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_outlet_status ON orders(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_table_active ON orders(table_id) WHERE status NOT IN ('SETTLED', 'CLOSED', 'CANCELLED');

-- Add foreign key constraint to stock_reservations
ALTER TABLE stock_reservations 
ADD CONSTRAINT fk_stock_reservations_order 
FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;


-- ============================================================================
-- 2. ORDER ITEMS & MODIFIERS
-- Invariant 6: Recipe version snapshot ID is stored permanently on each order item.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES menu_item_variants(id) ON DELETE RESTRICT,
    recipe_version_id UUID REFERENCES recipe_versions(id) ON DELETE RESTRICT, -- Frozen snapshot of BOM
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
    total_price_paise BIGINT NOT NULL CHECK (total_price_paise >= 0),
    status order_item_status_enum NOT NULL DEFAULT 'PENDING',
    void_reason TEXT,
    voided_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_option_id UUID NOT NULL REFERENCES modifier_options(id) ON DELETE RESTRICT,
    price_delta_paise BIGINT NOT NULL DEFAULT 0 CHECK (price_delta_paise >= 0),
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);

-- ============================================================================
-- 3. ORDER STATUS HISTORY & AUDIT EVENTS
-- Invariant 9: (order_id, status) prevents duplicate status events
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_status_history (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status order_status_enum NOT NULL,
    notes TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Invariant 9: Prevent duplicate status entry for same order
    CONSTRAINT uq_order_status_history UNIQUE (order_id, status)
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);

CREATE TABLE IF NOT EXISTS order_events (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- e.g. ITEM_ADDED, ITEM_VOIDED, DISCOUNT_APPLIED, KOT_PRINTED
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    triggered_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_time ON order_events(order_id, created_at DESC);

-- ============================================================================
-- 4. KITCHEN STATIONS & STATION ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS kitchen_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL, -- 'TANDOOR', 'CURRY', 'CHINESE', 'BAR', 'EXPO'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    capacity INT NOT NULL DEFAULT 4, -- Parallel concurrent items / burners / oven capacity
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kitchen_stations_outlet_code UNIQUE (outlet_id, code)
);

CREATE TABLE IF NOT EXISTS station_items (
    station_id UUID NOT NULL REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (station_id, menu_item_id)
);

-- ============================================================================
-- 5. KITCHEN TICKETS (KOT) & TICKET ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS kitchen_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES kitchen_stations(id) ON DELETE RESTRICT,
    kot_number VARCHAR(50) NOT NULL, -- e.g. KOT-0042
    status kitchen_ticket_status_enum NOT NULL DEFAULT 'QUEUED',
    printed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    bumped_at TIMESTAMPTZ,
    station_load_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_station_status ON kitchen_tickets(station_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_order ON kitchen_tickets(order_id);

CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kitchen_ticket_id UUID NOT NULL REFERENCES kitchen_tickets(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    notes TEXT,
    status kitchen_ticket_status_enum NOT NULL DEFAULT 'QUEUED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kitchen_ticket_items_ticket ON kitchen_ticket_items(kitchen_ticket_id);
