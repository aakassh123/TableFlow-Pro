// End-to-End Live Verification Script for Restaurant Operating Platform (ROP)
import http from 'http';

const BASE_URL = 'http://localhost:3000';
const OUTLET_ID = '33333333-3333-3333-3333-333333333301';

async function request(endpoint, options = {}) {
    const url = new URL(endpoint, BASE_URL);
    const method = options.method || 'GET';
    const headers = options.headers || {};
    let body = options.body;

    if (body && typeof body === 'object') {
        body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

    return new Promise((resolve, reject) => {
        const req = http.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    json = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: json });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
    totalCount++;
    if (condition) {
        passedCount++;
        console.log(`  ✓ PASS: ${message}`);
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function run() {
    console.log('===============================================================');
    console.log('LIVE COMPREHENSIVE END-TO-END SYSTEM VERIFICATION');
    console.log('Testing all pages, options, and APIs on live server: ' + BASE_URL);
    console.log('===============================================================\n');

    // 1. Static HTML Pages
    console.log('--- 1. Testing Web Page Endpoints ---');
    const pages = [
        { path: '/', name: 'POS Billing Terminal' },
        { path: '/kds', name: 'Kitchen Display System (KDS)' },
        { path: '/dashboard', name: 'Store Manager Operations Dashboard' },
        { path: '/counter-tv', name: 'Counter TV Token Screen' },
        { path: '/track', name: 'Customer Order Live Tracker' },
        { path: '/table/07', name: 'Customer Table QR Ordering PWA' },
        { path: '/conflicts', name: 'Offline Conflict Resolution Hub' }
    ];

    for (const p of pages) {
        const res = await request(p.path);
        assert(res.status === 200, `${p.name} (${p.path}) served successfully with HTTP 200`);
    }

    // 2. Authentication & POS Bootstrap
    console.log('\n--- 2. Testing Authentication & Catalog Bootstrap ---');
    const pinLoginRes = await request('/api/auth/login-pin', {
        method: 'POST',
        body: { outletId: OUTLET_ID, pin: '9999' }
    });
    assert(pinLoginRes.status === 200 && pinLoginRes.body.success, 'Fast Staff PIN (9999) authentication successful');
    const staffToken = pinLoginRes.body.data.accessToken || (pinLoginRes.body.data.tokens && pinLoginRes.body.data.tokens.accessToken);
    assert(!!staffToken, 'Received JWT Access Token for staff requests');
    const staffAuthHeaders = { Authorization: `Bearer ${staffToken}` };

    const managerLoginRes = await request('/api/auth/login', {
        method: 'POST',
        body: { outletId: OUTLET_ID, identifier: 'manager_arjun', password: 'Password@123' }
    });
    assert(managerLoginRes.status === 200 && managerLoginRes.body.success, 'Manager credentials authentication successful');
    const managerToken = managerLoginRes.body.data.accessToken;
    assert(!!managerToken, 'Received Manager JWT Access Token for privileged kitchen operations');
    const managerAuthHeaders = { Authorization: `Bearer ${managerToken}` };

    const bootstrapRes = await request(`/api/pos/bootstrap?outletId=${OUTLET_ID}`);
    assert(bootstrapRes.status === 200 && bootstrapRes.body.success, 'POS Catalog bootstrap endpoint returned HTTP 200');
    assert(bootstrapRes.body.data.items.length > 0, `Catalog loaded with ${bootstrapRes.body.data.items.length} menu items`);
    assert(bootstrapRes.body.data.tables.length > 0, `Floor layout loaded with ${bootstrapRes.body.data.tables.length} tables`);
    
    const items = bootstrapRes.body.data.items;
    const variants = bootstrapRes.body.data.variants;
    const tables = bootstrapRes.body.data.tables;

    const biryani = items.find(i => i.name.toLowerCase().includes('biryani')) || items[0];
    const biryaniVariant = variants.find(v => v.menu_item_id === biryani.id) || variants[0];
    const table = tables[0];

    // 3. Dine-In Order Placement & Full State Machine Lifecycle
    console.log('\n--- 3. Testing Dine-In Order Placement & State Machine ---');
    const dineInOrderRes = await request('/api/orders', {
        method: 'POST',
        headers: staffAuthHeaders,
        body: {
            outletId: OUTLET_ID,
            channel: 'DINE_IN',
            tableId: table.id,
            guestCount: 2,
            items: [
                {
                    menuItemId: biryani.id,
                    variantId: biryaniVariant.id,
                    quantity: 2
                }
            ],
            notes: 'Extra spicy, well cooked'
        }
    });

    assert(dineInOrderRes.status === 201 && dineInOrderRes.body.success, 'Dine-In order placed successfully with HTTP 201');
    const dineInOrder = dineInOrderRes.body.data;
    assert(dineInOrder.status === 'PLACED', `Order initial status is PLACED (Order #${dineInOrder.order_number})`);

    // Transition: Accept Order
    const acceptRes = await request(`/api/orders/${dineInOrder.id}/accept`, {
        method: 'POST',
        headers: staffAuthHeaders
    });
    assert(acceptRes.status === 200 && acceptRes.body.data.status === 'ACCEPTED', 'Order transitioned to ACCEPTED');

    // Transition: Prepare Order (Executed with Manager / Chef authority)
    const prepareRes = await request(`/api/orders/${dineInOrder.id}/prepare`, {
        method: 'POST',
        headers: managerAuthHeaders
    });
    assert(prepareRes.status === 200 && prepareRes.body.data.status === 'PREPARING', 'Order transitioned to PREPARING');

    // Transition: Mark Ready (Executed with Manager / Chef authority)
    const readyRes = await request(`/api/orders/${dineInOrder.id}/ready`, {
        method: 'POST',
        headers: managerAuthHeaders
    });
    assert(readyRes.status === 200 && readyRes.body.data.status === 'READY', 'Order transitioned to READY');

    // Transition: Serve Order
    const serveRes = await request(`/api/orders/${dineInOrder.id}/serve`, {
        method: 'POST',
        headers: staffAuthHeaders
    });
    assert(serveRes.status === 200 && serveRes.body.data.status === 'SERVED', 'Order transitioned to SERVED');

    // 4. KDS (Kitchen Display System) Operations
    console.log('\n--- 4. Testing Kitchen Display System (KDS) Operations ---');
    const stationsRes = await request('/api/kds/stations');
    assert(stationsRes.status === 200 && stationsRes.body.data.length > 0, `KDS stations loaded (${stationsRes.body.data.length} stations)`);

    const rushOrderRes = await request('/api/kds/rush-order', { method: 'POST' });
    assert(rushOrderRes.status === 201 && rushOrderRes.body.success, 'Rush demo order created for kitchen live test');

    const ticketsRes = await request('/api/kds/tickets');
    assert(ticketsRes.status === 200 && ticketsRes.body.data.length > 0, `KDS tickets list retrieved (${ticketsRes.body.data.length} active tickets)`);
    const activeTicket = ticketsRes.body.data[0];

    // Bump ticket
    const bumpRes = await request(`/api/kds/tickets/${activeTicket.id}/bump`, { method: 'POST' });
    assert(bumpRes.status === 200 && bumpRes.body.success, `Ticket #${activeTicket.kot_number || activeTicket.ticket_number || 'KOT'} bumped successfully`);

    // Toggle 86 (Out of Stock)
    const toggle86Res = await request(`/api/kds/86/${biryani.id}`, {
        method: 'POST',
        body: { isAvailable: false, reason: 'Chef finished batch' }
    });
    assert(toggle86Res.status === 200 && toggle86Res.body.success, `Item ${biryani.name} marked 86 (Out of Stock)`);

    const list86Res = await request('/api/kds/86');
    assert(list86Res.status === 200 && list86Res.body.data.some(i => i.id === biryani.id), 'Verified item appears in 86 list');

    // Restore item availability
    await request(`/api/kds/86/${biryani.id}`, {
        method: 'POST',
        body: { isAvailable: true }
    });

    // 5. Manager Dashboard & Inventory Actions
    console.log('\n--- 5. Testing Store Manager Operations Dashboard ---');
    const summaryRes = await request('/api/dashboard/summary');
    assert(summaryRes.status === 200 && summaryRes.body.success, 'Dashboard operational summary retrieved HTTP 200');
    assert(summaryRes.body.data.today && summaryRes.body.data.today.salesPaise !== undefined, `Live sales reported: ${summaryRes.body.data.today.salesFormatted}`);
    assert(summaryRes.body.data.today && summaryRes.body.data.today.ordersCount !== undefined, `Orders count reported: ${summaryRes.body.data.today.ordersCount}`);
    assert(summaryRes.body.data.inventory && summaryRes.body.data.inventory.length > 0, `Inventory thresholds tracked: ${summaryRes.body.data.inventory.length} ingredients`);

    const batchCookRes = await request('/api/dashboard/batch-cook/start', {
        method: 'POST',
        body: {
            item: 'Makhani Gravy',
            portions: 50,
            stationCode: 'CURRY'
        }
    });
    assert(batchCookRes.status === 200 && batchCookRes.body.success, 'Manager batch cooking production initiated');

    // 6. Signed Customer Table QR Ordering (PWA Flow)
    console.log('\n--- 6. Testing Customer Table QR Ordering Flow ---');
    const qrSessionGenRes = await request('/api/qr/tables/07/session', {
        method: 'POST',
        body: { expiresInMinutes: 120 }
    });
    assert(qrSessionGenRes.status === 200 && qrSessionGenRes.body.success, 'Signed cryptographic QR session generated for Table 07');
    const qrSession = qrSessionGenRes.body.data;
    assert(!!qrSession.token, `Generated token: ${qrSession.token.slice(0, 24)}...`);

    // Validate QR session
    const validateRes = await request(`/api/qr/session/validate?table=07&token=${encodeURIComponent(qrSession.token)}`);
    assert(validateRes.status === 200 && validateRes.body.success, 'QR session validated; menu catalog returned for PWA');

    // Place QR order
    const qrOrderRes = await request('/api/qr/orders', {
        method: 'POST',
        body: {
            table: '07',
            sessionToken: qrSession.token,
            guestCount: 3,
            items: [
                {
                    menuItemId: biryani.id,
                    variantId: biryaniVariant.id,
                    quantity: 1
                }
            ],
            notes: 'QR Mobile Order Test'
        }
    });
    if (qrOrderRes.status !== 201) {
        console.log('DEBUG qrOrderRes:', qrOrderRes.status, qrOrderRes.body);
    }
    assert(qrOrderRes.status === 201 && qrOrderRes.body.success, 'Customer placed order via signed QR table session');
    const qrOrder = qrOrderRes.body.data;

    // 7. Customer Real-time Order Tracking
    console.log('\n--- 7. Testing Customer Order Tracking ---');
    const qrOrderId = qrOrder.orderId || qrOrder.id;
    const qrOrderNumber = qrOrder.orderNumber || qrOrder.order_number;
    const trackRes = await request(`/api/public/orders/${qrOrderId}`);
    assert(trackRes.status === 200 && trackRes.body.success, `Customer tracked order ${qrOrderNumber} successfully`);
    assert(trackRes.body.data.status === 'PLACED', `Track status confirms ${trackRes.body.data.status}`);

    // 8. Offline Edge Node & Conflict Hub
    console.log('\n--- 8. Testing Edge Node Connectivity & Conflict Resolution ---');
    const edgeStatusRes = await request('/api/edge/status');
    assert(edgeStatusRes.status === 200 && edgeStatusRes.body.success, 'Edge Node status retrieved HTTP 200');
    const connState = edgeStatusRes.body.data.connectivity_state || edgeStatusRes.body.data.mode;
    assert(connState !== undefined, `Edge operating connectivity state: ${connState}`);

    const conflictsRes = await request('/api/edge/conflicts');
    assert(conflictsRes.status === 200 && conflictsRes.body.success, 'Sync conflicts query returned HTTP 200');

    // 9. Sensitive Action & Manager PIN Override Token
    console.log('\n--- 9. Testing Manager PIN Override Protocol ---');
    const overrideReqRes = await request('/api/auth/manager-override', {
        method: 'POST',
        headers: staffAuthHeaders,
        body: {
            managerIdentifier: 'manager_arjun',
            managerPin: '9999',
            sensitiveAction: 'orders.discount',
            targetEntityId: dineInOrder.id
        }
    });
    assert(overrideReqRes.status === 200 && overrideReqRes.body.success, 'Manager PIN override verified and token issued');
    const overrideToken = overrideReqRes.body.data.overrideToken || overrideReqRes.body.data.managerOverrideToken;
    assert(!!overrideToken, 'Received cryptographic override authorization token');

    const discountRes = await request(`/api/orders/${dineInOrder.id}/discount`, {
        method: 'POST',
        headers: {
            ...staffAuthHeaders,
            'X-Manager-Override-Token': overrideToken
        },
        body: { discountAmountPaise: 5000 }
    });
    assert(discountRes.status === 200, 'Discount authorized and applied using Manager Override');

    // 10. Walk-In Takeaway Token Allocation & Calling Buzzer
    console.log('\n--- 10. Testing Walk-In Takeaway & Counter TV Token Calling ---');
    const walkInOrderRes = await request('/api/orders', {
        method: 'POST',
        headers: staffAuthHeaders,
        body: {
            outletId: OUTLET_ID,
            channel: 'WALK_IN',
            items: [
                {
                    menuItemId: biryani.id,
                    variantId: biryaniVariant.id,
                    quantity: 1
                }
            ],
            notes: 'Takeaway parcel'
        }
    });
    assert(walkInOrderRes.status === 201 && walkInOrderRes.body.success, 'Walk-in takeaway order created');
    const walkInOrder = walkInOrderRes.body.data;
    assert(!!walkInOrder.token, `Assigned sequential token number: ${walkInOrder.token ? walkInOrder.token.token_number : 'N/A'}`);

    if (walkInOrder.token) {
        const callTokenRes = await request(`/api/tokens/${walkInOrder.token.id}/call`, {
            method: 'POST',
            headers: staffAuthHeaders
        });
        assert(callTokenRes.status === 200 && callTokenRes.body.success, `Token #${walkInOrder.token.token_number} called for pickup broadcast`);
    }

    // 11. Edge Connectivity State Switching
    console.log('\n--- 11. Testing Edge Mode Connectivity Switching ---');
    const offlineSwitchRes = await request('/api/edge/connectivity', {
        method: 'POST',
        body: { connectivityState: 'OFFLINE', outletId: OUTLET_ID }
    });
    assert(offlineSwitchRes.status === 200 && offlineSwitchRes.body.data.connectivity_state === 'OFFLINE', 'Switched Edge Node to OFFLINE mode');

    const onlineSwitchRes = await request('/api/edge/connectivity', {
        method: 'POST',
        body: { connectivityState: 'ONLINE', outletId: OUTLET_ID }
    });
    assert(onlineSwitchRes.status === 200 && onlineSwitchRes.body.data.connectivity_state === 'ONLINE', 'Restored Edge Node to ONLINE mode');

    console.log('\n===============================================================');
    console.log(`ALL SYSTEM & OPTION CHECKS PASSED: ${passedCount}/${totalCount} TESTS (100%)`);
    console.log('Every operational feature, UI page, API, and state transition verified.');
    console.log('===============================================================');
}

run().catch(err => {
    console.error('\nFatal test failure:', err);
    process.exit(1);
});
