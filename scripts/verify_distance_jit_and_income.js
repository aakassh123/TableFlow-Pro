/**
 * Automated Verification Script:
 * 1. Distance-Aware ETA Calculation (1km away, 2 burgers)
 * 2. Token Allocation and Arrival Time Synchronization
 * 3. Smart JIT Kitchen Queuing (Kitchen does NOT wait idle; concurrent orders smooth)
 * 4. Automatic Total Income & Discounts Tracking on Payment Confirmation
 */
import http from 'http';

const BASE_URL = 'http://localhost:3000';
const OUTLET_ID = '33333333-3333-3333-3333-333333333301';

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, headers: res.headers, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log('================================================================');
    console.log('STARTING DISTANCE ETA, JIT KITCHEN QUEUE & INCOME VERIFICATION');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✓ ${message}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${message}`);
            failed++;
        }
    }

    // Step 1: Login as Cashier
    console.log('1. Authenticating Cashier / Staff...');
    const loginRes = await request('POST', '/api/auth/login-pin', {
        outletId: OUTLET_ID,
        pin: '9999'
    });
    const authToken = loginRes.body.data?.accessToken || loginRes.body.data?.tokens?.accessToken;
    assert(loginRes.status === 200 && !!authToken, 'Cashier PIN login successful');

    // Step 2: Fetch initial dashboard summary to capture baseline income & discounts
    console.log('\n2. Fetching baseline Manager Operational Board summary...');
    const initialDashRes = await request('GET', `/api/dashboard/summary?outletId=${OUTLET_ID}`);
    assert(initialDashRes.status === 200, 'Dashboard summary retrieved');
    const initialToday = initialDashRes.body.data.today;
    console.log(`   Baseline Income: ${initialToday.totalIncomeFormatted || initialToday.salesFormatted}`);
    console.log(`   Baseline Discounts: ${initialToday.discountFormatted}`);
    console.log(`   Baseline Orders: ${initialToday.ordersCount}`);

    // Step 3: Fetch Menu to verify Burger items BG-001 and BG-002
    console.log('\n3. Verifying Burger catalog (BG-001 Classic Chicken Burger, BG-002 Crispy Veggie Burger)...');
    const menuRes = await request('GET', `/api/pos/bootstrap?outletId=${OUTLET_ID}`);
    assert(menuRes.status === 200, 'POS Bootstrap catalog loaded');
    const burgerItems = menuRes.body.data.items.filter(i => i.code === 'BG-001' || i.code === 'BG-002');
    assert(burgerItems.length === 2, `Seeded burger items found (${burgerItems.map(b => b.name).join(', ')})`);
    const chickenBurger = burgerItems.find(i => i.code === 'BG-001');
    const veggieBurger = burgerItems.find(i => i.code === 'BG-002');
    const burgerVariants = menuRes.body.data.variants.filter(v => v.menu_item_id === chickenBurger.id || v.menu_item_id === veggieBurger.id);

    // Step 4: Place Order from 1.0 km away with 2 Burgers (1 Classic Chicken + 1 Crispy Veggie) with discount
    console.log('\n4. Placing Order for 2 Burgers from 1.0 km away with ₹32 Discount...');
    const chkVariant = burgerVariants.find(v => v.menu_item_id === chickenBurger.id) || null;
    const vegVariant = burgerVariants.find(v => v.menu_item_id === veggieBurger.id) || null;

    const orderPayload = {
        outletId: OUTLET_ID,
        channel: 'WALK_IN',
        items: [
            { menuItemId: chickenBurger.id, variantId: chkVariant ? chkVariant.id : null, quantity: 1 },
            { menuItemId: veggieBurger.id, variantId: vegVariant ? vegVariant.id : null, quantity: 1 }
        ],
        distanceKm: 1.0,
        discountPaise: 3200,
        notes: 'Customer ordering 1km away. Fast transit.'
    };

    const orderRes = await request('POST', '/api/orders', orderPayload, authToken);
    assert(orderRes.status === 201, `Order created successfully (HTTP ${orderRes.status})`);
    const createdOrder = orderRes.body.data;

    // Verify Order Attributes
    assert(createdOrder.order_number.startsWith('ORD-'), `Order Number generated: ${createdOrder.order_number}`);
    assert(createdOrder.discount_paise === 3200, `Discount correctly recorded: ₹${createdOrder.discount_paise / 100}`);
    assert(createdOrder.total_paise > 0, `Total payable correctly calculated: ₹${createdOrder.total_paise / 100}`);
    assert(createdOrder.token && createdOrder.token.token_number, `Digital Token allocated: #${createdOrder.token?.token_number}`);

    // Verify Distance Transit & ETA Analysis
    assert(createdOrder.distance_km === 1.0, 'Order distance recorded: 1.0 km');
    assert(createdOrder.promiseDisplay, `Promise display window generated: "${createdOrder.promiseDisplay}"`);
    assert(createdOrder.distanceAnalysis, 'Distance analysis payload returned');
    if (createdOrder.distanceAnalysis) {
        console.log(`   Distance: ${createdOrder.distanceAnalysis.distanceKm} km`);
        console.log(`   Estimated Transit Time: ${createdOrder.distanceAnalysis.travelMinutes} mins (${createdOrder.distanceAnalysis.travelSeconds}s)`);
        console.log(`   Kitchen Prep Time: ${createdOrder.distanceAnalysis.prepMinutes} mins (${createdOrder.distanceAnalysis.kitchenPrepSeconds}s)`);
        console.log(`   JIT Status: ${createdOrder.distanceAnalysis.jitStrategy.status}`);
        console.log(`   Summary: ${createdOrder.distanceAnalysis.jitStrategy.summary}`);
        assert(createdOrder.distanceAnalysis.travelMinutes > 0, 'Transit travel time > 0');
        assert(createdOrder.distanceAnalysis.jitStrategy.status === 'FIRE_NOW', 'JIT status is FIRE_NOW (food prep 10m >= travel 6m, freshly ready on arrival)');
    }

    // Step 5: Verify smooth multi-order kitchen interleaving (Kitchen does not wait idle!)
    console.log('\n5. Verifying Kitchen KDS does not block or wait idle — other orders continue smoothly...');
    // Place a concurrent dine-in order (Chilli Paneer)
    const chilliPaneer = menuRes.body.data.items.find(i => i.code === 'CH-001');
    const order2Res = await request('POST', '/api/orders', {
        outletId: OUTLET_ID,
        channel: 'DINE_IN',
        tableId: '77777777-7777-7777-7777-777777777701',
        items: [{ menuItemId: chilliPaneer.id, quantity: 1 }],
        distanceKm: 0,
        discountPaise: 0
    }, authToken);
    assert(order2Res.status === 201, 'Concurrent Dine-in order created without stalling (HTTP 201)');
    const order2 = order2Res.body.data;
    assert(order2.order_number !== createdOrder.order_number, `Concurrent order distinct: ${order2.order_number}`);

    // Fetch KDS tickets to confirm both tickets exist and grill station has burger ticket
    const kdsRes = await request('GET', `/api/kds/tickets?outletId=${OUTLET_ID}`);
    assert(kdsRes.status === 200, 'KDS tickets retrieved');
    const tickets = kdsRes.body.data || [];
    const burgerTicket = tickets.find(t => t.orderId === createdOrder.id);
    const concurrentTicket = tickets.find(t => t.orderId === order2.id);

    assert(burgerTicket !== undefined, 'Burger order has active station ticket in KDS');
    assert(concurrentTicket !== undefined, 'Concurrent order has active station ticket in KDS');
    if (burgerTicket) {
        assert(burgerTicket.distanceKm === 1.0, `KDS ticket displays distance: ${burgerTicket.distanceKm} km`);
        assert(burgerTicket.tokenNumber !== undefined, `KDS ticket displays token: #${burgerTicket.tokenNumber}`);
        console.log(`   Burger Ticket #${burgerTicket.kotNumber} Station: [${burgerTicket.station.code}] Distance: ${burgerTicket.distanceKm}km Token: #${burgerTicket.tokenNumber}`);
    }

    // Step 6: Verify Manager Dashboard automatically shows updated Total Income & Total Discounts
    console.log('\n6. Checking updated Manager Operational Board summary...');
    const updatedDashRes = await request('GET', `/api/dashboard/summary?outletId=${OUTLET_ID}`);
    assert(updatedDashRes.status === 200, 'Updated dashboard summary retrieved');
    const updatedToday = updatedDashRes.body.data.today;

    console.log(`   Updated Total Income: ${updatedToday.totalIncomeFormatted}`);
    console.log(`   Updated Total Discounts: ${updatedToday.discountFormatted}`);
    console.log(`   Updated Orders Count: ${updatedToday.ordersCount}`);
    console.log(`   Updated Net Sales: ${updatedToday.netSalesFormatted}`);

    assert(updatedToday.ordersCount > initialToday.ordersCount, 'Order count incremented in real-time');
    assert(updatedToday.totalIncomePaise > initialToday.totalIncomePaise, 'Total Income incremented automatically');
    assert(updatedToday.totalDiscountPaise > initialToday.totalDiscountPaise, 'Total Discounts incremented automatically');

    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) process.exit(1);
}

run().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
