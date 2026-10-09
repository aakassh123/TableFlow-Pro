-- Migration 007: Tokens, Payments, and Purchasing (PO & GRN)

-- ============================================================================
-- 1. TOKENS (Takeaway / QSR buzzer calling tokens)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_number INT NOT NULL CHECK (token_number > 0),
    token_type VARCHAR(50) NOT NULL DEFAULT 'TAKEAWAY', -- 'TAKEAWAY', 'BUZZER'
    status token_status_enum NOT NULL DEFAULT 'ISSUED',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    called_at TIMESTAMPTZ,
    collected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tokens_outlet_number_daily UNIQUE (outlet_id, token_number, status)
);

CREATE INDEX IF NOT EXISTS idx_tokens_outlet_status ON tokens(outlet_id, status);

-- ============================================================================
-- 2. PAYMENTS & PAYMENT TRANSACTIONS
-- Invariant 10: Monetary values never use floating point (stored in integer paise)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL, -- Tax Invoice Number
    total_amount_paise BIGINT NOT NULL CHECK (total_amount_paise >= 0),
    paid_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount_paise >= 0),
    balance_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_amount_paise >= 0),
    tip_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (tip_amount_paise >= 0),
    status payment_status_enum NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payments_outlet_invoice UNIQUE (outlet_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    method payment_method_enum NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0), -- Amount in paise
    status transaction_status_enum NOT NULL DEFAULT 'INITIATED',
    gateway_provider VARCHAR(50), -- 'RAZORPAY', 'CASHFREE', 'PINELABS', 'CASH'
    gateway_reference_id VARCHAR(255), -- UTR number or Gateway Payment ID
    terminal_id VARCHAR(100), -- EDC machine terminal identity
    cashier_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway_ref ON payment_transactions(gateway_reference_id);

-- ============================================================================
-- 3. PURCHASING: PURCHASE ORDERS & GOODS RECEIPTS (GRN)
-- Invariant 10: Monetary values in integer paise
-- Invariant 11: Quantities in base units
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    po_number VARCHAR(50) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    status po_status_enum NOT NULL DEFAULT 'DRAFT',
    total_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_amount_paise >= 0),
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_purchase_orders_outlet_po UNIQUE (outlet_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity_base_units NUMERIC(14, 4) NOT NULL CHECK (quantity_base_units > 0),
    unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
    total_price_paise BIGINT NOT NULL CHECK (total_price_paise >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    grn_number VARCHAR(50) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL,
    total_amount_paise BIGINT NOT NULL CHECK (total_amount_paise >= 0),
    received_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_goods_receipts_outlet_grn UNIQUE (outlet_id, grn_number)
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts(purchase_order_id);
