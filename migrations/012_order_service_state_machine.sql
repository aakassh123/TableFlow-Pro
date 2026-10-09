-- Migration 012: Order Service State Machine and Channels

-- ============================================================================
-- 1. ORDER CHANNELS (WALK_IN, DINE_IN, QR, WEBSITE, WHATSAPP, DELIVERY)
-- ============================================================================

ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS channel VARCHAR(50) NOT NULL DEFAULT 'DINE_IN';

DO $$ BEGIN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_channel 
        CHECK (channel IN ('WALK_IN', 'DINE_IN', 'QR', 'WEBSITE', 'WHATSAPP', 'DELIVERY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. ORDER STATUS STATE MACHINE MIGRATION
-- States:
--   PENDING_PAYMENT
--   PLACED
--   ACCEPTED
--   PREPARING
--   READY
--   SERVED (Dine-in / QR)
--   COLLECTED (Walk-in takeaway)
--   HANDED_TO_RIDER (Delivery)
--   DELIVERED (Final delivery)
--   EXPIRED
--   REJECTED
--   CANCELLED (Before cooking, no waste)
--   CANCELLED_WITH_WASTE (After cooking started, with food waste)
-- ============================================================================

-- Alter orders.status and order_status_history.status to VARCHAR(50) for strict constraint enforcement
ALTER TABLE orders ALTER COLUMN status TYPE VARCHAR(50);
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'PLACED';

ALTER TABLE order_status_history ALTER COLUMN status TYPE VARCHAR(50);

DO $$ BEGIN
    ALTER TABLE orders ADD CONSTRAINT chk_orders_status 
        CHECK (status IN (
            'PENDING_PAYMENT',
            'PLACED',
            'ACCEPTED',
            'PREPARING',
            'READY',
            'SERVED',
            'COLLECTED',
            'HANDED_TO_RIDER',
            'DELIVERED',
            'EXPIRED',
            'REJECTED',
            'CANCELLED',
            'CANCELLED_WITH_WASTE'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3. STRICT SERVER-SIDE STATE MACHINE TRIGGER
-- Validates every transition and rejects illegal jumps.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_validate_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- If status hasn't changed, allow update
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Validate legal transitions
    IF (OLD.status = 'PENDING_PAYMENT' AND NEW.status IN ('PLACED', 'EXPIRED', 'CANCELLED')) OR
       (OLD.status = 'PLACED' AND NEW.status IN ('ACCEPTED', 'REJECTED', 'CANCELLED')) OR
       (OLD.status = 'ACCEPTED' AND NEW.status IN ('PREPARING', 'CANCELLED')) OR
       (OLD.status = 'PREPARING' AND NEW.status IN ('READY', 'CANCELLED_WITH_WASTE')) OR
       (OLD.status = 'READY' AND NEW.status IN ('SERVED', 'COLLECTED', 'HANDED_TO_RIDER', 'CANCELLED_WITH_WASTE')) OR
       (OLD.status = 'HANDED_TO_RIDER' AND NEW.status IN ('DELIVERED', 'CANCELLED_WITH_WASTE'))
    THEN
        -- Valid transition
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'CRITICAL STATE MACHINE VIOLATION: Illegal order status transition from % to % for order %',
            OLD.status, NEW.status, OLD.id;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON orders;
CREATE TRIGGER trg_validate_order_status_transition
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_order_status_transition();
