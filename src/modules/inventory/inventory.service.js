// Production-Grade Inventory Engine
// Append-Only Ledger, Concurrent Row-Level Locking, and Strict Invariant Enforcement
import {
    InsufficientStockError,
    InvalidReservationStateError,
    ReservationNotFoundError,
    StockItemNotFoundError
} from './inventory.errors.js';
import { ValidationError } from '../../shared/errors.js';
import { wsHub, WS_EVENTS } from '../realtime/websocket-hub.js';

export class InventoryService {
    /**
     * Helper to run queries inside an isolated or provided transaction block
     */
    static async withTransaction(poolOrClient, fn) {
        if (poolOrClient.connect && typeof poolOrClient.connect === 'function') {
            // It's a Pool: acquire client, manage transaction
            const client = await poolOrClient.connect();
            try {
                await client.query('BEGIN');
                const result = await fn(client);
                await client.query('COMMIT');
                return result;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } else {
            // It's already an active client inside a caller transaction
            return fn(poolOrClient);
        }
    }

    /**
     * 1. RESERVE STOCK
     * Atomically holds ingredient quantity for an order prior to cooking.
     * Concurrency guarantee: Uses SELECT ... FOR UPDATE row-level lock.
     * If two orders attempt to reserve simultaneously, the second waits for the lock
     * and fails if remaining available stock is insufficient.
     */
    static async reserveStock(poolOrClient, {
        outletId,
        orderId = null,
        orderItemId = null,
        stockItemId,
        quantityBaseUnits,
        expiresAtMinutes = 30
    }) {
        const qtyToReserve = parseFloat(quantityBaseUnits);
        if (isNaN(qtyToReserve) || qtyToReserve <= 0) {
            throw new ValidationError('Quantity to reserve must be a positive number');
        }

        return this.withTransaction(poolOrClient, async (client) => {
            // 1. Acquire exclusive row-level lock on the stock_item row
            const itemRes = await client.query(`
                SELECT id, outlet_id, ingredient_id, current_balance_base_units, reserved_quantity_base_units
                FROM stock_items
                WHERE id = $1 AND outlet_id = $2
                FOR UPDATE
            `, [stockItemId, outletId]);

            if (itemRes.rows.length === 0) {
                throw new StockItemNotFoundError(stockItemId);
            }

            const item = itemRes.rows[0];
            const currentBalance = parseFloat(item.current_balance_base_units);
            const currentReserved = parseFloat(item.reserved_quantity_base_units);
            const availableStock = currentBalance - currentReserved;

            // 2. Perform atomic conditional reservation update
            // Protects against concurrency races in both PostgreSQL and in-memory engines
            const updateRes = await client.query(`
                UPDATE stock_items
                SET reserved_quantity_base_units = reserved_quantity_base_units + $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                  AND outlet_id = $3
                  AND (current_balance_base_units - reserved_quantity_base_units) >= $1
                RETURNING id, current_balance_base_units, reserved_quantity_base_units;
            `, [qtyToReserve, stockItemId, outletId]);

            if (updateRes.rows.length === 0) {
                // A concurrent transaction reserved or consumed the stock simultaneously!
                const recheck = await client.query(`
                    SELECT current_balance_base_units, reserved_quantity_base_units
                    FROM stock_items WHERE id = $1 AND outlet_id = $2
                `, [stockItemId, outletId]);

                const curBal = recheck.rows.length > 0 ? parseFloat(recheck.rows[0].current_balance_base_units) : 0;
                const curRes = recheck.rows.length > 0 ? parseFloat(recheck.rows[0].reserved_quantity_base_units) : 0;
                const curAvail = Math.max(0, curBal - curRes);

                throw new InsufficientStockError(
                    stockItemId,
                    qtyToReserve.toFixed(4),
                    curAvail.toFixed(4),
                    `Insufficient stock for item ${stockItemId}: requested ${qtyToReserve.toFixed(4)}, available ${curAvail.toFixed(4)}`
                );
            }

            const updatedItem = updateRes.rows[0];
            const newReserved = parseFloat(updatedItem.reserved_quantity_base_units);
            const newOnHand = parseFloat(updatedItem.current_balance_base_units);


            // 3. Create stock_reservation record
            const expiresAt = new Date(Date.now() + expiresAtMinutes * 60 * 1000);
            const resRes = await client.query(`
                INSERT INTO stock_reservations (
                    outlet_id, order_id, order_item_id, stock_item_id,
                    quantity_reserved_base_units, status, expires_at
                ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
                RETURNING id, outlet_id, order_id, order_item_id, stock_item_id,
                          quantity_reserved_base_units, status, expires_at, created_at
            `, [outletId, orderId, orderItemId, stockItemId, qtyToReserve, expiresAt]);

            return {
                reservation: resRes.rows[0],
                stockItem: {
                    id: stockItemId,
                    onHandBalance: currentBalance,
                    reservedQuantity: newReserved,
                    availableStock: currentBalance - newReserved
                }
            };
        });
    }

    /**
     * 2. CONSUME RESERVED STOCK
     * Converts a PENDING reservation into actual consumption.
     * Decrements on-hand stock balance and reserved balance.
     * Appends immutable CONSUME entry to stock_ledger.
     * Invariant: Every consume MUST reference a valid reservation.
     */
    static async consumeReservedStock(poolOrClient, {
        outletId,
        reservationId,
        referenceType = 'ORDER',
        referenceId = null,
        userId = null
    }) {
        if (!reservationId) {
            throw new ValidationError('Reservation ID is required for stock consumption');
        }

        return this.withTransaction(poolOrClient, async (client) => {
            // 1. Lock and validate reservation
            const resRes = await client.query(`
                SELECT id, outlet_id, order_id, order_item_id, stock_item_id,
                       quantity_reserved_base_units, status
                FROM stock_reservations
                WHERE id = $1 AND outlet_id = $2
                FOR UPDATE
            `, [reservationId, outletId]);

            if (resRes.rows.length === 0) {
                throw new ReservationNotFoundError(reservationId);
            }

            const reservation = resRes.rows[0];

            if (reservation.status !== 'PENDING') {
                throw new InvalidReservationStateError(reservationId, reservation.status, 'PENDING');
            }

            const qtyToConsume = parseFloat(reservation.quantity_reserved_base_units);

            // 2. Lock stock_items row
            const itemRes = await client.query(`
                SELECT id, current_balance_base_units, reserved_quantity_base_units, average_unit_cost_paise
                FROM stock_items
                WHERE id = $1
                FOR UPDATE
            `, [reservation.stock_item_id]);

            const item = itemRes.rows[0];
            const currentBalance = parseFloat(item.current_balance_base_units);
            const currentReserved = parseFloat(item.reserved_quantity_base_units);

            if (currentBalance < qtyToConsume) {
                throw new InsufficientStockError(
                    reservation.stock_item_id,
                    qtyToConsume.toFixed(4),
                    currentBalance.toFixed(4),
                    'Cannot consume stock: on-hand balance is less than reserved quantity'
                );
            }

            // 3. FIFO Batch Allocation
            const batchesRes = await client.query(`
                SELECT id, batch_number, current_quantity_base_units, unit_cost_paise
                FROM stock_batches
                WHERE stock_item_id = $1 AND current_quantity_base_units > 0
                ORDER BY received_at ASC, id ASC
                FOR UPDATE
            `, [reservation.stock_item_id]);

            let remainingQty = qtyToConsume;
            let allocatedBatchId = null;
            let unitCost = item.average_unit_cost_paise;

            if (batchesRes.rows.length > 0) {
                // Deduct from batches using FIFO
                for (const batch of batchesRes.rows) {
                    if (remainingQty <= 0) break;
                    const batchQty = parseFloat(batch.current_quantity_base_units);
                    const deduction = Math.min(batchQty, remainingQty);

                    await client.query(`
                        UPDATE stock_batches
                        SET current_quantity_base_units = current_quantity_base_units - $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [deduction, batch.id]);

                    allocatedBatchId = batch.id;
                    unitCost = batch.unit_cost_paise;
                    remainingQty -= deduction;
                }
            }

            // 4. Update stock_items balance & reservation counts
            const newBalance = currentBalance - qtyToConsume;
            const newReserved = Math.max(0, currentReserved - qtyToConsume);

            await client.query(`
                UPDATE stock_items
                SET current_balance_base_units = $1,
                    reserved_quantity_base_units = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [newBalance, newReserved, reservation.stock_item_id]);

            // 5. Update reservation status to CONSUMED
            await client.query(`
                UPDATE stock_reservations
                SET status = 'CONSUMED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [reservationId]);

            // Realtime stock alert if stock is low or finished
            const availableStock = newBalance - newReserved;
            try {
                if (availableStock <= 0) {
                    wsHub.emitStockEvent(WS_EVENTS.STOCK_FINISHED, {
                        stockItemId: reservation.stock_item_id,
                        availableStock,
                        onHandBalance: newBalance
                    });
                } else if (availableStock <= 5000) {
                    wsHub.emitStockEvent(WS_EVENTS.STOCK_LOW, {
                        stockItemId: reservation.stock_item_id,
                        availableStock,
                        onHandBalance: newBalance
                    });
                }
            } catch (wsErr) {}

            // 6. Append to immutable stock_ledger (Satisfies Invariant 3: reservation_id is NOT NULL)
            const ledgerRes = await client.query(`
                INSERT INTO stock_ledger (
                    outlet_id, stock_item_id, batch_id, entry_type,
                    quantity_delta_base_units, unit_cost_paise, running_balance_base_units,
                    reference_type, reference_id, reservation_id, reason, created_by
                ) VALUES ($1, $2, $3, 'CONSUME', $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id, entry_type, quantity_delta_base_units, running_balance_base_units, created_at
            `, [
                outletId,
                reservation.stock_item_id,
                allocatedBatchId,
                -qtyToConsume, // Negative delta
                unitCost,
                newBalance,
                referenceType,
                referenceId || reservation.order_id,
                reservationId, // Non-null reference
                `Consumed for order reservation ${reservationId}`,
                userId
            ]);

            return {
                reservationId,
                status: 'CONSUMED',
                quantityConsumed: qtyToConsume,
                ledgerEntry: ledgerRes.rows[0],
                stockItem: {
                    id: reservation.stock_item_id,
                    onHandBalance: newBalance,
                    reservedQuantity: newReserved,
                    availableStock: newBalance - newReserved
                }
            };
        });
    }

    /**
     * 3. RELEASE RESERVATION
     * Cancels an active reservation, returning reserved quantity back to available.
     * Appends immutable RELEASE entry to stock_ledger.
     * Invariant: Every release MUST reference a valid reservation.
     */
    static async releaseReservation(poolOrClient, {
        outletId,
        reservationId,
        reason = 'ORDER_CANCELLED',
        userId = null
    }) {
        if (!reservationId) {
            throw new ValidationError('Reservation ID is required to release reserved stock');
        }

        return this.withTransaction(poolOrClient, async (client) => {
            // 1. Lock and validate reservation
            const resRes = await client.query(`
                SELECT id, outlet_id, order_id, stock_item_id, quantity_reserved_base_units, status
                FROM stock_reservations
                WHERE id = $1 AND outlet_id = $2
                FOR UPDATE
            `, [reservationId, outletId]);

            if (resRes.rows.length === 0) {
                throw new ReservationNotFoundError(reservationId);
            }

            const reservation = resRes.rows[0];

            if (reservation.status !== 'PENDING') {
                throw new InvalidReservationStateError(reservationId, reservation.status, 'PENDING');
            }

            const qtyToRelease = parseFloat(reservation.quantity_reserved_base_units);

            // 2. Lock stock_items row
            const itemRes = await client.query(`
                SELECT id, current_balance_base_units, reserved_quantity_base_units
                FROM stock_items
                WHERE id = $1
                FOR UPDATE
            `, [reservation.stock_item_id]);

            const item = itemRes.rows[0];
            const currentBalance = parseFloat(item.current_balance_base_units);
            const currentReserved = parseFloat(item.reserved_quantity_base_units);
            const newReserved = Math.max(0, currentReserved - qtyToRelease);

            // 3. Decrement reserved_quantity_base_units
            await client.query(`
                UPDATE stock_items
                SET reserved_quantity_base_units = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [newReserved, reservation.stock_item_id]);

            // 4. Update reservation status to RELEASED
            await client.query(`
                UPDATE stock_reservations
                SET status = 'RELEASED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [reservationId]);

            // 5. Append to immutable stock_ledger (Satisfies Invariant 4: reservation_id is NOT NULL)
            const ledgerRes = await client.query(`
                INSERT INTO stock_ledger (
                    outlet_id, stock_item_id, entry_type,
                    quantity_delta_base_units, unit_cost_paise, running_balance_base_units,
                    reference_type, reference_id, reservation_id, reason, created_by
                ) VALUES ($1, $2, 'RELEASE', 0.0000, 0, $3, 'ORDER_RESERVATION', $4, $5, $6, $7)
                RETURNING id, entry_type, running_balance_base_units, created_at
            `, [
                outletId,
                reservation.stock_item_id,
                currentBalance, // on-hand balance was not altered
                reservation.order_id || reservationId,
                reservationId, // Non-null reference
                `Released hold: ${reason}`,
                userId
            ]);

            return {
                reservationId,
                status: 'RELEASED',
                quantityReleased: qtyToRelease,
                ledgerEntry: ledgerRes.rows[0],
                stockItem: {
                    id: reservation.stock_item_id,
                    onHandBalance: currentBalance,
                    reservedQuantity: newReserved,
                    availableStock: currentBalance - newReserved
                }
            };
        });
    }

    /**
     * 4. RECORD WASTE
     * Records food spoilage, burning, or drop wastage.
     * Invariant 5: Every waste entry MUST have a valid non-empty reason.
     * Invariant 1: Available stock cannot drop below zero.
     */
    static async recordWaste(poolOrClient, {
        outletId,
        stockItemId,
        batchId = null,
        quantityBaseUnits,
        reason,
        recordedBy
    }) {
        const qtyToWaste = parseFloat(quantityBaseUnits);
        if (isNaN(qtyToWaste) || qtyToWaste <= 0) {
            throw new ValidationError('Waste quantity must be a positive number');
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            throw new ValidationError('Every waste entry must have a valid non-empty reason');
        }

        if (!recordedBy) {
            throw new ValidationError('Recorded by user ID is required');
        }

        return this.withTransaction(poolOrClient, async (client) => {
            // 1. Lock stock item
            const itemRes = await client.query(`
                SELECT id, current_balance_base_units, reserved_quantity_base_units, average_unit_cost_paise
                FROM stock_items
                WHERE id = $1 AND outlet_id = $2
                FOR UPDATE
            `, [stockItemId, outletId]);

            if (itemRes.rows.length === 0) {
                throw new StockItemNotFoundError(stockItemId);
            }

            const item = itemRes.rows[0];
            const currentBalance = parseFloat(item.current_balance_base_units);
            const currentReserved = parseFloat(item.reserved_quantity_base_units);
            const availableStock = currentBalance - currentReserved;

            // Invariant: Waste cannot exceed unreserved available stock
            if (availableStock < qtyToWaste) {
                throw new InsufficientStockError(
                    stockItemId,
                    qtyToWaste.toFixed(4),
                    availableStock.toFixed(4),
                    `Cannot record waste: quantity ${qtyToWaste.toFixed(4)} exceeds unreserved stock ${availableStock.toFixed(4)}`
                );
            }

            // 2. Deduct from batch if provided
            let unitCost = item.average_unit_cost_paise;
            if (batchId) {
                const batchRes = await client.query(`
                    SELECT id, current_quantity_base_units, unit_cost_paise
                    FROM stock_batches
                    WHERE id = $1 AND stock_item_id = $2
                    FOR UPDATE
                `, [batchId, stockItemId]);

                if (batchRes.rows.length > 0) {
                    const batch = batchRes.rows[0];
                    const batchQty = parseFloat(batch.current_quantity_base_units);
                    if (batchQty < qtyToWaste) {
                        throw new ValidationError(`Batch quantity (${batchQty.toFixed(4)}) is less than waste quantity (${qtyToWaste.toFixed(4)})`);
                    }
                    await client.query(`
                        UPDATE stock_batches
                        SET current_quantity_base_units = current_quantity_base_units - $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [qtyToWaste, batchId]);
                    unitCost = batch.unit_cost_paise;
                }
            }

            // 3. Create waste_entries record
            const wasteRes = await client.query(`
                INSERT INTO waste_entries (
                    outlet_id, stock_item_id, batch_id, quantity_base_units, reason, recorded_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, outlet_id, stock_item_id, batch_id, quantity_base_units, reason, created_at
            `, [outletId, stockItemId, batchId, qtyToWaste, reason.trim(), recordedBy]);

            const wasteEntry = wasteRes.rows[0];
            const newBalance = currentBalance - qtyToWaste;

            // 4. Update stock_items balance
            await client.query(`
                UPDATE stock_items
                SET current_balance_base_units = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [newBalance, stockItemId]);

            // 5. Append to immutable stock_ledger
            const ledgerRes = await client.query(`
                INSERT INTO stock_ledger (
                    outlet_id, stock_item_id, batch_id, entry_type,
                    quantity_delta_base_units, unit_cost_paise, running_balance_base_units,
                    reference_type, reference_id, reason, created_by
                ) VALUES ($1, $2, $3, 'WASTE', $4, $5, $6, 'WASTE', $7, $8, $9)
                RETURNING id, entry_type, quantity_delta_base_units, running_balance_base_units, created_at
            `, [
                outletId,
                stockItemId,
                batchId,
                -qtyToWaste,
                unitCost,
                newBalance,
                wasteEntry.id,
                reason.trim(),
                recordedBy
            ]);

            return {
                wasteEntry,
                ledgerEntry: ledgerRes.rows[0],
                stockItem: {
                    id: stockItemId,
                    onHandBalance: newBalance,
                    reservedQuantity: currentReserved,
                    availableStock: newBalance - currentReserved
                }
            };
        });
    }

    /**
     * 5. RECEIVE GOODS (PURCHASE GRN)
     * Ingests physical raw inventory into the restaurant outlet.
     * Creates Goods Receipt Note, batches, calculates new weighted average cost,
     * and appends PURCHASE_GRN entries to the stock ledger.
     */
    static async receiveGoods(poolOrClient, {
        outletId,
        supplierId,
        purchaseOrderId = null,
        grnNumber,
        invoiceNumber,
        receivedBy,
        items = []
    }) {
        if (!grnNumber || !invoiceNumber) {
            throw new ValidationError('GRN number and vendor invoice number are required');
        }

        if (!items || items.length === 0) {
            throw new ValidationError('At least one item is required in goods receipt');
        }

        return this.withTransaction(poolOrClient, async (client) => {
            let totalAmountPaise = 0;

            for (const it of items) {
                const qty = parseFloat(it.quantityBaseUnits);
                const cost = parseInt(it.unitCostPaise, 10);
                totalAmountPaise += Math.round(qty * cost);
            }

            // 1. Create goods_receipts header
            const grnRes = await client.query(`
                INSERT INTO goods_receipts (
                    outlet_id, purchase_order_id, grn_number, supplier_id,
                    invoice_number, total_amount_paise, received_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, grn_number, invoice_number, total_amount_paise, received_at
            `, [outletId, purchaseOrderId, grnNumber, supplierId, invoiceNumber, totalAmountPaise, receivedBy]);

            const grn = grnRes.rows[0];
            const processedItems = [];

            // 2. Process each item intake
            for (const it of items) {
                const qtyReceived = parseFloat(it.quantityBaseUnits);
                const unitCost = parseInt(it.unitCostPaise, 10);
                const batchNumber = it.batchNumber || `BATCH-${Date.now()}`;
                const expiryDate = it.expiryDate || null;

                // Lock or create stock_items entry
                let itemRes = await client.query(`
                    SELECT id, current_balance_base_units, reserved_quantity_base_units, average_unit_cost_paise
                    FROM stock_items
                    WHERE outlet_id = $1 AND ingredient_id = $2
                    FOR UPDATE
                `, [outletId, it.ingredientId]);

                let stockItem;
                if (itemRes.rows.length === 0) {
                    const insertItem = await client.query(`
                        INSERT INTO stock_items (
                            outlet_id, ingredient_id, current_balance_base_units,
                            reserved_quantity_base_units, average_unit_cost_paise
                        ) VALUES ($1, $2, 0, 0, $3)
                        RETURNING id, current_balance_base_units, reserved_quantity_base_units, average_unit_cost_paise
                    `, [outletId, it.ingredientId, unitCost]);
                    stockItem = insertItem.rows[0];
                } else {
                    stockItem = itemRes.rows[0];
                }

                const currentBal = parseFloat(stockItem.current_balance_base_units);
                const currentAvgCost = parseInt(stockItem.average_unit_cost_paise, 10);

                // Weighted Average Cost calculation:
                // New Cost = ((Old Bal * Old Cost) + (New Qty * New Cost)) / (Old Bal + New Qty)
                const newBal = currentBal + qtyReceived;
                const totalCost = (currentBal * currentAvgCost) + (qtyReceived * unitCost);
                const newAvgCost = newBal > 0 ? Math.round(totalCost / newBal) : unitCost;

                // Create stock_batches record
                const batchRes = await client.query(`
                    INSERT INTO stock_batches (
                        stock_item_id, batch_number, initial_quantity_base_units,
                        current_quantity_base_units, unit_cost_paise, expiry_date
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id, batch_number, current_quantity_base_units, expiry_date
                `, [stockItem.id, batchNumber, qtyReceived, qtyReceived, unitCost, expiryDate]);

                const batch = batchRes.rows[0];

                // Update stock_items
                await client.query(`
                    UPDATE stock_items
                    SET current_balance_base_units = $1,
                        average_unit_cost_paise = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [newBal, newAvgCost, stockItem.id]);

                // Append PURCHASE_GRN to stock_ledger
                const ledgerRes = await client.query(`
                    INSERT INTO stock_ledger (
                        outlet_id, stock_item_id, batch_id, entry_type,
                        quantity_delta_base_units, unit_cost_paise, running_balance_base_units,
                        reference_type, reference_id, reason, created_by
                    ) VALUES ($1, $2, $3, 'PURCHASE_GRN', $4, $5, $6, 'PURCHASE_GRN', $7, $8, $9)
                    RETURNING id, entry_type, quantity_delta_base_units, running_balance_base_units
                `, [
                    outletId,
                    stockItem.id,
                    batch.id,
                    qtyReceived,
                    unitCost,
                    newBal,
                    grn.id,
                    `Goods receipt note ${grnNumber}`,
                    receivedBy
                ]);

                processedItems.push({
                    ingredientId: it.ingredientId,
                    stockItemId: stockItem.id,
                    batchId: batch.id,
                    quantityReceived: qtyReceived,
                    newBalance: newBal,
                    ledgerEntry: ledgerRes.rows[0]
                });
            }

            return {
                goodsReceipt: grn,
                items: processedItems
            };
        });
    }

    /**
     * 6. ADJUST STOCK
     * Manual stock correction (audit/cycle count adjustment).
     * Enforces manager approval audit trail and append-only ledger entries.
     */
    static async adjustStock(poolOrClient, {
        outletId,
        stockItemId,
        adjustmentType, // 'INCREASE' or 'DECREASE'
        quantityBaseUnits,
        reason,
        approvedBy
    }) {
        const qty = parseFloat(quantityBaseUnits);
        if (isNaN(qty) || qty <= 0) {
            throw new ValidationError('Adjustment quantity must be a positive number');
        }

        if (adjustmentType !== 'INCREASE' && adjustmentType !== 'DECREASE') {
            throw new ValidationError("Adjustment type must be either 'INCREASE' or 'DECREASE'");
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            throw new ValidationError('A non-empty reason is required for stock adjustments');
        }

        if (!approvedBy) {
            throw new ValidationError('Approved by user ID is required');
        }

        return this.withTransaction(poolOrClient, async (client) => {
            // 1. Lock stock item
            const itemRes = await client.query(`
                SELECT id, current_balance_base_units, reserved_quantity_base_units, average_unit_cost_paise
                FROM stock_items
                WHERE id = $1 AND outlet_id = $2
                FOR UPDATE
            `, [stockItemId, outletId]);

            if (itemRes.rows.length === 0) {
                throw new StockItemNotFoundError(stockItemId);
            }

            const item = itemRes.rows[0];
            const currentBal = parseFloat(item.current_balance_base_units);
            const currentReserved = parseFloat(item.reserved_quantity_base_units);
            const available = currentBal - currentReserved;

            let delta = qty;
            let newBalance = currentBal + qty;
            const ledgerEntryType = adjustmentType === 'INCREASE' ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE';

            if (adjustmentType === 'DECREASE') {
                if (available < qty) {
                    throw new InsufficientStockError(
                        stockItemId,
                        qty.toFixed(4),
                        available.toFixed(4),
                        `Cannot decrease stock: adjustment quantity exceeds unreserved available stock (${available.toFixed(4)})`
                    );
                }
                delta = -qty;
                newBalance = currentBal - qty;
            }

            // 2. Create stock_adjustments record
            const adjRes = await client.query(`
                INSERT INTO stock_adjustments (
                    outlet_id, stock_item_id, adjustment_type, quantity_base_units, reason, approved_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, adjustment_type, quantity_base_units, reason, created_at
            `, [outletId, stockItemId, adjustmentType, qty, reason.trim(), approvedBy]);

            const adjustment = adjRes.rows[0];

            // 3. Update stock_items balance
            await client.query(`
                UPDATE stock_items
                SET current_balance_base_units = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [newBalance, stockItemId]);

            // 4. Append to immutable stock_ledger
            const ledgerRes = await client.query(`
                INSERT INTO stock_ledger (
                    outlet_id, stock_item_id, entry_type,
                    quantity_delta_base_units, unit_cost_paise, running_balance_base_units,
                    reference_type, reference_id, reason, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, 'STOCK_ADJUSTMENT', $7, $8, $9)
                RETURNING id, entry_type, quantity_delta_base_units, running_balance_base_units, created_at
            `, [
                outletId,
                stockItemId,
                ledgerEntryType,
                delta,
                item.average_unit_cost_paise,
                newBalance,
                adjustment.id,
                reason.trim(),
                approvedBy
            ]);

            return {
                adjustment,
                ledgerEntry: ledgerRes.rows[0],
                stockItem: {
                    id: stockItemId,
                    onHandBalance: newBalance,
                    reservedQuantity: currentReserved,
                    availableStock: newBalance - currentReserved
                }
            };
        });
    }

    /**
     * Query Live Balance & Ledger Audit
     */
    static async getStockBalance(poolOrClient, { outletId, stockItemId }) {
        const res = await poolOrClient.query(`
            SELECT si.id, si.outlet_id, si.ingredient_id,
                   i.code as ingredient_code, i.name as ingredient_name,
                   si.current_balance_base_units, si.reserved_quantity_base_units,
                   (si.current_balance_base_units - si.reserved_quantity_base_units) as available_base_units,
                   si.average_unit_cost_paise
            FROM stock_items si
            JOIN ingredients i ON si.ingredient_id = i.id
            WHERE si.id = $1 AND si.outlet_id = $2
        `, [stockItemId, outletId]);

        if (res.rows.length === 0) {
            throw new StockItemNotFoundError(stockItemId);
        }

        const row = res.rows[0];
        return {
            id: row.id,
            ingredientCode: row.ingredient_code,
            ingredientName: row.ingredient_name,
            onHandBalance: parseFloat(row.current_balance_base_units),
            reservedQuantity: parseFloat(row.reserved_quantity_base_units),
            availableStock: parseFloat(row.available_base_units),
            averageUnitCostPaise: parseInt(row.average_unit_cost_paise, 10)
        };
    }
}
