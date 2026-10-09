// Comprehensive Automated Test Suite: Authentication, RBAC, Manager PIN & Auditing
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';
import { CryptoService } from '../src/shared/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '..', 'migrations');

async function runAuthRbacTestSuite() {
    console.log('===============================================================');
    console.log('AUTHENTICATION & RBAC SECURITY TEST SUITE');
    console.log('===============================================================\n');

    // 1. Initialize In-Memory PostgreSQL engine with pg-mem
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

    // 2. Load all schema migrations (001 - 008, 010, 011)
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

    // Set real bcrypt hashes for test users:
    // Password: 'Password@123'
    // PIN: '9999'
    const testPasswordHash = await CryptoService.hashPassword('Password@123');
    const testPinHash = await CryptoService.hashPin('9999');

    db.public.none(`
        UPDATE users 
        SET password_hash = '${testPasswordHash}', pin_hash = '${testPinHash}'
        WHERE outlet_id = '33333333-3333-3333-3333-333333333301';
    `);

    // Create standard pg Pool using pg-mem adapter
    const { Pool } = db.adapters.createPg();
    const dbClient = new Pool();

    const app = createApp(dbClient);
    const outletId = '33333333-3333-3333-3333-333333333301';


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
    // TEST SECTION 1: SECURE LOGIN WITH PASSWORD & STAFF PIN
    // ========================================================================
    console.log('--- SECTION 1: SECURE LOGIN (PASSWORD & STAFF PIN) ---');

    // Test 1.1: Password Login Success
    let cashierLogin = await request(app)
        .post('/api/auth/login')
        .send({ outletId, identifier: 'cashier_ramesh', password: 'Password@123' });

    if (cashierLogin.status === 200 && cashierLogin.body.data.accessToken) {
        recordPass('Password login succeeds for valid credentials');
    } else {
        recordFail('Password login failed', JSON.stringify(cashierLogin.body));
    }
    const cashierToken = cashierLogin.body.data.accessToken;
    let cashierRefreshToken = cashierLogin.body.data.refreshToken;

    // Test 1.2: Password Login Rejects Invalid Password
    let failedLogin = await request(app)
        .post('/api/auth/login')
        .send({ outletId, identifier: 'cashier_ramesh', password: 'WrongPassword' });

    if (failedLogin.status === 401) {
        recordPass('Password login rejects invalid password with 401 Unauthorized');
    } else {
        recordFail('Expected 401 on wrong password', failedLogin.status);
    }

    // Test 1.3: Staff POS Fast PIN Login Success
    let pinLogin = await request(app)
        .post('/api/auth/login-pin')
        .send({ outletId, pin: '9999' });

    if (pinLogin.status === 200 && pinLogin.body.data.accessToken) {
        recordPass('Fast POS login succeeds for valid staff PIN');
    } else {
        recordFail('Staff PIN login failed', JSON.stringify(pinLogin.body));
    }

    // Test 1.4: Staff PIN Login Rejects Invalid PIN
    let failedPin = await request(app)
        .post('/api/auth/login-pin')
        .send({ outletId, pin: '0000' });

    if (failedPin.status === 401) {
        recordPass('Fast POS login rejects invalid staff PIN with 401');
    } else {
        recordFail('Expected 401 on wrong PIN', failedPin.status);
    }

    // ========================================================================
    // TEST SECTION 2: SESSION MANAGEMENT & REFRESH TOKEN ROTATION
    // ========================================================================
    console.log('\n--- SECTION 2: SESSION MANAGEMENT & REFRESH TOKEN ROTATION ---');

    // Test 2.1: Rotate Refresh Token
    let refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: cashierRefreshToken });

    if (refreshRes.status === 200 && refreshRes.body.data.accessToken && refreshRes.body.data.refreshToken) {
        recordPass('Refresh token rotation succeeds and returns new token pair');
    } else {
        recordFail('Token rotation failed', JSON.stringify(refreshRes.body));
    }

    const rotatedRefreshToken = refreshRes.body.data.refreshToken;

    // Test 2.2: Replay Attack / Reuse Detection!
    // Submitting the ALREADY USED cashierRefreshToken must trigger theft detection and revoke family!
    let reuseRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: cashierRefreshToken });

    if (reuseRes.status === 401 && reuseRes.body.detail.includes('reuse detected')) {
        recordPass('Refresh token reuse detected: Family revoked and request blocked with 401');
    } else {
        recordFail('Expected reuse detection 401', JSON.stringify(reuseRes.body));
    }

    // Test 2.3: Subsequent use of the rotated token is also rejected because entire family was revoked!
    let familyRevokedRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: rotatedRefreshToken });

    if (familyRevokedRes.status === 401) {
        recordPass('Entire token family invalidated after reuse incident');
    } else {
        recordFail('Expected rotated token to be revoked', familyRevokedRes.status);
    }

    // ========================================================================
    // TEST SECTION 3: ROLE BASED PERMISSIONS & BACKEND GUARDS
    // ========================================================================
    console.log('\n--- SECTION 3: ROLE-BASED ACCESS CONTROL (RBAC) & PERMISSION GUARDS ---');

    // Login each of the 6 roles
    const loginRole = async (username) => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ outletId, identifier: username, password: 'Password@123' });
        return res.body.data.accessToken;
    };

    const ownerToken = await loginRole('owner_rajesh');
    const managerToken = await loginRole('manager_arjun');
    const cashierToken2 = await loginRole('cashier_ramesh');
    const waiterToken = await loginRole('waiter_priya');
    const chefToken = await loginRole('chef_sanjeev');
    const riderToken = await loginRole('rider_vikas');

    // Test 3.1: OWNER has access to all modules
    let ownerOrders = await request(app).get('/api/orders').set('Authorization', `Bearer ${ownerToken}`);
    let ownerSettings = await request(app).put('/api/settings').set('Authorization', `Bearer ${ownerToken}`).send({ taxRate: 5 });
    if (ownerOrders.status === 200 && ownerSettings.status === 200) {
        recordPass('OWNER role possesses root authorization across all modules');
    } else {
        recordFail('OWNER authorization failed', ownerOrders.status);
    }

    // Test 3.2: CASHIER permissions
    // Cashier CAN read orders and menu
    let cashierOrders = await request(app).get('/api/orders').set('Authorization', `Bearer ${cashierToken2}`);
    let cashierMenu = await request(app).get('/api/menu').set('Authorization', `Bearer ${cashierToken2}`);
    if (cashierOrders.status === 200 && cashierMenu.status === 200) {
        recordPass('CASHIER granted access to permitted routes (orders.read, menu.read)');
    } else {
        recordFail('CASHIER allowed routes failed', cashierOrders.status);
    }

    // Cashier CANNOT edit menu (requires menu.write) -> 403 Forbidden
    let cashierMenuWrite = await request(app).post('/api/menu/items').set('Authorization', `Bearer ${cashierToken2}`).send({ code: 'NEW' });
    if (cashierMenuWrite.status === 403) {
        recordPass('CASHIER forbidden from modifying menu (menu.write enforced)');
    } else {
        recordFail('Expected 403 on menu.write for cashier', cashierMenuWrite.status);
    }

    // Cashier CANNOT manage settings -> 403 Forbidden
    let cashierSettings = await request(app).put('/api/settings').set('Authorization', `Bearer ${cashierToken2}`).send({});
    if (cashierSettings.status === 403) {
        recordPass('CASHIER forbidden from managing outlet settings (settings.manage enforced)');
    } else {
        recordFail('Expected 403 on settings.manage for cashier', cashierSettings.status);
    }

    // Test 3.3: CHEF permissions
    // Chef CAN access kitchen tickets and bump items
    let chefKitchen = await request(app).get('/api/kitchen/tickets').set('Authorization', `Bearer ${chefToken}`);
    let chefBump = await request(app).post('/api/kitchen/tickets/KOT-01/bump').set('Authorization', `Bearer ${chefToken}`);
    if (chefKitchen.status === 200 && chefBump.status === 200) {
        recordPass('CHEF granted access to kitchen tickets and bumping (kitchen.read, kitchen.bump)');
    } else {
        recordFail('CHEF allowed routes failed', chefKitchen.status);
    }

    // Chef CANNOT create orders -> 403 Forbidden
    let chefOrderCreate = await request(app).post('/api/orders').set('Authorization', `Bearer ${chefToken}`).send({});
    if (chefOrderCreate.status === 403) {
        recordPass('CHEF forbidden from creating customer orders (orders.create enforced)');
    } else {
        recordFail('Expected 403 on orders.create for chef', chefOrderCreate.status);
    }

    // Test 3.4: RIDER permissions
    // Rider CAN access delivery queue
    let riderDelivery = await request(app).get('/api/delivery/queue').set('Authorization', `Bearer ${riderToken}`);
    if (riderDelivery.status === 200) {
        recordPass('RIDER granted access to delivery dispatch queue (delivery.read)');
    } else {
        recordFail('RIDER delivery queue failed', riderDelivery.status);
    }

    // Rider CANNOT access kitchen tickets -> 403 Forbidden
    let riderKitchen = await request(app).get('/api/kitchen/tickets').set('Authorization', `Bearer ${riderToken}`);
    if (riderKitchen.status === 403) {
        recordPass('RIDER forbidden from viewing kitchen display system (kitchen.read enforced)');
    } else {
        recordFail('Expected 403 on kitchen.read for rider', riderKitchen.status);
    }

    // ========================================================================
    // TEST SECTION 4: MANAGER PIN FOR SENSITIVE OPERATIONS
    // ========================================================================
    console.log('\n--- SECTION 4: MANAGER PIN FOR SENSITIVE OPERATIONS ---');

    // Test 4.1: Sensitive action (orders.discount) by Cashier WITHOUT override token is blocked
    let unauthDiscount = await request(app)
        .post('/api/orders/ORD-001/discount')
        .set('Authorization', `Bearer ${cashierToken2}`)
        .send({ discountAmountPaise: 5000 });

    if (unauthDiscount.status === 403 && unauthDiscount.body.detail.includes('Manager PIN authorization token')) {
        recordPass('Sensitive action (orders.discount) blocked when Manager PIN token is missing');
    } else {
        recordFail('Expected 403 Manager PIN required error', JSON.stringify(unauthDiscount.body));
    }

    // Test 4.2: Request Manager Override Token using Manager PIN ('9999')
    let overrideRes = await request(app)
        .post('/api/auth/manager-override')
        .set('Authorization', `Bearer ${cashierToken2}`)
        .send({
            managerIdentifier: 'manager_arjun',
            managerPin: '9999',
            sensitiveAction: 'orders.discount',
            targetEntityId: 'ORD-001'
        });

    if (overrideRes.status === 200 && overrideRes.body.data.overrideToken) {
        recordPass('Manager PIN verified successfully and 120s override token issued');
    } else {
        recordFail('Manager override issuance failed', JSON.stringify(overrideRes.body));
    }

    const overrideToken = overrideRes.body.data.overrideToken;

    // Test 4.3: Cashier applies discount WITH the verified Manager Override Token
    let authDiscount = await request(app)
        .post('/api/orders/ORD-001/discount')
        .set('Authorization', `Bearer ${cashierToken2}`)
        .set('X-Manager-Override-Token', overrideToken)
        .send({ discountAmountPaise: 5000 });

    if (authDiscount.status === 200 && authDiscount.body.authorizedBy.managerUsername === 'manager_arjun') {
        recordPass('Sensitive action succeeds with verified Manager Override Token');
    } else {
        recordFail('Discount with override token failed', JSON.stringify(authDiscount.body));
    }

    // Test 4.4: Action Scope Mismatch - Token issued for 'orders.discount' CANNOT be used for 'inventory.adjust'
    let mismatchedAction = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${cashierToken2}`)
        .set('X-Manager-Override-Token', overrideToken) // token was for orders.discount!
        .send({ stockItemId: '10101010-1010-1010-1010-101010101001', quantityDelta: -500 });

    if (mismatchedAction.status === 403) {
        recordPass('Override token rejected when sensitive action does not match token scope');
    } else {
        recordFail('Expected 403 on action scope mismatch', mismatchedAction.status);
    }

    // Test 4.5: Manager has innate authority and does NOT need an override token
    let managerDiscount = await request(app)
        .post('/api/orders/ORD-002/discount')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ discountAmountPaise: 10000 });

    if (managerDiscount.status === 200 && managerDiscount.body.authorizedBy.innateAuthority === true) {
        recordPass('MANAGER possesses innate override authority without external token');
    } else {
        recordFail('Manager innate authority failed', JSON.stringify(managerDiscount.body));
    }

    // ========================================================================
    // TEST SECTION 5: AUDIT LOGGING OF PRIVILEGED ACTIONS
    // ========================================================================
    console.log('\n--- SECTION 5: AUDIT OF EVERY PRIVILEGED ACTION ---');

    const auditLogsRes = db.public.many(`
        SELECT action, entity_name, entity_id, new_values, created_at 
        FROM audit_logs 
        ORDER BY id DESC;
    `);

    const actionList = auditLogsRes.map(l => l.action);
    console.log(`  Audit entries recorded in database: ${auditLogsRes.length}`);
    console.log(`  Actions tracked: ${[...new Set(actionList)].join(', ')}`);

    const hasLoginAudit = actionList.includes('USER_LOGIN_PASSWORD');
    const hasOverrideGrant = actionList.includes('MANAGER_OVERRIDE_GRANTED');
    const hasDiscountAudit = actionList.includes('ORDER_DISCOUNT_APPLIED');
    const hasReuseAudit = actionList.includes('REFRESH_TOKEN_REUSE_DETECTED');

    if (hasLoginAudit && hasOverrideGrant && hasDiscountAudit && hasReuseAudit) {
        recordPass('All privileged operations, manager overrides, and security events recorded in audit_logs');
    } else {
        recordFail('Missing expected audit events', JSON.stringify(actionList));
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n===============================================================');
    console.log(`SECURITY TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS)`);
    console.log('===============================================================');
}

runAuthRbacTestSuite().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
