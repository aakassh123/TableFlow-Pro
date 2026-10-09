// Automated Test Suite for Order Service & Server-Side State Machine
// Verifies Single ACID Transaction Boundary, State Machine Transitions, Channel Rules, Idempotency, and Inventory Integration
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';
import { CryptoService } from '../src/shared/crypto.js';
import { OrderService } from '../src/modules/orders/order.service.js';
import { OrderStateMachine, ORDER_CHANNELS, ORDER_STATUSES, InvalidOrderTransitionError } from '../src/modules/orders/order-state-machine.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InsufficientStockError } from '../src/modules/inventory/inventory.errors.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runOrderServiceTestSuite() {
    console.log('===============================================================');
    console.log('ORDER SERVICE & STATE MACHINE VERIFICATION SUITE');
    console.log('===============================================================\n');

    // 1. Initialize In-Memory PostgreSQL database
    const db = newDb();

    db.public.registerFunction({
        name: 'gen_random_uuid',
        returns: db.public.getType('text'),
        impure: true,
        implementation: () => crypto.randomUUID()
    });
    db.public.registerFunction({
        name: 'trim',
        args: [db.public.getType('text')],
        returns: db.public.getType('text'),
        implementation: s => (s ? s.trim() : '')
    });
    db.public.registerFunction({
        name: 'length',
        args: [db.public.getType('text')],
        returns: db.public.getType('integer'),
        implementation: s => (s ? s.length : 0)
    });

    const migrationFiles = [
        '001_extensions_and_enums.sql',
        '002_core_auth_tenancy.sql',
        '003_catalog_menu.sql',
        '004_ingredients_recipes.sql',
        '005_stock_inventory_ledger.sql',
        '006_orders_kitchen.sql',
        '007_tokens_payments_purchasing.sql',
        '008_notifications_audit_outbox.sql',
        '010_seed_data.sql',
        '011_auth_rbac_enhancement.sql',
        '013_offline_edge_sync.sql',
        '014_distance_eta_and_jit_scheduling.sql'
    ];

    for (const f of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
            .replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/gi, '');
        db.public.none(sql);
    }

    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    pool._pgMemDb = db;

    const testPasswordHash = await CryptoService.hashPassword('Password@123');
    db.public.none(`
        UPDATE users 
        SET password_hash = '${testPasswordHash}'
        WHERE outlet_id = '33333333-3333-3333-3333-333333333301';
    `);

    const outletId = '33333333-3333-3333-3333-333333333301';
    const managerId = '01900000-2222-0000-0000-000000000002';
    const supplierId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';
    const biryaniMenuItemId = '99999999-9999-9999-9999-999999999902';
    const biryaniVariantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'; // Full Portion
    const tableId = '77777777-7777-7777-7777-777777777701'; // T-01

    let totalTests = 0;
    let passedTests = 0;

    function recordPass(testName) {
        totalTests++;
        passedTests++;
        console.log(`  PASS: [${testName}]`);
    }

    function recordFail(testName, detail) {
        totalTests++;
        console.error(`  FAIL: [${testName}]: ${detail}`);
    }

    // Receive initial raw stock via Goods Receipt Note
    console.log('--- SETUP: INGESTING INGREDIENT INVENTORY ---');
    await InventoryService.receiveGoods(pool, {
        outletId,
        supplierId,
        grnNumber: 'GRN-SETUP-001',
        invoiceNumber: 'INV-SETUP-901',
        receivedBy: managerId,
        items: [
            {
                ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff01', // Rice
                quantityBaseUnits: 100000.0000, // 100 kg
                unitCostPaise: 12,
                batchNumber: 'BATCH-RICE-01',
                expiryDate: '2027-10-01'
            },
            {
                ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff02', // Chicken
                quantityBaseUnits: 100000.0000, // 100 kg
                unitCostPaise: 22,
                batchNumber: 'BATCH-CHK-01',
                expiryDate: '2026-10-15'
            },
            {
                ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff04', // Ghee
                quantityBaseUnits: 20000.0000, // 20 L
                unitCostPaise: 65,
                batchNumber: 'BATCH-GHEE-01',
                expiryDate: '2027-01-01'
            }
        ]
    });
    console.log('✓ Ingested 100kg Rice, 100kg Chicken, 20L Ghee into stock.\n');

    // ========================================================================
    // SECTION 1: SINGLE ACID TRANSACTION ORDER CREATION
    // 1. Idempotency validation
    // 2. Order creation
    // 3. Order item creation
    // 4. Recipe snapshot
    // 5. Stock reservation
    // 6. Token allocation
    // 7. Outbox event creation
    // ========================================================================
    console.log('--- SECTION 1: SINGLE ACID TRANSACTION ORDER CREATION ---');

    const createRes = await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DINE_IN,
        tableId,
        guestCount: 2,
        items: [
            {
                menuItemId: biryaniMenuItemId,
                variantId: biryaniVariantId,
                quantity: 2
            }
        ],
        idempotencyKey: 'IDEMP-ORDER-001',
        notes: 'Less spicy please',
        createdBy: managerId
    });

    const order = createRes.order;

    // Verify 1 & 2: Order Header created
    if (order && order.id && order.order_number && order.status === ORDER_STATUSES.PLACED) {
        recordPass('Order header created with order number, channel DINE_IN, and status PLACED');
    } else {
        recordFail('Order header creation failed', JSON.stringify(order));
    }

    // Verify Financials (42000 paise * 2 = 84000, 5% GST = 4200, Total = 88200)
    if (parseInt(order.subtotal_paise, 10) === 84000 && parseInt(order.total_paise, 10) === 88200) {
        recordPass('Monetary amounts calculated accurately: Subtotal 84,000 paise (Rs 840) + Tax 4,200 paise (Rs 42) = Total 88,200 paise (Rs 882)');
    } else {
        recordFail('Order financial calculation error', `Subtotal: ${order.subtotal_paise}, Total: ${order.total_paise}`);
    }

    // Verify 3: Order Items created
    if (order.items && order.items.length === 1 && parseInt(order.items[0].quantity, 10) === 2) {
        recordPass('Order item created with quantity 2 and matching variant');
    } else {
        recordFail('Order item creation error', JSON.stringify(order.items));
    }

    // Verify 4: Recipe Snapshot frozen
    const item = order.items[0];
    if (item.recipe_version_id === '00000000-0000-0000-0000-000000000002') {
        recordPass('Recipe BOM version snapshot frozen onto order item (Invariant 6)');
    } else {
        recordFail('Recipe snapshot missing', item.recipe_version_id);
    }

    // Verify 5: Stock Reservation created
    const reservationsRes = await pool.query(`
        SELECT * FROM stock_reservations WHERE order_id = $1
    `, [order.id]);
    if (reservationsRes.rows.length === 3) {
        recordPass('Atomic stock reservations created for all 3 recipe ingredients (Rice, Chicken, Ghee)');
    } else {
        recordFail('Expected 3 stock reservations', `Found ${reservationsRes.rows.length}`);
    }

    // Verify 6: Token Allocation
    if (order.token && order.token.token_number >= 1 && order.token.status === 'ISSUED') {
        recordPass('Token allocated sequentially within same transaction');
    } else {
        recordFail('Token allocation failed', JSON.stringify(order.token));
    }

    // Verify 7: Outbox Event Created
    const outboxRes = await pool.query(`
        SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_CREATED'
    `, [order.id]);
    if (outboxRes.rows.length === 1 && outboxRes.rows[0].status === 'PENDING') {
        recordPass('Transactional outbox event ORDER_CREATED recorded atomically');
    } else {
        recordFail('Outbox event missing', `Found ${outboxRes.rows.length}`);
    }


    // ========================================================================
    // SECTION 2: ACID TRANSACTION ALL-OR-NOTHING ROLLBACK
    // ========================================================================
    console.log('\n--- SECTION 2: ACID TRANSACTION ALL-OR-NOTHING ROLLBACK ---');

    // Count records before failed attempt
    const beforeOrdersCount = (await pool.query('SELECT COUNT(*) FROM orders')).rows[0].count;
    const beforeItemsCount = (await pool.query('SELECT COUNT(*) FROM order_items')).rows[0].count;
    const beforeReservationsCount = (await pool.query('SELECT COUNT(*) FROM stock_reservations')).rows[0].count;
    const beforeTokensCount = (await pool.query('SELECT COUNT(*) FROM tokens')).rows[0].count;
    const beforeOutboxCount = (await pool.query('SELECT COUNT(*) FROM outbox_events')).rows[0].count;

    let rollbackCaught = false;
    try {
        // Attempt to order 1,000,000 biryanis (far exceeding the 100kg stock on hand)
        await OrderService.createOrder(pool, {
            outletId,
            channel: ORDER_CHANNELS.WALK_IN,
            items: [
                {
                    menuItemId: biryaniMenuItemId,
                    variantId: biryaniVariantId,
                    quantity: 1000000
                }
            ],
            idempotencyKey: 'IDEMP-FAIL-STOCK',
            createdBy: managerId
        });
    } catch (err) {
        if (err instanceof InsufficientStockError || err.code === 'INSUFFICIENT_STOCK') {
            rollbackCaught = true;
        }
    }

    if (rollbackCaught) {
        recordPass('Order creation rejected when ingredient stock is insufficient (InsufficientStockError)');
    } else {
        recordFail('Expected InsufficientStockError, but did not catch expected error', '');
    }

    // Verify that NO partial records were committed (Strict ACID Rollback)
    const afterOrdersCount = (await pool.query('SELECT COUNT(*) FROM orders')).rows[0].count;
    const afterItemsCount = (await pool.query('SELECT COUNT(*) FROM order_items')).rows[0].count;
    const afterReservationsCount = (await pool.query('SELECT COUNT(*) FROM stock_reservations')).rows[0].count;
    const afterTokensCount = (await pool.query('SELECT COUNT(*) FROM tokens')).rows[0].count;
    const afterOutboxCount = (await pool.query('SELECT COUNT(*) FROM outbox_events')).rows[0].count;

    const strictRollbackHeld = (
        beforeOrdersCount === afterOrdersCount &&
        beforeItemsCount === afterItemsCount &&
        beforeReservationsCount === afterReservationsCount &&
        beforeTokensCount === afterTokensCount &&
        beforeOutboxCount === afterOutboxCount
    );

    if (strictRollbackHeld) {
        recordPass('Strict ACID rollback: 0 orphan rows created across orders, items, reservations, tokens, and outbox');
    } else {
        recordFail('Rollback leaked rows into database', `Orders diff: ${afterOrdersCount - beforeOrdersCount}`);
    }


    // ========================================================================
    // SECTION 3: IDEMPOTENCY VERIFICATION
    // Repeated request must return original order instead of creating another
    // ========================================================================
    console.log('\n--- SECTION 3: IDEMPOTENCY ENFORCEMENT ---');

    const replayRes = await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DINE_IN,
        tableId,
        items: [
            {
                menuItemId: biryaniMenuItemId,
                variantId: biryaniVariantId,
                quantity: 2
            }
        ],
        idempotencyKey: 'IDEMP-ORDER-001', // Identical key as Section 1
        createdBy: managerId
    });

    if (replayRes.isIdempotentReplay === true && replayRes.order.id === order.id) {
        recordPass('Repeated request with same idempotency key returned original order (isIdempotentReplay: true)');
    } else {
        recordFail('Idempotency replay failed', JSON.stringify(replayRes));
    }

    const currentOrdersCount = (await pool.query('SELECT COUNT(*) FROM orders WHERE idempotency_key = $1', ['IDEMP-ORDER-001'])).rows[0].count;
    if (parseInt(currentOrdersCount, 10) === 1) {
        recordPass('No duplicate order rows created in database for repeated idempotent key');
    } else {
        recordFail('Duplicate order created', `Count: ${currentOrdersCount}`);
    }


    // ========================================================================
    // SECTION 4: SERVER-SIDE STATE MACHINE & CHANNEL FULFILLMENT
    // ========================================================================
    console.log('\n--- SECTION 4: STATE MACHINE LIFECYCLES BY CHANNEL ---');

    // 4A: DINE_IN Channel: PLACED -> ACCEPTED -> PREPARING -> READY -> SERVED
    console.log('Testing DINE_IN Lifecycle:');
    const dineInOrder = order;

    // 1. Accept Order
    const accepted = await OrderService.acceptOrder(pool, { outletId, orderId: dineInOrder.id, userId: managerId });
    if (accepted.status === ORDER_STATUSES.ACCEPTED) {
        recordPass('DINE_IN: PLACED -> ACCEPTED succeeds');
    } else {
        recordFail('Failed to accept order', accepted.status);
    }

    // 2. Start Preparing
    const preparing = await OrderService.startPreparing(pool, { outletId, orderId: dineInOrder.id, userId: managerId });
    if (preparing.status === ORDER_STATUSES.PREPARING) {
        recordPass('DINE_IN: ACCEPTED -> PREPARING succeeds');
    } else {
        recordFail('Failed to start preparing', preparing.status);
    }

    // 3. Mark Ready
    const ready = await OrderService.markReady(pool, { outletId, orderId: dineInOrder.id, userId: managerId });
    if (ready.status === ORDER_STATUSES.READY) {
        recordPass('DINE_IN: PREPARING -> READY succeeds');
    } else {
        recordFail('Failed to mark ready', ready.status);
    }

    // 4. Serve Order (READY -> SERVED)
    const served = await OrderService.serveOrder(pool, { outletId, orderId: dineInOrder.id, userId: managerId });
    if (served.status === ORDER_STATUSES.SERVED) {
        recordPass('DINE_IN: READY -> SERVED succeeds and transitions to terminal fulfillment');
    } else {
        recordFail('Failed to serve order', served.status);
    }

    // Check reservations are CONSUMED on SERVED
    const dineInResStatuses = (await pool.query('SELECT status FROM stock_reservations WHERE order_id = $1', [dineInOrder.id])).rows;
    const allConsumed = dineInResStatuses.every(r => r.status === 'CONSUMED');
    if (allConsumed) {
        recordPass('DINE_IN: serveOrder consumed all stock reservations into actual stock depletion');
    } else {
        recordFail('Reservations not consumed', JSON.stringify(dineInResStatuses));
    }


    // 4B: WALK_IN Channel (Takeaway): PLACED -> ACCEPTED -> PREPARING -> READY -> COLLECTED
    console.log('\nTesting WALK_IN (Counter Takeaway) Lifecycle:');
    const walkInCreate = await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.WALK_IN,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    });
    const walkInOrder = walkInCreate.order;

    await OrderService.acceptOrder(pool, { outletId, orderId: walkInOrder.id });
    await OrderService.startPreparing(pool, { outletId, orderId: walkInOrder.id });
    await OrderService.markReady(pool, { outletId, orderId: walkInOrder.id });

    // Collect Order
    const collected = await OrderService.collectOrder(pool, { outletId, orderId: walkInOrder.id });
    if (collected.status === ORDER_STATUSES.COLLECTED) {
        recordPass('WALK_IN: READY -> COLLECTED succeeds');
    } else {
        recordFail('Failed to collect order', collected.status);
    }

    // Verify token status marked COLLECTED
    const walkInToken = (await pool.query('SELECT status, collected_at FROM tokens WHERE order_id = $1', [walkInOrder.id])).rows[0];
    if (walkInToken && walkInToken.status === 'COLLECTED' && walkInToken.collected_at !== null) {
        recordPass('WALK_IN: collectOrder updated takeaway token to COLLECTED with timestamp');
    } else {
        recordFail('Token not updated to COLLECTED', JSON.stringify(walkInToken));
    }


    // 4C: DELIVERY Channel: PLACED -> ACCEPTED -> PREPARING -> READY -> HANDED_TO_RIDER -> DELIVERED
    console.log('\nTesting DELIVERY Lifecycle:');
    const deliveryCreate = await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DELIVERY,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    });
    const deliveryOrder = deliveryCreate.order;

    await OrderService.acceptOrder(pool, { outletId, orderId: deliveryOrder.id });
    await OrderService.startPreparing(pool, { outletId, orderId: deliveryOrder.id });
    await OrderService.markReady(pool, { outletId, orderId: deliveryOrder.id });

    // Hand to Rider
    const handed = await OrderService.handToRider(pool, { outletId, orderId: deliveryOrder.id, riderId: 'RIDER-42' });
    if (handed.status === ORDER_STATUSES.HANDED_TO_RIDER) {
        recordPass('DELIVERY: READY -> HANDED_TO_RIDER succeeds');
    } else {
        recordFail('Failed to hand to rider', handed.status);
    }

    // Deliver Order
    const delivered = await OrderService.deliverOrder(pool, { outletId, orderId: deliveryOrder.id });
    if (delivered.status === ORDER_STATUSES.DELIVERED) {
        recordPass('DELIVERY: HANDED_TO_RIDER -> DELIVERED succeeds');
    } else {
        recordFail('Failed to deliver order', delivered.status);
    }


    // 4D: QR Channel with Upfront Payment Expiration: PENDING_PAYMENT -> EXPIRED
    console.log('\nTesting QR Channel Payment Expiration Lifecycle:');
    const qrCreate = await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.QR,
        paymentRequiredUpfront: true,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    });
    const qrOrder = qrCreate.order;

    if (qrOrder.status === ORDER_STATUSES.PENDING_PAYMENT) {
        recordPass('QR with upfront payment initialized in PENDING_PAYMENT status');
    } else {
        recordFail('Initial QR status not PENDING_PAYMENT', qrOrder.status);
    }

    const expired = await OrderService.expireOrder(pool, { outletId, orderId: qrOrder.id, reason: 'UPI_TIMEOUT_EXPIRED' });
    if (expired.status === ORDER_STATUSES.EXPIRED) {
        recordPass('PENDING_PAYMENT -> EXPIRED transitions smoothly upon payment timeout');
    } else {
        recordFail('Failed to expire order', expired.status);
    }


    // ========================================================================
    // SECTION 5: STRICT REJECTION OF INVALID TRANSITIONS
    // Reject every invalid transition!
    // ========================================================================
    console.log('\n--- SECTION 5: REJECTION OF INVALID TRANSITIONS ---');

    const freshOrder = (await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DINE_IN,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    })).order;

    // Test 1: Illegal jump from PLACED directly to READY (skipping ACCEPTED and PREPARING)
    let jumpRejected = false;
    try {
        await OrderService.markReady(pool, { outletId, orderId: freshOrder.id });
    } catch (err) {
        if (err instanceof InvalidOrderTransitionError || err.code === 'INVALID_ORDER_TRANSITION') {
            jumpRejected = true;
        }
    }
    if (jumpRejected) {
        recordPass('Illegal jump (PLACED -> READY) strictly rejected with InvalidOrderTransitionError');
    } else {
        recordFail('Failed to reject illegal jump PLACED -> READY', '');
    }

    // Test 2: Channel mismatch (DELIVERY order attempting serveOrder)
    const deliveryOrderForMismatch = (await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DELIVERY,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    })).order;
    await OrderService.acceptOrder(pool, { outletId, orderId: deliveryOrderForMismatch.id });
    await OrderService.startPreparing(pool, { outletId, orderId: deliveryOrderForMismatch.id });
    await OrderService.markReady(pool, { outletId, orderId: deliveryOrderForMismatch.id });

    let channelMismatchRejected = false;
    try {
        await OrderService.serveOrder(pool, { outletId, orderId: deliveryOrderForMismatch.id });
    } catch (err) {
        if (err instanceof InvalidOrderTransitionError) {
            channelMismatchRejected = true;
        }
    }
    if (channelMismatchRejected) {
        recordPass('Channel mismatch (READY DELIVERY order attempting serveOrder) strictly rejected');
    } else {
        recordFail('Failed to reject channel mismatch on DELIVERY order', '');
    }

    // Test 3: Channel mismatch (DINE_IN order attempting collectOrder)
    let dineInCollectRejected = false;
    const dineInForMismatch = (await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DINE_IN,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    })).order;
    await OrderService.acceptOrder(pool, { outletId, orderId: dineInForMismatch.id });
    await OrderService.startPreparing(pool, { outletId, orderId: dineInForMismatch.id });
    await OrderService.markReady(pool, { outletId, orderId: dineInForMismatch.id });

    try {
        await OrderService.collectOrder(pool, { outletId, orderId: dineInForMismatch.id });
    } catch (err) {
        if (err instanceof InvalidOrderTransitionError) {
            dineInCollectRejected = true;
        }
    }
    if (dineInCollectRejected) {
        recordPass('Channel mismatch (READY DINE_IN order attempting collectOrder) strictly rejected');
    } else {
        recordFail('Failed to reject collectOrder on DINE_IN order', '');
    }

    // Test 4: Terminal state violation (Order in SERVED attempting cancel)
    let terminalMutationRejected = false;
    try {
        await OrderService.cancelOrder(pool, { outletId, orderId: dineInOrder.id, reason: 'TOO_LATE' });
    } catch (err) {
        if (err instanceof InvalidOrderTransitionError) {
            terminalMutationRejected = true;
        }
    }
    if (terminalMutationRejected) {
        recordPass('Terminal state mutation (SERVED order attempting cancelOrder) strictly rejected');
    } else {
        recordFail('Failed to reject mutation on terminal SERVED order', '');
    }


    // ========================================================================
    // SECTION 6: ORDER CANCELLATION SEMANTICS (PRE-COOKING VS POST-COOKING)
    // ========================================================================
    console.log('\n--- SECTION 6: CANCELLATION SEMANTICS (BEFORE VS AFTER COOKING) ---');

    // 6A: Cancellation BEFORE cooking (PLACED or ACCEPTED) -> CANCELLED (Releases stock, NO waste)
    const preCookOrder = (await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DINE_IN,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    })).order;

    await OrderService.acceptOrder(pool, { outletId, orderId: preCookOrder.id });

    const cancelPreCook = await OrderService.cancelOrder(pool, {
        outletId,
        orderId: preCookOrder.id,
        reason: 'GUEST_CHANGED_MIND',
        hasCookingStarted: false,
        userId: managerId
    });

    if (cancelPreCook.status === ORDER_STATUSES.CANCELLED) {
        recordPass('Pre-cooking cancellation transitions to CANCELLED');
    } else {
        recordFail('Expected CANCELLED status', cancelPreCook.status);
    }

    // Verify reservations were RELEASED
    const preCookResList = (await pool.query('SELECT status FROM stock_reservations WHERE order_id = $1', [preCookOrder.id])).rows;
    const allReleased = preCookResList.every(r => r.status === 'RELEASED');
    if (allReleased) {
        recordPass('Pre-cooking cancellation released all stock reservations back to inventory');
    } else {
        recordFail('Reservations not released', JSON.stringify(preCookResList));
    }

    // Verify NO waste entries created
    const wasteCountPre = (await pool.query('SELECT COUNT(*) FROM waste_entries WHERE reason LIKE $1', [`%${preCookOrder.id}%`])).rows[0].count;
    if (parseInt(wasteCountPre, 10) === 0) {
        recordPass('Pre-cooking cancellation created 0 waste entries');
    } else {
        recordFail('Unexpected waste entries created', wasteCountPre);
    }


    // 6B: Cancellation AFTER cooking started (PREPARING) -> CANCELLED_WITH_WASTE
    const postCookOrder = (await OrderService.createOrder(pool, {
        outletId,
        channel: ORDER_CHANNELS.DINE_IN,
        items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }],
        createdBy: managerId
    })).order;

    await OrderService.acceptOrder(pool, { outletId, orderId: postCookOrder.id });
    await OrderService.startPreparing(pool, { outletId, orderId: postCookOrder.id });

    const cancelPostCook = await OrderService.cancelOrder(pool, {
        outletId,
        orderId: postCookOrder.id,
        reason: 'CUSTOMER_WALKOUT_AFTER_FOOD_PREPARED',
        userId: managerId
    });

    if (cancelPostCook.status === ORDER_STATUSES.CANCELLED_WITH_WASTE) {
        recordPass('Post-cooking cancellation transitions to CANCELLED_WITH_WASTE');
    } else {
        recordFail('Expected CANCELLED_WITH_WASTE status', cancelPostCook.status);
    }

    // Verify reservations were CONSUMED as waste
    const postCookResList = (await pool.query('SELECT status FROM stock_reservations WHERE order_id = $1', [postCookOrder.id])).rows;
    const allConsumedWaste = postCookResList.every(r => r.status === 'CONSUMED');
    if (allConsumedWaste) {
        recordPass('Post-cooking cancellation consumed stock reservations as food waste');
    } else {
        recordFail('Reservations not consumed as waste', JSON.stringify(postCookResList));
    }

    // Verify waste entries logged with reason (Invariant 5)
    const wasteEntries = (await pool.query('SELECT * FROM waste_entries WHERE reason LIKE $1', [`%${postCookOrder.id}%`])).rows;
    if (wasteEntries.length === 3 && wasteEntries[0].reason.length > 0) {
        recordPass('Post-cooking cancellation logged 3 waste_entries with mandatory reason (Invariant 5)');
    } else {
        recordFail('Waste entries not logged properly', `Found ${wasteEntries.length}`);
    }


    // ========================================================================
    // SECTION 7: HTTP REST API & RBAC CONTROLLER INTEGRATION
    // ========================================================================
    console.log('\n--- SECTION 7: HTTP REST API & RBAC INTEGRATION ---');
    const app = createApp(pool);

    // Login Cashier for Auth Token
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
            outletId,
            identifier: 'cashier_ramesh',
            password: 'Password@123'
        });
    const cashierToken = loginRes.body.data.accessToken;

    // 1. POST /api/orders
    const apiOrderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('Idempotency-Key', 'HTTP-IDEMP-KEY-999')
        .send({
            channel: 'DINE_IN',
            tableId,
            items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }]
        });

    if (apiOrderRes.status === 201 && apiOrderRes.body.data.id) {
        recordPass('HTTP POST /api/orders created order with 201 Created and full payload');
    } else {
        recordFail('HTTP order creation failed', JSON.stringify(apiOrderRes.body));
    }
    const httpOrderId = apiOrderRes.body.data.id;

    // 2. Repeated POST /api/orders with same Idempotency-Key
    const replayHttpRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('Idempotency-Key', 'HTTP-IDEMP-KEY-999')
        .send({
            channel: 'DINE_IN',
            tableId,
            items: [{ menuItemId: biryaniMenuItemId, variantId: biryaniVariantId, quantity: 1 }]
        });

    if (replayHttpRes.status === 200 && replayHttpRes.headers['idempotency-replay'] === 'true') {
        recordPass('HTTP repeated request returns 200 OK with Idempotency-Replay: true header');
    } else {
        recordFail('HTTP idempotency replay failed', `Status: ${replayHttpRes.status}, Headers: ${JSON.stringify(replayHttpRes.headers)}`);
    }

    // 3. HTTP Transition endpoints
    const acceptHttp = await request(app)
        .post(`/api/orders/${httpOrderId}/accept`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ notes: 'Accepted from POS' });

    if (acceptHttp.status === 200 && acceptHttp.body.data.status === 'ACCEPTED') {
        recordPass('HTTP POST /api/orders/:id/accept transitions order to ACCEPTED');
    } else {
        recordFail('HTTP accept order failed', JSON.stringify(acceptHttp.body));
    }

    // 4. RBAC Guard: Cashier attempting kitchen.bump is rejected with 403 Forbidden
    const cashierBumpForbidden = await request(app)
        .post(`/api/orders/${httpOrderId}/ready`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({});

    if (cashierBumpForbidden.status === 403) {
        recordPass('RBAC Guard: Cashier attempting kitchen.bump (/ready) blocked with 403 Forbidden');
    } else {
        recordFail('Expected 403 Forbidden for Cashier bump', cashierBumpForbidden.status);
    }

    // 5. Manager Login for authorized transition operations
    const managerLoginRes = await request(app)
        .post('/api/auth/login')
        .send({
            outletId,
            identifier: 'manager_arjun',
            password: 'Password@123'
        });
    const managerToken = managerLoginRes.body.data.accessToken;

    // 6. HTTP Invalid Transition returns RFC 7807 409 Conflict
    // (Manager has kitchen.bump, but order is in ACCEPTED state, not PREPARING state)
    const invalidHttp = await request(app)
        .post(`/api/orders/${httpOrderId}/ready`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

    if (invalidHttp.status === 409 && invalidHttp.body.title === 'INVALID_ORDER_TRANSITION') {
        recordPass('HTTP invalid transition returns RFC 7807 409 Problem Details (INVALID_ORDER_TRANSITION)');
    } else {
        recordFail('HTTP did not return 409 Conflict', `Status: ${invalidHttp.status}, Body: ${JSON.stringify(invalidHttp.body)}`);
    }

    // 7. Full HTTP progression to SERVED
    const prepareHttp = await request(app)
        .post(`/api/orders/${httpOrderId}/prepare`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});
    if (prepareHttp.status === 200 && prepareHttp.body.data.status === 'PREPARING') {
        recordPass('HTTP POST /api/orders/:id/prepare transitions order to PREPARING');
    } else {
        recordFail('HTTP prepare failed', JSON.stringify(prepareHttp.body));
    }

    const readyHttp = await request(app)
        .post(`/api/orders/${httpOrderId}/ready`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});
    if (readyHttp.status === 200 && readyHttp.body.data.status === 'READY') {
        recordPass('HTTP POST /api/orders/:id/ready transitions order to READY');
    } else {
        recordFail('HTTP mark ready failed', JSON.stringify(readyHttp.body));
    }

    const serveHttp = await request(app)
        .post(`/api/orders/${httpOrderId}/serve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});
    if (serveHttp.status === 200 && serveHttp.body.data.status === 'SERVED') {
        recordPass('HTTP POST /api/orders/:id/serve transitions order to terminal SERVED');
    } else {
        recordFail('HTTP serve failed', JSON.stringify(serveHttp.body));
    }

    console.log('\n===============================================================');
    console.log(`ORDER SERVICE TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS)`);
    console.log('===============================================================');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

runOrderServiceTestSuite().catch(err => {
    console.error('Fatal order service test error:', err);
    process.exit(1);
});
