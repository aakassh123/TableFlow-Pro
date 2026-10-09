-- Migration 005: Stock Inventory, Batches, Reservations, and Immutable Stock Ledger

-- ============================================================================
-- 1. STOCK ITEMS (Per outlet ingredient stock master)
-- Invariant 1: Stock cannot become negative
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    current_balance_base_units NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (current_balance_base_units >= 0),
    reserved_quantity_base_units NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (reserved_quantity_base_units >= 0),
    average_unit_cost_paise BIGINT NOT NULL DEFAULT 0 CHECK (average_unit_cost_paise >= 0),
    last_counted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stock_items_outlet_ingredient UNIQUE (outlet_id, ingredient_id),
    CONSTRAINT chk_stock_available_non_negative CHECK (current_balance_base_units >= reserved_quantity_base_units)
);

CREATE INDEX IF NOT EXISTS idx_stock_items_outlet ON stock_items(outlet_id);

-- ============================================================================
-- 2. STOCK BATCHES (FIFO / Lot tracking with expiry dates)
-- Invariant 1: Batch stock cannot become negative
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    initial_quantity_base_units NUMERIC(14, 4) NOT NULL CHECK (initial_quantity_base_units > 0),
    current_quantity_base_units NUMERIC(14, 4) NOT NULL CHECK (current_quantity_base_units >= 0),
    unit_cost_paise BIGINT NOT NULL CHECK (unit_cost_paise >= 0),
    expiry_date DATE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stock_batches_item_number UNIQUE (stock_item_id, batch_number),
    CONSTRAINT chk_batch_current_lte_initial CHECK (current_quantity_base_units <= initial_quantity_base_units)
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_item_qty ON stock_batches(stock_item_id, current_quantity_base_units);

-- ============================================================================
-- 3. STOCK RESERVATIONS
-- Used when an order is placed to hold stock prior to cooking confirmation.
-- Invariants 3 & 4 require consume & release to reference a reservation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    order_id UUID, -- References orders(id) once created in migration 006
    order_item_id UUID, -- References order_items(id)
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
    quantity_reserved_base_units NUMERIC(14, 4) NOT NULL CHECK (quantity_reserved_base_units > 0),
    status reservation_status_enum NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order ON stock_reservations(order_id);

-- ============================================================================
-- 4. STOCK LEDGER (IMMUTABLE - APPEND ONLY)
-- Invariants:
-- 1. Balance must be non-negative.
-- 2. Ledger is strictly append-only (no UPDATE, no DELETE).
-- 3. Every consume must reference a reservation.
-- 4. Every release must reference a reservation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_ledger (
    id BIGSERIAL PRIMARY KEY,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES stock_batches(id) ON DELETE RESTRICT,
    entry_type stock_ledger_entry_type_enum NOT NULL,
    quantity_delta_base_units NUMERIC(14, 4) NOT NULL, -- Positive for intake/adjustment, negative for consume/waste
    unit_cost_paise BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
    running_balance_base_units NUMERIC(14, 4) NOT NULL CHECK (running_balance_base_units >= 0),
    reference_type VARCHAR(50) NOT NULL, -- 'ORDER', 'PURCHASE_GRN', 'ADJUSTMENT', 'WASTE'
    reference_id UUID NOT NULL,
    reservation_id UUID REFERENCES stock_reservations(id) ON DELETE RESTRICT,
    reason TEXT,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Enforce Invariant 3: Every CONSUME must reference a reservation
    CONSTRAINT chk_ledger_consume_requires_reservation CHECK (
        entry_type != 'CONSUME' OR reservation_id IS NOT NULL
    ),
    -- Enforce Invariant 4: Every RELEASE must reference a reservation
    CONSTRAINT chk_ledger_release_requires_reservation CHECK (
        entry_type != 'RELEASE' OR reservation_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_time ON stock_ledger(stock_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_ref ON stock_ledger(reference_type, reference_id);

-- ============================================================================
-- 5. STOCK ADJUSTMENTS & WASTE ENTRIES
-- Invariant 5: Every waste entry must have a non-empty reason
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('INCREASE', 'DECREASE')),
    quantity_base_units NUMERIC(14, 4) NOT NULL CHECK (quantity_base_units > 0),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    approved_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waste_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES stock_batches(id) ON DELETE RESTRICT,
    quantity_base_units NUMERIC(14, 4) NOT NULL CHECK (quantity_base_units > 0),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0), -- Enforces Invariant 5
    recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waste_entries_item ON waste_entries(stock_item_id);
