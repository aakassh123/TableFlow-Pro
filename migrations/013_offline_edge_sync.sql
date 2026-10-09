-- Migration 013: Offline-First Edge Node Architecture & Two-Way Sync
-- Enables continuous local kitchen & POS operations when internet connection is lost

-- ============================================================================
-- 1. EDGE EVENT LOG (Append-Only Local Sequence Log)
-- Every action performed locally is recorded with a monotonic sequence number
-- ============================================================================

CREATE TABLE IF NOT EXISTS edge_event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    sequence_number BIGINT NOT NULL,
    event_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- e.g. 'EDGE_ORDER_CREATED', 'EDGE_KDS_BUMP', 'EDGE_STOCK_CONSUMED', 'EDGE_TOKEN_ISSUED'
    aggregate_type VARCHAR(100) NOT NULL, -- 'ORDER', 'TICKET', 'STOCK', 'TOKEN'
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(255),
    sync_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SYNCED', 'CONFLICT', 'FAILED'
    synced_at TIMESTAMPTZ,
    error_message TEXT,
    local_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_edge_event_seq UNIQUE (outlet_id, sequence_number),
    CONSTRAINT uq_edge_event_id UNIQUE (outlet_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_edge_event_sync ON edge_event_log(outlet_id, sync_status, sequence_number);

-- ============================================================================
-- 2. SYNC CONFLICTS QUEUE (Never Silently Discard Data)
-- On reconnect, any non-reconcilable discrepancy is placed in this queue for manager review
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    event_id UUID REFERENCES edge_event_log(id) ON DELETE SET NULL,
    conflict_type VARCHAR(100) NOT NULL, -- 'CONCURRENT_ORDER_UPDATE', 'INVENTORY_SHORTAGE', 'STATE_MACHINE_MISMATCH', 'DUPLICATE_AGGREGATE'
    entity_type VARCHAR(100) NOT NULL, -- 'ORDER', 'STOCK_ITEM', 'PAYMENT'
    entity_id UUID NOT NULL,
    local_state JSONB NOT NULL,
    cloud_state JSONB NOT NULL,
    conflict_reason TEXT NOT NULL,
    resolution_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW', -- 'PENDING_REVIEW', 'RESOLVED_KEEP_LOCAL', 'RESOLVED_KEEP_CLOUD', 'RESOLVED_MERGED', 'DISMISSED'
    resolved_by UUID REFERENCES users(id),
    resolution_strategy VARCHAR(50), -- 'KEEP_LOCAL', 'KEEP_CLOUD', 'MERGE', 'STOCK_VARIANCE'
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(outlet_id, resolution_status);

-- ============================================================================
-- 3. EDGE NODE STATE (Operational Status & Sync Health)
-- Tracks connectivity (ONLINE / OFFLINE), sync cursors, and pending backlogs
-- ============================================================================

CREATE TABLE IF NOT EXISTS edge_node_state (
    outlet_id UUID PRIMARY KEY REFERENCES outlets(id) ON DELETE RESTRICT,
    node_id VARCHAR(100) NOT NULL,
    connectivity_state VARCHAR(50) NOT NULL DEFAULT 'ONLINE', -- 'ONLINE', 'OFFLINE', 'SYNCING'
    last_synced_sequence BIGINT NOT NULL DEFAULT 0,
    last_sync_attempt_at TIMESTAMPTZ,
    last_successful_sync_at TIMESTAMPTZ,
    pending_events_count INT NOT NULL DEFAULT 0,
    unresolved_conflicts_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial Edge Node state for Indiranagar Flagship Outlet
INSERT INTO edge_node_state (
    outlet_id, node_id, connectivity_state, last_synced_sequence, updated_at
) VALUES (
    '33333333-3333-3333-3333-333333333301', 'EDGE-BLR-IND-NODE-01', 'ONLINE', 0, CURRENT_TIMESTAMP
) ON CONFLICT (outlet_id) DO NOTHING;
