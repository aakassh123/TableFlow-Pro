import { OrderStateMachine, ORDER_CHANNELS, ORDER_STATUSES } from './order-state-machine.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ValidationError, AppError } from '../../shared/errors.js';
import { ETAEngine } from '../eta/eta-engine.js';
import { wsHub, WS_EVENTS } from '../realtime/websocket-hub.js';

export class OrderService {
    /**
     * Helper to run queries inside a transaction
     */
    static async withTransaction(poolOrClient, fn) {
        if (poolOrClient.connect && typeof poolOrClient.connect === 'function') {
            const client = await poolOrClient.connect();
            const memBackup = poolOrClient._pgMemDb ? poolOrClient._pgMemDb.backup() : null;
            try {
                await client.query('BEGIN');
                const result = await fn(client);
                await client.query('COMMIT');
                return result;
            } catch (err) {
                if (memBackup) {
                    memBackup.restore();
                }
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } else {
            return fn(poolOrClient);
        }
    }

    /**
     * Fetch complete order by ID with items, tokens, and reservations
     */
    static async getOrderDetails(client, orderId) {
        const orderRes = await client.query(`
            SELECT id, outlet_id, order_number, table_id, customer_id, channel,
                   status, subtotal_paise, discount_paise, tax_paise, total_paise,
                   round_off_paise, guest_count, notes, idempotency_key, created_at, updated_at
            FROM orders
            WHERE id = $1
        `, [orderId]);

        if (orderRes.rows.length === 0) return null;
        const order = orderRes.rows[0];

        const itemsRes = await client.query(`
            SELECT id, menu_item_id, variant_id, recipe_version_id, quantity,
                   unit_price_paise, total_price_paise, status
            FROM order_items
            WHERE order_id = $1
        `, [orderId]);

        const tokensRes = await client.query(`
            SELECT id, token_number, token_type, status, issued_at
            FROM tokens
            WHERE order_id = $1
        `, [orderId]);

        const reservationsRes = await client.query(`
            SELECT id, stock_item_id, quantity_reserved_base_units, status, expires_at
            FROM stock_reservations
            WHERE order_id = $1
        `, [orderId]);

        return {
            ...order,
            items: itemsRes.rows,
            token: tokensRes.rows[0] || null,
            reservations: reservationsRes.rows
        };
    }

    /**
     * 1. CREATE ORDER
     * Single Transaction containing:
     * - Idempotency validation
     * - Order creation
     * - Order item creation
     * - Recipe snapshot (BOM version freeze)
     * - Stock reservation
     * - Token allocation
     * - Outbox event creation
     * Either EVERYTHING succeeds or EVERYTHING rolls back.
     * No external API calls inside this transaction.
     */
    static async createOrder(poolOrClient, {
        outletId,
        channel = ORDER_CHANNELS.DINE_IN,
        tableId = null,
        customerId = null,
        guestCount = 1,
        items = [],
        idempotencyKey = null,
        notes = null,
        createdBy = null,
        paymentRequiredUpfront = false,
        distanceKm = 0,
        discountPaise = 0
    }) {
        if (!outletId) throw new ValidationError('Outlet ID is required');
        if (!items || items.length === 0) throw new ValidationError('Order must contain at least one item');
        if (!Object.values(ORDER_CHANNELS).includes(channel)) {
            throw new ValidationError(`Invalid order channel: ${channel}`);
        }

        // 1. IDEMPOTENCY CHECK:
        // A repeated request must return the original order instead of creating another order!
        if (idempotencyKey) {
            const existingOrderRes = await poolOrClient.query(`
                SELECT id FROM orders WHERE outlet_id = $1 AND idempotency_key = $2
            `, [outletId, idempotencyKey]);

            if (existingOrderRes.rows.length > 0) {
                const existingOrder = await this.getOrderDetails(poolOrClient, existingOrderRes.rows[0].id);
                return {
                    isIdempotentReplay: true,
                    order: existingOrder
                };
            }
        }

        return this.withTransaction(poolOrClient, async (client) => {
            // Re-verify idempotency within active transaction to prevent race conditions
            if (idempotencyKey) {
                const existingInTrx = await client.query(`
                    SELECT id FROM orders WHERE outlet_id = $1 AND idempotency_key = $2 FOR UPDATE
                `, [outletId, idempotencyKey]);

                if (existingInTrx.rows.length > 0) {
                    const existingOrder = await this.getOrderDetails(client, existingInTrx.rows[0].id);
                    return { isIdempotentReplay: true, order: existingOrder };
                }
            }

            // 2. RECIPE SNAPSHOT & PRICING PREPARATION
            let subtotalPaise = 0;
            let totalTaxPaise = 0;
            const preparedItems = [];

            for (const item of items) {
                const menuItemRes = await client.query(`
                    SELECT id, code, name, base_price_paise, gst_rate_percentage, is_active, is_available
                    FROM menu_items
                    WHERE id = $1 AND outlet_id = $2
                `, [item.menuItemId, outletId]);

                if (menuItemRes.rows.length === 0) {
                    throw new ValidationError(`Menu item ${item.menuItemId} not found`);
                }

                const menuItem = menuItemRes.rows[0];
                if (!menuItem.is_active || !menuItem.is_available) {
                    throw new ValidationError(`Menu item '${menuItem.name}' is currently unavailable (86-list)`);
                }

                let unitPricePaise = parseInt(menuItem.base_price_paise, 10);

                // Check variant if provided
                if (item.variantId) {
                    const variantRes = await client.query(`
                        SELECT id, name, price_paise, is_active
                        FROM menu_item_variants
                        WHERE id = $1 AND menu_item_id = $2
                    `, [item.variantId, item.menuItemId]);

                    if (variantRes.rows.length > 0) {
                        unitPricePaise = parseInt(variantRes.rows[0].price_paise, 10);
                    }
                }

                const qty = parseInt(item.quantity, 10);
                if (isNaN(qty) || qty <= 0) {
                    throw new ValidationError(`Invalid quantity for item ${menuItem.name}`);
                }

                const itemTotalPaise = unitPricePaise * qty;
                const gstRate = parseFloat(menuItem.gst_rate_percentage) || 5.0;
                const itemTaxPaise = Math.round((itemTotalPaise * gstRate) / 100);

                subtotalPaise += itemTotalPaise;
                totalTaxPaise += itemTaxPaise;

                // Recipe BOM Freeze: Find active recipe version
                const recipeRes = await client.query(`
                    SELECT r.id as recipe_id, rv.id as recipe_version_id
                    FROM recipes r
                    JOIN recipe_versions rv ON r.id = rv.recipe_id
                    WHERE r.menu_item_id = $1 
                      AND (r.variant_id = $2 OR r.variant_id IS NULL)
                      AND rv.status = 'ACTIVE'
                    ORDER BY r.variant_id NULLS LAST
                    LIMIT 1
                `, [item.menuItemId, item.variantId || null]);

                const recipeVersionId = recipeRes.rows.length > 0 ? recipeRes.rows[0].recipe_version_id : null;

                // Ingredients lookup for reservation
                let ingredientsToReserve = [];
                if (recipeVersionId) {
                    const ingRes = await client.query(`
                        SELECT ri.ingredient_id, ri.quantity_base_units, ri.wastage_percentage,
                               si.id as stock_item_id
                        FROM recipe_items ri
                        JOIN stock_items si ON ri.ingredient_id = si.ingredient_id AND si.outlet_id = $1
                        WHERE ri.recipe_version_id = $2
                    `, [outletId, recipeVersionId]);

                    ingredientsToReserve = ingRes.rows.map(ing => {
                        const baseQty = parseFloat(ing.quantity_base_units);
                        const wastage = parseFloat(ing.wastage_percentage) || 0;
                        const grossPerDish = baseQty / (1 - (wastage / 100));
                        return {
                            stockItemId: ing.stock_item_id,
                            grossQuantity: grossPerDish * qty
                        };
                    });
                }

                preparedItems.push({
                    menuItemId: item.menuItemId,
                    variantId: item.variantId || null,
                    recipeVersionId,
                    quantity: qty,
                    unitPricePaise,
                    totalPricePaise: itemTotalPaise,
                    ingredientsToReserve
                });
            }

            const discount = Math.max(0, parseInt(discountPaise, 10) || 0);
            const rawTotal = Math.max(0, (subtotalPaise - discount) + totalTaxPaise);
            const roundOffPaise = 0; // standard integer paise
            const totalPaise = rawTotal + roundOffPaise;

            // Initial status
            const initialStatus = paymentRequiredUpfront
                ? ORDER_STATUSES.PENDING_PAYMENT
                : ORDER_STATUSES.PLACED;

            // Generate sequence order number
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const seqRes = await client.query(`
                SELECT COUNT(*) + 1 as next_val 
                FROM orders 
                WHERE outlet_id = $1 
                  AND created_at >= $2
            `, [outletId, startOfDay]);
            const seqNum = String(seqRes.rows[0].next_val).padStart(4, '0');
            const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const orderNumber = `ORD-${todayStr}-${seqNum}`;

            // 3. INSERT ORDER HEADER
            const orderRes = await client.query(`
                INSERT INTO orders (
                    outlet_id, order_number, table_id, customer_id, channel,
                    status, subtotal_paise, discount_paise, tax_paise, total_paise,
                    round_off_paise, guest_count, notes, idempotency_key, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id, outlet_id, order_number, table_id, customer_id, channel,
                          status, subtotal_paise, discount_paise, tax_paise, total_paise, created_at
            `, [
                outletId, orderNumber, tableId, customerId, channel,
                initialStatus, subtotalPaise, discount, totalTaxPaise, totalPaise,
                roundOffPaise, guestCount, notes, idempotencyKey, createdBy
            ]);

            const order = orderRes.rows[0];

            // 4. INSERT ORDER ITEMS & MODIFIERS
            const createdItems = [];
            for (const pi of preparedItems) {
                const itemRes = await client.query(`
                    INSERT INTO order_items (
                        order_id, menu_item_id, variant_id, recipe_version_id,
                        quantity, unit_price_paise, total_price_paise, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
                    RETURNING id, menu_item_id, variant_id, recipe_version_id, quantity, unit_price_paise, total_price_paise
                `, [
                    order.id, pi.menuItemId, pi.variantId, pi.recipeVersionId,
                    pi.quantity, pi.unitPricePaise, pi.totalPricePaise
                ]);

                const createdItem = itemRes.rows[0];
                createdItems.push(createdItem);

                // 5. ATOMIC STOCK RESERVATION
                for (const ing of pi.ingredientsToReserve) {
                    await InventoryService.reserveStock(client, {
                        outletId,
                        orderId: order.id,
                        orderItemId: createdItem.id,
                        stockItemId: ing.stockItemId,
                        quantityBaseUnits: ing.grossQuantity
                    });
                }
            }

            // 6. TOKEN ALLOCATION
            const tokenType = (channel === ORDER_CHANNELS.WALK_IN || channel === ORDER_CHANNELS.WEBSITE || channel === ORDER_CHANNELS.WHATSAPP)
                ? 'TAKEAWAY'
                : (channel === ORDER_CHANNELS.DELIVERY)
                ? 'DELIVERY'
                : 'TAKEAWAY';

            const tokenSeqRes = await client.query(`
                SELECT COALESCE(MAX(token_number), 0) + 1 as next_token
                FROM tokens
                WHERE outlet_id = $1 AND created_at >= $2
            `, [outletId, startOfDay]);

            const tokenNum = parseInt(tokenSeqRes.rows[0].next_token, 10);
            const tokenRes = await client.query(`
                INSERT INTO tokens (
                    outlet_id, order_id, token_number, token_type, status
                ) VALUES ($1, $2, $3, $4, 'ISSUED')
                RETURNING id, token_number, token_type, status, issued_at
            `, [outletId, order.id, tokenNum, tokenType]);

            const token = tokenRes.rows[0];

            // 7. TRANSACTIONAL OUTBOX EVENT CREATION
            const outboxPayload = {
                orderId: order.id,
                orderNumber: order.order_number,
                outletId: order.outlet_id,
                channel: order.channel,
                status: order.status,
                totalPaise: order.total_paise,
                itemsCount: createdItems.length
            };

            await client.query(`
                INSERT INTO outbox_events (
                    outlet_id, event_type, aggregate_type, aggregate_id, payload, status
                ) VALUES ($1, 'ORDER_CREATED', 'ORDER', $2, $3, 'PENDING')
            `, [outletId, order.id, JSON.stringify(outboxPayload)]);

            if (idempotencyKey) {
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await client.query(`
                    INSERT INTO idempotency_keys (
                        outlet_id, key, request_path, request_hash, response_code, response_body, status, expires_at
                    ) VALUES ($1, $2, '/api/orders', $3, 201, $4, 'COMPLETED', $5)
                    ON CONFLICT (outlet_id, key) DO UPDATE
                    SET status = 'COMPLETED', response_body = EXCLUDED.response_body, updated_at = CURRENT_TIMESTAMP
                `, [
                    outletId,
                    idempotencyKey,
                    order.id,
                    JSON.stringify({ orderId: order.id, orderNumber: order.order_number }),
                    expiresAt
                ]);
            }

            // Compute deterministic ETA range with distance and JIT scheduling
            let calculatedEta = null;
            try {
                calculatedEta = await ETAEngine.computeOrderETA(client, {
                    orderId: order.id,
                    outletId,
                    rushLevel: 1.0,
                    distanceKm: parseFloat(distanceKm) || 0
                });
            } catch (etaErr) {
                // Non-fatal if items not yet linked to stations in minimal test harness
            }

            const promiseDisplay = calculatedEta?.promiseRange?.rangeDisplay || '25–30 minutes';
            const distanceAnalysis = calculatedEta?.distanceAnalysis || null;

            // Realtime WebSocket broadcast
            wsHub.emitOrderEvent(WS_EVENTS.ORDER_CREATED, {
                orderId: order.id,
                orderNumber: order.order_number,
                channel: order.channel,
                status: order.status,
                totalPaise: order.total_paise,
                promiseDisplay,
                promiseRange: calculatedEta?.promiseRange || null,
                distanceKm: parseFloat(distanceKm) || 0,
                distanceAnalysis
            });

            wsHub.emitTokenEvent(WS_EVENTS.TOKEN_CREATED, {
                tokenId: token.id,
                tokenNumber: token.token_number,
                orderId: order.id,
                tokenType: token.token_type,
                status: token.status,
                distanceKm: parseFloat(distanceKm) || 0,
                promiseDisplay,
                distanceAnalysis
            });

            return {
                isIdempotentReplay: false,
                order: {
                    ...order,
                    promiseDisplay,
                    promiseRange: calculatedEta?.promiseRange || null,
                    distance_km: parseFloat(distanceKm) || 0,
                    distanceAnalysis,
                    items: createdItems,
                    token
                }
            };
        });
    }

    /**
     * Helper for state machine transitions
     */
    static async transitionOrderStatus(poolOrClient, {
        outletId,
        orderId,
        targetStatus,
        userId = null,
        notes = null,
        extraActions = null
    }) {
        return this.withTransaction(poolOrClient, async (client) => {
            // Lock order row
            const orderRes = await client.query(`
                SELECT id, outlet_id, order_number, channel, status
                FROM orders
                WHERE id = $1 AND outlet_id = $2
                FOR UPDATE
            `, [orderId, outletId]);

            if (orderRes.rows.length === 0) {
                throw new ValidationError(`Order ${orderId} not found`);
            }

            const order = orderRes.rows[0];

            // Enforce Strict State Machine Transition
            OrderStateMachine.validateTransition(order.status, targetStatus, order.channel, order.id);

            // Execute custom transition hooks (e.g. consuming or releasing inventory)
            if (extraActions) {
                await extraActions(client, order);
            }

            // Update status
            await client.query(`
                UPDATE orders
                SET status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [targetStatus, orderId]);

            // Append to order_status_history
            await client.query(`
                INSERT INTO order_status_history (order_id, status, notes, changed_by)
                VALUES ($1, $2, $3, $4)
            `, [orderId, targetStatus, notes || `Transitioned to ${targetStatus}`, userId]);

            // Append to outbox_events
            await client.query(`
                INSERT INTO outbox_events (
                    outlet_id, event_type, aggregate_type, aggregate_id, payload, status
                ) VALUES ($1, $2, 'ORDER', $3, $4, 'PENDING')
            `, [
                outletId,
                `ORDER_${targetStatus}`,
                orderId,
                JSON.stringify({ orderId, orderNumber: order.order_number, previousStatus: order.status, status: targetStatus, userId })
            ]);

            // Record actual timestamps for deterministic ETA calibration
            try {
                if (targetStatus === ORDER_STATUSES.ACCEPTED) {
                    await ETAEngine.recordOrderAccepted(client, orderId);
                } else if (targetStatus === ORDER_STATUSES.PREPARING) {
                    await ETAEngine.recordOrderStarted(client, orderId);
                } else if (targetStatus === ORDER_STATUSES.READY) {
                    await ETAEngine.recordOrderReady(client, orderId);
                }
            } catch (etaErr) {
                // Non-fatal actuals recording failure
            }

            // Realtime WebSocket broadcast
            try {
                if (targetStatus === ORDER_STATUSES.ACCEPTED) {
                    wsHub.emitOrderEvent(WS_EVENTS.ORDER_ACCEPTED, { orderId, orderNumber: order.order_number, channel: order.channel, status: targetStatus });
                } else if (targetStatus === ORDER_STATUSES.PREPARING) {
                    wsHub.emitOrderEvent(WS_EVENTS.ORDER_PREPARING, { orderId, orderNumber: order.order_number, channel: order.channel, status: targetStatus });
                } else if (targetStatus === ORDER_STATUSES.READY) {
                    wsHub.emitOrderEvent(WS_EVENTS.ORDER_READY, { orderId, orderNumber: order.order_number, channel: order.channel, status: targetStatus });
                    wsHub.emitTokenEvent(WS_EVENTS.TOKEN_CALLED, { orderId, orderNumber: order.order_number, channel: order.channel, status: 'READY' });
                } else if (targetStatus === ORDER_STATUSES.SERVED || targetStatus === ORDER_STATUSES.COLLECTED || targetStatus === ORDER_STATUSES.DELIVERED) {
                    wsHub.emitOrderEvent(WS_EVENTS.ORDER_DELIVERED, { orderId, orderNumber: order.order_number, channel: order.channel, status: targetStatus });
                } else if (targetStatus === ORDER_STATUSES.CANCELLED || targetStatus === ORDER_STATUSES.CANCELLED_WITH_WASTE || targetStatus === ORDER_STATUSES.REJECTED) {
                    wsHub.emitOrderEvent(WS_EVENTS.ORDER_CANCELLED, { orderId, orderNumber: order.order_number, channel: order.channel, status: targetStatus, reason: notes });
                }
            } catch (wsErr) {
                // Non-fatal broadcast failure
            }

            return {
                orderId,
                orderNumber: order.order_number,
                previousStatus: order.status,
                status: targetStatus
            };
        });
    }

    /**
     * 2. ACCEPT ORDER (PLACED -> ACCEPTED)
     */
    static async acceptOrder(poolOrClient, { outletId, orderId, userId = null, notes = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.ACCEPTED,
            userId,
            notes
        });
    }

    /**
     * 3. REJECT ORDER (PLACED -> REJECTED)
     * Rejection releases all held inventory reservations
     */
    static async rejectOrder(poolOrClient, { outletId, orderId, reason = 'REJECTED_BY_KITCHEN', userId = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.REJECTED,
            userId,
            notes: reason,
            extraActions: async (client, order) => {
                // Release all active stock reservations
                const resList = await client.query(`
                    SELECT id FROM stock_reservations
                    WHERE order_id = $1 AND status = 'PENDING'
                `, [order.id]);

                for (const r of resList.rows) {
                    await InventoryService.releaseReservation(client, {
                        outletId,
                        reservationId: r.id,
                        reason: `Order rejected: ${reason}`,
                        userId
                    });
                }
            }
        });
    }

    /**
     * 4. START PREPARING (ACCEPTED -> PREPARING)
     */
    static async startPreparing(poolOrClient, { outletId, orderId, userId = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.PREPARING,
            userId
        });
    }

    /**
     * 5. MARK READY (PREPARING -> READY)
     */
    static async markReady(poolOrClient, { outletId, orderId, userId = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.READY,
            userId
        });
    }

    /**
     * 6. SERVE ORDER (READY -> SERVED)
     * Valid for DINE_IN and QR channels.
     * Consumes all reserved stock into actual consumption.
     */
    static async serveOrder(poolOrClient, { outletId, orderId, userId = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.SERVED,
            userId,
            extraActions: async (client, order) => {
                const resList = await client.query(`
                    SELECT id FROM stock_reservations
                    WHERE order_id = $1 AND status = 'PENDING'
                `, [order.id]);

                for (const r of resList.rows) {
                    await InventoryService.consumeReservedStock(client, {
                        outletId,
                        reservationId: r.id,
                        referenceType: 'ORDER',
                        referenceId: order.id,
                        userId
                    });
                }
            }
        });
    }

    /**
     * 7. COLLECT ORDER (READY -> COLLECTED)
     * Valid for WALK_IN, WEBSITE, WHATSAPP channels.
     * Consumes stock reservations and updates token status.
     */
    static async collectOrder(poolOrClient, { outletId, orderId, userId = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.COLLECTED,
            userId,
            extraActions: async (client, order) => {
                // Consume stock
                const resList = await client.query(`
                    SELECT id FROM stock_reservations
                    WHERE order_id = $1 AND status = 'PENDING'
                `, [order.id]);

                for (const r of resList.rows) {
                    await InventoryService.consumeReservedStock(client, {
                        outletId,
                        reservationId: r.id,
                        referenceType: 'ORDER',
                        referenceId: order.id,
                        userId
                    });
                }

                // Update token to COLLECTED
                await client.query(`
                    UPDATE tokens
                    SET status = 'COLLECTED', collected_at = CURRENT_TIMESTAMP
                    WHERE order_id = $1
                `, [order.id]);
            }
        });
    }

    /**
     * 8. HAND TO RIDER (READY -> HANDED_TO_RIDER)
     * Valid for DELIVERY channel.
     */
    static async handToRider(poolOrClient, { outletId, orderId, riderId = null, userId = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.HANDED_TO_RIDER,
            userId,
            notes: riderId ? `Handed to rider ${riderId}` : 'Handed to delivery rider'
        });
    }

    /**
     * 9. DELIVER ORDER (HANDED_TO_RIDER -> DELIVERED)
     * Valid for DELIVERY channel. Consumes reserved stock.
     */
    static async deliverOrder(poolOrClient, { outletId, orderId, userId = null }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.DELIVERED,
            userId,
            extraActions: async (client, order) => {
                const resList = await client.query(`
                    SELECT id FROM stock_reservations
                    WHERE order_id = $1 AND status = 'PENDING'
                `, [order.id]);

                for (const r of resList.rows) {
                    await InventoryService.consumeReservedStock(client, {
                        outletId,
                        reservationId: r.id,
                        referenceType: 'DELIVERY_FULFILLED',
                        referenceId: order.id,
                        userId
                    });
                }
            }
        });
    }

    /**
     * 10. CANCEL ORDER
     * If cooking has not started (PLACED or ACCEPTED):
     *   -> CANCELLED (releases inventory hold)
     * If cooking has started or completed (PREPARING, READY, HANDED_TO_RIDER):
     *   -> CANCELLED_WITH_WASTE (consumes stock and logs food waste entries)
     */
    static async cancelOrder(poolOrClient, {
        outletId,
        orderId,
        reason = 'CUSTOMER_CANCELLED',
        hasCookingStarted = false,
        userId = null
    }) {
        return this.withTransaction(poolOrClient, async (client) => {
            const orderRes = await client.query(`
                SELECT id, status, channel FROM orders WHERE id = $1 AND outlet_id = $2 FOR UPDATE
            `, [orderId, outletId]);

            if (orderRes.rows.length === 0) throw new ValidationError(`Order ${orderId} not found`);
            const order = orderRes.rows[0];

            const cookingStates = [
                ORDER_STATUSES.PREPARING,
                ORDER_STATUSES.READY,
                ORDER_STATUSES.HANDED_TO_RIDER
            ];

            const isWasteCancellation = hasCookingStarted || cookingStates.includes(order.status);
            const targetStatus = isWasteCancellation
                ? ORDER_STATUSES.CANCELLED_WITH_WASTE
                : ORDER_STATUSES.CANCELLED;

            return this.transitionOrderStatus(client, {
                outletId,
                orderId,
                targetStatus,
                userId,
                notes: reason,
                extraActions: async (cli, ord) => {
                    const resList = await cli.query(`
                        SELECT id, stock_item_id, quantity_reserved_base_units FROM stock_reservations
                        WHERE order_id = $1 AND status = 'PENDING'
                    `, [ord.id]);

                    if (isWasteCancellation) {
                        // Food was cooked/wasted! Consume and log waste
                        for (const r of resList.rows) {
                            await InventoryService.consumeReservedStock(cli, {
                                outletId,
                                reservationId: r.id,
                                referenceType: 'ORDER_WASTE',
                                referenceId: ord.id,
                                userId
                            });

                            await cli.query(`
                                INSERT INTO waste_entries (
                                    outlet_id, stock_item_id, quantity_base_units, reason, recorded_by
                                ) VALUES ($1, $2, $3, $4, $5)
                            `, [
                                outletId,
                                r.stock_item_id,
                                r.quantity_reserved_base_units,
                                `Order ${ord.id} cancelled after cooking: ${reason}`,
                                userId || '01900000-2222-0000-0000-000000000002'
                            ]);
                        }
                    } else {
                        // Food was not cooked: release holds back to inventory
                        for (const r of resList.rows) {
                            await InventoryService.releaseReservation(cli, {
                                outletId,
                                reservationId: r.id,
                                reason: `Order cancelled before cooking: ${reason}`,
                                userId
                            });
                        }
                    }

                    // Cancel associated tokens
                    await cli.query(`
                        UPDATE tokens
                        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
                        WHERE order_id = $1 AND status != 'CANCELLED'
                    `, [ord.id]);
                }
            });
        });
    }

    /**
     * 11. EXPIRE ORDER (PENDING_PAYMENT -> EXPIRED)
     */
    static async expireOrder(poolOrClient, { outletId, orderId, userId = null, reason = 'PAYMENT_EXPIRED' }) {
        return this.transitionOrderStatus(poolOrClient, {
            outletId,
            orderId,
            targetStatus: ORDER_STATUSES.EXPIRED,
            userId,
            notes: reason,
            extraActions: async (client, order) => {
                const resList = await client.query(`
                    SELECT id FROM stock_reservations
                    WHERE order_id = $1 AND status = 'PENDING'
                `, [order.id]);

                for (const r of resList.rows) {
                    await InventoryService.releaseReservation(client, {
                        outletId,
                        reservationId: r.id,
                        reason: `Order expired: ${reason}`,
                        userId
                    });
                }

                await client.query(`
                    UPDATE tokens
                    SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
                    WHERE order_id = $1 AND status != 'CANCELLED'
                `, [order.id]);
            }
        });
    }

    /**
     * 12. DELAY ORDER
     * Extends ETA promise range and broadcasts order.delayed to all channels and customer tracking
     */
    static async delayOrder(poolOrClient, {
        outletId,
        orderId,
        delayMinutes = 10,
        reason = 'Kitchen rush surge'
    }) {
        return this.withTransaction(poolOrClient, async (client) => {
            const orderRes = await client.query(`
                SELECT id, order_number, channel, promise_range_min, promise_range_max
                FROM orders
                WHERE id = $1 AND outlet_id = $2
            `, [orderId, outletId]);

            if (orderRes.rows.length === 0) throw new ValidationError(`Order ${orderId} not found`);
            const ord = orderRes.rows[0];

            const curMin = ord.promise_range_min || 20;
            const curMax = ord.promise_range_max || 25;
            const newMin = curMin + delayMinutes;
            const newMax = curMax + delayMinutes;
            const rangeDisplay = `${newMin}–${newMax} minutes`;

            await client.query(`
                UPDATE orders
                SET promise_range_min = $1,
                    promise_range_max = $2,
                    promise_display = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [newMin, newMax, rangeDisplay, orderId]);

            const payload = {
                orderId,
                orderNumber: ord.order_number,
                channel: ord.channel,
                delayMinutes,
                reason,
                promiseRange: {
                    minMinutes: newMin,
                    maxMinutes: newMax,
                    rangeDisplay
                }
            };

            await client.query(`
                INSERT INTO outbox_events (
                    outlet_id, event_type, aggregate_type, aggregate_id, payload, status
                ) VALUES ($1, 'ORDER_DELAYED', 'ORDER', $2, $3, 'PENDING')
            `, [outletId, orderId, JSON.stringify(payload)]);

            wsHub.emitOrderEvent(WS_EVENTS.ORDER_DELAYED, payload);
            return payload;
        });
    }
}
