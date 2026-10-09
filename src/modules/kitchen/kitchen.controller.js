// Kitchen Display System Controller
import { KitchenService } from './kitchen.service.js';
import { AuditService } from '../audit/audit.service.js';

export class KitchenController {
    static async getStations(req, res, next) {
        try {
            const outletId = req.user?.outletId || req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const stations = await KitchenService.getStations(req.db, outletId);
            res.json({ success: true, data: stations });
        } catch (err) {
            next(err);
        }
    }

    static async getTickets(req, res, next) {
        try {
            const outletId = req.user?.outletId || req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const stationCode = req.query.station || 'ALL';
            const status = req.query.status || 'ACTIVE';

            // Ensure demo tickets exist on first access
            await KitchenService.seedInitialDemoTickets(req.db, outletId);

            const tickets = await KitchenService.getTickets(req.db, {
                outletId,
                stationCode,
                status
            });

            res.json({
                success: true,
                count: tickets.length,
                station: stationCode,
                data: tickets
            });
        } catch (err) {
            next(err);
        }
    }

    static async bumpTicket(req, res, next) {
        try {
            const ticketId = req.params.id;
            const outletId = req.user?.outletId || req.body?.outletId || '33333333-3333-3333-3333-333333333301';
            const userId = req.user?.id || null;

            const result = await KitchenService.bumpTicket(req.db, {
                ticketId,
                outletId,
                userId
            });

            // Audit the kitchen bump
            if (userId) {
                await AuditService.logPrivilegedAction(req.db, {
                    outletId,
                    userId,
                    action: 'KITCHEN_TICKET_BUMPED',
                    entityName: 'kitchen_tickets',
                    entityId: ticketId,
                    newValues: result,
                    ipAddress: req.ip
                });
            }

            res.json({
                success: true,
                message: result.globalOrderReady
                    ? `Ticket bumped! All stations ready — Order ${result.orderNumber} is now READY.`
                    : `Station ticket bumped (${result.completionPercentage}% of order completed).`,
                data: result
            });
        } catch (err) {
            next(err);
        }
    }

    static async holdTicket(req, res, next) {
        try {
            const ticketId = req.params.id;
            const { reason } = req.body || {};
            const userId = req.user?.id || null;

            const result = await KitchenService.holdTicket(req.db, {
                ticketId,
                reason,
                userId
            });

            res.json({
                success: true,
                message: result.isHeld ? 'Ticket placed on HOLD' : 'Ticket resumed from hold',
                data: result
            });
        } catch (err) {
            next(err);
        }
    }

    static async delayTicket(req, res, next) {
        try {
            const ticketId = req.params.id;
            const { delayMinutes, reason } = req.body || {};
            const result = await KitchenService.delayTicket(req.db, {
                ticketId,
                delayMinutes: parseInt(delayMinutes, 10) || 10,
                reason: reason || 'Kitchen surge delay'
            });
            res.json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async recallTicket(req, res, next) {
        try {
            const ticketId = req.params.id;
            const userId = req.user?.id || null;

            const result = await KitchenService.recallTicket(req.db, {
                ticketId,
                userId
            });

            res.json({
                success: true,
                message: 'Ticket recalled to active kitchen queue',
                data: result
            });
        } catch (err) {
            next(err);
        }
    }

    static async getRecalledTickets(req, res, next) {
        try {
            const outletId = req.user?.outletId || req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const tickets = await KitchenService.getRecalledTickets(req.db, { outletId });
            res.json({ success: true, data: tickets });
        } catch (err) {
            next(err);
        }
    }

    static async get86List(req, res, next) {
        try {
            const outletId = req.user?.outletId || req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const items = await KitchenService.get86List(req.db, outletId);
            res.json({ success: true, data: items });
        } catch (err) {
            next(err);
        }
    }

    static async toggle86(req, res, next) {
        try {
            const menuItemId = req.params.id;
            const { isAvailable } = req.body || {};
            const userId = req.user?.id || null;

            const updated = await KitchenService.toggle86Item(req.db, {
                menuItemId,
                isAvailable: Boolean(isAvailable),
                userId
            });

            res.json({
                success: true,
                message: isAvailable ? `Item '${updated.name}' is now Available` : `Item '${updated.name}' marked 86 (Out of Stock)`,
                data: updated
            });
        } catch (err) {
            next(err);
        }
    }

    static async getPrintSlip(req, res, next) {
        try {
            const ticketId = req.params.id;
            const payload = await KitchenService.getPrintKotPayload(req.db, ticketId);
            res.json({ success: true, data: payload });
        } catch (err) {
            next(err);
        }
    }

    static async createRushDemoOrder(req, res, next) {
        try {
            const body = req.body || {};
            const outletId = req.user?.outletId || body.outletId || '33333333-3333-3333-3333-333333333301';
            const managerId = '66666666-6666-6666-6666-666666666601';

            // Generate sequence rush order number
            const seq = Math.floor(100 + Math.random() * 900);
            const orderNumber = `ORD-20261007-0${seq}`;

            const channel = body.channel || 'DELIVERY';
            const allergy = body.allergy || 'PEANUT';
            const riderEta = body.riderEta || 3;

            // Fetch menu items
            const miRes = await req.db.query(`SELECT id, code, name, base_price_paise FROM menu_items WHERE outlet_id = $1`, [outletId]);
            const items = miRes.rows;
            const bc = items.find(i => i.code === 'CR-001') || items[0];
            const dm = items.find(i => i.code === 'CR-002') || items[1] || items[0];

            const notes = `ALLERGY: ${allergy} | RIDER ETA: ${String(riderEta).padStart(2, '0')} min | Rush delivery test`;

            const orderRes = await req.db.query(`
                INSERT INTO orders (
                    outlet_id, order_number, channel, order_type, status,
                    subtotal_paise, tax_paise, total_paise, notes, created_by, created_at
                ) VALUES (
                    $1, $2, $3, 'DIRECT_DELIVERY', 'PREPARING',
                    88000, 4400, 92400, $4, $5, CURRENT_TIMESTAMP
                ) RETURNING id, order_number, channel, notes, created_at
            `, [outletId, orderNumber, channel, notes, managerId]);

            const newOrder = orderRes.rows[0];

            // Order items
            await req.db.query(`
                INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise)
                VALUES ($1, $2, 2, 32000, 64000)
            `, [newOrder.id, bc.id]);

            await req.db.query(`
                INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_paise, total_price_paise)
                VALUES ($1, $2, 1, 24000, 24000)
            `, [newOrder.id, dm.id]);

            // Create station tickets
            const stationTickets = await KitchenService.createStationTicketsForOrder(req.db, {
                orderId: newOrder.id,
                outletId
            });

            res.status(201).json({
                success: true,
                message: `Rush Order ${orderNumber} created with ${stationTickets.length} station tickets.`,
                order: newOrder,
                tickets: stationTickets
            });
        } catch (err) {
            next(err);
        }
    }
}
