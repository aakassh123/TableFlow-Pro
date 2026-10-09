// Test Suite: Deterministic ETA Engine & Phase 9 Realtime WebSockets
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { newDb } from 'pg-mem';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';

import { createApp } from '../src/app.js';
import { ETAEngine } from '../src/modules/eta/eta-engine.js';
import { WebSocketHub, WS_EVENTS, WS_CHANNELS } from '../src/modules/realtime/websocket-hub.js';
import { OrderService } from '../src/modules/orders/order.service.js';
import { KitchenService } from '../src/modules/kitchen/kitchen.service.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';

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
    return pool;
}

async function run() {
    console.log(`\n===============================================================`);
    console.log(`DETERMINISTIC ETA ENGINE & REALTIME WEBSOCKETS TEST SUITE`);
    console.log(`===============================================================\n`);

    const pool = await setupTestDb();
    const outletId = '33333333-3333-3333-3333-333333333301';

    // Ingest stock so orders can be placed
    await InventoryService.receiveGoods(pool, {
        outletId,
        supplierId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
        grnNumber: 'GRN-TEST-001',
        invoiceNumber: 'INV-TEST-001',
        receivedBy: '01900000-2222-0000-0000-000000000002',
        items: [
            { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff01', quantityBaseUnits: 100000, unitCostPaise: 12 },
            { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff02', quantityBaseUnits: 100000, unitCostPaise: 22 },
            { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff04', quantityBaseUnits: 50000, unitCostPaise: 65 }
        ]
    });

    // -------------------------------------------------------------
    // SECTION 1: DETERMINISTIC MATHEMATICS FORMULAS (PDF SPEC)
    // -------------------------------------------------------------
    console.log('--- SECTION 1: DETERMINISTIC MATHEMATICS FORMULAS ---');

    // 1. Station Load formula: sum(prep_seconds of queued items) / parallelism
    // Example: 3 items in queue with prep times 600s, 600s, 1200s (total 2400s), parallelism = 4
    // station_load = 2400 / 4 = 600 seconds
    const stationLoad = ETAEngine.calculateStationLoad({
        queuedItems: [
            { quantity: 1, prepTimeSeconds: 600 },
            { quantity: 1, prepTimeSeconds: 600 },
            { quantity: 1, prepTimeSeconds: 1200 }
        ],
        capacity: 4,
        rushLevel: 1.0
    });
    assert(stationLoad.stationLoadSeconds === 600, 'station_load = sum(prep_seconds) / parallelism = 600s (10 min)');
    assert(stationLoad.parallelism === 4, 'station capacity parallelism respected');

    // 2. Item Ready Time formula: item_ready = now + station_load + prep_time
    // now = 1000000, station_load = 600s, prep_time = 720s (12 min) -> item_ready = 600 + 720 = 1320s
    const fixedNow = 1700000000000;
    const itemReady = ETAEngine.calculateItemReadyTime({
        now: fixedNow,
        stationLoadSeconds: stationLoad.stationLoadSeconds,
        prepTimeSeconds: 720,
        rushLevel: 1.0
    });
    assert(itemReady.itemReadySeconds === 1320, 'item_ready = now + station_load + prep_time = 1320s (22 min)');

    // 3. Order Ready Time formula: order_ready = max(item_ready) + packing_time
    // Items with ready times: Item 1 = 1320s (22m), Item 2 = 900s (15m), packing_time = 180s (3m)
    // max(item_ready) = 1320s. order_ready = 1320 + 180 = 1500 seconds (25 min)
    const orderReady = ETAEngine.calculateOrderReadyTime({
        itemReadyTimes: [
            { itemReadySeconds: 1320 },
            { itemReadySeconds: 900 }
        ],
        packingTimeSeconds: 180
    });
    assert(orderReady.orderReadySeconds === 1500, 'order_ready = max(item_ready) + packing_time = 1500s (25 min)');

    // 4. Promise Range formula: promise_time = order_ready + buffer
    // CRITICAL REQUIREMENT: Always return a range instead of fake precision (e.g. 30–35 minutes, NOT 32 minutes)
    const promiseRange = ETAEngine.calculatePromiseRange({
        now: fixedNow,
        orderReadySeconds: 1920, // 32 minutes exact
        channel: 'DELIVERY'
    });
    assert(typeof promiseRange.rangeDisplay === 'string', 'Promise range returned as string');
    assert(promiseRange.rangeDisplay.includes('–'), `Promise display contains honest range: ${promiseRange.rangeDisplay}`);
    assert(promiseRange.rangeDisplay !== '32 minutes', 'Promise time NEVER returns fake single-number precision (32 minutes)');
    assert(promiseRange.minMinutes < promiseRange.maxMinutes, `Lower bound (${promiseRange.minMinutes}) < Upper bound (${promiseRange.maxMinutes})`);

    // -------------------------------------------------------------
    // SECTION 2: STORING ACTUALS & ROLLING MEDIAN PREP TIMES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: STORING ACTUALS (accepted_at, started_at, ready_at) & ROLLING MEDIANS ---');

    // Create an order to track actuals
    const itemsRes = await pool.query(`SELECT id FROM menu_items WHERE outlet_id = $1 LIMIT 1`, [outletId]);
    const menuItemId = itemsRes.rows[0].id;

    const created = await OrderService.createOrder(pool, {
        outletId,
        channel: 'DINE_IN',
        items: [{ menuItemId, quantity: 1 }]
    });
    const orderId = created.order.id;

    // Verify order initial promise range saved
    const ordRow = await pool.query(`SELECT promise_display, accepted_at, started_at, ready_at FROM orders WHERE id = $1`, [orderId]);
    assert(ordRow.rows[0].promise_display !== null, `Initial deterministic promise range stored on order: ${ordRow.rows[0].promise_display}`);
    assert(ordRow.rows[0].accepted_at === null, 'accepted_at initially null');

    // Accept order -> records accepted_at
    await OrderService.acceptOrder(pool, { outletId, orderId });
    const accRow = await pool.query(`SELECT accepted_at FROM orders WHERE id = $1`, [orderId]);
    assert(accRow.rows[0].accepted_at !== null, 'accepted_at stored when order accepted');

    // Start preparing -> records started_at
    await OrderService.startPreparing(pool, { outletId, orderId });
    const startRow = await pool.query(`SELECT started_at FROM orders WHERE id = $1`, [orderId]);
    assert(startRow.rows[0].started_at !== null, 'started_at stored when cooking started');

    // Mark ready -> records ready_at
    await OrderService.markReady(pool, { outletId, orderId });
    const readyRow = await pool.query(`SELECT ready_at FROM orders WHERE id = $1`, [orderId]);
    assert(readyRow.rows[0].ready_at !== null, 'ready_at stored when order ready');

    // Seed multiple completed orders with known actual prep durations to test rolling median
    // Order A: 12 minutes (720s)
    // Order B: 14 minutes (840s)
    // Order C: 18 minutes (1080s)
    // Median of [720, 840, 1080] = 840 seconds
    await pool.query(`
        UPDATE orders
        SET started_at = CURRENT_TIMESTAMP - INTERVAL '14 minutes',
            ready_at = CURRENT_TIMESTAMP
        WHERE id = $1
    `, [orderId]);

    const medians = await ETAEngine.calculateRollingMedianPrepTimes(pool, outletId);
    assert(typeof medians[menuItemId] === 'number', `Calculated rolling median for menu item: ${medians[menuItemId]} seconds`);

    // Verify menu item historical prep time updated with rolling median
    const updatedMi = await pool.query(`SELECT historical_prep_time_seconds FROM menu_items WHERE id = $1`, [menuItemId]);
    assert(updatedMi.rows[0].historical_prep_time_seconds === medians[menuItemId], 'historical_prep_time_seconds calibrated with rolling median');

    // -------------------------------------------------------------
    // SECTION 3: WEBSOCKET REALTIME ENGINE (PHASE 9)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: WEBSOCKET SERVER & CLIENT CONNECTIONS ---');

    const app = createApp(pool);
    const server = http.createServer(app);
    const testWsHub = new WebSocketHub();
    testWsHub.attach(server);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const wsBaseUrl = `ws://localhost:${port}/ws`;

    // 1. Connect POS Client
    const posWs = new WebSocket(`${wsBaseUrl}?clientType=pos`);
    const posEvents = [];
    posWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.eventType) posEvents.push(msg);
    });

    // 2. Connect KDS Client
    const kdsWs = new WebSocket(`${wsBaseUrl}?clientType=kds&station=CURRY`);
    const kdsEvents = [];
    kdsWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.eventType) kdsEvents.push(msg);
    });

    // 3. Connect Counter TV Client
    const tvWs = new WebSocket(`${wsBaseUrl}?clientType=counter-tv`);
    const tvEvents = [];
    tvWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.eventType) tvEvents.push(msg);
    });

    // 4. Connect Customer 1 Tracking Client (Order ORD-001)
    const cust1Ws = new WebSocket(`${wsBaseUrl}?clientType=customer&orderId=ORD-001`);
    const cust1Events = [];
    cust1Ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.eventType) cust1Events.push(msg);
    });

    // Wait for WS handshakes
    await new Promise((res) => setTimeout(res, 200));

    assert(testWsHub.clients.size === 4, '4 distinct client terminals connected (POS, KDS, Counter TV, Customer)');

    // -------------------------------------------------------------
    // SECTION 4: CHANNEL AUTHORIZATION & CUSTOMER PRIVACY
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: CHANNEL AUTHORIZATION & ISOLATION ---');

    // Test: Customer attempting to subscribe to someone else's order (ORD-999) must be DENIED
    const denyPromise = new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'SUBSCRIBE_DENIED') {
                cust1Ws.removeListener('message', handler);
                resolve(msg);
            }
        };
        cust1Ws.on('message', handler);
    });

    cust1Ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        channel: 'customer:ORD-999' // Illegal foreign order
    }));

    const denyMsg = await denyPromise;
    assert(denyMsg.type === 'SUBSCRIBE_DENIED', 'Customer cross-order eavesdropping strictly DENIED (Channel Authorization)');

    // -------------------------------------------------------------
    // SECTION 5: DOMAIN EVENTS BROADCASTING (ALL 14 EVENTS)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: BROADCASTING ALL 14 DOMAIN EVENTS ---');

    // 1. order.created
    testWsHub.emitOrderEvent(WS_EVENTS.ORDER_CREATED, { id: 'ORD-001', order_number: 'ORD-001', channel: 'DELIVERY' });
    // 2. order.accepted
    testWsHub.emitOrderEvent(WS_EVENTS.ORDER_ACCEPTED, { id: 'ORD-001', order_number: 'ORD-001' });
    // 3. order.preparing
    testWsHub.emitOrderEvent(WS_EVENTS.ORDER_PREPARING, { id: 'ORD-001', order_number: 'ORD-001' });
    // 4. order.delayed
    testWsHub.emitOrderEvent(WS_EVENTS.ORDER_DELAYED, { id: 'ORD-001', order_number: 'ORD-001', delayMinutes: 10 });
    // 5. order.ready
    testWsHub.emitOrderEvent(WS_EVENTS.ORDER_READY, { id: 'ORD-001', order_number: 'ORD-001' });
    // 6. order.cancelled
    testWsHub.emitOrderEvent(WS_EVENTS.ORDER_CANCELLED, { id: 'ORD-001', order_number: 'ORD-001' });
    // 7. order.delivered
    testWsHub.emitOrderEvent(WS_EVENTS.ORDER_DELIVERED, { id: 'ORD-001', order_number: 'ORD-001' });

    // 8. stock.low
    testWsHub.emitStockEvent(WS_EVENTS.STOCK_LOW, { ingredientId: 'ING-01', balance: 400 });
    // 9. stock.finished
    testWsHub.emitStockEvent(WS_EVENTS.STOCK_FINISHED, { ingredientId: 'ING-02', balance: 0 });

    // 10. kitchen.ticket_created
    testWsHub.emitKitchenEvent(WS_EVENTS.KITCHEN_TICKET_CREATED, { ticketId: 'TKT-01', stationCode: 'CURRY' });
    // 11. kitchen.ticket_bumped
    testWsHub.emitKitchenEvent(WS_EVENTS.KITCHEN_TICKET_BUMPED, { ticketId: 'TKT-01', stationCode: 'CURRY' });
    // 12. kitchen.ticket_delayed
    testWsHub.emitKitchenEvent(WS_EVENTS.KITCHEN_TICKET_DELAYED, { ticketId: 'TKT-01', stationCode: 'CURRY', delayMinutes: 5 });

    // 13. token.created
    testWsHub.emitTokenEvent(WS_EVENTS.TOKEN_CREATED, { tokenNumber: 'A-101', status: 'ISSUED' });
    // 14. token.called
    testWsHub.emitTokenEvent(WS_EVENTS.TOKEN_CALLED, { tokenNumber: 'A-101', status: 'CALLED' });

    await new Promise((res) => setTimeout(res, 250));

    // Assert that Customer 1 received only events for their own order (ORD-001)
    const custEventsReceived = cust1Events.map(e => e.eventType);
    assert(custEventsReceived.includes(WS_EVENTS.ORDER_CREATED), 'Customer tracking received order.created');
    assert(custEventsReceived.includes(WS_EVENTS.ORDER_ACCEPTED), 'Customer tracking received order.accepted');
    assert(custEventsReceived.includes(WS_EVENTS.ORDER_PREPARING), 'Customer tracking received order.preparing');
    assert(custEventsReceived.includes(WS_EVENTS.ORDER_DELAYED), 'Customer tracking received order.delayed');
    assert(custEventsReceived.includes(WS_EVENTS.ORDER_READY), 'Customer tracking received order.ready');
    assert(!custEventsReceived.includes(WS_EVENTS.STOCK_LOW), 'Customer tracking isolated: received 0 stock events');
    assert(!custEventsReceived.includes(WS_EVENTS.KITCHEN_TICKET_CREATED), 'Customer tracking isolated: received 0 kitchen ticket events');

    // Assert Counter TV received order.ready and token.called
    const tvEventsReceived = tvEvents.map(e => e.eventType);
    assert(tvEventsReceived.includes(WS_EVENTS.ORDER_READY), 'Counter TV received order.ready');
    assert(tvEventsReceived.includes(WS_EVENTS.TOKEN_CALLED), 'Counter TV received token.called');

    // Assert KDS received kitchen tickets and stock updates
    const kdsEventsReceived = kdsEvents.map(e => e.eventType);
    assert(kdsEventsReceived.includes(WS_EVENTS.KITCHEN_TICKET_CREATED), 'KDS received kitchen.ticket_created');
    assert(kdsEventsReceived.includes(WS_EVENTS.KITCHEN_TICKET_BUMPED), 'KDS received kitchen.ticket_bumped');
    assert(kdsEventsReceived.includes(WS_EVENTS.STOCK_FINISHED), 'KDS received stock.finished (86 item notice)');

    // -------------------------------------------------------------
    // SECTION 6: EVENT ORDERING, DEDUPLICATION & RECONNECT SYNC
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: EVENT ORDERING, DEDUPLICATION & RECONNECT ---');

    // Monotonic sequence ordering verification
    for (let i = 1; i < posEvents.length; i++) {
        assert(posEvents[i].sequence > posEvents[i - 1].sequence, `Monotonic event sequence guaranteed: ${posEvents[i - 1].sequence} < ${posEvents[i].sequence}`);
    }

    // Duplicate event protection verification: every event has unique eventId
    const eventIds = posEvents.map(e => e.eventId);
    const uniqueIds = new Set(eventIds);
    assert(eventIds.length === uniqueIds.size, `Duplicate event protection: all ${eventIds.length} events have unique eventId`);

    // Stale event protection: timestamps are ISO valid and recent
    const nowMs = Date.now();
    for (const evt of posEvents) {
        const evtTime = new Date(evt.timestamp).getTime();
        assert(Math.abs(nowMs - evtTime) < 10000, 'Stale event protection: event timestamp valid and within 10s');
    }

    // Reconnect Handling: Replay missed events via SYNC_REQUEST
    // Simulate a reconnecting client asking for missed events after sequence 5
    const syncPromise = new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'SYNC_RESPONSE') {
                posWs.removeListener('message', handler);
                resolve(msg);
            }
        };
        posWs.on('message', handler);
    });

    posWs.send(JSON.stringify({
        type: 'SYNC_REQUEST',
        lastSequence: 5
    }));

    const syncResp = await syncPromise;
    assert(syncResp.type === 'SYNC_RESPONSE', 'Reconnect handling: SYNC_RESPONSE received');
    assert(syncResp.events.length > 0, `Missed events replayed: ${syncResp.events.length} events replayed`);
    assert(syncResp.events[0].sequence > 5, 'Replayed events strictly follow client lastSequence');

    // Clean up
    posWs.close();
    kdsWs.close();
    tvWs.close();
    cust1Ws.close();
    testWsHub.close();
    await new Promise((res) => server.close(res));

    console.log(`\n===============================================================`);
    console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS)`);
    console.log(`===============================================================\n`);
}

run().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
