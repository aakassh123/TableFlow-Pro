import { OrderService } from './order.service.js';
import { AuditService } from '../audit/audit.service.js';
import { KitchenService } from '../kitchen/kitchen.service.js';
import { ETAEngine } from '../eta/eta-engine.js';
import { wsHub, WS_EVENTS } from '../realtime/websocket-hub.js';

export class OrdersController {
    /**
     * POST /api/orders
     */
    static async createOrder(req, res, next) {
        try {
            const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || null;
            const result = await OrderService.createOrder(req.db, {
                outletId: req.user.outletId,
                channel: req.body.channel,
                tableId: req.body.tableId,
                customerId: req.body.customerId,
                guestCount: req.body.guestCount,
                items: req.body.items,
                idempotencyKey,
                notes: req.body.notes,
                createdBy: req.user.id,
                paymentRequiredUpfront: req.body.paymentRequiredUpfront,
                distanceKm: req.body.distanceKm !== undefined ? req.body.distanceKm : (req.body.distance_km || 0),
                discountPaise: req.body.discountPaise !== undefined ? req.body.discountPaise : (req.body.discount_paise || 0)
            });

            if (result.isIdempotentReplay) {
                // Return original order with idempotency replay header
                res.setHeader('Idempotency-Replay', 'true');
                return res.status(200).json({
                    success: true,
                    message: 'Idempotent request replayed. Returning existing order.',
                    data: result.order
                });
            }

            // Generate multi-station tickets for KDS
            try {
                await KitchenService.createStationTicketsForOrder(req.db, {
                    orderId: result.order.id,
                    outletId: req.user.outletId
                });
            } catch (kErr) {
                console.warn('KDS station ticket generation note:', kErr.message);
            }

            await AuditService.logPrivilegedAction(req.db, {
                outletId: req.user.outletId,
                userId: req.user.id,
                action: 'ORDER_CREATED',
                entityName: 'orders',
                entityId: result.order.id,
                newValues: { orderNumber: result.order.order_number, totalPaise: result.order.total_paise },
                ipAddress: req.ip
            });

            res.status(201).json({ success: true, data: result.order });
        } catch (err) { next(err); }
    }

    /**
     * GET /api/orders/:id
     */
    static async getOrder(req, res, next) {
        try {
            const order = await OrderService.getOrderDetails(req.db, req.params.id);
            if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
            res.status(200).json({ success: true, data: order });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/accept
     */
    static async acceptOrder(req, res, next) {
        try {
            const result = await OrderService.acceptOrder(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                userId: req.user.id,
                notes: req.body.notes
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/reject
     */
    static async rejectOrder(req, res, next) {
        try {
            const result = await OrderService.rejectOrder(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                reason: req.body.reason,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/prepare
     */
    static async startPreparing(req, res, next) {
        try {
            const result = await OrderService.startPreparing(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/ready
     */
    static async markReady(req, res, next) {
        try {
            const result = await OrderService.markReady(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/serve
     */
    static async serveOrder(req, res, next) {
        try {
            const result = await OrderService.serveOrder(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/collect
     */
    static async collectOrder(req, res, next) {
        try {
            const result = await OrderService.collectOrder(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/hand-to-rider
     */
    static async handToRider(req, res, next) {
        try {
            const result = await OrderService.handToRider(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                riderId: req.body.riderId,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/deliver
     */
    static async deliverOrder(req, res, next) {
        try {
            const result = await OrderService.deliverOrder(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/cancel
     */
    static async cancelOrder(req, res, next) {
        try {
            const result = await OrderService.cancelOrder(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                reason: req.body.reason,
                hasCookingStarted: req.body.hasCookingStarted,
                userId: req.user.id
            });

            await AuditService.logPrivilegedAction(req.db, {
                outletId: req.user.outletId,
                userId: req.user.id,
                action: 'ORDER_CANCELLED',
                entityName: 'orders',
                entityId: req.params.id,
                newValues: { reason: req.body.reason, status: result.status },
                managerOverride: req.managerOverride,
                ipAddress: req.ip
            });

            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/expire
     */
    static async expireOrder(req, res, next) {
        try {
            const result = await OrderService.expireOrder(req.db, {
                outletId: req.user.outletId,
                orderId: req.params.id,
                reason: req.body.reason || 'PAYMENT_EXPIRED',
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/orders/:id/delay
     */
    static async delayOrder(req, res, next) {
        try {
            const outletId = req.user?.outletId || req.body.outletId || '33333333-3333-3333-3333-333333333301';
            const result = await OrderService.delayOrder(req.db, {
                outletId,
                orderId: req.params.id,
                delayMinutes: parseInt(req.body.delayMinutes, 10) || 10,
                reason: req.body.reason || 'Kitchen surge'
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * GET /api/orders/:id/eta
     */
    static async getOrderETA(req, res, next) {
        try {
            const outletId = req.user?.outletId || req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const rushLevel = parseFloat(req.query.rushLevel) || 1.0;
            const eta = await ETAEngine.computeOrderETA(req.db, {
                orderId: req.params.id,
                outletId,
                rushLevel
            });
            res.status(200).json({ success: true, data: eta });
        } catch (err) { next(err); }
    }

    /**
     * GET /api/eta/rolling-median
     */
    static async getRollingMedian(req, res, next) {
        try {
            const outletId = req.user?.outletId || req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const medians = await ETAEngine.calculateRollingMedianPrepTimes(req.db, outletId);
            res.status(200).json({ success: true, data: medians });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/tokens/:id/call
     */
    static async callToken(req, res, next) {
        try {
            const tokenId = req.params.id;
            const tokenRes = await req.db.query(`
                SELECT id, token_number, token_type, order_id, status 
                FROM tokens 
                WHERE id = $1 OR CAST(token_number AS text) = $1
            `, [tokenId]);

            if (tokenRes.rows.length === 0) {
                wsHub.emitTokenEvent(WS_EVENTS.TOKEN_CALLED, { tokenId, tokenNumber: tokenId, status: 'CALLED' });
                return res.status(200).json({ success: true, message: `Token ${tokenId} called` });
            }

            const token = tokenRes.rows[0];
            await req.db.query(`UPDATE tokens SET status = 'CALLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [token.id]);
            wsHub.emitTokenEvent(WS_EVENTS.TOKEN_CALLED, {
                tokenId: token.id,
                tokenNumber: token.token_number,
                tokenType: token.token_type,
                orderId: token.order_id,
                status: 'CALLED'
            });

            res.status(200).json({ success: true, data: token });
        } catch (err) { next(err); }
    }
}
