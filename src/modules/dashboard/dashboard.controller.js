// Dashboard Controller - Operational Manager Board Endpoints
import { DashboardService } from './dashboard.service.js';

export class DashboardController {
    /**
     * Get Complete Operational Manager Board Metrics
     * GET /api/dashboard/summary
     */
    static async getSummary(req, res, next) {
        try {
            const outletId = req.query.outletId || req.user?.outletId || '33333333-3333-3333-3333-333333333301';
            const data = await DashboardService.getManagerOperationalBoard(req.db, outletId);
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Approve Purchase Order
     * POST /api/dashboard/purchase-orders/:id/approve
     */
    static async approvePurchaseOrder(req, res, next) {
        try {
            const outletId = req.body.outletId || req.user?.outletId || '33333333-3333-3333-3333-333333333301';
            const result = await DashboardService.approvePurchaseOrder(req.db, {
                poId: req.params.id,
                outletId,
                approvedBy: req.user?.id
            });
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    }

    /**
     * Start Batch Cooking Prep
     * POST /api/dashboard/batch-cook/start
     */
    static async startBatchCooking(req, res, next) {
        try {
            const { item, portions, stationCode, outletId } = req.body;
            const result = await DashboardService.startBatchCooking(req.db, {
                outletId: outletId || req.user?.outletId,
                item,
                portions,
                stationCode
            });
            res.status(200).json(result);
        } catch (err) {
            next(err);
        }
    }
}
