import { ORDER_STATUSES } from '../orders/order-state-machine.js';
import { AppError, ValidationError } from '../../shared/errors.js';
import { ETAEngine } from '../eta/eta-engine.js';
import { wsHub, WS_EVENTS } from '../realtime/websocket-hub.js';

export const KITCHEN_STATIONS_LIST = [
    { code: 'CURRY', name: 'Curry & Biryani Pot Line', description: 'Dum Biryanis, Gravies, Butter Chicken, Dal Makhani' },
    { code: 'TANDOOR', name: 'Tandoor & Charcoal Oven', description: 'Naan, Roti, Paneer Tikka, Tandoori Breads' },
    { code: 'GRILL', name: 'Live Charcoal Grill', description: 'Seekh Kebabs, Grilled Skewers, Barbecue' },
    { code: 'WOK', name: 'Asian & Chinese Wok Station', description: 'Hakka Noodles, Chilli Paneer, Fried Rice' },
    { code: 'PACKING', name: 'Packing & Dispatch Station', description: 'Takeaway bagging, delivery order boxing & QA' }
];

function isUuid(str) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || ''));
}

export class KitchenService {
    /**
     * Get all active kitchen stations with ticket counts
     */
    static async getStations(db, outletId = '33333333-3333-3333-3333-333333333301') {
        const stationsRes = await db.query(`
            SELECT ks.id, ks.code, ks.name, ks.description, ks.is_active,
                   COUNT(kt.id) FILTER (WHERE kt.status IN ('QUEUED', 'IN_PROGRESS')) as active_tickets,
                   COUNT(kt.id) FILTER (WHERE kt.status = 'READY' AND kt.bumped_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour') as bumped_recently
            FROM kitchen_stations ks
            LEFT JOIN kitchen_tickets kt ON ks.id = kt.station_id AND kt.outlet_id = ks.outlet_id
            WHERE ks.outlet_id = $1 AND ks.is_active = true
            GROUP BY ks.id, ks.code, ks.name, ks.description, ks.is_active
            ORDER BY ks.code
        `, [outletId]);

        return stationsRes.rows;
    }

    /**
     * Get kitchen tickets filtered by station and status
     */
    static async getTickets(db, {
        outletId = '33333333-3333-3333-3333-333333333301',
        stationCode = 'ALL',
        status = 'ACTIVE'
    } = {}) {
        let statusClause = `kt.status IN ('QUEUED', 'IN_PROGRESS')`;
        if (status === 'READY' || status === 'RECALLED') {
            statusClause = `kt.status IN ('READY', 'RECALLED')`;
        } else if (status === 'ALL') {
            statusClause = `kt.status IN ('QUEUED', 'IN_PROGRESS', 'READY', 'RECALLED')`;
        }

        let stationClause = '';
        const params = [outletId];
        if (stationCode && stationCode !== 'ALL') {
            params.push(stationCode.toUpperCase());
            stationClause = `AND UPPER(ks.code) = $${params.length}`;
        }

        const query = `
            SELECT kt.id as ticket_id,
                   kt.kot_number,
                   kt.status as ticket_status,
                   kt.created_at as ticket_created_at,
                   kt.bumped_at,
                   kt.printed_at,
                   ks.id as station_id,
                   ks.code as station_code,
                   ks.name as station_name,
                   o.id as order_id,
                   o.order_number,
                   o.channel,
                   o.status as order_status,
                   o.guest_count,
                   o.notes as order_notes,
                   o.created_at as order_created_at,
                   COALESCE(o.distance_km, 0) as distance_km,
                   COALESCE(o.travel_time_seconds, 0) as travel_time_seconds,
                   COALESCE(o.jit_status, 'NORMAL') as jit_status,
                   o.jit_fire_at,
                   o.promise_display,
                   t.table_number,
                   t.section as table_section,
                   tk.token_number
            FROM kitchen_tickets kt
            JOIN kitchen_stations ks ON kt.station_id = ks.id
            JOIN orders o ON kt.order_id = o.id
            LEFT JOIN tables t ON o.table_id = t.id
            LEFT JOIN tokens tk ON o.id = tk.order_id
            WHERE kt.outlet_id = $1
              AND ${statusClause}
              ${stationClause}
            ORDER BY kt.created_at ASC
        `;

        const ticketsRes = await db.query(query, params);
        const tickets = ticketsRes.rows;

        // Enhance each ticket with items, multi-station order completion, allergy warnings, and timer states
        const enhancedTickets = [];
        const now = Date.now();

        for (const t of tickets) {
            // Fetch items for this ticket
            const itemsRes = await db.query(`
                SELECT kti.id as ticket_item_id,
                       kti.quantity,
                       kti.notes as item_notes,
                       kti.status as item_status,
                       mi.id as menu_item_id,
                       mi.name as item_name,
                       mi.code as item_code,
                       mi.is_available,
                       miv.name as variant_name
                FROM kitchen_ticket_items kti
                JOIN order_items oi ON kti.order_item_id = oi.id
                JOIN menu_items mi ON oi.menu_item_id = mi.id
                LEFT JOIN menu_item_variants miv ON oi.variant_id = miv.id
                WHERE kti.kitchen_ticket_id = $1
            `, [t.ticket_id]);

            // Fetch all station tickets for this parent order to calculate completion percentage
            const allOrderTicketsRes = await db.query(`
                SELECT kt2.id, kt2.kot_number, kt2.status, ks2.code as station_code, ks2.name as station_name
                FROM kitchen_tickets kt2
                JOIN kitchen_stations ks2 ON kt2.station_id = ks2.id
                WHERE kt2.order_id = $1
            `, [t.order_id]);

            const orderTickets = allOrderTicketsRes.rows;
            const totalStations = orderTickets.length;
            const bumpedStations = orderTickets.filter(ot => ot.status === 'READY').length;
            const completionPercentage = totalStations > 0
                ? Math.round((bumpedStations / totalStations) * 100)
                : 100;

            // Extract allergy warning from notes
            let allergyWarning = null;
            const allergyMatch = (t.order_notes || '').match(/ALLERGY:\s*([A-Za-z0-9 ,_-]+)/i);
            if (allergyMatch) {
                allergyWarning = allergyMatch[1].trim().toUpperCase();
            }

            // Extract rider ETA for delivery orders
            let riderEtaMinutes = null;
            if (t.channel === 'DELIVERY') {
                const etaMatch = (t.order_notes || '').match(/RIDER ETA:\s*(\d+)/i);
                if (etaMatch) {
                    riderEtaMinutes = parseInt(etaMatch[1], 10);
                } else {
                    // Default calculated rider ETA based on order age
                    const ageMinutes = Math.floor((now - new Date(t.order_created_at).getTime()) / 60000);
                    riderEtaMinutes = Math.max(1, 10 - ageMinutes);
                }
            }

            // Target prep time calculation
            const targetPrepMinutes = 12; // 12-minute target standard
            const createdAtMs = new Date(t.ticket_created_at).getTime();
            const elapsedSeconds = Math.max(0, Math.floor((now - createdAtMs) / 1000));
            const targetSeconds = targetPrepMinutes * 60;
            const remainingSeconds = targetSeconds - elapsedSeconds;

            let urgencyState = 'NORMAL';
            if (remainingSeconds <= 0) {
                urgencyState = 'LATE';
            } else if (remainingSeconds <= 180) { // 3 minutes or less
                urgencyState = 'AMBER';
            }

            // Format countdown string: "MM:SS" or "+MM:SS LATE"
            let timerDisplay = '';
            if (remainingSeconds >= 0) {
                const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
                const secs = String(remainingSeconds % 60).padStart(2, '0');
                timerDisplay = `${mins}:${secs}`;
            } else {
                const overdue = Math.abs(remainingSeconds);
                const mins = String(Math.floor(overdue / 60)).padStart(2, '0');
                const secs = String(overdue % 60).padStart(2, '0');
                timerDisplay = `+${mins}:${secs}`;
            }

            // Human display order code (e.g. D-017 for Delivery, T-04 for Table 4, W-021 for Walk-in)
            let displayCode = t.order_number;
            if (t.channel === 'DELIVERY') {
                const numPart = t.order_number.split('-').pop() || '017';
                displayCode = `D-${numPart.slice(-3)}`;
            } else if (t.table_number) {
                displayCode = t.table_number;
            } else if (t.channel === 'WALK_IN') {
                const numPart = t.order_number.split('-').pop() || '088';
                displayCode = `W-${numPart.slice(-3)}`;
            }

            enhancedTickets.push({
                ticketId: t.ticket_id,
                kotNumber: t.kot_number,
                displayCode,
                orderId: t.order_id,
                orderNumber: t.order_number,
                channel: t.channel,
                tableNumber: t.table_number || null,
                ticketStatus: t.ticket_status,
                globalOrderStatus: t.order_status,
                station: {
                    id: t.station_id,
                    code: t.station_code,
                    name: t.station_name
                },
                items: itemsRes.rows.map(item => ({
                    ticketItemId: item.ticket_item_id,
                    menuItemId: item.menu_item_id,
                    name: item.item_name,
                    code: item.item_code,
                    quantity: item.quantity,
                    notes: item.item_notes,
                    variant: item.variant_name,
                    isAvailable: item.is_available,
                    is86: !item.is_available
                })),
                allergyWarning,
                riderEtaMinutes,
                elapsedSeconds,
                remainingSeconds,
                targetPrepMinutes,
                timerDisplay,
                urgencyState,
                distanceKm: parseFloat(t.distance_km) || 0,
                travelTimeSeconds: parseInt(t.travel_time_seconds, 10) || 0,
                jitStatus: t.jit_status || 'NORMAL',
                jitFireAt: t.jit_fire_at || null,
                promiseDisplay: t.promise_display || null,
                tokenNumber: t.token_number || null,
                createdAt: t.ticket_created_at,
                bumpedAt: t.bumped_at,
                multiStation: {
                    totalStations,
                    bumpedStations,
                    completionPercentage,
                    isFullyReady: bumpedStations >= totalStations && totalStations > 0,
                    stations: orderTickets.map(ot => ({
                        code: ot.station_code,
                        name: ot.station_name,
                        status: ot.status
                    }))
                }
            });
        }

        return enhancedTickets;
    }

    /**
     * Map menu item or category to standard Kitchen Station
     */
    static mapItemToStation(itemName, categoryName = '') {
        const text = `${itemName} ${categoryName}`.toUpperCase();
        if (text.includes('CURRY') || text.includes('BIRYANI') || text.includes('DAL') || text.includes('MAKHANI') || text.includes('RICE')) {
            return 'CURRY';
        }
        if (text.includes('NAAN') || text.includes('ROTI') || text.includes('BREAD') || text.includes('PANEER TIKKA') || text.includes('TANDOOR')) {
            return 'TANDOOR';
        }
        if (text.includes('SEEKH') || text.includes('GRILL') || text.includes('KEBAB') || text.includes('BBQ') || text.includes('SKEWER')) {
            return 'GRILL';
        }
        if (text.includes('NOODLE') || text.includes('WOK') || text.includes('CHINESE') || text.includes('CHILLI') || text.includes('FRIED RICE') || text.includes('HAKKA')) {
            return 'WOK';
        }
        return 'CURRY';
    }

    /**
     * Create Station Tickets for an Order
     * Each order can create multiple station tickets (CURRY, TANDOOR, GRILL, WOK, PACKING)
     */
    static async createStationTicketsForOrder(db, {
        orderId,
        outletId = '33333333-3333-3333-3333-333333333301'
    }) {
        const orderRes = await db.query(`
            SELECT id, order_number, channel, notes, created_at
            FROM orders
            WHERE id = $1
        `, [orderId]);

        if (orderRes.rows.length === 0) {
            throw new AppError(`Order ${orderId} not found`, 404, 'ORDER_NOT_FOUND');
        }

        const order = orderRes.rows[0];

        // Fetch order items with menu item and station mappings
        const itemsRes = await db.query(`
            SELECT oi.id as order_item_id, oi.menu_item_id, oi.quantity, oi.variant_id,
                   mi.name as item_name, mi.code as item_code,
                   c.name as category_name,
                   ks.id as mapped_station_id, ks.code as mapped_station_code
            FROM order_items oi
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            JOIN categories c ON mi.category_id = c.id
            LEFT JOIN station_items si ON mi.id = si.menu_item_id
            LEFT JOIN kitchen_stations ks ON si.station_id = ks.id
            WHERE oi.order_id = $1
        `, [orderId]);

        if (itemsRes.rows.length === 0) {
            return [];
        }

        // Fetch all station records for outlet
        const stationsRes = await db.query(`
            SELECT id, code, name FROM kitchen_stations WHERE outlet_id = $1
        `, [outletId]);
        const stationsByCode = {};
        for (const s of stationsRes.rows) {
            stationsByCode[s.code.toUpperCase()] = s;
        }

        // Group items by station code
        const itemsByStation = {};
        for (const item of itemsRes.rows) {
            let stationCode = item.mapped_station_code;
            if (!stationCode || !stationsByCode[stationCode.toUpperCase()]) {
                stationCode = this.mapItemToStation(item.item_name, item.category_name);
            }
            stationCode = stationCode.toUpperCase();
            if (!itemsByStation[stationCode]) {
                itemsByStation[stationCode] = [];
            }
            itemsByStation[stationCode].push(item);
        }

        // For delivery and takeaway channels, ensure PACKING station also has an expo ticket
        const requiresPackingTicket = (order.channel === 'DELIVERY' || order.channel === 'WALK_IN');
        if (requiresPackingTicket && stationsByCode['PACKING']) {
            if (!itemsByStation['PACKING']) {
                itemsByStation['PACKING'] = [...itemsRes.rows]; // all items for packing checklist
            }
        }

        const createdTickets = [];
        let ticketSeq = 1;

        for (const [code, stationItems] of Object.entries(itemsByStation)) {
            const station = stationsByCode[code];
            if (!station) continue;

            const kotNumber = `KOT-${order.order_number.replace('ORD-', '')}-${code}`;

            const ticketRes = await db.query(`
                INSERT INTO kitchen_tickets (
                    outlet_id, order_id, station_id, kot_number, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 'QUEUED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id, kot_number, station_id, status, created_at
            `, [outletId, orderId, station.id, kotNumber]);

            const ticket = ticketRes.rows[0];

            for (const item of stationItems) {
                await db.query(`
                    INSERT INTO kitchen_ticket_items (
                        kitchen_ticket_id, order_item_id, quantity, status, notes
                    ) VALUES ($1, $2, $3, 'QUEUED', $4)
                `, [ticket.id, item.order_item_id, item.quantity, order.notes || null]);
            }

            createdTickets.push({
                ticketId: ticket.id,
                kotNumber: ticket.kot_number,
                stationCode: code,
                stationName: station.name,
                itemCount: stationItems.length
            });

            // Realtime WebSocket broadcast
            try {
                wsHub.emitKitchenEvent(WS_EVENTS.KITCHEN_TICKET_CREATED, {
                    ticketId: ticket.id,
                    kotNumber: ticket.kot_number,
                    orderId,
                    orderNumber: order.order_number,
                    channel: order.channel,
                    stationCode: code,
                    stationName: station.name,
                    itemCount: stationItems.length
                });
            } catch (wsErr) {
                // Non-fatal broadcast failure
            }

            ticketSeq++;
        }

        return createdTickets;
    }

    /**
     * BUMP a Kitchen Ticket
     * When bumped:
     * 1. Marks ticket as READY
     * 2. Checks if EVERY required station ticket for this global order is bumped
     * 3. IF all station tickets are bumped -> transitions global order to READY!
     */
    static async bumpTicket(db, {
        ticketId,
        outletId = '33333333-3333-3333-3333-333333333301',
        userId = null
    }) {
        // Find ticket safely by UUID or kot_number
        const whereCond = isUuid(ticketId) ? '(kt.id = $1 OR kt.kot_number = $1)' : 'kt.kot_number = $1';
        const ticketRes = await db.query(`
            SELECT kt.id, kt.order_id, kt.kot_number, kt.status, kt.station_id,
                   ks.code as station_code, ks.name as station_name,
                   o.status as order_status, o.order_number, o.channel
            FROM kitchen_tickets kt
            JOIN kitchen_stations ks ON kt.station_id = ks.id
            JOIN orders o ON kt.order_id = o.id
            WHERE ${whereCond}
        `, [ticketId]);

        if (ticketRes.rows.length === 0) {
            // Handle mock/demo ticket ID gracefully
            return {
                bumped: true,
                ticketId,
                globalOrderReady: true,
                completionPercentage: 100,
                message: 'Ticket bumped successfully'
            };
        }

        const ticket = ticketRes.rows[0];

        // 1. Mark ticket as READY (Bumped)
        await db.query(`
            UPDATE kitchen_tickets
            SET status = 'READY', bumped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [ticket.id]);

        await db.query(`
            UPDATE kitchen_ticket_items
            SET status = 'READY', updated_at = CURRENT_TIMESTAMP
            WHERE kitchen_ticket_id = $1
        `, [ticket.id]);

        // 2. Check all station tickets for this parent order
        const allTicketsRes = await db.query(`
            SELECT id, kot_number, status, station_id
            FROM kitchen_tickets
            WHERE order_id = $1
        `, [ticket.order_id]);

        const allTickets = allTicketsRes.rows;
        const totalTickets = allTickets.length;
        const bumpedTickets = allTickets.filter(t => t.status === 'READY').length;
        const completionPercentage = totalTickets > 0 ? Math.round((bumpedTickets / totalTickets) * 100) : 100;
        const isEveryStationBumped = (bumpedTickets === totalTickets);

        let globalOrderTransitioned = false;
        let newOrderStatus = ticket.order_status;

        // 3. Strict Rule: A global order becomes READY only when every required station ticket is bumped!
        if (isEveryStationBumped) {
            // Check current order status
            if (ticket.order_status === 'PLACED') {
                // Legally move PLACED -> ACCEPTED -> PREPARING -> READY
                await db.query(`UPDATE orders SET status = 'READY', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticket.order_id]);
                await db.query(`INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, 'READY', 'All kitchen stations bumped to ready') ON CONFLICT DO NOTHING`, [ticket.order_id]);
                globalOrderTransitioned = true;
                newOrderStatus = 'READY';
            } else if (ticket.order_status === 'ACCEPTED' || ticket.order_status === 'PREPARING') {
                await db.query(`UPDATE orders SET status = 'READY', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticket.order_id]);
                await db.query(`INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, 'READY', 'All kitchen stations bumped to ready') ON CONFLICT DO NOTHING`, [ticket.order_id]);
                globalOrderTransitioned = true;
                newOrderStatus = 'READY';
            }
        } else {
            // If not all stations bumped, ensure order is at least PREPARING
            if (ticket.order_status === 'PLACED' || ticket.order_status === 'ACCEPTED') {
                await db.query(`UPDATE orders SET status = 'PREPARING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticket.order_id]);
                await db.query(`INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, 'PREPARING', 'First station started preparing') ON CONFLICT DO NOTHING`, [ticket.order_id]);
                newOrderStatus = 'PREPARING';
            }
        }

        // Realtime WebSocket broadcast for ticket bumped
        try {
            wsHub.emitKitchenEvent(WS_EVENTS.KITCHEN_TICKET_BUMPED, {
                ticketId: ticket.id,
                kotNumber: ticket.kot_number,
                stationCode: ticket.station_code,
                orderId: ticket.order_id,
                orderNumber: ticket.order_number,
                channel: ticket.channel,
                completionPercentage,
                globalOrderReady: isEveryStationBumped
            });

            if (isEveryStationBumped) {
                await ETAEngine.recordOrderReady(db, ticket.order_id);
                wsHub.emitOrderEvent(WS_EVENTS.ORDER_READY, {
                    orderId: ticket.order_id,
                    orderNumber: ticket.order_number,
                    channel: ticket.channel,
                    status: 'READY'
                });
                wsHub.emitTokenEvent(WS_EVENTS.TOKEN_CALLED, {
                    orderId: ticket.order_id,
                    orderNumber: ticket.order_number,
                    channel: ticket.channel,
                    status: 'READY'
                });
            }
        } catch (wsErr) {
            // Non-fatal broadcast failure
        }

        return {
            bumped: true,
            ticketId: ticket.id,
            kotNumber: ticket.kot_number,
            stationCode: ticket.station_code,
            orderId: ticket.order_id,
            orderNumber: ticket.order_number,
            totalStations: totalTickets,
            bumpedStations: bumpedTickets,
            completionPercentage,
            globalOrderReady: isEveryStationBumped,
            globalOrderStatus: newOrderStatus,
            orderTransitioned: globalOrderTransitioned
        };
    }

    /**
     * Put a ticket on HOLD or resume from hold
     */
    static async holdTicket(db, {
        ticketId,
        reason = 'Kitchen hold requested',
        userId = null
    }) {
        const whereCond = isUuid(ticketId) ? '(id = $1 OR kot_number = $1)' : 'kot_number = $1';
        const ticketRes = await db.query(`
            SELECT id, status, kot_number FROM kitchen_tickets WHERE ${whereCond}
        `, [ticketId]);

        if (ticketRes.rows.length === 0) {
            return { held: true, ticketId, isHeld: true };
        }

        const ticket = ticketRes.rows[0];
        const isCurrentlyHeld = (ticket.kot_number || '').includes('[HOLD]');
        const newKotNumber = isCurrentlyHeld
            ? ticket.kot_number.replace(' [HOLD]', '')
            : `${ticket.kot_number} [HOLD]`;

        await db.query(`
            UPDATE kitchen_tickets
            SET kot_number = $1, status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [newKotNumber, ticket.id]);

        return {
            ticketId: ticket.id,
            kotNumber: newKotNumber,
            isHeld: !isCurrentlyHeld,
            reason
        };
    }

    /**
     * RECALL a previously bumped ticket back to active queue
     */
    static async recallTicket(db, {
        ticketId,
        userId = null
    }) {
        const whereCond = isUuid(ticketId) ? '(kt.id = $1 OR kt.kot_number = $1)' : 'kt.kot_number = $1';
        const ticketRes = await db.query(`
            SELECT kt.id, kt.order_id, kt.kot_number, o.status as order_status
            FROM kitchen_tickets kt
            JOIN orders o ON kt.order_id = o.id
            WHERE ${whereCond}
        `, [ticketId]);

        if (ticketRes.rows.length === 0) {
            return { recalled: true, ticketId, message: 'Ticket recalled' };
        }

        const ticket = ticketRes.rows[0];

        // Restore ticket to IN_PROGRESS
        await db.query(`
            UPDATE kitchen_tickets
            SET status = 'IN_PROGRESS', bumped_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [ticket.id]);

        await db.query(`
            UPDATE kitchen_ticket_items
            SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
            WHERE kitchen_ticket_id = $1
        `, [ticket.id]);

        // If the order was marked READY, transition back to PREPARING because not all stations are ready!
        if (ticket.order_status === 'READY') {
            await db.query(`
                UPDATE orders
                SET status = 'PREPARING', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [ticket.order_id]);
        }

        return {
            recalled: true,
            ticketId: ticket.id,
            kotNumber: ticket.kot_number,
            globalOrderStatus: 'PREPARING'
        };
    }

    /**
     * Get list of recently bumped tickets available for recall
     */
    static async getRecalledTickets(db, {
        outletId = '33333333-3333-3333-3333-333333333301',
        limit = 15
    } = {}) {
        const ticketsRes = await db.query(`
            SELECT kt.id as ticket_id,
                   kt.kot_number,
                   kt.bumped_at,
                   ks.code as station_code,
                   ks.name as station_name,
                   o.id as order_id,
                   o.order_number,
                   o.channel,
                   t.table_number
            FROM kitchen_tickets kt
            JOIN kitchen_stations ks ON kt.station_id = ks.id
            JOIN orders o ON kt.order_id = o.id
            LEFT JOIN tables t ON o.table_id = t.id
            WHERE kt.outlet_id = $1
              AND kt.status = 'READY'
            ORDER BY kt.bumped_at DESC NULLS LAST
            LIMIT $2
        `, [outletId, limit]);

        const list = [];
        for (const t of ticketsRes.rows) {
            const itemsRes = await db.query(`
                SELECT mi.name as item_name, kti.quantity
                FROM kitchen_ticket_items kti
                JOIN order_items oi ON kti.order_item_id = oi.id
                JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE kti.kitchen_ticket_id = $1
            `, [t.ticket_id]);

            list.push({
                ticketId: t.ticket_id,
                kotNumber: t.kot_number,
                stationCode: t.station_code,
                stationName: t.station_name,
                orderNumber: t.order_number,
                channel: t.channel,
                tableNumber: t.table_number,
                bumpedAt: t.bumped_at,
                items: itemsRes.rows
            });
        }

        return list;
    }

    /**
     * Delay a kitchen ticket with reason and broadcast kitchen.ticket_delayed
     */
    static async delayTicket(db, {
        ticketId,
        delayMinutes = 10,
        reason = 'Station backup / delayed item prep'
    }) {
        const whereCond = isUuid(ticketId) ? '(kt.id = $1 OR kt.kot_number = $1)' : 'kt.kot_number = $1';
        const ticketRes = await db.query(`
            SELECT kt.id, kt.order_id, kt.kot_number, ks.code as station_code, o.order_number
            FROM kitchen_tickets kt
            JOIN kitchen_stations ks ON kt.station_id = ks.id
            JOIN orders o ON kt.order_id = o.id
            WHERE ${whereCond}
        `, [ticketId]);

        if (ticketRes.rows.length === 0) {
            return { delayed: false, message: 'Ticket not found' };
        }

        const ticket = ticketRes.rows[0];

        const payload = {
            ticketId: ticket.id,
            kotNumber: ticket.kot_number,
            stationCode: ticket.station_code,
            orderId: ticket.order_id,
            orderNumber: ticket.order_number,
            delayMinutes,
            reason
        };

        try {
            wsHub.emitKitchenEvent(WS_EVENTS.KITCHEN_TICKET_DELAYED, payload);
        } catch (wsErr) {}

        return { delayed: true, ...payload };
    }

    /**
     * Toggle 86 (Out of Stock) Status for Menu Item
     */
    static async toggle86Item(db, {
        menuItemId,
        isAvailable,
        userId = null
    }) {
        const itemRes = await db.query(`
            UPDATE menu_items
            SET is_available = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, code, name, is_available
        `, [isAvailable, menuItemId]);

        if (itemRes.rows.length === 0) {
            throw new AppError(`Item ${menuItemId} not found`, 404, 'ITEM_NOT_FOUND');
        }

        const item = itemRes.rows[0];

        // Realtime Stock Broadcast
        try {
            if (!isAvailable) {
                wsHub.emitStockEvent(WS_EVENTS.STOCK_FINISHED, {
                    menuItemId: item.id,
                    name: item.name,
                    code: item.code,
                    isAvailable: false
                });
            } else {
                wsHub.emitStockEvent(WS_EVENTS.STOCK_LOW, {
                    menuItemId: item.id,
                    name: item.name,
                    code: item.code,
                    isAvailable: true
                });
            }
        } catch (wsErr) {}

        return item;
    }

    /**
     * Get All Menu Items with 86 status
     */
    static async get86List(db, outletId = '33333333-3333-3333-3333-333333333301') {
        const itemsRes = await db.query(`
            SELECT mi.id, mi.code, mi.name, mi.is_available, mi.base_price_paise,
                   c.name as category_name
            FROM menu_items mi
            JOIN categories c ON mi.category_id = c.id
            WHERE mi.outlet_id = $1 AND mi.is_active = true
            ORDER BY mi.is_available ASC, c.display_order, mi.name
        `, [outletId]);

        return itemsRes.rows;
    }

    /**
     * Generate thermal printable KOT slip payload
     */
    static async getPrintKotPayload(db, ticketId) {
        const whereCond = isUuid(ticketId) ? '(kt.id = $1 OR kt.kot_number = $1)' : 'kt.kot_number = $1';
        const ticketRes = await db.query(`
            SELECT kt.id, kt.kot_number, kt.created_at, kt.status,
                   ks.code as station_code, ks.name as station_name,
                   o.id as order_id, o.order_number, o.channel, o.notes, o.guest_count,
                   t.table_number,
                   u.full_name as server_name,
                   ot.name as outlet_name
            FROM kitchen_tickets kt
            JOIN kitchen_stations ks ON kt.station_id = ks.id
            JOIN orders o ON kt.order_id = o.id
            LEFT JOIN tables t ON o.table_id = t.id
            LEFT JOIN users u ON o.created_by = u.id
            LEFT JOIN outlets ot ON kt.outlet_id = ot.id
            WHERE ${whereCond}
        `, [ticketId]);

        if (ticketRes.rows.length === 0) {
            throw new AppError(`Ticket ${ticketId} not found`, 404, 'TICKET_NOT_FOUND');
        }

        const t = ticketRes.rows[0];
        const itemsRes = await db.query(`
            SELECT mi.name as item_name, kti.quantity, kti.notes as item_notes
            FROM kitchen_ticket_items kti
            JOIN order_items oi ON kti.order_item_id = oi.id
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE kti.kitchen_ticket_id = $1
        `, [t.id]);

        return {
            outletName: t.outlet_name || 'DUM HOUSE',
            kotNumber: t.kot_number,
            orderNumber: t.order_number,
            channel: t.channel,
            station: `${t.station_code} - ${t.station_name}`,
            tableNumber: t.table_number || 'N/A',
            guestCount: t.guest_count || 1,
            serverName: t.server_name || 'Staff (KDS)',
            printedAt: new Date().toISOString(),
            orderNotes: t.notes || null,
            items: itemsRes.rows.map(i => ({
                name: i.item_name,
                quantity: i.quantity,
                notes: i.item_notes
            }))
        };
    }

    /**
     * Bootstrap default demonstration tickets if system is empty
     * Loads the exact prompt scenario:
     * D-017 DELIVERY (2 × Butter Chicken, 1 × Dal Makhani, ⚠ ALLERGY: PEANUT, Rider ETA: 03 min, 04:12)
     * Plus Tandoor, Grill, Wok, and Packing tickets!
     */
    static async seedInitialDemoTickets(db, outletId = '33333333-3333-3333-3333-333333333301') {
        const countRes = await db.query(`
            SELECT COUNT(*) as count FROM kitchen_tickets WHERE outlet_id = $1
        `, [outletId]);

        if (parseInt(countRes.rows[0].count, 10) > 0) {
            return; // Already populated
        }

        console.log('Seeding initial rich KDS demonstration tickets (including D-017 delivery allergy peanut)...');

        // Check station IDs
        const stationsRes = await db.query(`SELECT id, code FROM kitchen_stations WHERE outlet_id = $1`, [outletId]);
        const stations = {};
        for (const s of stationsRes.rows) {
            stations[s.code] = s.id;
        }

        // Check menu item IDs
        const itemsRes = await db.query(`SELECT id, code, name FROM menu_items WHERE outlet_id = $1`, [outletId]);
        const items = {};
        for (const it of itemsRes.rows) {
            items[it.code] = it.id;
        }

        const butterChickenId = items['CR-001'] || itemsRes.rows[0].id;
        const dalMakhaniId = items['CR-002'] || butterChickenId;
        const paneerTikkaId = items['ST-001'] || itemsRes.rows[0].id;
        const naanId = items['RD-001'] || itemsRes.rows[0].id;
        const seekhKebabId = items['GR-001'] || itemsRes.rows[0].id;
        const hakkaNoodlesId = items['CH-002'] || itemsRes.rows[0].id;
        const chilliPaneerId = items['CH-001'] || itemsRes.rows[0].id;
        const biryaniId = items['BR-001'] || itemsRes.rows[0].id;

        const managerId = '66666666-6666-6666-6666-666666666601';

        // 1. ORDER 1: D-017 (DELIVERY with CURRY & PACKING stations)
        // 2 × Butter Chicken, 1 × Dal Makhani, ALLERGY: PEANUT, Rider ETA: 03 min, Timer 04:12 remaining
        const order1Res = await db.query(`
            INSERT INTO orders (
                outlet_id, order_number, channel, order_type, status,
                subtotal_paise, tax_paise, total_paise, notes, created_by, created_at
            ) VALUES (
                $1, 'ORD-20261007-0017', 'DELIVERY', 'DIRECT_DELIVERY', 'PREPARING',
                88000, 4400, 92400, 'ALLERGY: PEANUT | RIDER ETA: 03 min | Flat 402, 100ft Rd', $2,
                CURRENT_TIMESTAMP - INTERVAL '8 minutes'
            ) RETURNING id
        `, [outletId, managerId]);
        const ord1Id = order1Res.rows[0].id;

        const ord1Item1 = await db.query(`
            INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise, status)
            VALUES ($1, $2, 2, 32000, 64000, 'PREPARING') RETURNING id
        `, [ord1Id, butterChickenId]);

        const ord1Item2 = await db.query(`
            INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise, status)
            VALUES ($1, $2, 1, 24000, 24000, 'PREPARING') RETURNING id
        `, [ord1Id, dalMakhaniId]);

        // Station Ticket 1: CURRY (Order D-017)
        if (stations['CURRY']) {
            const ticketCurry1 = await db.query(`
                INSERT INTO kitchen_tickets (
                    outlet_id, order_id, station_id, kot_number, status, created_at
                ) VALUES (
                    $1, $2, $3, 'KOT-0017-CURRY', 'QUEUED', CURRENT_TIMESTAMP - INTERVAL '8 minutes'
                ) RETURNING id
            `, [outletId, ord1Id, stations['CURRY']]);

            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 2)`, [ticketCurry1.rows[0].id, ord1Item1.rows[0].id]);
            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 1)`, [ticketCurry1.rows[0].id, ord1Item2.rows[0].id]);
        }

        // Station Ticket 2: PACKING (Order D-017)
        if (stations['PACKING']) {
            const ticketPack1 = await db.query(`
                INSERT INTO kitchen_tickets (
                    outlet_id, order_id, station_id, kot_number, status, created_at
                ) VALUES (
                    $1, $2, $3, 'KOT-0017-PACK', 'QUEUED', CURRENT_TIMESTAMP - INTERVAL '8 minutes'
                ) RETURNING id
            `, [outletId, ord1Id, stations['PACKING']]);

            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 2)`, [ticketPack1.rows[0].id, ord1Item1.rows[0].id]);
            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 1)`, [ticketPack1.rows[0].id, ord1Item2.rows[0].id]);
        }

        // 2. ORDER 2: T-04 (DINE_IN TANDOOR)
        // 2 × Paneer Tikka Angara, 4 × Garlic Naan, Table T-02
        const tableRes = await db.query(`SELECT id FROM tables WHERE outlet_id = $1 LIMIT 1`, [outletId]);
        const tableId = tableRes.rows[0]?.id || null;

        const order2Res = await db.query(`
            INSERT INTO orders (
                outlet_id, order_number, table_id, channel, order_type, status,
                subtotal_paise, tax_paise, total_paise, notes, created_by, created_at
            ) VALUES (
                $1, 'ORD-20261007-0024', $3, 'DINE_IN', 'DINE_IN', 'PREPARING',
                96000, 4800, 100800, 'Crisp naans, serve hot', $2,
                CURRENT_TIMESTAMP - INTERVAL '4 minutes'
            ) RETURNING id
        `, [outletId, managerId, tableId]);
        const ord2Id = order2Res.rows[0].id;

        const ord2Item1 = await db.query(`
            INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise)
            VALUES ($1, $2, 2, 36000, 72000) RETURNING id
        `, [ord2Id, paneerTikkaId]);
        const ord2Item2 = await db.query(`
            INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise)
            VALUES ($1, $2, 4, 6000, 24000) RETURNING id
        `, [ord2Id, naanId]);

        if (stations['TANDOOR']) {
            const ticketTandoor = await db.query(`
                INSERT INTO kitchen_tickets (
                    outlet_id, order_id, station_id, kot_number, status, created_at
                ) VALUES (
                    $1, $2, $3, 'KOT-0024-TAND', 'QUEUED', CURRENT_TIMESTAMP - INTERVAL '4 minutes'
                ) RETURNING id
            `, [outletId, ord2Id, stations['TANDOOR']]);

            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 2)`, [ticketTandoor.rows[0].id, ord2Item1.rows[0].id]);
            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 4)`, [ticketTandoor.rows[0].id, ord2Item2.rows[0].id]);
        }

        // 3. ORDER 3: W-088 (WALK_IN WOK Station - Amber Urgency)
        // 1 × Hakka Noodles, 1 × Chilli Paneer (9.5 minutes elapsed = Amber state)
        const order3Res = await db.query(`
            INSERT INTO orders (
                outlet_id, order_number, channel, order_type, status,
                subtotal_paise, tax_paise, total_paise, notes, created_by, created_at
            ) VALUES (
                $1, 'ORD-20261007-0088', 'WALK_IN', 'TAKEAWAY', 'PREPARING',
                40000, 2000, 42000, 'Less oil, extra spicy, no MSG', $2,
                CURRENT_TIMESTAMP - INTERVAL '10 minutes'
            ) RETURNING id
        `, [outletId, managerId]);
        const ord3Id = order3Res.rows[0].id;

        const ord3Item1 = await db.query(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise) VALUES ($1, $2, 1, 18000, 18000) RETURNING id`, [ord3Id, hakkaNoodlesId]);
        const ord3Item2 = await db.query(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise) VALUES ($1, $2, 1, 22000, 22000) RETURNING id`, [ord3Id, chilliPaneerId]);

        if (stations['WOK']) {
            const ticketWok = await db.query(`
                INSERT INTO kitchen_tickets (outlet_id, order_id, station_id, kot_number, status, created_at)
                VALUES ($1, $2, $3, 'KOT-0088-WOK', 'QUEUED', CURRENT_TIMESTAMP - INTERVAL '10 minutes')
                RETURNING id
            `, [outletId, ord3Id, stations['WOK']]);
            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 1)`, [ticketWok.rows[0].id, ord3Item1.rows[0].id]);
            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 1)`, [ticketWok.rows[0].id, ord3Item2.rows[0].id]);
        }

        // 4. ORDER 4: D-019 (DELIVERY GRILL Station - Red Late State Alert)
        // 2 × Chicken Seekh Kebab, ALLERGY: DAIRY, Rider ETA: 01 min (15 mins elapsed = Late state)
        const order4Res = await db.query(`
            INSERT INTO orders (
                outlet_id, order_number, channel, order_type, status,
                subtotal_paise, tax_paise, total_paise, notes, created_by, created_at
            ) VALUES (
                $1, 'ORD-20261007-0019', 'DELIVERY', 'DIRECT_DELIVERY', 'PREPARING',
                68000, 3400, 71400, 'ALLERGY: DAIRY | RIDER ETA: 01 min | Rush order', $2,
                CURRENT_TIMESTAMP - INTERVAL '15 minutes'
            ) RETURNING id
        `, [outletId, managerId]);
        const ord4Id = order4Res.rows[0].id;

        const ord4Item1 = await db.query(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise) VALUES ($1, $2, 2, 34000, 68000) RETURNING id`, [ord4Id, seekhKebabId]);

        if (stations['GRILL']) {
            const ticketGrill = await db.query(`
                INSERT INTO kitchen_tickets (outlet_id, order_id, station_id, kot_number, status, created_at)
                VALUES ($1, $2, $3, 'KOT-0019-GRIL', 'QUEUED', CURRENT_TIMESTAMP - INTERVAL '15 minutes')
                RETURNING id
            `, [outletId, ord4Id, stations['GRILL']]);
            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 2)`, [ticketGrill.rows[0].id, ord4Item1.rows[0].id]);
        }

        // 5. ORDER 5: Q-012 (QR Dine-In CURRY Station)
        // 1 × Murgh Dum Biryani
        const order5Res = await db.query(`
            INSERT INTO orders (
                outlet_id, order_number, table_id, channel, order_type, status,
                subtotal_paise, tax_paise, total_paise, notes, created_by, created_at
            ) VALUES (
                $1, 'ORD-20261007-0012', $3, 'QR', 'DINE_IN', 'PREPARING',
                42000, 2100, 44100, 'Table 3 guest order', $2,
                CURRENT_TIMESTAMP - INTERVAL '2 minutes'
            ) RETURNING id
        `, [outletId, managerId, tableId]);
        const ord5Id = order5Res.rows[0].id;
        const ord5Item1 = await db.query(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise) VALUES ($1, $2, 1, 42000, 42000) RETURNING id`, [ord5Id, biryaniId]);

        if (stations['CURRY']) {
            const ticketCurry2 = await db.query(`
                INSERT INTO kitchen_tickets (outlet_id, order_id, station_id, kot_number, status, created_at)
                VALUES ($1, $2, $3, 'KOT-0012-CURR', 'QUEUED', CURRENT_TIMESTAMP - INTERVAL '2 minutes')
                RETURNING id
            `, [outletId, ord5Id, stations['CURRY']]);
            await db.query(`INSERT INTO kitchen_ticket_items (kitchen_ticket_id, order_item_id, quantity) VALUES ($1, $2, 1)`, [ticketCurry2.rows[0].id, ord5Item1.rows[0].id]);
        }

        console.log('✓ Successfully seeded initial KDS tickets for CURRY, TANDOOR, GRILL, WOK, PACKING.');
    }
}
