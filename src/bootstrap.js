import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { newDb } from 'pg-mem';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { InventoryService } from './modules/inventory/inventory.service.js';
import { CryptoService } from './shared/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

let cachedPool = null;
let cachedApp = null;

export async function bootstrapDatabase() {
    if (cachedPool) return cachedPool;

    if (process.env.DATABASE_URL) {
        console.log('Connecting to PostgreSQL database:', process.env.DATABASE_URL.replace(/:[^:]+@/, ':****@'));
        cachedPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        return cachedPool;
    }

    console.log('Starting in-memory PostgreSQL engine (pg-mem) for instant zero-dependency execution...');
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
        const filePath = path.join(migrationsDir, f);
        if (fs.existsSync(filePath)) {
            const sql = fs.readFileSync(filePath, 'utf8')
                .replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/gi, '');
            db.public.none(sql);
        }
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

    // Ingest initial raw stock inventory
    try {
        await InventoryService.receiveGoods(pool, {
            outletId,
            supplierId,
            grnNumber: 'GRN-BOOTSTRAP-001',
            invoiceNumber: 'INV-INITIAL-001',
            receivedBy: managerId,
            items: [
                { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff01', quantityBaseUnits: 200000.0, unitCostPaise: 12, batchNumber: 'BATCH-RICE-BOOT', expiryDate: '2027-10-01' },
                { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff02', quantityBaseUnits: 200000.0, unitCostPaise: 22, batchNumber: 'BATCH-CHK-BOOT', expiryDate: '2026-10-15' },
                { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff03', quantityBaseUnits: 100000.0, unitCostPaise: 35, batchNumber: 'BATCH-PAN-BOOT', expiryDate: '2026-10-20' },
                { ingredientId: 'ffffffff-ffff-ffff-ffff-ffffffffff04', quantityBaseUnits: 50000.0, unitCostPaise: 65, batchNumber: 'BATCH-GHEE-BOOT', expiryDate: '2027-01-01' }
            ]
        });
    } catch (e) {
        console.warn('Inventory bootstrap note:', e.message);
    }

    cachedPool = pool;
    return cachedPool;
}

export async function getApp() {
    if (cachedApp) return cachedApp;
    const dbClient = await bootstrapDatabase();
    cachedApp = createApp(dbClient);
    return cachedApp;
}
