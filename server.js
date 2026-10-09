// Restaurant Operating Platform (ROP) - Local Server Runner
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { newDb } from 'pg-mem';
import { fileURLToPath } from 'url';
import { createApp } from './src/app.js';
import { InventoryService } from './src/modules/inventory/inventory.service.js';
import { CryptoService } from './src/shared/crypto.js';

import { wsHub } from './src/modules/realtime/websocket-hub.js';
import { OutboxWorker } from './src/modules/outbox/outbox.worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

const PORT = process.env.PORT || 3000;

async function bootstrapDatabase() {
    if (process.env.DATABASE_URL) {
        console.log('Connecting to PostgreSQL database:', process.env.DATABASE_URL.replace(/:[^:]+@/, ':****@'));
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        return pool;
    }

    console.log('Starting in-memory PostgreSQL engine (pg-mem) for instant local zero-dependency execution...');
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
    const managerId = '01900000-2222-0000-0000-000000000002';
    const supplierId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';

    // Hash passwords for staff users
    const testPasswordHash = await CryptoService.hashPassword('Password@123');
    const testPinHash = await CryptoService.hashPin('9999');
    db.public.none(`
        UPDATE users 
        SET password_hash = '${testPasswordHash}', pin_hash = '${testPinHash}'
        WHERE outlet_id = '${outletId}';
    `);

    // Ingest initial raw stock inventory for Biryani, Paneer, Chicken, Ghee, Flour
    try {
        await InventoryService.receiveGoods(pool, {
            outletId,
            supplierId,
            grnNumber: 'GRN-BOOTSTRAP-001',
            invoiceNumber: 'INV-INITIAL-001',
            receivedBy: managerId,
            items: [
                {
                    ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff01', // Rice
                    quantityBaseUnits: 200000.0000, // 200 kg
                    unitCostPaise: 12,
                    batchNumber: 'BATCH-RICE-BOOT',
                    expiryDate: '2027-10-01'
                },
                {
                    ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff02', // Chicken
                    quantityBaseUnits: 200000.0000, // 200 kg
                    unitCostPaise: 22,
                    batchNumber: 'BATCH-CHK-BOOT',
                    expiryDate: '2026-10-15'
                },
                {
                    ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff03', // Paneer
                    quantityBaseUnits: 100000.0000, // 100 kg
                    unitCostPaise: 35,
                    batchNumber: 'BATCH-PAN-BOOT',
                    expiryDate: '2026-10-20'
                },
                {
                    ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff04', // Ghee
                    quantityBaseUnits: 50000.0000, // 50 L
                    unitCostPaise: 65,
                    batchNumber: 'BATCH-GHEE-BOOT',
                    expiryDate: '2027-01-01'
                }
            ]
        });
        console.log('✓ Initial inventory ingested into stock ledger (Rice, Chicken, Paneer, Ghee).');
    } catch (e) {
        console.warn('Inventory bootstrap note:', e.message);
    }

    return pool;
}

async function startServer() {
    const dbClient = await bootstrapDatabase();
    const app = createApp(dbClient);

    const server = http.createServer(app);
    wsHub.attach(server);

    const outboxWorker = new OutboxWorker({ db: dbClient });
    outboxWorker.start();

    server.listen(PORT, () => {
        console.log(`\n===============================================================`);
        console.log(`RESTAURANT OPERATING PLATFORM (ROP) POS SERVER RUNNING`);
        console.log(`===============================================================`);
        console.log(`URL: http://localhost:${PORT}`);
        console.log(`Outlet: DUM HOUSE (Indiranagar, Bangalore)`);
        console.log(`Ready for order taking, kitchen display, and state machine fulfillment.\n`);
    });

    return server;
}

startServer().catch(err => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
});
