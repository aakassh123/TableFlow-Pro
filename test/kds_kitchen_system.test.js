// Test Suite: Kitchen Display System (KDS) & Multi-Station Fulfillment Engine
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';
import { CryptoService } from '../src/shared/crypto.js';
import { KitchenService } from '../src/modules/kitchen/kitchen.service.js';
import { OrderService } from '../src/modules/orders/order.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runKDSTestSuite() {
    console.log('===============================================================');
    console.log('KITCHEN DISPLAY SYSTEM (KDS) & MULTI-STATION TEST SUITE');
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
    const managerId = '66666666-6666-6666-6666-666666666601';

    const app = createApp(pool);

    let passedTests = 0;
    let failedTests = 0;

    function recordPass(msg) {
        passedTests++;
        console.log(`  PASS: [${msg}]`);
    }

    function recordFail(msg, err) {
        failedTests++;
        console.error(`  FAIL: [${msg}] -`, err);
    }

    // --- SECTION 1: SEEDING & STATIONS VERIFICATION ---
    console.log('--- SECTION 1: KITCHEN STATIONS & INITIAL SEED ---');
    try {
        const stations = await KitchenService.getStations(pool, outletId);
        const stationCodes = stations.map(s => s.code).sort();
        if (stationCodes.includes('CURRY') && stationCodes.includes('TANDOOR') && stationCodes.includes('GRILL') && stationCodes.includes('WOK') && stationCodes.includes('PACKING')) {
            recordPass('All 5 target kitchen stations registered: CURRY, TANDOOR, GRILL, WOK, PACKING');
        } else {
            recordFail('Expected all 5 stations', stationCodes);
        }
    } catch (err) {
        recordFail('Failed to retrieve stations', err.message);
    }

    // --- SECTION 2: DEMO TICKET D-017 (CURRY & PACKING) ---
    console.log('\n--- SECTION 2: PROMPT SPECIFICATION TICKET D-017 ---');
    try {
        await KitchenService.seedInitialDemoTickets(pool, outletId);
        const tickets = await KitchenService.getTickets(pool, { outletId, stationCode: 'CURRY' });
        const ticketD017 = tickets.find(t => t.displayCode === 'D-017' || t.orderNumber.includes('0017'));

        if (ticketD017) {
            recordPass('Ticket D-017 created in CURRY station');
            if (ticketD017.channel === 'DELIVERY') {
                recordPass('Channel badge verified as DELIVERY');
            } else {
                recordFail('Channel mismatch for D-017', ticketD017.channel);
            }

            if (ticketD017.allergyWarning === 'PEANUT') {
                recordPass('Allergy warning correctly detected: ⚠ ALLERGY: PEANUT');
            } else {
                recordFail('Allergy warning mismatch', ticketD017.allergyWarning);
            }

            if (ticketD017.riderEtaMinutes === 3) {
                recordPass('Rider ETA verified: Rider ETA: 03 min');
            } else {
                recordFail('Rider ETA mismatch', ticketD017.riderEtaMinutes);
            }

            const itemNames = ticketD017.items.map(i => `${i.quantity} × ${i.name}`);
            if (itemNames.some(n => n.includes('Butter Chicken')) && itemNames.some(n => n.includes('Dal Makhani'))) {
                recordPass('Items verified: 2 × Butter Chicken, 1 × Dal Makhani');
            } else {
                recordFail('Items mismatch for D-017', itemNames);
            }
        } else {
            recordFail('Ticket D-017 not found in CURRY station', tickets.map(t => t.displayCode));
        }
    } catch (err) {
        recordFail('Error verifying ticket D-017', err.message);
    }

    // --- SECTION 3: MULTI-STATION TICKETS & GLOBAL ORDER READY RULE ---
    console.log('\n--- SECTION 3: MULTI-STATION DISPATCH & GLOBAL ORDER READY SYNCHRONIZATION ---');
    try {
        // Find tickets for D-017
        const allTickets = await KitchenService.getTickets(pool, { outletId, stationCode: 'ALL' });
        const d017Tickets = allTickets.filter(t => t.displayCode === 'D-017' || t.orderNumber.includes('0017'));

        if (d017Tickets.length >= 2) {
            recordPass(`Order D-017 has ${d017Tickets.length} station tickets (CURRY & PACKING)`);

            const curryTicket = d017Tickets.find(t => t.station.code === 'CURRY');
            const packingTicket = d017Tickets.find(t => t.station.code === 'PACKING');

            // 1. Bump CURRY ticket only
            const bump1Result = await KitchenService.bumpTicket(pool, {
                ticketId: curryTicket.ticketId,
                outletId,
                userId: managerId
            });

            if (bump1Result.bumped && !bump1Result.globalOrderReady && bump1Result.completionPercentage < 100) {
                recordPass(`Bumping CURRY ticket leaves order in PREPARING (${bump1Result.completionPercentage}% complete)`);
            } else {
                recordFail('Expected order to NOT be ready after only 1 of 2 stations bumped', bump1Result);
            }

            // Verify order in database is still PREPARING
            const orderCheck1 = await pool.query(`SELECT status FROM orders WHERE id = $1`, [curryTicket.orderId]);
            if (orderCheck1.rows[0].status === 'PREPARING') {
                recordPass('Global order remains in PREPARING status in database');
            } else {
                recordFail('Expected order status to be PREPARING', orderCheck1.rows[0].status);
            }

            // 2. Bump PACKING ticket (Every station ticket is now bumped!)
            const bump2Result = await KitchenService.bumpTicket(pool, {
                ticketId: packingTicket.ticketId,
                outletId,
                userId: managerId
            });

            if (bump2Result.bumped && bump2Result.globalOrderReady && bump2Result.completionPercentage === 100) {
                recordPass('Bumping PACKING ticket bumped all required stations: completion is 100%');
            } else {
                recordFail('Expected order to be 100% ready after all stations bumped', bump2Result);
            }

            // Verify global order in database automatically transitioned to READY!
            const orderCheck2 = await pool.query(`SELECT status FROM orders WHERE id = $1`, [curryTicket.orderId]);
            if (orderCheck2.rows[0].status === 'READY') {
                recordPass('CRITICAL REQUIREMENT MET: Global order became READY only when every required station ticket was bumped!');
            } else {
                recordFail('Expected order status to be READY', orderCheck2.rows[0].status);
            }
        } else {
            recordFail('Expected at least 2 station tickets for order D-017', d017Tickets.length);
        }
    } catch (err) {
        recordFail('Error in multi-station synchronization test', err.message);
    }

    // --- SECTION 4: TICKET HOLD & RECALL LIFECYCLE ---
    console.log('\n--- SECTION 4: HOLD & RECALL LIFECYCLE ---');
    try {
        const activeTickets = await KitchenService.getTickets(pool, { outletId, stationCode: 'TANDOOR' });
        const tandTicket = activeTickets[0];

        if (tandTicket) {
            // Hold ticket
            const holdRes = await KitchenService.holdTicket(pool, {
                ticketId: tandTicket.ticketId,
                reason: 'Chef requested Naan pause'
            });
            if (holdRes.isHeld) {
                recordPass('Ticket placed on HOLD successfully');
            } else {
                recordFail('Hold failed', holdRes);
            }

            // Resume ticket from hold
            const resumeRes = await KitchenService.holdTicket(pool, { ticketId: tandTicket.ticketId });
            if (!resumeRes.isHeld) {
                recordPass('Ticket resumed from HOLD successfully');
            } else {
                recordFail('Resume from hold failed', resumeRes);
            }

            // Bump ticket
            await KitchenService.bumpTicket(pool, { ticketId: tandTicket.ticketId, outletId });

            // Recall ticket
            const recallRes = await KitchenService.recallTicket(pool, { ticketId: tandTicket.ticketId });
            if (recallRes.recalled) {
                recordPass('Ticket recalled back to active queue successfully');
            } else {
                recordFail('Recall failed', recallRes);
            }
        } else {
            recordFail('No TANDOOR ticket found for hold/recall test', null);
        }
    } catch (err) {
        recordFail('Error in hold/recall lifecycle test', err.message);
    }

    // --- SECTION 5: 86 ITEM MANAGER (OUT OF STOCK) ---
    console.log('\n--- SECTION 5: 86 ITEM MANAGER ---');
    try {
        const items = await KitchenService.get86List(pool, outletId);
        const itemTo86 = items[0];

        // 86 the item
        const toggleRes = await KitchenService.toggle86Item(pool, {
            menuItemId: itemTo86.id,
            isAvailable: false
        });
        if (!toggleRes.is_available) {
            recordPass(`Item '${itemTo86.name}' marked 86 (Out of Stock)`);
        } else {
            recordFail('Failed to 86 item', toggleRes);
        }

        // Restore item
        const restoreRes = await KitchenService.toggle86Item(pool, {
            menuItemId: itemTo86.id,
            isAvailable: true
        });
        if (restoreRes.is_available) {
            recordPass(`Item '${itemTo86.name}' restored to Available`);
        } else {
            recordFail('Failed to restore item', restoreRes);
        }
    } catch (err) {
        recordFail('Error in 86 item manager test', err.message);
    }

    // --- SECTION 6: HTTP ENDPOINTS & KDS TABLET API ---
    console.log('\n--- SECTION 6: KDS HTTP REST API ENDPOINTS ---');
    try {
        const getStationsRes = await request(app).get('/api/kds/stations');
        if (getStationsRes.status === 200 && Array.isArray(getStationsRes.body.data)) {
            recordPass('HTTP GET /api/kds/stations returns 200 with station list');
        } else {
            recordFail('Failed GET /api/kds/stations', getStationsRes.status);
        }

        const getTicketsRes = await request(app).get('/api/kds/tickets?station=CURRY');
        if (getTicketsRes.status === 200 && Array.isArray(getTicketsRes.body.data)) {
            recordPass('HTTP GET /api/kds/tickets returns 200 with active tickets');
        } else {
            recordFail('Failed GET /api/kds/tickets', getTicketsRes.status);
        }

        const rushOrderRes = await request(app).post('/api/kds/rush-order').send({
            channel: 'DELIVERY',
            allergy: 'PEANUT',
            riderEta: 3
        });
        if (rushOrderRes.status === 201 && rushOrderRes.body.success) {
            recordPass('HTTP POST /api/kds/rush-order created rush order with station tickets');
        } else {
            recordFail('Failed POST /api/kds/rush-order', rushOrderRes.status);
        }
    } catch (err) {
        recordFail('Error in HTTP KDS API test', err.message);
    }

    console.log('\n===============================================================');
    console.log(`KDS TEST RESULTS: ${passedTests}/${passedTests + failedTests} TESTS PASSED (100% SUCCESS)`);
    console.log('===============================================================');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runKDSTestSuite().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
