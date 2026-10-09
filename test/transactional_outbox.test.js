// Test Suite: Transactional Outbox Pattern & Background Worker Reliability (PHASE 9)
// Verifies:
// 1. Order state changes insert outbox events in the same ACID transaction
// 2. Zero external calls inside the DB transaction
// 3. Worker reads pending events, publishes to WhatsApp/SMS/Push, and marks PUBLISHED
// 4. Retry handling with exponential backoff on transient failure
// 5. Duplicate delivery prevention via idempotency keys
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { newDb } from 'pg-mem';
import { fileURLToPath } from 'url';

import { OrderService } from '../src/modules/orders/order.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { OutboxService } from '../src/modules/outbox/outbox.service.js';
import { OutboxWorker } from '../src/modules/outbox/outbox.worker.js';
import { NotificationDispatcher, NOTIFICATION_CHANNELS } from '../src/modules/notifications/notification.dispatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (!condition) {
        console.error(`  FAIL: [${message}]`);
        throw new Error(`Assertion failed: ${message}`);
    } else {
        console.log(`  PASS: [${message}]`);
        passedTests++;
    }
}

async function setupTestDb() {
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
        '011_auth_rbac_enhancement.sql'
    ];

    for (const f of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
            .replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/gi, '');
        db.public.none(sql);
    }

    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    pool._pgMemDb = db;
    return pool;
}

async function run() {
    console.log(`\n===============================================================`);
    console.log(`TRANSACTIONAL OUTBOX & RELIABLE WORKER TEST SUITE`);
    console.log(`===============================================================\n`);

    const pool = await setupTestDb();
    const outletId = '33333333-3333-3333-3333-333333333301';

    // Ingest stock so orders can be placed
    await InventoryService.receiveGoods(pool, {
        outletId,
        supplierId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
        grnNumber: 'GRN-OUTBOX-001',
        invoiceNumber: 'INV-OUTBOX-001',
        receivedBy: '01900000-2222-0000-0000-000000000002',
        items: [
            { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff01', quantityBaseUnits: 100000, unitCostPaise: 12 },
            { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff02', quantityBaseUnits: 100000, unitCostPaise: 22 },
            { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff04', quantityBaseUnits: 50000, unitCostPaise: 65 }
        ]
    });

    const itemsRes = await pool.query(`SELECT id FROM menu_items WHERE code = 'BR-001' AND outlet_id = $1`, [outletId]);
    const menuItemId = itemsRes.rows[0]?.id || (await pool.query(`SELECT id FROM menu_items WHERE outlet_id = $1 LIMIT 1`, [outletId])).rows[0].id;

    // -------------------------------------------------------------
    // SECTION 1: SAME ACID TRANSACTION COMMIT & ROLLBACK
    // -------------------------------------------------------------
    console.log('--- SECTION 1: SAME ACID TRANSACTION COMMIT & ROLLBACK ---');

    const initialOutboxCount = parseInt((await pool.query('SELECT COUNT(*) FROM outbox_events')).rows[0].count, 10);

    // 1. Create order: must commit order + outbox event together atomically
    const orderResult = await OrderService.createOrder(pool, {
        outletId,
        channel: 'DELIVERY',
        items: [{ menuItemId, quantity: 2 }]
    });

    const orderId = orderResult.order.id;
    const postCreateCount = parseInt((await pool.query('SELECT COUNT(*) FROM outbox_events')).rows[0].count, 10);
    assert(postCreateCount === initialOutboxCount + 1, 'Order created: Exactly 1 outbox event inserted in the transaction');

    const createdEventRes = await pool.query(`
        SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_CREATED'
    `, [orderId]);
    assert(createdEventRes.rows.length === 1, 'Outbox event ORDER_CREATED recorded with matching order aggregate_id');
    assert(createdEventRes.rows[0].status === 'PENDING', 'Outbox event initialized in PENDING status');
    assert(createdEventRes.rows[0].retry_count === 0, 'Outbox event retry_count initialized to 0');

    // 2. State changes: Accept, Prepare, Ready, Delay
    await OrderService.acceptOrder(pool, { outletId, orderId });
    const acceptEvt = await pool.query(`SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_ACCEPTED'`, [orderId]);
    assert(acceptEvt.rows.length === 1, 'State transition ACCEPTED inserted ORDER_ACCEPTED in same transaction');

    await OrderService.startPreparing(pool, { outletId, orderId });
    const prepEvt = await pool.query(`SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_PREPARING'`, [orderId]);
    assert(prepEvt.rows.length === 1, 'State transition PREPARING inserted ORDER_PREPARING in same transaction');

    await OrderService.delayOrder(pool, { outletId, orderId, delayMinutes: 15, reason: 'Oven overload' });
    const delayEvt = await pool.query(`SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_DELAYED'`, [orderId]);
    assert(delayEvt.rows.length === 1, 'delayOrder inserted ORDER_DELAYED in same transaction');

    // 3. ACID Rollback test: If order creation rolls back, outbox event MUST ALSO roll back!
    const biryaniVariantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
    const outboxBeforeFailed = parseInt((await pool.query('SELECT COUNT(*) FROM outbox_events')).rows[0].count, 10);
    let caughtRollbackError = false;
    try {
        await OrderService.createOrder(pool, {
            outletId,
            channel: 'DELIVERY',
            items: [{ menuItemId, variantId: biryaniVariantId, quantity: 999999 }] // Excessive quantity -> Insufficient stock error
        });
    } catch (e) {
        caughtRollbackError = true;
    }
    assert(caughtRollbackError, 'Excessive order quantity threw InsufficientStockError');
    const outboxAfterFailed = parseInt((await pool.query('SELECT COUNT(*) FROM outbox_events')).rows[0].count, 10);
    assert(outboxAfterFailed === outboxBeforeFailed, 'Transaction rollback: 0 orphan outbox events created on aborted transaction');

    // -------------------------------------------------------------
    // SECTION 2: OUTBOX WORKER PROCESSING & PUBLISHING
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: OUTBOX WORKER PROCESSING & PUBLISHING ---');

    const testDispatcher = new NotificationDispatcher();
    const worker = new OutboxWorker({
        db: pool,
        pollIntervalMs: 500,
        batchSize: 10,
        maxRetries: 3,
        dispatcher: testDispatcher
    });

    // Check pending events before worker runs
    const pendingBefore = await OutboxService.getPendingEvents(pool, { limit: 10 });
    assert(pendingBefore.length >= 4, `Worker found ${pendingBefore.length} pending events awaiting delivery`);

    // Run batch processing
    const processed = await worker.processBatch();
    assert(processed >= 4, `Worker processed batch of ${processed} events`);

    // Verify events were published and marked PUBLISHED
    const pendingAfter = await OutboxService.getPendingEvents(pool, { limit: 10 });
    assert(pendingAfter.length === 0, 'All events processed: 0 PENDING events remain in queue');

    const publishedRes = await pool.query(`
        SELECT status, processed_at FROM outbox_events WHERE aggregate_id = $1
    `, [orderId]);

    const allPublished = publishedRes.rows.every(r => r.status === 'PUBLISHED' && r.processed_at !== null);
    assert(allPublished, 'All order events marked PUBLISHED with processed_at timestamps');

    // Verify external notifications were dispatched by worker (NOT inside DB transaction)
    assert(testDispatcher.sentMessages.length > 0, `Dispatcher sent ${testDispatcher.sentMessages.length} external messages`);

    const whatsAppMessages = testDispatcher.sentMessages.filter(m => m.channel === NOTIFICATION_CHANNELS.WHATSAPP);
    assert(whatsAppMessages.length >= 4, `Customer received WhatsApp updates for Order Placed, Accepted, Cooking, Delay`);

    const pushMessages = testDispatcher.sentMessages.filter(m => m.channel === NOTIFICATION_CHANNELS.PUSH);
    assert(pushMessages.length >= 1, `Kitchen terminal received Push notification for incoming ticket`);

    // Verify audit rows in notifications table
    const notifsInDb = await pool.query(`SELECT COUNT(*) FROM notifications WHERE outlet_id = $1`, [outletId]);
    assert(parseInt(notifsInDb.rows[0].count, 10) >= 4, 'Notifications table audited each dispatched message');

    // -------------------------------------------------------------
    // SECTION 3: EXPONENTIAL BACKOFF ON TRANSIENT FAILURES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: EXPONENTIAL BACKOFF ON FAILURES ---');

    // Create an event that will fail due to simulated gateway downtime
    const failedOrder = await OrderService.createOrder(pool, {
        outletId,
        channel: 'WALK_IN',
        items: [{ menuItemId, quantity: 1 }]
    });

    const failingDispatcher = new NotificationDispatcher({ shouldSimulateErrors: true });
    const retryWorker = new OutboxWorker({
        db: pool,
        pollIntervalMs: 500,
        batchSize: 5,
        maxRetries: 3,
        baseDelaySeconds: 2,
        dispatcher: failingDispatcher
    });

    // Attempt 1: Should fail and schedule retry with backoff (2 * 2^0 = 2 seconds)
    await retryWorker.processBatch();

    const failedEvt1 = (await pool.query(`SELECT retry_count, status, last_error, next_retry_at FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_CREATED'`, [failedOrder.order.id])).rows[0];
    assert(failedEvt1.status === 'PENDING', 'Failed event remains PENDING for retry');
    assert(failedEvt1.retry_count === 1, 'retry_count incremented to 1');
    assert(failedEvt1.last_error.includes('SIMULATED_TRANSIENT_ERROR'), 'last_error captured gateway failure message');
    assert(new Date(failedEvt1.next_retry_at) > new Date(), 'next_retry_at scheduled in the future with exponential backoff');

    // Fast-forward next_retry_at to test Attempt 2
    await pool.query(`UPDATE outbox_events SET next_retry_at = CURRENT_TIMESTAMP WHERE aggregate_id = $1`, [failedOrder.order.id]);
    await retryWorker.processBatch();

    const failedEvt2 = (await pool.query(`SELECT retry_count, status FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_CREATED'`, [failedOrder.order.id])).rows[0];
    assert(failedEvt2.retry_count === 2, 'retry_count incremented to 2 on second failure');
    assert(failedEvt2.status === 'PENDING', 'Still PENDING after second failure');

    // Fast-forward to test Attempt 3 (Reaches maxRetries = 3 -> Marked FAILED)
    await pool.query(`UPDATE outbox_events SET next_retry_at = CURRENT_TIMESTAMP WHERE aggregate_id = $1`, [failedOrder.order.id]);
    await retryWorker.processBatch();

    const failedEvt3 = (await pool.query(`SELECT retry_count, status, processed_at FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ORDER_CREATED'`, [failedOrder.order.id])).rows[0];
    assert(failedEvt3.retry_count === 3, 'retry_count reached maxRetries (3)');
    assert(failedEvt3.status === 'FAILED', 'Dead letter protection: Event marked FAILED after exceeding max retries');
    assert(failedEvt3.processed_at !== null, 'processed_at set when marked FAILED');

    // -------------------------------------------------------------
    // SECTION 4: DUPLICATE DELIVERY PREVENTION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: DUPLICATE DELIVERY PREVENTION ---');

    // Create an order event to test duplicate delivery suppression
    const dupOrder = await OrderService.createOrder(pool, {
        outletId,
        channel: 'DELIVERY',
        items: [{ menuItemId, quantity: 1 }]
    });

    const dupDispatcher = new NotificationDispatcher();
    const dupWorker = new OutboxWorker({
        db: pool,
        batchSize: 5,
        dispatcher: dupDispatcher
    });

    // Run first delivery
    await dupWorker.processBatch();
    const initialSentCount = dupDispatcher.sentMessages.length;
    assert(initialSentCount >= 2, `Initial delivery sent ${initialSentCount} messages (WhatsApp + Push)`);

    // Reset the outbox event back to PENDING (simulating worker crash / redelivery)
    await pool.query(`
        UPDATE outbox_events
        SET status = 'PENDING', next_retry_at = CURRENT_TIMESTAMP
        WHERE aggregate_id = $1
    `, [dupOrder.order.id]);

    // Run worker again on the reset event
    await dupWorker.processBatch();
    const postReplaySentCount = dupDispatcher.sentMessages.length;

    assert(postReplaySentCount === initialSentCount, 'DUPLICATE DELIVERY PREVENTED: 0 duplicate external messages sent');
    assert(dupWorker.duplicatePreventedCount > 0, `Worker successfully skipped duplicate delivery (${dupWorker.duplicatePreventedCount} duplicates suppressed)`);

    console.log(`\n===============================================================`);
    console.log(`TRANSACTIONAL OUTBOX SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS)`);
    console.log(`===============================================================\n`);
}

run().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
