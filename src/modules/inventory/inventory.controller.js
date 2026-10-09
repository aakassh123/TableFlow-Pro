// Inventory HTTP Controller
import { InventoryService } from './inventory.service.js';
import { AuditService } from '../audit/audit.service.js';

export class InventoryController {
    /**
     * POST /api/inventory/reserve
     */
    static async reserveStock(req, res, next) {
        try {
            const { stockItemId, quantityBaseUnits, orderId, orderItemId, expiresAtMinutes } = req.body;
            const result = await InventoryService.reserveStock(req.db, {
                outletId: req.user.outletId,
                orderId,
                orderItemId,
                stockItemId,
                quantityBaseUnits,
                expiresAtMinutes
            });
            res.status(201).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/inventory/consume
     */
    static async consumeReservedStock(req, res, next) {
        try {
            const { reservationId, referenceType, referenceId } = req.body;
            const result = await InventoryService.consumeReservedStock(req.db, {
                outletId: req.user.outletId,
                reservationId,
                referenceType,
                referenceId,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/inventory/release
     */
    static async releaseReservation(req, res, next) {
        try {
            const { reservationId, reason } = req.body;
            const result = await InventoryService.releaseReservation(req.db, {
                outletId: req.user.outletId,
                reservationId,
                reason,
                userId: req.user.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/inventory/waste
     */
    static async recordWaste(req, res, next) {
        try {
            const { stockItemId, batchId, quantityBaseUnits, reason } = req.body;
            const result = await InventoryService.recordWaste(req.db, {
                outletId: req.user.outletId,
                stockItemId,
                batchId,
                quantityBaseUnits,
                reason,
                recordedBy: req.user.id
            });

            await AuditService.logPrivilegedAction(req.db, {
                outletId: req.user.outletId,
                userId: req.user.id,
                action: 'STOCK_WASTE_RECORDED',
                entityName: 'waste_entries',
                entityId: result.wasteEntry.id,
                newValues: { stockItemId, quantityBaseUnits, reason },
                ipAddress: req.ip
            });

            res.status(201).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/inventory/receive
     */
    static async receiveGoods(req, res, next) {
        try {
            const { supplierId, purchaseOrderId, grnNumber, invoiceNumber, items } = req.body;
            const result = await InventoryService.receiveGoods(req.db, {
                outletId: req.user.outletId,
                supplierId,
                purchaseOrderId,
                grnNumber,
                invoiceNumber,
                receivedBy: req.user.id,
                items
            });

            await AuditService.logPrivilegedAction(req.db, {
                outletId: req.user.outletId,
                userId: req.user.id,
                action: 'GOODS_RECEIPT_PROCESSED',
                entityName: 'goods_receipts',
                entityId: result.goodsReceipt.id,
                newValues: { grnNumber, invoiceNumber, itemsCount: items.length },
                ipAddress: req.ip
            });

            res.status(201).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * POST /api/inventory/adjust
     */
    static async adjustStock(req, res, next) {
        try {
            const { stockItemId, adjustmentType, quantityBaseUnits, reason } = req.body;
            const result = await InventoryService.adjustStock(req.db, {
                outletId: req.user.outletId,
                stockItemId,
                adjustmentType,
                quantityBaseUnits,
                reason,
                approvedBy: req.managerOverride ? req.managerOverride.managerId : req.user.id
            });

            await AuditService.logPrivilegedAction(req.db, {
                outletId: req.user.outletId,
                userId: req.user.id,
                action: 'STOCK_ADJUSTMENT_PROCESSED',
                entityName: 'stock_adjustments',
                entityId: result.adjustment.id,
                newValues: { stockItemId, adjustmentType, quantityBaseUnits, reason },
                managerOverride: req.managerOverride,
                ipAddress: req.ip
            });

            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    /**
     * GET /api/inventory/:id/balance
     */
    static async getStockBalance(req, res, next) {
        try {
            const result = await InventoryService.getStockBalance(req.db, {
                outletId: req.user.outletId,
                stockItemId: req.params.id
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) { next(err); }
    }
}
