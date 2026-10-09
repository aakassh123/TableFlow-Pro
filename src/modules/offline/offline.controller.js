// Offline Controller - REST API Endpoints for Edge Node Operations
import { EdgeNodeService, CAPABILITIES } from './edge-node.service.js';
import { EdgeSyncService } from './edge-sync.service.js';
import { ConflictQueueService } from './conflict-queue.service.js';

export class OfflineController {
    /**
     * GET /api/edge/status
     */
    static async getStatus(req, res, next) {
        try {
            const outletId = req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const state = await EdgeNodeService.getNodeState(req.db, outletId);
            res.json({
                success: true,
                data: state
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/edge/connectivity
     * Toggle ONLINE / OFFLINE mode
     */
    static async setConnectivity(req, res, next) {
        try {
            const { connectivityState, outletId = '33333333-3333-3333-3333-333333333301' } = req.body;
            const updated = await EdgeNodeService.setConnectivityState(req.db, {
                outletId,
                connectivityState
            });
            res.json({
                success: true,
                message: `Edge Node connectivity switched to ${connectivityState}`,
                data: updated
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/edge/order
     * Place order in offline outlet mode
     */
    static async createOrder(req, res, next) {
        try {
            const {
                outletId = '33333333-3333-3333-3333-333333333301',
                channel = 'WALK_IN',
                tableId = null,
                guestCount = 1,
                items = [],
                notes = null,
                idempotencyKey = req.headers['x-idempotency-key'] || null
            } = req.body;

            const result = await EdgeNodeService.createOfflineOrder(req.db, {
                outletId,
                channel,
                tableId,
                guestCount,
                items,
                notes,
                idempotencyKey
            });

            res.status(201).json({
                success: true,
                message: 'Order created in offline edge mode',
                data: result
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/edge/kds/bump
     * Bump ticket in offline mode
     */
    static async bumpTicket(req, res, next) {
        try {
            const {
                outletId = '33333333-3333-3333-3333-333333333301',
                ticketId
            } = req.body;

            const result = await EdgeNodeService.bumpKitchenTicket(req.db, {
                outletId,
                ticketId
            });

            res.json({
                success: true,
                message: 'Ticket bumped offline',
                data: result
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/edge/print
     * Generate thermal receipt payload
     */
    static async printReceipt(req, res, next) {
        try {
            const { orderNumber, tokenNumber, channel, items, subtotalPaise, taxPaise, totalPaise } = req.body;
            const receipt = EdgeNodeService.formatThermalReceipt({
                orderNumber,
                tokenNumber,
                channel,
                items,
                subtotalPaise,
                taxPaise,
                totalPaise
            });

            res.json({
                success: true,
                data: {
                    receipt,
                    printerStatus: 'ONLINE_CONNECTED',
                    encoding: 'ESC/POS'
                }
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/edge/sync
     * Trigger synchronization from edge event log to cloud
     */
    static async triggerSync(req, res, next) {
        try {
            const outletId = req.body.outletId || '33333333-3333-3333-3333-333333333301';
            // In standalone/edge server, req.cloudDb can be passed, or simulated against req.db
            const cloudDb = req.cloudDb || req.db;
            const syncSummary = await EdgeSyncService.syncEvents(req.db, cloudDb, { outletId });

            res.json({
                success: true,
                message: 'Edge synchronization completed',
                data: syncSummary
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /api/edge/conflicts
     * List all unresolved sync conflicts for manager review
     */
    static async getConflicts(req, res, next) {
        try {
            const outletId = req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const conflicts = await ConflictQueueService.listPendingConflicts(req.db, outletId);
            res.json({
                success: true,
                data: conflicts
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * POST /api/edge/conflicts/:id/resolve
     * Manager resolves a sync conflict
     */
    static async resolveConflict(req, res, next) {
        try {
            const conflictId = req.params.id;
            const {
                outletId = '33333333-3333-3333-3333-333333333301',
                resolutionStrategy,
                resolutionNotes,
                resolvedBy
            } = req.body;

            const result = await ConflictQueueService.resolveConflict(req.db, {
                conflictId,
                outletId,
                resolutionStrategy,
                resolutionNotes,
                resolvedBy
            });

            res.json({
                success: true,
                data: result
            });
        } catch (err) {
            next(err);
        }
    }
}
