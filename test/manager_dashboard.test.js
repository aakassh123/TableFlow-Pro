// Test Suite: Manager Operational Dashboard & Board Metrics
// Verifies Today KPIs, Kitchen traffic lights, Inventory thresholds, Cook Next Batch, and PO Approvals per DOC-20261007-WA0006
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runManagerDashboardTestSuite() {
    console.log('===============================================================');
    console.log('OPERATIONAL MANAGER BOARD & DASHBOARD TEST SUITE');
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
        // SECTION 1: TODAY EXECUTIVE KPIS
        // ====================================================================
        console.log('--- SECTION 1: TODAY EXECUTIVE KPIS ---');

        const metrics = await DashboardService.getManagerOperationalBoard(pool, outletId);

        if (metrics.today && metrics.today.salesFormatted.includes('42,850')) {
            recordPass(`Today Sales accurately computed: '${metrics.today.salesFormatted}'`);
        } else {
            recordFail('Today Sales accurately computed', new Error(`Got: ${metrics.today?.salesFormatted}`));
        }

        if (metrics.today && metrics.today.ordersCount >= 128) {
            recordPass(`Today Order Volume recorded: ${metrics.today.ordersCount} Orders`);
        } else {
            recordFail('Today Order Volume recorded', new Error(`Got: ${metrics.today?.ordersCount}`));
        }

        if (metrics.today && metrics.today.avgTicketMinutes === 8.2) {
            recordPass(`Average Station Ticket Time: ${metrics.today.avgTicketMinutes} min`);
        } else {
            recordFail('Average Station Ticket Time', new Error(`Got: ${metrics.today?.avgTicketMinutes}`));
        }

        if (metrics.today && metrics.today.promiseHitRate === 94) {
            recordPass(`Promise Hit Rate: ${metrics.today.promiseHitRate}%`);
        } else {
            recordFail('Promise Hit Rate', new Error(`Got: ${metrics.today?.promiseHitRate}`));
        }

        // ====================================================================
        // SECTION 2: KITCHEN TRAFFIC LIGHT STATUS
        // ====================================================================
        console.log('\n--- SECTION 2: KITCHEN TRAFFIC LIGHT STATUS ---');

        if (metrics.kitchen && metrics.kitchen.openCount === 8) {
            recordPass(`🟢 Open Tickets: ${metrics.kitchen.openCount} Open`);
        } else {
            recordFail('🟢 Open Tickets', new Error(`Got: ${metrics.kitchen?.openCount}`));
        }

        if (metrics.kitchen && metrics.kitchen.delayedCount === 2) {
            recordPass(`🟡 Delayed Tickets: ${metrics.kitchen.delayedCount} Delayed`);
        } else {
            recordFail('🟡 Delayed Tickets', new Error(`Got: ${metrics.kitchen?.delayedCount}`));
        }

        if (metrics.kitchen && metrics.kitchen.lateCount === 1) {
            recordPass(`🔴 Late Tickets: ${metrics.kitchen.lateCount} Late`);
        } else {
            recordFail('🔴 Late Tickets', new Error(`Got: ${metrics.kitchen?.lateCount}`));
        }

        // ====================================================================
        // SECTION 3: INVENTORY THRESHOLD TRAFFIC LIGHTS
        // ====================================================================
        console.log('\n--- SECTION 3: INVENTORY THRESHOLD TRAFFIC LIGHTS ---');

        const inv = metrics.inventory;

        // Paneer: 900g 🔴
        const paneer = inv.find(i => i.name === 'Paneer');
        if (paneer && paneer.displayValue === '900g' && paneer.trafficStatus === 'CRITICAL' && paneer.icon === '🔴') {
            recordPass(`🔴 Paneer: ${paneer.displayValue} (CRITICAL - Below safety stock)`);
        } else {
            recordFail('🔴 Paneer threshold', new Error(`Got: ${paneer?.displayValue} ${paneer?.trafficStatus}`));
        }

        // Butter: 600g 🔴
        const butter = inv.find(i => i.name === 'Butter');
        if (butter && butter.displayValue === '600g' && butter.trafficStatus === 'CRITICAL' && butter.icon === '🔴') {
            recordPass(`🔴 Butter: ${butter.displayValue} (CRITICAL - Below safety stock)`);
        } else {
            recordFail('🔴 Butter threshold', new Error(`Got: ${butter?.displayValue} ${butter?.trafficStatus}`));
        }

        // Maida: 4.3kg 🟡
        const maida = inv.find(i => i.name === 'Maida');
        if (maida && maida.displayValue === '4.3kg' && maida.trafficStatus === 'WARNING' && maida.icon === '🟡') {
            recordPass(`🟡 Maida: ${maida.displayValue} (WARNING - Reorder point approaching)`);
        } else {
            recordFail('🟡 Maida threshold', new Error(`Got: ${maida?.displayValue} ${maida?.trafficStatus}`));
        }

        // Oil: 6L 🟢
        const oil = inv.find(i => i.name === 'Oil');
        if (oil && oil.displayValue === '6L' && oil.trafficStatus === 'HEALTHY' && oil.icon === '🟢') {
            recordPass(`🟢 Oil: ${oil.displayValue} (HEALTHY - Stock level sufficient)`);
        } else {
            recordFail('🟢 Oil threshold', new Error(`Got: ${oil?.displayValue} ${oil?.trafficStatus}`));
        }

        // ====================================================================
        // SECTION 4: COOK NEXT BATCH PREP RECOMMENDATION
        // ====================================================================
        console.log('\n--- SECTION 4: COOK NEXT BATCH PREP RECOMMENDATION ---');

        const nextBatch = metrics.cookNextBatch;
        if (nextBatch && nextBatch.item === 'Makhani Gravy') {
            recordPass(`Anticipatory Batch Target: ${nextBatch.item} (${nextBatch.station} station)`);
        } else {
            recordFail('Anticipatory Batch Target', new Error(`Got: ${nextBatch?.item}`));
        }

        if (nextBatch && nextBatch.yieldDisplay.includes('8 portions')) {
            recordPass(`Batch Yield: ${nextBatch.yieldDisplay}`);
        } else {
            recordFail('Batch Yield', new Error(`Got: ${nextBatch?.yieldDisplay}`));
        }

        // Trigger batch cook via HTTP API
        const batchRes = await request(app)
            .post('/api/dashboard/batch-cook/start')
            .send({ item: 'Makhani Gravy', portions: 8, stationCode: 'CURRY' });

        if (batchRes.status === 200 && batchRes.body.success) {
            recordPass('HTTP POST /api/dashboard/batch-cook/start initiated batch cooking session');
        } else {
            recordFail('HTTP POST /api/dashboard/batch-cook/start', new Error(batchRes.body.message));
        }

        // ====================================================================
        // SECTION 5: PURCHASE ORDERS & MANAGER APPROVAL
        // ====================================================================
        console.log('\n--- SECTION 5: PURCHASE ORDERS & MANAGER APPROVAL ---');

        const poSummary = metrics.purchaseOrders;
        if (poSummary && poSummary.awaitingApprovalCount === 2) {
            recordPass(`Purchase Orders: ${poSummary.summaryDisplay}`);
        } else {
            recordFail('Purchase Orders awaiting approval count', new Error(`Got: ${poSummary?.awaitingApprovalCount}`));
        }

        if (poSummary.orders && poSummary.orders.length >= 2) {
            recordPass(`Found ${poSummary.orders.length} purchase order records in procurement ledger`);
        } else {
            recordFail('Purchase order records found', new Error(`Count: ${poSummary.orders?.length}`));
        }

        const po1 = poSummary.orders[0];
        const po2 = poSummary.orders[1];

        if (po1.poNumber.startsWith('PO-') && po1.totalFormatted.startsWith('₹')) {
            recordPass(`PO 1 verified: ${po1.poNumber} • ${po1.supplierName} (${po1.totalFormatted})`);
        } else {
            recordFail('PO 1 verified', new Error(`PO 1: ${po1.poNumber}`));
        }

        // Approve PO via HTTP POST
        const approveRes = await request(app)
            .post(`/api/dashboard/purchase-orders/${po1.id}/approve`)
            .send({ outletId });

        if (approveRes.status === 200 && approveRes.body.success && approveRes.body.po.status === 'ISSUED') {
            recordPass(`Manager approved PO ${po1.poNumber} -> Status transitioned to 'ISSUED'`);
        } else {
            recordFail('Manager approved PO', new Error(approveRes.body.message));
        }

        // ====================================================================
        // SECTION 6: HTTP REST API & FRONTEND SERVING
        // ====================================================================
        console.log('\n--- SECTION 6: HTTP REST API & FRONTEND SERVING ---');

        const httpSummaryRes = await request(app)
            .get('/api/dashboard/summary');

        if (httpSummaryRes.status === 200 && httpSummaryRes.body.success) {
            recordPass('HTTP GET /api/dashboard/summary returned 200 with operational metrics');
        } else {
            recordFail('HTTP GET /api/dashboard/summary', new Error(httpSummaryRes.status));
        }

        const dashboardPageRes = await request(app)
            .get('/dashboard');

        if (dashboardPageRes.status === 200 && dashboardPageRes.text.includes('Operational Manager Board')) {
            recordPass('HTTP GET /dashboard serves Operational Manager Board HTML UI');
        } else {
            recordFail('HTTP GET /dashboard serves UI', new Error(dashboardPageRes.status));
        }

    } catch (unexpectedErr) {
        console.error('\nUNEXPECTED SUITE FAILURE:', unexpectedErr);
        failedTests++;
    }

    console.log('\n===============================================================');
    console.log(`MANAGER DASHBOARD TEST RESULTS: ${passedTests}/${passedTests + failedTests} TESTS PASSED (${failedTests === 0 ? '100% SUCCESS' : 'FAILURES PRESENT'})`);
    console.log('===============================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runManagerDashboardTestSuite().catch(err => {
    console.error('Fatal Test Harness Failure:', err);
    process.exit(1);
});
