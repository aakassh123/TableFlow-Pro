// Test Suite: Customer Table QR Ordering & Signed Session Security
// Verifies HMAC-SHA256 Signed Sessions, Abuse Prevention, Table Binding, Expiry,
// PWA API Catalog, Order Placement, KDS Station Tickets, and Deterministic ETA
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';
import { QRSessionService, normalizeTableIdentifier } from '../src/modules/qr/qr-session.service.js';
import { KitchenService } from '../src/modules/kitchen/kitchen.service.js';
import { OrderService } from '../src/modules/orders/order.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runQROrderingTestSuite() {
    console.log('===============================================================');
    console.log('CUSTOMER TABLE QR ORDERING & SIGNED SESSION TEST SUITE');
    console.log('===============================================================\n');

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

    const outletId = '33333333-3333-3333-3333-333333333301';
    const app = createApp(pool);

    let passedTests = 0;
    let failedTests = 0;

    function recordPass(msg) {
        passedTests++;
        console.log(`  PASS: [${msg}]`);
    }

    function recordFail(msg, err) {
        failedTests++;
        console.error(`  FAIL: [${msg}]`);
        if (err) console.error('       ', err.message || err);
    }

    try {
        // ====================================================================
        // SECTION 1: SIGNED SHORT-LIVED TABLE QR SESSIONS & CRYPTO VERIFICATION
        // ====================================================================
        console.log('--- SECTION 1: SIGNED SHORT-LIVED TABLE QR SESSIONS & CRYPTO VERIFICATION ---');

        const table07 = await QRSessionService.resolveTable(pool, {
            outletId,
            tableIdentifier: '7'
        });

        if (table07 && table07.table_number === 'T-07') {
            recordPass("Resolved Table 07 (T-07) from identifier '7'");
        } else {
            recordFail("Resolved Table 07 (T-07) from identifier '7'", new Error('Expected T-07'));
        }

        // Generate signed session
        const session = QRSessionService.generateSessionToken({
            outletId,
            tableId: table07.id,
            tableNumber: table07.table_number,
            expiresInMinutes: 120
        });

        if (session.token && session.token.includes('.')) {
            recordPass('Generated HMAC-SHA256 signed session token');
        } else {
            recordFail('Generated HMAC-SHA256 signed session token', new Error('Malformed token'));
        }

        if (session.sessionUrl === `/table/7/session/${session.token}`) {
            recordPass("Constructed exact URL format: /table/7/session/xxxx rather than simply /table/7");
        } else {
            recordFail("Constructed exact URL format: /table/7/session/xxxx", new Error(`Got: ${session.sessionUrl}`));
        }

        // Verify valid session
        const verified = QRSessionService.verifySessionToken(session.token, {
            expectedTableIdentifier: '7',
            expectedTableId: table07.id,
            expectedOutletId: outletId
        });

        if (verified.valid && verified.payload.tableNumber === 'T-07') {
            recordPass('Cryptographically verified valid session token with timing-safe comparison');
        } else {
            recordFail('Cryptographically verified valid session token', new Error('Verification failed'));
        }

        if (verified.remainingMinutes > 115 && verified.remainingMinutes <= 120) {
            recordPass(`Short-lived session TTL recorded correctly (${verified.remainingMinutes} min remaining)`);
        } else {
            recordFail('Short-lived session TTL recorded correctly', new Error(`Remaining: ${verified.remainingMinutes}`));
        }

        // Tamper resistance: modify payload or signature
        const [pB64, sigB64] = session.token.split('.');
        const tamperedToken = `${pB64}.tamperedSignature123`;
        try {
            QRSessionService.verifySessionToken(tamperedToken, { expectedTableIdentifier: '7' });
            recordFail('Tampered signature detection', new Error('Should have rejected tampered signature'));
        } catch (err) {
            if (err.code === 'QR_SIGNATURE_INVALID') {
                recordPass('Tampered signature strictly rejected with QR_SIGNATURE_INVALID (403)');
            } else {
                recordFail('Tampered signature detection', err);
            }
        }

        // Anti-hijacking: Cross-table mismatch
        // Using Table 7 token to order on Table 4 or Table 8
        try {
            QRSessionService.verifySessionToken(session.token, { expectedTableIdentifier: '4' });
            recordFail('Cross-table mismatch detection', new Error('Should have rejected cross-table mismatch'));
        } catch (err) {
            if (err.code === 'QR_TABLE_MISMATCH') {
                recordPass('Cross-table hijacking strictly rejected with QR_TABLE_MISMATCH (403)');
            } else {
                recordFail('Cross-table mismatch detection', err);
            }
        }

        // Expiration check: token with expired timestamp
        const expiredSession = QRSessionService.generateSessionToken({
            outletId,
            tableId: table07.id,
            tableNumber: table07.table_number,
            expiresInMinutes: -5 // Expired 5 minutes ago
        });

        try {
            QRSessionService.verifySessionToken(expiredSession.token, { expectedTableIdentifier: '7' });
            recordFail('Expired token rejection', new Error('Should have rejected expired token'));
        } catch (err) {
            if (err.code === 'QR_SESSION_EXPIRED') {
                recordPass('Expired table session strictly rejected with QR_SESSION_EXPIRED (401)');
            } else {
                recordFail('Expired token rejection', err);
            }
        }

        // ====================================================================
        // SECTION 2: TABLE IDENTIFIER RESOLUTION
        // ====================================================================
        console.log('\n--- SECTION 2: TABLE IDENTIFIER RESOLUTION ---');

        const testCases = ['7', '07', 'T-07', 'T-7'];
        for (const tc of testCases) {
            const resolved = await QRSessionService.resolveTable(pool, { outletId, tableIdentifier: tc });
            if (resolved.id === table07.id) {
                recordPass(`Resolved identifier '${tc}' -> Table ID ${resolved.id} (${resolved.table_number})`);
            } else {
                recordFail(`Resolved identifier '${tc}'`, new Error('Mismatch'));
            }
        }

        try {
            await QRSessionService.resolveTable(pool, { outletId, tableIdentifier: '999' });
            recordFail('Non-existent table detection', new Error('Should have thrown TABLE_NOT_FOUND'));
        } catch (err) {
            if (err.code === 'TABLE_NOT_FOUND') {
                recordPass('Non-existent table rejected with TABLE_NOT_FOUND (404)');
            } else {
                recordFail('Non-existent table detection', err);
            }
        }

        // ====================================================================
        // SECTION 3: HTTP REST API & ACCESS CONTROL
        // ====================================================================
        console.log('\n--- SECTION 3: HTTP REST API & ACCESS CONTROL ---');

        // Generate session via HTTP POST
        const genRes = await request(app)
            .post('/api/qr/tables/7/session')
            .send({ outletId, expiresInMinutes: 120 });

        if (genRes.status === 200 && genRes.body.success && genRes.body.data.token) {
            recordPass('HTTP POST /api/qr/tables/7/session returned 200 with signed token');
        } else {
            recordFail('HTTP POST /api/qr/tables/7/session', new Error(genRes.body.detail || genRes.status));
        }

        const liveToken = genRes.body.data.token;

        // Direct validate without session token
        const noTokenRes = await request(app)
            .get('/api/qr/session/validate?table=7');

        if (noTokenRes.status === 401 && noTokenRes.body.title === 'QR_SESSION_REQUIRED') {
            recordPass('Direct unauthenticated table access (/table/7) blocked with 401 QR_SESSION_REQUIRED');
        } else {
            recordFail('Direct unauthenticated table access blocked', new Error(`Got: ${noTokenRes.status}`));
        }

        // Validate session with valid signed token
        const valRes = await request(app)
            .get(`/api/qr/session/validate?table=7&token=${liveToken}`);

        if (valRes.status === 200 && valRes.body.success && valRes.body.data.valid) {
            recordPass('HTTP GET /api/qr/session/validate returned 200 with verified table session');
        } else {
            recordFail('HTTP GET /api/qr/session/validate', new Error(valRes.body.detail));
        }

        if (valRes.body.data.menuItems && valRes.body.data.menuItems.length >= 4) {
            recordPass(`Catalog loaded: ${valRes.body.data.menuItems.length} menu items, ${valRes.body.data.categories.length} categories`);
        } else {
            recordFail('Catalog loaded', new Error('Missing menu items'));
        }

        // ====================================================================
        // SECTION 4: CUSTOMER QR ORDER PLACEMENT TO KDS PIPELINE
        // ====================================================================
        console.log('\n--- SECTION 4: CUSTOMER QR ORDER PLACEMENT TO KDS PIPELINE ---');

        // Look up menu items
        const butterChicken = valRes.body.data.menuItems.find(it => it.code === 'CR-001');
        const garlicNaan = valRes.body.data.menuItems.find(it => it.code === 'RD-001');

        if (!butterChicken || !garlicNaan) {
            throw new Error('Required dishes not found in seed menu items');
        }

        // Place Order from Table 07 PWA
        const orderPayload = {
            sessionToken: liveToken,
            table: '7',
            outletId,
            customer: {
                name: 'Ananya Sharma',
                phone: '+919876543210'
            },
            items: [
                { menuItemId: butterChicken.id, quantity: 2, notes: 'Less spicy' },
                { menuItemId: garlicNaan.id, quantity: 1, notes: 'Crispy' }
            ],
            notes: '⚠ ALLERGY: PEANUT',
            paymentMethod: 'UPI_INSTANT'
        };

        const orderRes = await request(app)
            .post('/api/qr/orders')
            .send(orderPayload);

        if (orderRes.status === 201 && orderRes.body.success) {
            recordPass(`Order placed from Table 07: ${orderRes.body.data.orderNumber} (Channel: ${orderRes.body.data.channel})`);
        } else {
            recordFail('Order placed from Table 07', new Error(orderRes.body.detail || orderRes.status));
        }

        const orderData = orderRes.body.data;

        // Verify channel and table assignment
        if (orderData.channel === 'QR' && orderData.tableNumber === 'T-07') {
            recordPass("Order channel bound to 'QR' and linked to Table 07");
        } else {
            recordFail('Order channel and table binding', new Error(`Channel: ${orderData.channel}, Table: ${orderData.tableNumber}`));
        }

        // Verify deterministic honest ETA
        if (orderData.promiseDisplay && orderData.promiseDisplay.includes('–')) {
            recordPass(`Deterministic Honest ETA returned as honest range: '${orderData.promiseDisplay}'`);
        } else {
            recordFail('Deterministic Honest ETA returned', new Error(`Got: ${orderData.promiseDisplay}`));
        }

        // Verify outbox event created
        const outboxRes = await pool.query(`
            SELECT id, event_type, aggregate_id, status
            FROM outbox_events
            WHERE aggregate_id = $1 AND event_type = 'ORDER_CREATED'
        `, [orderData.orderId]);

        if (outboxRes.rows.length === 1 && outboxRes.rows[0].status === 'PENDING') {
            recordPass('Transactional Outbox: ORDER_CREATED event atomically committed with order');
        } else {
            recordFail('Transactional Outbox event committed', new Error(`Rows: ${outboxRes.rows.length}`));
        }

        // Verify Station Tickets Created for KDS
        const kdsTicketsRes = await pool.query(`
            SELECT kt.id, kt.kot_number, kt.status, ks.code as station_code, ks.name as station_name
            FROM kitchen_tickets kt
            JOIN kitchen_stations ks ON kt.station_id = ks.id
            WHERE kt.order_id = $1
            ORDER BY ks.code
        `, [orderData.orderId]);

        if (kdsTicketsRes.rows.length >= 2) {
            recordPass(`KDS Integration: Generated ${kdsTicketsRes.rows.length} station tickets for order`);
        } else {
            recordFail('KDS Integration: Station tickets generated', new Error(`Count: ${kdsTicketsRes.rows.length}`));
        }

        const stationCodes = kdsTicketsRes.rows.map(t => t.station_code);
        if (stationCodes.includes('CURRY') && stationCodes.includes('TANDOOR')) {
            recordPass(`Station dispatch correct: CURRY (Butter Chicken) and TANDOOR (Garlic Naan)`);
        } else {
            recordFail('Station dispatch correct', new Error(`Stations: ${stationCodes.join(', ')}`));
        }

        // Verify KDS Tickets Display Allergy Warning & Table Number
        const kdsFullRes = await KitchenService.getTickets(pool, { outletId });
        const table7Ticket = kdsFullRes.find(t => t.orderId === orderData.orderId);

        if (table7Ticket && table7Ticket.tableNumber === 'T-07') {
            recordPass(`KDS ticket displayed with Table Badge: '${table7Ticket.tableNumber}'`);
        } else {
            recordFail('KDS ticket displayed with Table Badge', new Error('Missing table on KDS ticket'));
        }

        if (table7Ticket && table7Ticket.allergyWarning && table7Ticket.allergyWarning.includes('PEANUT')) {
            recordPass(`KDS ticket displays highlighted allergy warning: '${table7Ticket.allergyWarning}'`);
        } else {
            recordFail('KDS ticket allergy warning display', new Error(`Warning: ${table7Ticket?.allergyWarning}`));
        }

        // Verify UPI payment record created
        const payRes = await pool.query(`
            SELECT id, total_amount_paise, status
            FROM payments
            WHERE order_id = $1
        `, [orderData.orderId]);

        if (payRes.rows.length === 1 && payRes.rows[0].status === 'PAID') {
            recordPass('Payment Engine: Recorded instant UPI settlement transaction');
        } else {
            recordFail('Payment Engine: Recorded payment', new Error(`Pay status: ${payRes.rows[0]?.status}`));
        }

        // ====================================================================
        // SECTION 5: LIVE 86 (OUT-OF-STOCK) PROTECTION IN QR ORDERING
        // ====================================================================
        console.log('\n--- SECTION 5: LIVE 86 (OUT-OF-STOCK) PROTECTION IN QR ORDERING ---');

        // Toggle Butter Chicken to 86 (Out of Stock)
        await pool.query(`UPDATE menu_items SET is_available = false WHERE id = $1`, [butterChicken.id]);

        // Attempt to order 86'd item from QR table
        const order86Res = await request(app)
            .post('/api/qr/orders')
            .send({
                sessionToken: liveToken,
                table: '7',
                outletId,
                items: [{ menuItemId: butterChicken.id, quantity: 1 }]
            });

        if (order86Res.status === 400 && order86Res.body.detail.includes('86-list')) {
            recordPass('Live 86 Protection: QR cart order rejected for out-of-stock item (86-list)');
        } else {
            recordFail('Live 86 Protection', new Error(`Got: ${order86Res.status} - ${order86Res.body.detail}`));
        }

        // Restore Butter Chicken to available
        await pool.query(`UPDATE menu_items SET is_available = true WHERE id = $1`, [butterChicken.id]);

        // ====================================================================
        // SECTION 6: PWA FRONTEND ROUTE SERVING
        // ====================================================================
        console.log('\n--- SECTION 6: PWA FRONTEND ROUTE SERVING ---');

        const pwaPageRes = await request(app)
            .get(`/table/7/session/${liveToken}`);

        if (pwaPageRes.status === 200 && pwaPageRes.text.includes('qrAppContainer')) {
            recordPass('HTTP GET /table/7/session/xxxx serves Customer QR PWA HTML');
        } else {
            recordFail('HTTP GET /table/7/session/xxxx serves PWA HTML', new Error(`Status: ${pwaPageRes.status}`));
        }

        const directPageRes = await request(app)
            .get('/table/7');

        if (directPageRes.status === 200 && directPageRes.text.includes('securityErrorCard')) {
            recordPass('HTTP GET /table/7 serves PWA with security anti-abuse protection banner');
        } else {
            recordFail('HTTP GET /table/7 serves PWA', new Error(`Status: ${directPageRes.status}`));
        }

    } catch (unexpectedErr) {
        console.error('\nUNEXPECTED SUITE FAILURE:', unexpectedErr);
        failedTests++;
    }

    console.log('\n===============================================================');
    console.log(`QR ORDERING TEST RESULTS: ${passedTests}/${passedTests + failedTests} TESTS PASSED (${failedTests === 0 ? '100% SUCCESS' : 'FAILURES PRESENT'})`);
    console.log('===============================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runQROrderingTestSuite().catch(err => {
    console.error('Fatal Test Harness Failure:', err);
    process.exit(1);
});
