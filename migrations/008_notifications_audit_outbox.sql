-- Migration 008: Notifications, Auditing, Idempotency, and Transactional Outbox

-- ============================================================================
-- 1. NOTIFICATIONS & DELIVERIES (WhatsApp, SMS, Push)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    channel notification_channel_enum NOT NULL,
    recipient VARCHAR(255) NOT NULL, -- Phone number or Device Push Token
    template_code VARCHAR(100) NOT NULL, -- e.g. 'BILL_RECEIPT_WHATSAPP', 'OTP_SMS'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(255),
    outbox_event_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED', -- QUEUED, SENT, DELIVERED, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_outlet_status ON notifications(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications(idempotency_key);

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL DEFAULT 1,
    provider VARCHAR(50) NOT NULL, -- 'GUPSHUP', 'MSG91', 'FIREBASE'
    provider_message_id VARCHAR(255),
    response_code VARCHAR(50),
    error_message TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notif ON notification_deliveries(notification_id);

-- ============================================================================
-- 2. AUDIT LOGS
-- Invariant 12: Every important mutation must be auditable
-- Immutable audit log for security, compliance, and regulatory governance.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- e.g. 'ORDER_STATUS_UPDATE', 'STOCK_ADJUSTMENT', 'ITEM_VOID'
    entity_name VARCHAR(100) NOT NULL, -- e.g. 'orders', 'stock_items', 'payments'
    entity_id VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outlet_time ON audit_logs(outlet_id, created_at DESC);

-- ============================================================================
-- 3. IDEMPOTENCY KEYS
-- Invariant 8: Idempotency keys must prevent duplicate mutating actions / orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    key VARCHAR(255) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL, -- SHA-256 of request payload
    response_code INT,
    response_body JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSING', -- 'PROCESSING', 'COMPLETED', 'FAILED'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_idempotency_outlet_key UNIQUE (outlet_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON idempotency_keys(outlet_id, key, status);

-- ============================================================================
-- 4. TRANSACTIONAL OUTBOX (Reliable Event Dispatch)
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    event_type VARCHAR(100) NOT NULL, -- 'ORDER_CREATED', 'KOT_PRINTED', 'PAYMENT_RECEIVED'
    aggregate_type VARCHAR(50) NOT NULL, -- 'ORDER', 'INVENTORY', 'PAYMENT'
    aggregate_id VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status outbox_status_enum NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    idempotency_key VARCHAR(255),
    last_error TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending_events 
    ON outbox_events(status, next_retry_at, created_at ASC);
