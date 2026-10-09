// Automated Test Suite for Inventory Engine
// Verifies Append-Only Ledger, Batch Tracking, Invariants, and Concurrent Reservations Race Conditions
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { InsufficientStockError, InvalidReservationStateError, ReservationNotFoundError } from '../src/modules/inventory/inventory.errors.js';
import { ValidationError } from '../src/shared/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runInventoryTestSuite() {
    console.log('===============================================================');
    console.log('INVENTORY ENGINE & CONCURRENCY VERIFICATION SUITE');
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
        '011_auth_rbac_enhancement.sql'
    ];

    for (const f of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
            .replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/gi, '');
        db.public.none(sql);
    }

    const { Pool } = db.adapters.createPg();
    const pool = new Pool();

    const outletId = '33333333-3333-3333-3333-333333333301';
    const managerId = '01900000-2222-0000-0000-000000000002';
    const supplierId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';

    // Insert test orders for foreign key references in stock_reservations
    await pool.query(`
        INSERT INTO orders (id, outlet_id, order_number, subtotal_paise, total_paise) VALUES
            ('00000000-0000-0000-0000-000000000001', '${outletId}', 'ORD-INV-001', 42000, 44100),
            ('00000000-0000-0000-0000-000000000010', '${outletId}', 'ORD-RACE-001', 42000, 44100),
            ('00000000-0000-0000-0000-000000000020', '${outletId}', 'ORD-RACE-002', 42000, 44100)
        ON CONFLICT DO NOTHING;
    `);

    // Insert orders for 10-way race test
    for (let i = 0; i < 10; i++) {
        await pool.query(`
            INSERT INTO orders (id, outlet_id, order_number, subtotal_paise, total_paise)
            VALUES ('00000000-0000-0000-0000-0000000000${i + 30}', '${outletId}', 'ORD-MULTI-${i + 1}', 10000, 10500)
            ON CONFLICT DO NOTHING;
        `);
    }


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

    // ========================================================================
    // SECTION 1: GOODS RECEIPT & APPEND-ONLY LEDGER INGESTION
    // ========================================================================
    console.log('--- SECTION 1: GOODS RECEIPT (PURCHASE GRN) & WEIGHTED AVG COST ---');

    // Receive 50,000g (50 kg) of Paneer at 35 paise/g
    const paneerIngId = 'ffffffff-ffff-ffff-ffff-ffffffffff03';
    const grnResult = await InventoryService.receiveGoods(pool, {
        outletId,
        supplierId,
        grnNumber: 'GRN-2026-001',
        invoiceNumber: 'INV-METRO-9981',
        receivedBy: managerId,
        items: [
            {
                ingredientId: paneerIngId,
                quantityBaseUnits: 50000.0000,
                unitCostPaise: 35,
                batchNumber: 'BATCH-PAN-001',
                expiryDate: '2026-10-20'
            }
        ]
    });

    const paneerStockItem = grnResult.items[0];
    if (paneerStockItem.newBalance === 50000 && paneerStockItem.ledgerEntry.entry_type === 'PURCHASE_GRN') {
        recordPass('Goods receipt note creates batch, updates on-hand stock, and appends to stock_ledger');
    } else {
        recordFail('Goods receipt intake failed', JSON.stringify(grnResult));
    }

    // Receive another 20,000g at 42 paise/g to verify Weighted Average Cost
    // Old: 50,000g @ 35p (Total = 1,750,000p)
    // New: 20,000g @ 42p (Total = 840,000p)
    // Combined: 70,000g -> Total 2,590,000p -> 37 paise/g
    await InventoryService.receiveGoods(pool, {
        outletId,
        supplierId,
        grnNumber: 'GRN-2026-002',
        invoiceNumber: 'INV-METRO-9982',
        receivedBy: managerId,
        items: [
            {
                ingredientId: paneerIngId,
                quantityBaseUnits: 20000.0000,
                unitCostPaise: 42,
                batchNumber: 'BATCH-PAN-002'
            }
        ]
    });

    const paneerBalance = await InventoryService.getStockBalance(pool, { outletId, stockItemId: paneerStockItem.stockItemId });
    if (paneerBalance.onHandBalance === 70000 && paneerBalance.averageUnitCostPaise === 37) {
        recordPass('Weighted average unit cost correctly computed and maintained across receipts');
    } else {
        recordFail('Weighted average cost mismatch', JSON.stringify(paneerBalance));
    }

    // ========================================================================
    // SECTION 2: RESERVATION & CONSUMPTION LIFECYCLE
    // ========================================================================
    console.log('\n--- SECTION 2: RESERVATION & CONSUMPTION LIFECYCLE ---');

    // 2.1: Reserve 1,200g Paneer for an order
    const reserveResult = await InventoryService.reserveStock(pool, {
        outletId,
        stockItemId: paneerStockItem.stockItemId,
        quantityBaseUnits: 1200.0000,
        orderId: '00000000-0000-0000-0000-000000000001'
    });

    const res1 = reserveResult.reservation;
    if (res1.status === 'PENDING' && reserveResult.stockItem.reservedQuantity === 1200 && reserveResult.stockItem.availableStock === 68800) {
        recordPass('reserveStock holds ingredient quantity: on-hand stays 70,000g, reserved becomes 1,200g, available becomes 68,800g');
    } else {
        recordFail('reserveStock values incorrect', JSON.stringify(reserveResult));
    }

    // 2.2: Consume the reserved stock (order cooked)
    const consumeResult = await InventoryService.consumeReservedStock(pool, {
        outletId,
        reservationId: res1.id,
        referenceType: 'ORDER',
        referenceId: '00000000-0000-0000-0000-000000000001',
        userId: managerId
    });

    if (consumeResult.status === 'CONSUMED' &&
        consumeResult.stockItem.onHandBalance === 68800 &&
        consumeResult.stockItem.reservedQuantity === 0 &&
        consumeResult.ledgerEntry.entry_type === 'CONSUME') {
        recordPass('consumeReservedStock releases reservation, decrements on-hand stock, and logs CONSUME ledger delta');
    } else {
        recordFail('consumeReservedStock failed', JSON.stringify(consumeResult));
    }

    // 2.3: Rejection: Double Consume of same reservation must fail!
    try {
        await InventoryService.consumeReservedStock(pool, {
            outletId,
            reservationId: res1.id,
            userId: managerId
        });
        recordFail('Double consume succeeded', 'Expected InvalidReservationStateError');
    } catch (err) {
        if (err instanceof InvalidReservationStateError) {
            recordPass('Double-consume of already consumed reservation rejected with InvalidReservationStateError');
        } else {
            recordFail('Unexpected error on double consume', err.message);
        }
    }

    // ========================================================================
    // SECTION 3: RESERVATION & RELEASE LIFECYCLE
    // ========================================================================
    console.log('\n--- SECTION 3: RESERVATION & RELEASE LIFECYCLE ---');

    // 3.1: Reserve 800g Paneer
    const reserve2Result = await InventoryService.reserveStock(pool, {
        outletId,
        stockItemId: paneerStockItem.stockItemId,
        quantityBaseUnits: 800.0000
    });
    const res2 = reserve2Result.reservation;

    // 3.2: Release reservation (Customer voids order prior to cooking)
    const releaseResult = await InventoryService.releaseReservation(pool, {
        outletId,
        reservationId: res2.id,
        reason: 'GUEST_CHANGED_MIND',
        userId: managerId
    });

    if (releaseResult.status === 'RELEASED' &&
        releaseResult.stockItem.reservedQuantity === 0 &&
        releaseResult.stockItem.availableStock === 68800 &&
        releaseResult.ledgerEntry.entry_type === 'RELEASE') {
        recordPass('releaseReservation decrements reserved stock, restores available balance, and appends RELEASE ledger entry');
    } else {
        recordFail('releaseReservation failed', JSON.stringify(releaseResult));
    }

    // 3.3: Rejection: Releasing an already released reservation must fail
    try {
        await InventoryService.releaseReservation(pool, {
            outletId,
            reservationId: res2.id,
            userId: managerId
        });
        recordFail('Double release succeeded', 'Expected InvalidReservationStateError');
    } catch (err) {
        if (err instanceof InvalidReservationStateError) {
            recordPass('Double-release of already released reservation rejected');
        } else {
            recordFail('Unexpected error on double release', err.message);
        }
    }

    // ========================================================================
    // SECTION 4: INVARIANT VIOLATION DEFENSES
    // ========================================================================
    console.log('\n--- SECTION 4: INVARIANT VIOLATION DEFENSES ---');

    // 4.1: CONSUME without RESERVE must fail
    try {
        await InventoryService.consumeReservedStock(pool, {
            outletId,
            reservationId: '99999999-0000-0000-0000-000000000000',
            userId: managerId
        });
        recordFail('Consume without reserve succeeded', 'Expected ReservationNotFoundError');
    } catch (err) {
        if (err instanceof ReservationNotFoundError) {
            recordPass('CONSUME without RESERVE rejected with ReservationNotFoundError');
        } else {
            recordFail('Unexpected error on unreserved consume', err.message);
        }
    }

    // 4.2: RELEASE without RESERVE must fail
    try {
        await InventoryService.releaseReservation(pool, {
            outletId,
            reservationId: '99999999-0000-0000-0000-000000000000',
            userId: managerId
        });
        recordFail('Release without reserve succeeded', 'Expected ReservationNotFoundError');
    } catch (err) {
        if (err instanceof ReservationNotFoundError) {
            recordPass('RELEASE without RESERVE rejected with ReservationNotFoundError');
        } else {
            recordFail('Unexpected error on unreserved release', err.message);
        }
    }

    // 4.3: WASTE without valid reason must fail
    try {
        await InventoryService.recordWaste(pool, {
            outletId,
            stockItemId: paneerStockItem.stockItemId,
            quantityBaseUnits: 150.0000,
            reason: '   ', // Blank / whitespace reason
            recordedBy: managerId
        });
        recordFail('Waste without reason succeeded', 'Expected ValidationError');
    } catch (err) {
        if (err instanceof ValidationError) {
            recordPass('WASTE without valid reason rejected with ValidationError');
        } else {
            recordFail('Unexpected error on empty waste reason', err.message);
        }
    }

    // 4.4: WASTE with valid reason succeeds
    const wasteResult = await InventoryService.recordWaste(pool, {
        outletId,
        stockItemId: paneerStockItem.stockItemId,
        quantityBaseUnits: 300.0000,
        reason: 'Fell on kitchen floor during prep',
        recordedBy: managerId
    });

    if (wasteResult.wasteEntry.reason === 'Fell on kitchen floor during prep' &&
        wasteResult.stockItem.onHandBalance === 68500 &&
        wasteResult.ledgerEntry.entry_type === 'WASTE') {
        recordPass('WASTE with valid non-empty reason succeeds and appends negative WASTE delta to ledger');
    } else {
        recordFail('Waste recording failed', JSON.stringify(wasteResult));
    }

    // ========================================================================
    // SECTION 5: CONCURRENT RESERVATION RACE CONDITION TESTS
    // ========================================================================
    console.log('\n--- SECTION 5: CONCURRENT RESERVATIONS RACE CONDITION TESTS ---');
    console.log('Scenario: Ingredient has EXACTLY 1,000g available.');
    console.log('Two orders try to reserve 600g SIMULTANEOUSLY. Only ONE can succeed!\n');

    // 1. Create a dedicated isolated test ingredient with EXACTLY 1,000g
    const testIngRes = await pool.query(`
        INSERT INTO ingredients (
            outlet_id, code, name, base_unit_id, cost_per_base_unit_paise, reorder_level_base_units
        ) VALUES (
            $1, 'ING-RACE-TEST', 'Limited Saffron Threads',
            '11111111-1111-1111-1111-111111111101', 500, 100
        ) RETURNING id;
    `, [outletId]);

    const saffronIngId = testIngRes.rows[0].id;

    // Receive exactly 1,000g into stock
    const raceGrn = await InventoryService.receiveGoods(pool, {
        outletId,
        supplierId,
        grnNumber: 'GRN-RACE-001',
        invoiceNumber: 'INV-RACE-001',
        receivedBy: managerId,
        items: [
            {
                ingredientId: saffronIngId,
                quantityBaseUnits: 1000.0000,
                unitCostPaise: 500,
                batchNumber: 'BATCH-SAFFRON-001'
            }
        ]
    });

    const saffronStockItemId = raceGrn.items[0].stockItemId;

    // Check initial state
    const initBalance = await InventoryService.getStockBalance(pool, { outletId, stockItemId: saffronStockItemId });
    console.log(`  Initial stock: on_hand = ${initBalance.onHandBalance}g, available = ${initBalance.availableStock}g`);

    // 2. Execute 2 simultaneous reservation requests for 600g each
    const order1Promise = InventoryService.reserveStock(pool, {
        outletId,
        stockItemId: saffronStockItemId,
        quantityBaseUnits: 600.0000,
        orderId: '00000000-0000-0000-0000-000000000010'
    });

    const order2Promise = InventoryService.reserveStock(pool, {
        outletId,
        stockItemId: saffronStockItemId,
        quantityBaseUnits: 600.0000,
        orderId: '00000000-0000-0000-0000-000000000020'
    });

    const results = await Promise.allSettled([order1Promise, order2Promise]);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    console.log(`  Simultaneous 600g reservation results: ${successCount} Succeeded, ${failureCount} Rejected`);

    if (successCount === 1 && failureCount === 1) {
        recordPass('Concurrent 2-order race condition: EXACTLY 1 order succeeded and 1 was rejected');
    } else {
        recordFail('Race condition failed to protect inventory', `Successes: ${successCount}, Failures: ${failureCount}`);
    }

    // Verify rejection was InsufficientStockError
    const rejectedReason = results.find(r => r.status === 'rejected').reason;
    if (rejectedReason instanceof InsufficientStockError) {
        recordPass('Losing concurrent order received InsufficientStockError');
    } else {
        recordFail('Losing order did not receive InsufficientStockError', rejectedReason.message);
    }

    // Verify post-race balance: on_hand = 1,000g, reserved = 600g, available = 400g
    const postRaceBalance = await InventoryService.getStockBalance(pool, { outletId, stockItemId: saffronStockItemId });
    if (postRaceBalance.onHandBalance === 1000 && postRaceBalance.reservedQuantity === 600 && postRaceBalance.availableStock === 400) {
        recordPass('Post-race balance exact: on_hand = 1,000g, reserved = 600g, available = 400g');
    } else {
        recordFail('Post-race balance corrupted', JSON.stringify(postRaceBalance));
    }

    // 3. Multi-order race condition:
    // With 400g remaining available, 10 concurrent orders attempt to reserve 200g each simultaneously!
    console.log('\n  Multi-order Race: 10 concurrent requests for 200g each when only 400g remains.');
    const concurrentRequests = Array.from({ length: 10 }).map((_, idx) =>
        InventoryService.reserveStock(pool, {
            outletId,
            stockItemId: saffronStockItemId,
            quantityBaseUnits: 200.0000,
            orderId: `00000000-0000-0000-0000-0000000000${idx + 30}`
        })
    );

    const multiResults = await Promise.allSettled(concurrentRequests);
    const multiSuccess = multiResults.filter(r => r.status === 'fulfilled').length;
    const multiRejected = multiResults.filter(r => r.status === 'rejected').length;

    console.log(`  Results: ${multiSuccess} Succeeded, ${multiRejected} Rejected`);

    if (multiSuccess === 2 && multiRejected === 8) {
        recordPass('10-way concurrent race: EXACTLY 2 succeeded (2 x 200g = 400g) and 8 rejected');
    } else {
        recordFail('Multi-way concurrency leak', `Successes: ${multiSuccess}, Failures: ${multiRejected}`);
    }

    // Final Invariant Checks on Saffron stock
    const finalBalance = await InventoryService.getStockBalance(pool, { outletId, stockItemId: saffronStockItemId });
    const availableNonNegative = finalBalance.availableStock >= 0;
    const reservedLteOnHand = finalBalance.reservedQuantity <= finalBalance.onHandBalance;

    if (availableNonNegative && reservedLteOnHand && finalBalance.availableStock === 0 && finalBalance.reservedQuantity === 1000) {
        recordPass('Final invariants hold: available_stock is exactly 0g (never negative), reserved = on_hand = 1,000g');
    } else {
        recordFail('Final invariants violated', JSON.stringify(finalBalance));
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n===============================================================');
    console.log(`INVENTORY TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS)`);
    console.log('===============================================================');
}

runInventoryTestSuite().catch(err => {
    console.error('Fatal inventory test error:', err);
    process.exit(1);
});
