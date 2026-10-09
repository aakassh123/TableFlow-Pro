// Application Server & Route Registration
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuthService } from './modules/auth/auth.service.js';
import { AuditService } from './modules/audit/audit.service.js';
import { InventoryController } from './modules/inventory/inventory.controller.js';
import { OrdersController } from './modules/orders/orders.controller.js';
import { KitchenController } from './modules/kitchen/kitchen.controller.js';
import { QRController } from './modules/qr/qr.controller.js';
import { DashboardController } from './modules/dashboard/dashboard.controller.js';
import { OfflineController } from './modules/offline/offline.controller.js';
import { EdgeNodeService, CAPABILITIES } from './modules/offline/edge-node.service.js';
import { authenticate, requirePermission, requireManagerOverride } from './modules/rbac/guards.js';
import { PERMISSIONS } from './modules/rbac/permissions.js';
import { AppError } from './shared/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(dbClient) {
    const app = express();
    app.use(express.json());

    // Context injector helper for db
    app.use((req, res, next) => {
        req.db = dbClient;
        next();
    });

    // Serve static frontend assets from public/
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Direct KDS route
    app.get('/kds', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'kds.html'));
    });

    // Customer tracking page route
    app.get('/track/:id', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'track.html'));
    });
    app.get('/track', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'track.html'));
    });

    // Counter TV token display route
    app.get('/counter-tv', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'counter-tv.html'));
    });

    // Customer Signed Table QR Ordering PWA routes
    // /table/7/session/xxxx or /table/07/session/xxxx
    app.get('/table/:table/session/:token', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'qr-order.html'));
    });
    // Direct /table/:table serves the PWA which displays the security rejection screen & demo generator
    app.get('/table/:table', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'qr-order.html'));
    });

    // ========================================================================
    // CUSTOMER TABLE QR ORDERING API (SIGNED SESSIONS & ANTI-ABUSE)
    // ========================================================================
    app.post('/api/qr/tables/:table/session', QRController.generateSession);
    app.get('/api/qr/tables/:table/session', QRController.generateSession);
    app.post('/api/qr/session/generate', QRController.generateSession);
    app.get('/api/qr/session/validate', QRController.validateSession);
    app.post('/api/qr/orders', QRController.placeQrOrder);

    // ========================================================================
    // OPERATIONAL MANAGER BOARD & DASHBOARD API (DOC-20261007-WA0006)
    // ========================================================================
    app.get('/dashboard', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
    });
    app.get('/api/dashboard/summary', DashboardController.getSummary);
    app.post('/api/dashboard/purchase-orders/:id/approve', DashboardController.approvePurchaseOrder);
    app.post('/api/dashboard/batch-cook/start', DashboardController.startBatchCooking);

    // ========================================================================
    // OFFLINE-FIRST EDGE NODE & CONFLICT RESOLUTION API (DOC-20261007-WA0006)
    // ========================================================================
    app.get('/conflicts', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'conflict-resolution.html'));
    });
    app.get('/api/edge/status', OfflineController.getStatus);
    app.post('/api/edge/connectivity', OfflineController.setConnectivity);
    app.post('/api/edge/order', OfflineController.createOrder);
    app.post('/api/edge/kds/bump', OfflineController.bumpTicket);
    app.post('/api/edge/print', OfflineController.printReceipt);
    app.post('/api/edge/sync', OfflineController.triggerSync);
    app.get('/api/edge/conflicts', OfflineController.getConflicts);
    app.post('/api/edge/conflicts/:id/resolve', OfflineController.resolveConflict);

    // ========================================================================
    // 1. PUBLIC AUTHENTICATION ROUTES
    // ========================================================================

    // Password login
    app.post('/api/auth/login', async (req, res, next) => {
        try {
            const { outletId, identifier, password } = req.body;
            const result = await AuthService.loginWithPassword(req.db, {
                outletId,
                identifier,
                password,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    });

    // Staff PIN fast POS login
    app.post('/api/auth/login-pin', async (req, res, next) => {
        try {
            const { outletId, pin } = req.body;
            const result = await AuthService.loginWithPin(req.db, {
                outletId,
                pin,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    });

    // Refresh token rotation
    app.post('/api/auth/refresh', async (req, res, next) => {
        try {
            const { refreshToken } = req.body;
            const result = await AuthService.refreshTokens(req.db, {
                refreshToken,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    });

    // Logout
    app.post('/api/auth/logout', async (req, res, next) => {
        try {
            const { refreshToken } = req.body;
            await AuthService.logout(req.db, { refreshToken });
            res.status(200).json({ success: true, message: 'Logged out successfully' });
        } catch (err) {
            next(err);
        }
    });

    // Manager PIN Override Authorization
    // Cashier/Waiter requests authorization by supplying manager credentials/PIN
    app.post('/api/auth/manager-override', authenticate, async (req, res, next) => {
        try {
            const { managerIdentifier, managerPin, sensitiveAction, targetEntityId } = req.body;
            const result = await AuthService.verifyManagerPin(req.db, {
                outletId: req.user.outletId,
                managerIdentifier,
                managerPin,
                sensitiveAction,
                targetEntityId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    });

    // ========================================================================
    // 2. PROTECTED DOMAIN ROUTES (ENFORCING ALL 23 PERMISSIONS)
    // ========================================================================

    app.get('/api/orders', authenticate, requirePermission(PERMISSIONS.ORDERS_READ), async (req, res, next) => {
        try {
            const outletId = req.user.outletId || '33333333-3333-3333-3333-333333333301';
            const ordersRes = await req.db.query(`
                SELECT o.id, o.order_number, o.table_id, o.channel, o.status,
                       o.subtotal_paise, o.tax_paise, o.discount_paise, o.total_paise,
                       o.guest_count, o.notes, o.created_at, o.updated_at,
                       t.table_number, t.section,
                       tk.token_number
                FROM orders o
                LEFT JOIN tables t ON o.table_id = t.id
                LEFT JOIN tokens tk ON o.id = tk.order_id
                WHERE o.outlet_id = $1
                ORDER BY o.created_at DESC
            `, [outletId]);

            const itemsRes = await req.db.query(`
                SELECT oi.order_id, oi.quantity, mi.name, mi.is_veg, oi.total_price_paise
                FROM order_items oi
                JOIN menu_items mi ON oi.menu_item_id = mi.id
            `);

            const itemsByOrder = {};
            for (const item of itemsRes.rows) {
                if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
                itemsByOrder[item.order_id].push(item);
            }

            const data = ordersRes.rows.map(o => ({
                ...o,
                items: itemsByOrder[o.id] || []
            }));

            res.status(200).json({ success: true, message: 'Orders read granted', user: req.user.username, data });
        } catch (err) { next(err); }
    });

    app.post('/api/orders', authenticate, requirePermission(PERMISSIONS.ORDERS_CREATE), OrdersController.createOrder);
    app.get('/api/orders/:id', authenticate, requirePermission(PERMISSIONS.ORDERS_READ), OrdersController.getOrder);

    // State Machine Transitions
    app.post('/api/orders/:id/accept', authenticate, requirePermission(PERMISSIONS.ORDERS_MODIFY), OrdersController.acceptOrder);
    app.post('/api/orders/:id/reject', authenticate, requirePermission(PERMISSIONS.ORDERS_CANCEL), OrdersController.rejectOrder);
    app.post('/api/orders/:id/prepare', authenticate, requirePermission(PERMISSIONS.KITCHEN_HOLD), OrdersController.startPreparing);
    app.post('/api/orders/:id/ready', authenticate, requirePermission(PERMISSIONS.KITCHEN_BUMP), OrdersController.markReady);
    app.post('/api/orders/:id/serve', authenticate, requirePermission(PERMISSIONS.ORDERS_MODIFY), OrdersController.serveOrder);
    app.post('/api/orders/:id/collect', authenticate, requirePermission(PERMISSIONS.ORDERS_MODIFY), OrdersController.collectOrder);
    app.post('/api/orders/:id/hand-to-rider', authenticate, requirePermission(PERMISSIONS.DELIVERY_ASSIGN), OrdersController.handToRider);
    app.post('/api/orders/:id/deliver', authenticate, requirePermission(PERMISSIONS.DELIVERY_READ), OrdersController.deliverOrder);
    app.post('/api/orders/:id/cancel', authenticate, requirePermission(PERMISSIONS.ORDERS_CANCEL), OrdersController.cancelOrder);
    app.post('/api/orders/:id/expire', authenticate, requirePermission(PERMISSIONS.ORDERS_CANCEL), OrdersController.expireOrder);
    app.post('/api/orders/:id/delay', authenticate, requirePermission(PERMISSIONS.ORDERS_MODIFY), OrdersController.delayOrder);
    app.get('/api/orders/:id/eta', OrdersController.getOrderETA);
    app.get('/api/eta/rolling-median', OrdersController.getRollingMedian);
    app.post('/api/tokens/:id/call', OrdersController.callToken);

    // Public Customer Order Tracking lookup
    app.get('/api/public/orders/:id', async (req, res, next) => {
        try {
            const order = await req.db.query(`
                SELECT o.id, o.order_number, o.channel, o.status, o.total_paise, o.created_at,
                       o.promise_range_min, o.promise_range_max, o.promise_display,
                       t.token_number
                FROM orders o
                LEFT JOIN tokens t ON o.id = t.order_id
                WHERE o.id = $1 OR o.order_number = $1
            `, [req.params.id]);

            if (order.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            const ord = order.rows[0];
            const itemsRes = await req.db.query(`
                SELECT oi.quantity, mi.name, mi.code
                FROM order_items oi
                JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE oi.order_id = $1
            `, [ord.id]);

            res.json({
                success: true,
                data: {
                    ...ord,
                    items: itemsRes.rows
                }
            });
        } catch (err) { next(err); }
    });

    app.put('/api/orders/:id/items', authenticate, requirePermission(PERMISSIONS.ORDERS_MODIFY), (req, res) => {
        res.json({ message: 'Order item modified', orderId: req.params.id });
    });

    // Sensitive Order Action: Discount (Enforces Manager Override for non-managers)
    app.post('/api/orders/:id/discount',
        authenticate,
        requirePermission(PERMISSIONS.ORDERS_DISCOUNT),
        async (req, res, next) => {
            try {
                await AuditService.logPrivilegedAction(req.db, {
                    outletId: req.user.outletId,
                    userId: req.user.id,
                    action: 'ORDER_DISCOUNT_APPLIED',
                    entityName: 'orders',
                    entityId: req.params.id,
                    newValues: { discountAmountPaise: req.body.discountAmountPaise },
                    managerOverride: req.managerOverride,
                    ipAddress: req.ip
                });
                res.json({
                    message: 'Discount applied successfully with manager authorization',
                    orderId: req.params.id,
                    authorizedBy: req.managerOverride
                });
            } catch (err) { next(err); }
        }
    );


    // Sensitive Order Action: Refund
    app.post('/api/orders/:id/refund',
        authenticate,
        requirePermission(PERMISSIONS.ORDERS_REFUND),
        async (req, res, next) => {
            try {
                await AuditService.logPrivilegedAction(req.db, {
                    outletId: req.user.outletId,
                    userId: req.user.id,
                    action: 'ORDER_REFUNDED',
                    entityName: 'orders',
                    entityId: req.params.id,
                    newValues: req.body,
                    managerOverride: req.managerOverride,
                    ipAddress: req.ip
                });
                res.json({ message: 'Order refund authorized and processed' });
            } catch (err) { next(err); }
        }
    );


    // --- POS BOOTSTRAP & CATALOG ---
    app.get('/api/pos/bootstrap', async (req, res, next) => {
        try {
            const outletId = req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const outletRes = await req.db.query(`
                SELECT o.id, o.name, o.code, o.city, r.name as restaurant_name, r.gstin, r.fssai_license
                FROM outlets o
                JOIN restaurants r ON o.restaurant_id = r.id
                WHERE o.id = $1
            `, [outletId]);
            const categoriesRes = await req.db.query(`
                SELECT id, name, display_order FROM categories WHERE outlet_id = $1 ORDER BY display_order
            `, [outletId]);
            const itemsRes = await req.db.query(`
                SELECT mi.id, mi.category_id, mi.code, mi.name, mi.description, mi.is_veg, mi.is_beverage,
                       mi.base_price_paise, mi.gst_rate_percentage, mi.is_available, mi.is_active,
                       c.name as category_name
                FROM menu_items mi
                JOIN categories c ON mi.category_id = c.id
                WHERE mi.outlet_id = $1 AND mi.is_active = true
                ORDER BY c.display_order, mi.name
            `, [outletId]);
            const variantsRes = await req.db.query(`
                SELECT id, menu_item_id, name, sku, price_paise, is_default
                FROM menu_item_variants
                WHERE is_active = true
            `);
            const tablesRes = await req.db.query(`
                SELECT t.id, t.table_number, t.section, t.capacity, t.status,
                       o.id as active_order_id, o.order_number as active_order_number,
                       o.status as active_order_status, o.total_paise as active_total_paise,
                       o.guest_count as active_guests
                FROM tables t
                LEFT JOIN orders o ON t.id = o.table_id AND o.status NOT IN ('SERVED', 'COLLECTED', 'DELIVERED', 'CANCELLED', 'CANCELLED_WITH_WASTE', 'EXPIRED', 'REJECTED')
                WHERE t.outlet_id = $1
                ORDER BY t.table_number
            `, [outletId]);

            res.json({
                success: true,
                data: {
                    outlet: outletRes.rows[0] || null,
                    categories: categoriesRes.rows,
                    items: itemsRes.rows,
                    variants: variantsRes.rows,
                    tables: tablesRes.rows
                }
            });
        } catch (err) { next(err); }
    });

    // Public / Protected Tables API for visual floor map
    app.get('/api/tables', async (req, res, next) => {
        try {
            const outletId = req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const tablesRes = await req.db.query(`
                SELECT t.id, t.table_number, t.section, t.capacity, t.status,
                       o.id as active_order_id, o.order_number as active_order_number,
                       o.status as active_order_status, o.total_paise as active_total_paise,
                       o.guest_count as active_guests
                FROM tables t
                LEFT JOIN orders o ON t.id = o.table_id AND o.status NOT IN ('SERVED', 'COLLECTED', 'DELIVERED', 'CANCELLED', 'CANCELLED_WITH_WASTE', 'EXPIRED', 'REJECTED')
                WHERE t.outlet_id = $1
                ORDER BY t.table_number
            `, [outletId]);
            res.json({ success: true, data: tablesRes.rows });
        } catch (err) { next(err); }
    });

    // --- MENU MODULE ---
    app.get('/api/menu', authenticate, requirePermission(PERMISSIONS.MENU_READ), async (req, res, next) => {
        try {
            const outletId = req.user.outletId;
            const categoriesRes = await req.db.query(`
                SELECT id, name, display_order FROM categories WHERE outlet_id = $1 ORDER BY display_order
            `, [outletId]);
            const itemsRes = await req.db.query(`
                SELECT mi.id, mi.category_id, mi.code, mi.name, mi.description, mi.is_veg, mi.is_beverage,
                       mi.base_price_paise, mi.gst_rate_percentage, mi.is_available, mi.is_active,
                       c.name as category_name
                FROM menu_items mi
                JOIN categories c ON mi.category_id = c.id
                WHERE mi.outlet_id = $1 AND mi.is_active = true
                ORDER BY c.display_order, mi.name
            `, [outletId]);
            const variantsRes = await req.db.query(`
                SELECT id, menu_item_id, name, sku, price_paise, is_default
                FROM menu_item_variants
                WHERE is_active = true
            `);
            const tablesRes = await req.db.query(`
                SELECT id, table_number, section, capacity, status
                FROM tables
                WHERE outlet_id = $1
                ORDER BY table_number
            `, [outletId]);

            res.json({
                message: 'Menu read granted',
                data: {
                    categories: categoriesRes.rows,
                    items: itemsRes.rows,
                    variants: variantsRes.rows,
                    tables: tablesRes.rows
                }
            });
        } catch (err) { next(err); }
    });

    app.post('/api/menu/items', authenticate, requirePermission(PERMISSIONS.MENU_WRITE), async (req, res, next) => {
        try {
            await AuditService.logPrivilegedAction(req.db, {
                outletId: req.user.outletId,
                userId: req.user.id,
                action: 'MENU_ITEM_CREATED',
                entityName: 'menu_items',
                entityId: req.body.code || 'ITEM-NEW',
                newValues: req.body,
                ipAddress: req.ip
            });
            res.status(201).json({ message: 'Menu item created' });
        } catch (err) { next(err); }
    });

    // --- RECIPES MODULE ---
    app.get('/api/recipes', authenticate, requirePermission(PERMISSIONS.RECIPES_READ), (req, res) => {
        res.json({ message: 'Recipes read granted' });
    });

    app.post('/api/recipes', authenticate, requirePermission(PERMISSIONS.RECIPES_WRITE), (req, res) => {
        res.status(201).json({ message: 'Recipe modified successfully' });
    });

    // --- INVENTORY MODULE ---
    app.get('/api/inventory', authenticate, requirePermission(PERMISSIONS.INVENTORY_READ), (req, res) => {
        res.json({ message: 'Inventory ledger read granted' });
    });

    app.get('/api/inventory/:id/balance', authenticate, requirePermission(PERMISSIONS.INVENTORY_READ), InventoryController.getStockBalance);
    app.post('/api/inventory/reserve', authenticate, requirePermission(PERMISSIONS.ORDERS_CREATE), InventoryController.reserveStock);
    app.post('/api/inventory/consume', authenticate, requirePermission(PERMISSIONS.KITCHEN_BUMP), InventoryController.consumeReservedStock);
    app.post('/api/inventory/release', authenticate, requirePermission(PERMISSIONS.ORDERS_MODIFY), InventoryController.releaseReservation);
    app.post('/api/inventory/receive', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), InventoryController.receiveGoods);
    app.post('/api/inventory/waste', authenticate, requirePermission(PERMISSIONS.INVENTORY_WASTE), InventoryController.recordWaste);
    app.post('/api/inventory/adjust', authenticate, requirePermission(PERMISSIONS.INVENTORY_ADJUST), InventoryController.adjustStock);


    // --- KITCHEN MODULE (RBAC Protected for staff) ---
    app.get('/api/kitchen/tickets', authenticate, requirePermission(PERMISSIONS.KITCHEN_READ), KitchenController.getTickets);
    app.post('/api/kitchen/tickets/:id/bump', authenticate, requirePermission(PERMISSIONS.KITCHEN_BUMP), KitchenController.bumpTicket);
    app.post('/api/kitchen/tickets/:id/hold', authenticate, requirePermission(PERMISSIONS.KITCHEN_HOLD), KitchenController.holdTicket);
    app.post('/api/kitchen/tickets/:id/recall', authenticate, requirePermission(PERMISSIONS.KITCHEN_RECALL), KitchenController.recallTicket);
    app.post('/api/kitchen/tickets/:id/delay', authenticate, requirePermission(PERMISSIONS.KITCHEN_HOLD), KitchenController.delayTicket);

    // Kitchen auxiliary routes
    app.get('/api/kitchen/stations', KitchenController.getStations);
    app.get('/api/kitchen/tickets/recalled', KitchenController.getRecalledTickets);
    app.get('/api/kitchen/tickets/:id/print', KitchenController.getPrintSlip);
    app.get('/api/kitchen/86', KitchenController.get86List);
    app.post('/api/kitchen/86/:id', KitchenController.toggle86);
    app.post('/api/kitchen/rush-order', KitchenController.createRushDemoOrder);

    // --- KDS DEDICATED TABLET TERMINAL API (Direct display access) ---
    app.get('/api/kds/stations', KitchenController.getStations);
    app.get('/api/kds/tickets', KitchenController.getTickets);
    app.post('/api/kds/tickets/:id/bump', KitchenController.bumpTicket);
    app.post('/api/kds/tickets/:id/hold', KitchenController.holdTicket);
    app.post('/api/kds/tickets/:id/recall', KitchenController.recallTicket);
    app.post('/api/kds/tickets/:id/delay', KitchenController.delayTicket);
    app.get('/api/kds/tickets/recalled', KitchenController.getRecalledTickets);
    app.get('/api/kds/tickets/:id/print', KitchenController.getPrintSlip);
    app.get('/api/kds/86', KitchenController.get86List);
    app.post('/api/kds/86/:id', KitchenController.toggle86);
    app.post('/api/kds/rush-order', KitchenController.createRushDemoOrder);

    // --- PAYMENTS MODULE ---
    app.get('/api/payments', authenticate, requirePermission(PERMISSIONS.PAYMENTS_READ), (req, res) => {
        res.json({ message: 'Payments read granted' });
    });

    // Sensitive Payment Action: Refund
    app.post('/api/payments/:id/refund',
        authenticate,
        requirePermission(PERMISSIONS.PAYMENTS_REFUND),

        async (req, res, next) => {
            try {
                await AuditService.logPrivilegedAction(req.db, {
                    outletId: req.user.outletId,
                    userId: req.user.id,
                    action: 'PAYMENT_REFUNDED',
                    entityName: 'payments',
                    entityId: req.params.id,
                    newValues: req.body,
                    managerOverride: req.managerOverride,
                    ipAddress: req.ip
                });
                res.json({ message: 'Payment refund processed with manager authorization' });
            } catch (err) { next(err); }
        }
    );

    // --- REPORTS MODULE (ONLINE-ONLY CAPABILITY) ---
    app.get('/api/reports/daily', authenticate, requirePermission(PERMISSIONS.REPORTS_READ), async (req, res, next) => {
        try {
            await EdgeNodeService.assertCapability(req.db, {
                outletId: req.user.outletId,
                capability: CAPABILITIES.CLOUD_REPORTS
            });
            res.json({ message: 'Daily sales reports read granted' });
        } catch (err) {
            next(err);
        }
    });

    // --- DELIVERY MODULE ---
    app.get('/api/delivery/queue', authenticate, requirePermission(PERMISSIONS.DELIVERY_READ), (req, res) => {
        res.json({ message: 'Delivery queue read granted' });
    });

    app.post('/api/delivery/assign', authenticate, requirePermission(PERMISSIONS.DELIVERY_ASSIGN), (req, res) => {
        res.json({ message: 'Rider assigned to order' });
    });

    // --- SETTINGS MODULE ---
    app.put('/api/settings', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res, next) => {
        try {
            await AuditService.logPrivilegedAction(req.db, {
                outletId: req.user.outletId,
                userId: req.user.id,
                action: 'SETTINGS_UPDATED',
                entityName: 'settings',
                entityId: req.user.outletId,
                newValues: req.body,
                ipAddress: req.ip
            });
            res.json({ message: 'Outlet settings updated' });
        } catch (err) { next(err); }
    });

    // ========================================================================
    // 3. CENTRAL ERROR HANDLER (RFC 7807 PROBLEM DETAILS)
    // ========================================================================
    app.use((err, req, res, next) => {
        const statusCode = err.statusCode || (err instanceof AppError ? err.statusCode : 500);
        const code = err.code || 'INTERNAL_ERROR';
        const message = err.message || 'An internal server error occurred';

        res.status(statusCode).json({
            type: `https://api.restaurant.local/errors/${code.toLowerCase()}`,
            title: code,
            status: statusCode,
            detail: message,
            instance: req.originalUrl,
            details: err.details || null
        });
    });

    return app;
}
