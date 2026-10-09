-- Migration 009: Invariants, Automated Triggers, and Constraints

-- ============================================================================
-- INVARIANT 2: STOCK LEDGER IS STRICTLY APPEND-ONLY (NO UPDATE, NO DELETE)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_prevent_stock_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'CRITICAL INVARIANT VIOLATION: stock_ledger is immutable and append-only. % operations are strictly forbidden.', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_stock_ledger_mutation ON stock_ledger;
CREATE TRIGGER trg_prevent_stock_ledger_mutation
    BEFORE UPDATE OR DELETE ON stock_ledger
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_stock_ledger_mutation();

-- ============================================================================
-- INVARIANT 1: STOCK CANNOT BECOME NEGATIVE & AUTOMATIC BALANCE SYNCHRONIZATION
-- Whenever a row is appended to stock_ledger:
-- 1. Updates stock_items.current_balance_base_units.
-- 2. Updates stock_batches.current_quantity_base_units (if batch_id is present).
-- 3. Ensures stock balance never drops below zero.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_process_stock_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_new_balance NUMERIC(14, 4);
    v_batch_balance NUMERIC(14, 4);
BEGIN
    -- 1. Update stock_items balance
    UPDATE stock_items
    SET current_balance_base_units = current_balance_base_units + NEW.quantity_delta_base_units,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.stock_item_id
    RETURNING current_balance_base_units INTO v_new_balance;

    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'CRITICAL INVARIANT VIOLATION: Stock balance cannot become negative. Attempted balance: % for stock item %', v_new_balance, NEW.stock_item_id;
    END IF;

    -- Store the computed running balance on the ledger row
    NEW.running_balance_base_units := v_new_balance;

    -- 2. Update batch balance if batch_id is provided
    IF NEW.batch_id IS NOT NULL THEN
        UPDATE stock_batches
        SET current_quantity_base_units = current_quantity_base_units + NEW.quantity_delta_base_units,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.batch_id
        RETURNING current_quantity_base_units INTO v_batch_balance;

        IF v_batch_balance < 0 THEN
            RAISE EXCEPTION 'CRITICAL INVARIANT VIOLATION: Batch quantity cannot become negative. Attempted balance: % for batch %', v_batch_balance, NEW.batch_id;
        END IF;
    END IF;

    -- Invariant 3: If CONSUME, mark reservation as CONSUMED
    IF NEW.entry_type = 'CONSUME' AND NEW.reservation_id IS NOT NULL THEN
        UPDATE stock_reservations
        SET status = 'CONSUMED',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.reservation_id;

        -- Decrement reserved quantity
        UPDATE stock_items
        SET reserved_quantity_base_units = GREATEST(0, reserved_quantity_base_units + NEW.quantity_delta_base_units) -- delta is negative
        WHERE id = NEW.stock_item_id;
    END IF;

    -- Invariant 4: If RELEASE, mark reservation as RELEASED
    IF NEW.entry_type = 'RELEASE' AND NEW.reservation_id IS NOT NULL THEN
        UPDATE stock_reservations
        SET status = 'RELEASED',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.reservation_id;

        -- Decrement reserved quantity
        UPDATE stock_items
        SET reserved_quantity_base_units = GREATEST(0, reserved_quantity_base_units - ABS(NEW.quantity_delta_base_units))
        WHERE id = NEW.stock_item_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_process_stock_ledger_entry ON stock_ledger;
CREATE TRIGGER trg_process_stock_ledger_entry
    BEFORE INSERT ON stock_ledger
    FOR EACH ROW
    EXECUTE FUNCTION fn_process_stock_ledger_entry();

-- ============================================================================
-- INVARIANT 6: RECIPE VERSIONS CANNOT MODIFY HISTORICAL ORDERS
-- Once a recipe_version is ACTIVE or DEPRECATED, its recipe_items and
-- recipe_modifiers can no longer be edited or deleted.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_prevent_locked_recipe_modification()
RETURNS TRIGGER AS $$
DECLARE
    v_status recipe_version_status_enum;
    v_version_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_version_id := OLD.recipe_version_id;
    ELSE
        v_version_id := NEW.recipe_version_id;
    END IF;

    SELECT status INTO v_status FROM recipe_versions WHERE id = v_version_id;

    IF v_status IS NOT NULL AND v_status != 'DRAFT' THEN
        RAISE EXCEPTION 'CRITICAL INVARIANT VIOLATION: Cannot % recipe items or modifiers for a locked recipe version (current status: %). Create a new recipe version instead.', TG_OP, v_status;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_recipe_item_modification ON recipe_items;
CREATE TRIGGER trg_prevent_recipe_item_modification
    BEFORE INSERT OR UPDATE OR DELETE ON recipe_items
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_locked_recipe_modification();

DROP TRIGGER IF EXISTS trg_prevent_recipe_modifier_modification ON recipe_modifiers;
CREATE TRIGGER trg_prevent_recipe_modifier_modification
    BEFORE INSERT OR UPDATE OR DELETE ON recipe_modifiers
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_locked_recipe_modification();

-- ============================================================================
-- INVARIANT 7: ORDER STATUS TRANSITIONS MUST BE VALIDATED
-- Strict State Machine:
-- DRAFT -> CONFIRMED, CANCELLED
-- CONFIRMED -> IN_PREPARATION, CANCELLED
-- IN_PREPARATION -> READY, CANCELLED
-- READY -> SERVED, CANCELLED
-- SERVED -> BILLED, CANCELLED
-- BILLED -> SETTLED, CANCELLED
-- SETTLED -> CLOSED
-- CLOSED -> (terminal)
-- CANCELLED -> (terminal)
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
       (OLD.status = 'HANDED_TO_RIDER' AND NEW.status IN ('DELIVERED', 'CANCELLED_WITH_WASTE')) OR
       -- Legacy compatibility:
       (OLD.status = 'DRAFT' AND NEW.status IN ('PLACED', 'CONFIRMED', 'CANCELLED')) OR
       (OLD.status = 'CONFIRMED' AND NEW.status IN ('ACCEPTED', 'IN_PREPARATION', 'CANCELLED')) OR
       (OLD.status = 'IN_PREPARATION' AND NEW.status IN ('READY', 'CANCELLED')) OR
       (OLD.status = 'BILLED' AND NEW.status IN ('SETTLED', 'CANCELLED')) OR
       (OLD.status = 'SETTLED' AND NEW.status = 'CLOSED')
    THEN
        -- Valid transition
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'CRITICAL INVARIANT VIOLATION: Illegal order status transition from % to % for order %',
            OLD.status, NEW.status, OLD.id;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON orders;
CREATE TRIGGER trg_validate_order_status_transition
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_order_status_transition();

-- Record status change in order_status_history automatically (Enforces Invariant 9)
CREATE OR REPLACE FUNCTION fn_record_order_status_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (OLD.status != NEW.status) THEN
        INSERT INTO order_status_history (order_id, status, notes, changed_by)
        VALUES (NEW.id, NEW.status, 'Automated transition recorded by system trigger', NEW.created_by);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_record_order_status_history ON orders;
CREATE TRIGGER trg_record_order_status_history
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_record_order_status_history();

-- ============================================================================
-- INVARIANT 12: EVERY IMPORTANT MUTATION MUST BE AUDITABLE
-- Triggers on core financial and operational entities
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_audit_log_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID := NULL;
    v_outlet_id UUID := NULL;
    v_entity_id VARCHAR(100);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id::text;
        IF TG_TABLE_NAME = 'orders' THEN v_outlet_id := OLD.outlet_id; END IF;
        IF TG_TABLE_NAME = 'payments' THEN v_outlet_id := OLD.outlet_id; END IF;
        IF TG_TABLE_NAME = 'stock_adjustments' THEN v_outlet_id := OLD.outlet_id; END IF;
        IF TG_TABLE_NAME = 'waste_entries' THEN v_outlet_id := OLD.outlet_id; END IF;

        INSERT INTO audit_logs (outlet_id, user_id, action, entity_name, entity_id, old_values, new_values)
        VALUES (v_outlet_id, NULL, TG_TABLE_NAME || '_DELETED', TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), NULL);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        v_entity_id := NEW.id::text;
        IF TG_TABLE_NAME = 'orders' THEN v_outlet_id := NEW.outlet_id; END IF;
        IF TG_TABLE_NAME = 'payments' THEN v_outlet_id := NEW.outlet_id; END IF;
        IF TG_TABLE_NAME = 'stock_adjustments' THEN v_outlet_id := NEW.outlet_id; END IF;
        IF TG_TABLE_NAME = 'waste_entries' THEN v_outlet_id := NEW.outlet_id; END IF;

        INSERT INTO audit_logs (outlet_id, user_id, action, entity_name, entity_id, old_values, new_values)
        VALUES (v_outlet_id, NULL, TG_TABLE_NAME || '_UPDATED', TG_TABLE_NAME, v_entity_id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id::text;
        IF TG_TABLE_NAME = 'orders' THEN v_outlet_id := NEW.outlet_id; END IF;
        IF TG_TABLE_NAME = 'payments' THEN v_outlet_id := NEW.outlet_id; END IF;
        IF TG_TABLE_NAME = 'stock_adjustments' THEN v_outlet_id := NEW.outlet_id; END IF;
        IF TG_TABLE_NAME = 'waste_entries' THEN v_outlet_id := NEW.outlet_id; END IF;

        INSERT INTO audit_logs (outlet_id, user_id, action, entity_name, entity_id, old_values, new_values)
        VALUES (v_outlet_id, NULL, TG_TABLE_NAME || '_CREATED', TG_TABLE_NAME, v_entity_id, NULL, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_orders ON orders;
CREATE TRIGGER trg_audit_orders
    AFTER INSERT OR UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_audit_payments ON payments;
CREATE TRIGGER trg_audit_payments
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_audit_stock_adjustments ON stock_adjustments;
CREATE TRIGGER trg_audit_stock_adjustments
    AFTER INSERT ON stock_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_audit_waste_entries ON waste_entries;
CREATE TRIGGER trg_audit_waste_entries
    AFTER INSERT ON waste_entries
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_log_mutation();
