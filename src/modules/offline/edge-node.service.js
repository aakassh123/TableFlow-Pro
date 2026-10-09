// Edge Node Service - Offline-First Local Engine
// Governs Edge Node capabilities, local POS/KDS workflows, token generation, thermal printing, and local inventory deduction
import crypto from 'crypto';
import { EdgeEventLog } from './edge-event-log.js';
import { EdgeSyncService } from './edge-sync.service.js';
import { ConflictQueueService, CONFLICT_RESOLUTION_STRATEGIES } from './conflict-queue.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AppError, ValidationError } from '../../shared/errors.js';

export const CAPABILITIES = {
    // Offline-Capable
    POS: 'POS',
    KDS: 'KDS',
    TOKEN_GENERATION: 'TOKEN_GENERATION',
    PRINTING: 'PRINTING',
    WALK_IN_ORDERS: 'WALK_IN_ORDERS',
    DINE_IN_ORDERS: 'DINE_IN_ORDERS',
    INVENTORY_DEDUCTION: 'INVENTORY_DEDUCTION',

    // Online-Only
    ONLINE_CUSTOMER_ORDERING: 'ONLINE_CUSTOMER_ORDERING',
    WHATSAPP_NOTIFICATIONS: 'WHATSAPP_NOTIFICATIONS',
    EXTERNAL_PAYMENT_CONFIRMATION: 'EXTERNAL_PAYMENT_CONFIRMATION',
    CLOUD_REPORTS: 'CLOUD_REPORTS'
};

const OFFLINE_ALLOWED = new Set([
    CAPABILITIES.POS,
    CAPABILITIES.KDS,
    CAPABILITIES.TOKEN_GENERATION,
    CAPABILITIES.PRINTING,
    CAPABILITIES.WALK_IN_ORDERS,
    CAPABILITIES.DINE_IN_ORDERS,
    CAPABILITIES.INVENTORY_DEDUCTION
]);

const ONLINE_ONLY = new Set([
    CAPABILITIES.ONLINE_CUSTOMER_ORDERING,
    CAPABILITIES.WHATSAPP_NOTIFICATIONS,
    CAPABILITIES.EXTERNAL_PAYMENT_CONFIRMATION,
    CAPABILITIES.CLOUD_REPORTS
]);

export class EdgeNodeService {
    /**
     * Get Edge Node status and sync health
     */
    static async getNodeState(db, outletId = '33333333-3333-3333-3333-333333333301') {
        try {
            const res = await db.query(`
                SELECT outlet_id, node_id, connectivity_state, last_synced_sequence,
                       last_sync_attempt_at, last_successful_sync_at, pending_events_count,
                       unresolved_conflicts_count, updated_at
                FROM edge_node_state
                WHERE outlet_id = $1
            `, [outletId]);

            if (res.rows.length === 0) {
                // Initialize if absent
                const init = await db.query(`
                    INSERT INTO edge_node_state (
                        outlet_id, node_id, connectivity_state, last_synced_sequence
                    ) VALUES ($1, 'EDGE-BLR-IND-NODE-01', 'ONLINE', 0)
                    RETURNING *
                `, [outletId]);
                return init.rows[0];
            }

            // Count live pending events
            const pendingCountRes = await db.query(`
                SELECT COUNT(*) as count FROM edge_event_log WHERE outlet_id = $1 AND sync_status = 'PENDING'
            `, [outletId]);

            const conflictCountRes = await db.query(`
                SELECT COUNT(*) as count FROM sync_conflicts WHERE outlet_id = $1 AND resolution_status = 'PENDING_REVIEW'
            `, [outletId]);

            const row = res.rows[0];
            row.pending_events_count = parseInt(pendingCountRes.rows[0].count, 10);
            row.unresolved_conflicts_count = parseInt(conflictCountRes.rows[0].count, 10);

            return row;
        } catch (err) {
            // Graceful fallback if edge_node_state migration is not loaded in standalone mode
            return {
                outlet_id: outletId,
                node_id: 'EDGE-DEFAULT-NODE',
                connectivity_state: 'ONLINE',
                pending_events_count: 0,
                unresolved_conflicts_count: 0
            };
        }
    }

    /**
     * Set connectivity state ('ONLINE' or 'OFFLINE' or 'SYNCING')
     */
    static async setConnectivityState(db, { outletId = '33333333-3333-3333-3333-333333333301', connectivityState }) {
        if (!['ONLINE', 'OFFLINE', 'SYNCING'].includes(connectivityState)) {
            throw new ValidationError(`Invalid connectivity state: ${connectivityState}. Must be ONLINE, OFFLINE, or SYNCING`);
        }

        const res = await db.query(`
            UPDATE edge_node_state
            SET connectivity_state = $1, updated_at = CURRENT_TIMESTAMP
            WHERE outlet_id = $2
            RETURNING *
        `, [connectivityState, outletId]);

        return res.rows[0];
    }

    /**
     * Assert if a capability is available in current connectivity state
     */
    static async assertCapability(db, { outletId = '33333333-3333-3333-3333-333333333301', capability }) {
        const state = await this.getNodeState(db, outletId);

        if (state.connectivity_state === 'OFFLINE') {
            if (ONLINE_ONLY.has(capability)) {
                throw new AppError(
                    `Capability '${capability}' is strictly unavailable in OFFLINE mode. Kitchen operations and local POS continue.`,
                    503,
                    'OFFLINE_CAPABILITY_UNAVAILABLE'
                );
            }
        }

        return true;
    }

    /**
     * Check capability query helper
     */
    static isCapabilityAllowed(connectivityState, capability) {
        if (connectivityState === 'OFFLINE') {
            return OFFLINE_ALLOWED.has(capability);
        }
        return true;
    }

    /**
     * Create an offline order (Walk-In or Dine-In)
     * Deducts local stock, assigns local token, generates station KDS tickets,
     * formats receipt, and logs to append-only edge_event_log.
     */
    static async createOfflineOrder(db, {
        outletId = '33333333-3333-3333-3333-333333333301',
        channel = 'WALK_IN', // 'WALK_IN' or 'DINE_IN'
        tableId = null,
        guestCount = 1,
        items = [],
        notes = null,
        idempotencyKey = null,
        userId = '66666666-6666-6666-6666-666666666603' // Default cashier
    }) {
        if (!['WALK_IN', 'DINE_IN'].includes(channel)) {
            // Check capability: online orders are blocked offline
            await this.assertCapability(db, { outletId, capability: CAPABILITIES.ONLINE_CUSTOMER_ORDERING });
        }

        if (!items || items.length === 0) {
            throw new ValidationError('Offline order requires at least one item');
        }

        const orderId = crypto.randomUUID();
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        
        // 1. Generate local monotonic token
        const tokenRes = await db.query(`
            SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
            FROM edge_event_log
            WHERE outlet_id = $1
        `, [outletId]);
        const seq = parseInt(tokenRes.rows[0].next_seq, 10);
        const tokenNumber = `TK-${(700 + (seq % 100)).toString().padStart(3, '0')}`;
        const orderNumber = `ORD-OFF-${dateStr}-${seq.toString().padStart(4, '0')}`;

        // 2. Calculate item totals and check/deduct inventory locally
        let subtotalPaise = 0;
        const processedItems = [];

        for (const it of items) {
            const menuRes = await db.query(`
                SELECT id, name, base_price_paise FROM menu_items WHERE id = $1
            `, [it.menuItemId]);

            if (menuRes.rows.length === 0) {
                throw new ValidationError(`Menu item ${it.menuItemId} not found`);
            }
            const menuItem = menuRes.rows[0];
            const qty = parseInt(it.quantity, 10) || 1;
            const price = menuItem.base_price_paise;
            const itemTotal = price * qty;
            subtotalPaise += itemTotal;

            processedItems.push({
                menuItemId: menuItem.id,
                name: menuItem.name,
                quantity: qty,
                unitPricePaise: price,
                totalPricePaise: itemTotal
            });
        }

        const taxPaise = Math.round(subtotalPaise * 0.05);
        const totalPaise = subtotalPaise + taxPaise;

        // 2. Insert local order header first so foreign keys reference a valid order
        const orderInsert = await db.query(`
            INSERT INTO orders (
                id, outlet_id, order_number, table_id, customer_id, channel,
                status, subtotal_paise, discount_paise, tax_paise, total_paise,
                round_off_paise, guest_count, notes, idempotency_key, created_at
            ) VALUES ($1, $2, $3, $4, NULL, $5, 'PLACED', $6, 0, $7, $8, 0, $9, $10, $11, CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            orderId, outletId, orderNumber, tableId, channel,
            subtotalPaise, taxPaise, totalPaise, guestCount, notes, idempotencyKey
        ]);

        const order = orderInsert.rows[0];

        // 3. Local Recipe-Based Inventory Deduction & Consumption
        for (const it of processedItems) {
            const recipeRes = await db.query(`
                SELECT 
                    ri.ingredient_id,
                    ri.quantity_base_units,
                    ing.name as stock_name,
                    si.id as stock_item_id,
                    si.current_balance_base_units
                FROM recipes r
                JOIN recipe_versions rv ON rv.recipe_id = r.id AND rv.status = 'ACTIVE'
                JOIN recipe_items ri ON ri.recipe_version_id = rv.id
                JOIN ingredients ing ON ing.id = ri.ingredient_id
                LEFT JOIN stock_items si ON si.ingredient_id = ri.ingredient_id AND si.outlet_id = $2
                WHERE r.menu_item_id = $1 AND r.outlet_id = $2
            `, [it.menuItemId, outletId]);

            for (const r of recipeRes.rows) {
                if (!r.stock_item_id) continue;
                const requiredQty = parseFloat(r.quantity_base_units) * it.quantity;

                const reservationResult = await InventoryService.reserveStock(db, {
                    outletId,
                    orderId,
                    stockItemId: r.stock_item_id,
                    quantityBaseUnits: requiredQty,
                    userId
                });

                const resId = reservationResult?.reservation?.id || reservationResult?.reservationId;

                await InventoryService.consumeReservedStock(db, {
                    outletId,
                    reservationId: resId,
                    referenceType: 'ORDER',
                    referenceId: orderId,
                    userId
                });

                // Append event log for stock consumption
                await EdgeEventLog.appendEvent(db, {
                    outletId,
                    eventType: 'EDGE_STOCK_CONSUMED',
                    aggregateType: 'STOCK_ITEM',
                    aggregateId: r.stock_item_id,
                    payload: {
                        orderId,
                        stockItemId: r.stock_item_id,
                        quantityDeltaBaseUnits: -requiredQty,
                        reason: `Recipe deduction for ${it.name}`
                    }
                });
            }
        }

        // 4. Insert order items
        for (const it of processedItems) {
            await db.query(`
                INSERT INTO order_items (
                    id, order_id, menu_item_id, variant_id, quantity,
                    unit_price_paise, total_price_paise, status
                ) VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4, $5, 'PENDING')
            `, [orderId, it.menuItemId, it.quantity, it.unitPricePaise, it.totalPricePaise]);
        }

        // 5. Generate local Kitchen Tickets (Station-based KDS)
        const tickets = [];
        const stationsRes = await db.query(`
            SELECT id, code FROM kitchen_stations WHERE outlet_id = $1 LIMIT 2
        `, [outletId]);

        let kotSeq = 1;
        for (const st of stationsRes.rows) {
            const kotNumber = `KOT-OFFLINE-${Date.now().toString().slice(-4)}-${kotSeq}`;
            const tRes = await db.query(`
                INSERT INTO kitchen_tickets (
                    id, outlet_id, order_id, station_id, kot_number, status, created_at
                ) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'QUEUED', CURRENT_TIMESTAMP)
                RETURNING *
            `, [outletId, orderId, st.id, kotNumber]);
            tickets.push(tRes.rows[0]);
            kotSeq++;
        }

        // 6. Generate ESC/POS Thermal Receipt Payload
        const receipt = this.formatThermalReceipt({
            orderNumber,
            tokenNumber,
            channel,
            tableId,
            items: processedItems,
            subtotalPaise,
            taxPaise,
            totalPaise,
            createdAt: now
        });

        // 7. Append append-only local event log with monotonic sequence
        const event = await EdgeEventLog.appendEvent(db, {
            outletId,
            eventType: 'EDGE_ORDER_CREATED',
            aggregateType: 'ORDER',
            aggregateId: orderId,
            payload: {
                orderNumber,
                tokenNumber,
                channel,
                tableId,
                status: 'PLACED',
                subtotalPaise,
                taxPaise,
                totalPaise,
                items: processedItems,
                guestCount,
                notes
            },
            idempotencyKey
        });

        // 8. Update Edge Node pending count
        await db.query(`
            UPDATE edge_node_state
            SET pending_events_count = pending_events_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE outlet_id = $1
        `, [outletId]);

        return {
            order,
            tokenNumber,
            tickets,
            receipt,
            eventLog: event,
            offline: true
        };
    }

    /**
     * BUMP a local Kitchen Ticket on KDS
     */
    static async bumpKitchenTicket(db, {
        outletId = '33333333-3333-3333-3333-333333333301',
        ticketId
    }) {
        const ticketRes = await db.query(`
            SELECT kt.id, kt.order_id, kt.station_id, ks.code as station_code, kt.status
            FROM kitchen_tickets kt
            LEFT JOIN kitchen_stations ks ON kt.station_id = ks.id
            WHERE kt.id = $1 AND kt.outlet_id = $2
        `, [ticketId, outletId]);

        if (ticketRes.rows.length === 0) {
            throw new AppError(`Kitchen ticket ${ticketId} not found`, 404, 'TICKET_NOT_FOUND');
        }

        const ticket = ticketRes.rows[0];

        // Update ticket to READY
        await db.query(`
            UPDATE kitchen_tickets
            SET status = 'READY', bumped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [ticketId]);

        // Check if all tickets for this order are bumped
        const remaining = await db.query(`
            SELECT COUNT(*) as count
            FROM kitchen_tickets
            WHERE order_id = $1 AND status != 'READY'
        `, [ticket.order_id]);

        let orderReady = false;
        if (parseInt(remaining.rows[0].count, 10) === 0) {
            await db.query(`
                UPDATE orders
                SET status = 'READY', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [ticket.order_id]);
            orderReady = true;
        }

        // Append to edge event log
        const event = await EdgeEventLog.appendEvent(db, {
            outletId,
            eventType: 'EDGE_KDS_BUMP',
            aggregateType: 'TICKET',
            aggregateId: ticketId,
            payload: {
                ticketId,
                orderId: ticket.order_id,
                station: ticket.station_code,
                orderReady
            }
        });

        return {
            success: true,
            ticketId,
            station: ticket.station_code,
            status: 'READY',
            orderReady,
            event
        };
    }

    /**
     * Format ESC/POS Thermal Receipt for offline printing
     */
    static formatThermalReceipt({
        orderNumber,
        tokenNumber,
        channel,
        tableId,
        items,
        subtotalPaise,
        taxPaise,
        totalPaise,
        createdAt = new Date()
    }) {
        const timeStr = new Date(createdAt).toLocaleTimeString('en-IN', { hour12: false });
        const lines = [
            '================================',
            '      FLAGSHIP RESTAURANT       ',
            '   *** OFFLINE OUTLET MODE ***  ',
            '================================',
            `TOKEN : ${tokenNumber}`,
            `ORDER : ${orderNumber}`,
            `TYPE  : ${channel}${tableId ? ` (Table ${tableId})` : ''}`,
            `TIME  : ${timeStr}`,
            '--------------------------------',
        ];

        for (const it of items) {
            const price = (it.totalPricePaise / 100).toFixed(2);
            const line = `${it.quantity}x ${it.name}`;
            const pad = 32 - line.length - price.length - 1;
            lines.push(`${line}${' '.repeat(Math.max(1, pad))}₹${price}`);
        }

        lines.push('--------------------------------');
        lines.push(`SUBTOTAL:                      ₹${(subtotalPaise / 100).toFixed(2)}`);
        lines.push(`GST (5%):                      ₹${(taxPaise / 100).toFixed(2)}`);
        lines.push(`TOTAL:                         ₹${(totalPaise / 100).toFixed(2)}`);
        lines.push('================================');
        lines.push('  KITCHEN DISPATCH CONFIRMED    ');
        lines.push('================================\n');

        return lines.join('\n');
    }
}
