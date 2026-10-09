// Customer QR Ordering Controller
// Secure table session validation, menu catalog retrieval, order placement, and KDS integration
import { QRSessionService, normalizeTableIdentifier } from './qr-session.service.js';
import { OrderService } from '../orders/order.service.js';
import { KitchenService } from '../kitchen/kitchen.service.js';
import { ORDER_CHANNELS, ORDER_STATUSES } from '../orders/order-state-machine.js';
import { wsHub, WS_EVENTS } from '../realtime/websocket-hub.js';
import { EdgeNodeService, CAPABILITIES } from '../offline/edge-node.service.js';
import { AppError, ValidationError } from '../../shared/errors.js';

export class QRController {
    /**
     * Generate or rotate signed short-lived session token for a table
     * Used by POS, management, or QR badge printing
     * POST /api/qr/tables/:table/session or POST /api/qr/session/generate
     */
    static async generateSession(req, res, next) {
        try {
            const tableIdentifier = req.params.table || req.body.tableIdentifier || req.body.tableNumber;
            const outletId = req.body.outletId || req.query.outletId || '33333333-3333-3333-3333-333333333301';
            const expiresInMinutes = parseInt(req.body.expiresInMinutes || req.query.expiresInMinutes || 120, 10);

            if (!tableIdentifier) {
                throw new ValidationError('Table identifier (e.g. 7 or T-07) is required');
            }

            const table = await QRSessionService.resolveTable(req.db, {
                outletId,
                tableIdentifier
            });

            const session = QRSessionService.generateSessionToken({
                outletId,
                tableId: table.id,
                tableNumber: table.table_number,
                expiresInMinutes
            });

            // Store active session token on table
            await req.db.query(`
                UPDATE tables
                SET qr_code_token = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [session.token, table.id]);

            res.status(200).json({
                success: true,
                message: `Signed QR session generated for Table ${table.table_number}`,
                data: session
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Validate session token and return table details + full menu catalog for PWA
     * GET /api/qr/session/validate?table=7&token=xxxx
     */
    static async validateSession(req, res, next) {
        try {
            const tableIdentifier = req.query.table || req.params.table;
            const token = req.query.token || req.headers['x-qr-session-token'];
            const outletId = req.query.outletId || '33333333-3333-3333-3333-333333333301';

            if (!tableIdentifier) {
                throw new ValidationError('Table identifier is required');
            }
            if (!token) {
                throw new AppError(
                    'Signed session token required. Direct unauthenticated table access (/table/7) is blocked to prevent abuse.',
                    401,
                    'QR_SESSION_REQUIRED'
                );
            }

            const table = await QRSessionService.resolveTable(req.db, {
                outletId,
                tableIdentifier
            });

            // Cryptographic validation + table binding + expiration check
            const verification = QRSessionService.verifySessionToken(token, {
                expectedTableIdentifier: table.table_number,
                expectedTableId: table.id,
                expectedOutletId: outletId
            });

            // Fetch Outlet info
            const outletRes = await req.db.query(`
                SELECT o.id, o.name, o.code, o.city, r.name as restaurant_name, r.gstin, r.fssai_license
                FROM outlets o
                JOIN restaurants r ON o.restaurant_id = r.id
                WHERE o.id = $1
            `, [outletId]);

            // Fetch Categories
            const categoriesRes = await req.db.query(`
                SELECT id, name, display_order
                FROM categories
                WHERE outlet_id = $1
                ORDER BY display_order ASC
            `, [outletId]);

            // Fetch Menu Items (including 86 live status)
            const itemsRes = await req.db.query(`
                SELECT mi.id, mi.category_id, mi.code, mi.name, mi.description, mi.is_veg, mi.is_beverage,
                       mi.base_price_paise, mi.gst_rate_percentage, mi.is_available, mi.is_active,
                       c.name as category_name
                FROM menu_items mi
                JOIN categories c ON mi.category_id = c.id
                WHERE mi.outlet_id = $1 AND mi.is_active = true
                ORDER BY c.display_order, mi.name
            `, [outletId]);

            // Fetch Item Variants
            const variantsRes = await req.db.query(`
                SELECT id, menu_item_id, name, sku, price_paise, is_default
                FROM menu_item_variants
                WHERE is_active = true
            `);

            // Fetch active order for this table if any
            const activeOrderRes = await req.db.query(`
                SELECT id, order_number, status, total_paise, promise_display, created_at
                FROM orders
                WHERE table_id = $1 AND status IN ('PLACED', 'ACCEPTED', 'PREPARING')
                ORDER BY created_at DESC
                LIMIT 1
            `, [table.id]);

            res.status(200).json({
                success: true,
                data: {
                    valid: true,
                    table: {
                        id: table.id,
                        tableNumber: table.table_number,
                        section: table.section,
                        capacity: table.capacity,
                        displayBadge: `TABLE ${table.table_number.replace(/^T-/, '')}`
                    },
                    session: {
                        token,
                        remainingMinutes: verification.remainingMinutes,
                        expiresAt: new Date(verification.payload.exp).toISOString()
                    },
                    outlet: outletRes.rows[0] || null,
                    categories: categoriesRes.rows,
                    menuItems: itemsRes.rows,
                    variants: variantsRes.rows,
                    activeTableOrder: activeOrderRes.rows[0] || null
                }
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Submit Order from Customer Table PWA
     * Verifies signed token, creates order, generates KDS station tickets, notifies kitchen
     * POST /api/qr/orders
     */
    static async placeQrOrder(req, res, next) {
        try {
            const sessionToken = req.body.sessionToken || req.body.token;
            const {
                table: tableParam,
                tableIdentifier,
                outletId = '33333333-3333-3333-3333-333333333301',
                customer = {},
                items = [],
                notes = null,
                paymentMethod = 'UPI_INSTANT', // 'UPI_INSTANT' or 'PAY_AT_COUNTER'
                idempotencyKey = null
            } = req.body;

            const targetTable = tableParam || tableIdentifier;
            if (!targetTable) {
                throw new ValidationError('Table identifier is required');
            }
            if (!sessionToken) {
                throw new AppError(
                    'Signed session token is required to place a table order. Direct submission blocked.',
                    401,
                    'QR_SESSION_REQUIRED'
                );
            }
            if (!items || items.length === 0) {
                throw new ValidationError('Order cart must contain at least one item');
            }

            // Online-Only Capability Check: Block customer online ordering when outlet is offline
            await EdgeNodeService.assertCapability(req.db, {
                outletId,
                capability: CAPABILITIES.ONLINE_CUSTOMER_ORDERING
            });

            // 1. Resolve table & verify signed session token
            const table = await QRSessionService.resolveTable(req.db, {
                outletId,
                tableIdentifier: targetTable
            });

            QRSessionService.verifySessionToken(sessionToken, {
                expectedTableIdentifier: table.table_number,
                expectedTableId: table.id,
                expectedOutletId: outletId
            });

            // 2. Format items for OrderService
            const orderItems = items.map(it => ({
                menuItemId: it.menuItemId || it.id,
                variantId: it.variantId || null,
                quantity: parseInt(it.quantity, 10) || 1,
                notes: it.notes || null
            }));

            // 3. Upsert Customer Record if customer info is provided
            let customerId = null;
            if (customer.phone) {
                const custRes = await req.db.query(`
                    INSERT INTO customers (outlet_id, phone, name)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                    RETURNING id
                `, [outletId, customer.phone, customer.name || 'Table Guest']);
                if (custRes.rows.length > 0) {
                    customerId = custRes.rows[0].id;
                } else {
                    const existingCust = await req.db.query(
                        `SELECT id FROM customers WHERE outlet_id = $1 AND phone = $2 LIMIT 1`,
                        [outletId, customer.phone]
                    );
                    customerId = existingCust.rows[0]?.id || null;
                }
            }

            // 4. Create Order in Database (Single ACID transaction with inventory reservation & outbox)
            const result = await OrderService.createOrder(req.db, {
                outletId,
                channel: ORDER_CHANNELS.QR,
                tableId: table.id,
                customerId,
                guestCount: table.capacity || 2,
                items: orderItems,
                notes: notes ? String(notes).trim() : null,
                idempotencyKey: idempotencyKey || null,
                paymentRequiredUpfront: false
            });

            const order = result.order;

            // 5. Create Multi-Station Kitchen Tickets (CURRY, TANDOOR, GRILL, WOK, PACKING)
            let stationTickets = [];
            try {
                stationTickets = await KitchenService.createStationTicketsForOrder(req.db, {
                    orderId: order.id,
                    outletId
                });
            } catch (kErr) {
                console.error('[QRController] Station ticket creation error:', kErr.message);
            }

            // 6. If Instant UPI payment selected, record simulated payment receipt
            if (paymentMethod === 'UPI_INSTANT') {
                try {
                    const invoiceNum = `INV-${order.order_number.replace('ORD-', '')}`;
                    const payRes = await req.db.query(`
                        INSERT INTO payments (
                            outlet_id, order_id, invoice_number, total_amount_paise,
                            paid_amount_paise, balance_amount_paise, status
                        ) VALUES ($1, $2, $3, $4, $4, 0, 'PAID')
                        RETURNING id
                    `, [outletId, order.id, invoiceNum, order.total_paise]);

                    if (payRes.rows.length > 0) {
                        const utr = `UPI${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
                        await req.db.query(`
                            INSERT INTO payment_transactions (
                                payment_id, method, amount_paise, status, gateway_provider, gateway_reference_id
                            ) VALUES ($1, 'UPI', $2, 'SUCCESS', 'UPI_QR_INTENT', $3)
                        `, [payRes.rows[0].id, order.total_paise, utr]);
                    }
                } catch (payErr) {
                    console.error('[QRController] Payment recording warning:', payErr.message);
                }
            }

            // 7. Update table status to OCCUPIED
            await req.db.query(`
                UPDATE tables
                SET status = 'OCCUPIED', updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [table.id]);

            // 8. WebSocket broadcast to KDS and POS
            wsHub.emitOrderEvent(WS_EVENTS.ORDER_CREATED, {
                orderId: order.id,
                orderNumber: order.order_number,
                channel: 'QR',
                tableNumber: table.table_number,
                status: order.status,
                totalPaise: order.total_paise,
                promiseDisplay: order.promiseDisplay,
                stationTicketsCount: stationTickets.length,
                notes: order.notes
            });

            res.status(201).json({
                success: true,
                message: `Order #${order.order_number} successfully placed for Table ${table.table_number}`,
                data: {
                    orderId: order.id,
                    orderNumber: order.order_number,
                    channel: 'QR',
                    status: order.status,
                    tableNumber: table.table_number,
                    tableSection: table.section,
                    tokenNumber: order.token?.token_number || null,
                    totalPaise: order.total_paise,
                    totalFormatted: (order.total_paise / 100).toFixed(2),
                    promiseDisplay: order.promiseDisplay,
                    promiseRange: order.promiseRange,
                    trackingUrl: `/track/${order.id}`,
                    stationTicketsCount: stationTickets.length,
                    stationTickets: stationTickets.map(st => ({
                        stationCode: st.stationCode,
                        stationName: st.stationName,
                        kotNumber: st.kotNumber
                    }))
                }
            });
        } catch (err) {
            next(err);
        }
    }
}
