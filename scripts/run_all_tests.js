import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const testSuites = [
    { name: 'Schema & Database Invariants', cmd: 'node scripts/test_invariants.js' },
    { name: 'Authentication & RBAC Security', cmd: 'node test/auth_rbac.test.js' },
    { name: 'Inventory Ledger & Stock Deductions', cmd: 'node test/inventory_engine.test.js' },
    { name: 'Order Service & State Machines', cmd: 'node test/order_service.test.js' },
    { name: 'Kitchen Display System (KDS)', cmd: 'node test/kds_kitchen_system.test.js' },
    { name: 'ETA Estimation & Realtime WebSocket Hub', cmd: 'node test/eta_and_realtime.test.js' },
    { name: 'Transactional Outbox & Event Publishing', cmd: 'node test/transactional_outbox.test.js' },
    { name: 'QR Table Ordering & Upfront Payment', cmd: 'node test/qr_ordering.test.js' },
    { name: 'Manager Analytics & Z-Report Dashboard', cmd: 'node test/manager_dashboard.test.js' },
    { name: '24-Hour Production Concurrency Audit', cmd: 'node test/production_audit_24.test.js' },
    { name: 'POS Modern UI/UX & All 18 Workflows', cmd: 'node test/pos_ui_ux_verification.test.js' }
];

console.log('========================================================================');
console.log('   DUM HOUSE RESTAURANT OPERATING SYSTEM - MASTER TEST RUNNER');
console.log('========================================================================\n');

const results = [];
let totalStartTime = Date.now();

for (const suite of testSuites) {
    process.stdout.write(`⏳ Running [${suite.name}]... `);
    const start = Date.now();
    try {
        const output = execSync(suite.cmd, { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        console.log(`✓ PASSED (${elapsed}s)`);
        results.push({ name: suite.name, status: 'PASSED', time: elapsed });
    } catch (err) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        console.log(`❌ FAILED (${elapsed}s)`);
        console.error(err.stdout || err.message);
        results.push({ name: suite.name, status: 'FAILED', time: elapsed, error: err.message });
    }
}

const totalTime = ((Date.now() - totalStartTime) / 1000).toFixed(2);

console.log('\n========================================================================');
console.log('                           MASTER TEST REPORT');
console.log('========================================================================');
console.table(results);

const passedCount = results.filter(r => r.status === 'PASSED').length;
const totalCount = results.length;
console.log(`Summary: ${passedCount}/${totalCount} Test Suites Passed in ${totalTime}s (Success Rate: ${Math.round((passedCount/totalCount)*100)}%)\n`);

if (passedCount < totalCount) {
    process.exit(1);
}
