// Customer Table QR Ordering PWA Client Logic
// Enforces signed session token, handles cart state, menu rendering, allergen warnings, and KDS synchronization

(function() {
    'use strict';

    // State
    const state = {
        tableParam: null,
        sessionToken: null,
        outletId: '33333333-3333-3333-3333-333333333301',
        tableData: null,
        sessionData: null,
        categories: [],
        menuItems: [],
        variants: [],
        activeCategory: 'ALL',
        vegOnlyFilter: false,
        searchQuery: '',
        cart: {}, // itemId -> { item, quantity, notes }
        currentOrderId: null,
        ws: null,
        expiryInterval: null
    };

    // DOM Elements
    const els = {
        appContainer: document.getElementById('qrAppContainer'),
        header: document.getElementById('qrHeader'),
        restaurantName: document.getElementById('restaurantName'),
        outletLocation: document.getElementById('outletLocation'),
        tableBadgeDisplay: document.getElementById('tableBadgeDisplay'),
        sessionExpiryText: document.getElementById('sessionExpiryText'),
        securityInfoBtn: document.getElementById('securityInfoBtn'),
        menuSearchInput: document.getElementById('menuSearchInput'),
        vegToggleBtn: document.getElementById('vegToggleBtn'),
        categoryTabsNav: document.getElementById('categoryTabsNav'),
        menuContainer: document.getElementById('menuContainer'),
        floatingCartBar: document.getElementById('floatingCartBar'),
        cartBadgeCount: document.getElementById('cartBadgeCount'),
        cartBarTotal: document.getElementById('cartBarTotal'),
        cartModalBackdrop: document.getElementById('cartModalBackdrop'),
        cartDrawer: document.getElementById('cartDrawer'),
        drawerTitle: document.getElementById('drawerTitle'),
        drawerCloseBtn: document.getElementById('drawerCloseBtn'),
        cartItemsList: document.getElementById('cartItemsList'),
        orderNotesInput: document.getElementById('orderNotesInput'),
        optUpiLabel: document.getElementById('optUpiLabel'),
        optCounterLabel: document.getElementById('optCounterLabel'),
        billSubtotal: document.getElementById('billSubtotal'),
        billGst: document.getElementById('billGst'),
        billGrandTotal: document.getElementById('billGrandTotal'),
        btnPlaceOrder: document.getElementById('btnPlaceOrder'),
        btnOrderTotal: document.getElementById('btnOrderTotal'),
        successView: document.getElementById('successView'),
        receiptOrderNumber: document.getElementById('receiptOrderNumber'),
        receiptTableNumber: document.getElementById('receiptTableNumber'),
        receiptTokenBadge: document.getElementById('receiptTokenBadge'),
        receiptEtaValue: document.getElementById('receiptEtaValue'),
        stepCooking: document.getElementById('stepCooking'),
        stepReady: document.getElementById('stepReady'),
        stepServed: document.getElementById('stepServed'),
        realtimeSyncStatus: document.getElementById('realtimeSyncStatus'),
        btnLiveTrackerLink: document.getElementById('btnLiveTrackerLink'),
        btnOrderMore: document.getElementById('btnOrderMore'),
        securityErrorCard: document.getElementById('securityErrorCard'),
        securityErrorTitle: document.getElementById('securityErrorTitle'),
        securityErrorDesc: document.getElementById('securityErrorDesc'),
        btnGenerateDemoSession: document.getElementById('btnGenerateDemoSession')
    };

    // Initialize
    async function init() {
        parseRoute();
        setupEventListeners();

        if (!state.sessionToken) {
            showSecurityError(
                'Signed Session Required',
                `Direct unauthenticated access to Table ${state.tableParam || '07'} is blocked to prevent prank orders.<br><br>` +
                `The restaurant uses cryptographically signed, short-lived table QR sessions:<br>` +
                `<code>/table/${state.tableParam || '7'}/session/xxxx</code>`
            );
            return;
        }

        await validateSessionAndLoadMenu();
    }

    /**
     * Parses the current window URL
     * Expected path: /table/:table/session/:token
     */
    function parseRoute() {
        const path = window.location.pathname;
        const match = path.match(/^\/table\/([^/]+)\/session\/([^/]+)/i);

        if (match) {
            state.tableParam = match[1];
            state.sessionToken = match[2];
        } else {
            // Check direct /table/:table
            const directMatch = path.match(/^\/table\/([^/]+)/i);
            if (directMatch) {
                state.tableParam = directMatch[1];
            } else {
                state.tableParam = '7'; // Default demo table
            }
            state.sessionToken = null;
        }

        // Set initial badge text
        const displayNum = state.tableParam.replace(/^T-0*/i, '').padStart(2, '0');
        els.tableBadgeDisplay.textContent = `TABLE ${displayNum}`;
        els.drawerTitle.textContent = `Your Order • TABLE ${displayNum}`;
    }

    /**
     * Calls GET /api/qr/session/validate
     */
    async function validateSessionAndLoadMenu() {
        try {
            els.menuContainer.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                    <div style="font-size: 28px; margin-bottom: 8px;">🛡️</div>
                    <p style="font-weight: 600;">Verifying cryptographic table session signature...</p>
                </div>
            `;

            const res = await fetch(`/api/qr/session/validate?table=${encodeURIComponent(state.tableParam)}&token=${encodeURIComponent(state.sessionToken)}`);
            const data = await res.json();

            if (!res.ok || !data.success) {
                showSecurityError(
                    data.title || 'Security Verification Failed',
                    data.detail || data.message || 'The QR session is invalid or has expired. Please re-scan your table QR code.'
                );
                return;
            }

            // Hydrate state
            state.tableData = data.data.table;
            state.sessionData = data.data.session;
            state.categories = data.data.categories;
            state.menuItems = data.data.menuItems;
            state.variants = data.data.variants || [];

            if (data.data.outlet) {
                els.restaurantName.textContent = data.data.outlet.restaurant_name || 'The Grand Biryani & Grill';
                els.outletLocation.textContent = `${data.data.outlet.name} • ${data.data.outlet.city || 'Bangalore'}`;
            }

            els.tableBadgeDisplay.textContent = data.data.table.displayBadge || `TABLE ${data.data.table.tableNumber}`;
            els.drawerTitle.textContent = `Your Order • ${data.data.table.displayBadge || data.data.table.tableNumber}`;

            startSessionCountdown(data.data.session.expiresAt);
            renderCategoryTabs();
            renderMenuItems();

            // Connect live WebSocket for real-time 86 updates
            initWebSocket();

        } catch (err) {
            console.error('Validation fetch error:', err);
            showSecurityError(
                'Network Connection Error',
                'Unable to reach restaurant ordering server. Please ensure you are connected to the restaurant Wi-Fi.'
            );
        }
    }

    /**
     * Countdown timer for signed session TTL
     */
    function startSessionCountdown(expiresAtIso) {
        if (state.expiryInterval) clearInterval(state.expiryInterval);
        const expTime = new Date(expiresAtIso).getTime();

        function updateTimer() {
            const now = Date.now();
            const diff = expTime - now;

            if (diff <= 0) {
                clearInterval(state.expiryInterval);
                els.sessionExpiryText.textContent = 'Session Expired';
                els.sessionExpiryText.style.color = '#ef4444';
                showSecurityError(
                    'Session Expired',
                    'This table session has expired. To place orders, please re-scan the QR code on your table.'
                );
                return;
            }

            const hrs = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            els.sessionExpiryText.textContent = hrs > 0 
                ? `Expires in ${hrs}h ${mins}m` 
                : `Expires in ${mins}m ${secs}s`;
        }

        updateTimer();
        state.expiryInterval = setInterval(updateTimer, 1000);
    }

    /**
     * Render category pills
     */
    function renderCategoryTabs() {
        let html = `<button type="button" class="cat-pill ${state.activeCategory === 'ALL' ? 'active' : ''}" data-category="ALL">All Items</button>`;

        for (const cat of state.categories) {
            html += `<button type="button" class="cat-pill ${state.activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">${escapeHtml(cat.name)}</button>`;
        }

        els.categoryTabsNav.innerHTML = html;

        els.categoryTabsNav.querySelectorAll('.cat-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                els.categoryTabsNav.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.activeCategory = btn.getAttribute('data-category');
                renderMenuItems();
            });
        });
    }

    /**
     * Filter and render menu items
     */
    function renderMenuItems() {
        let items = [...state.menuItems];

        // Filter by category
        if (state.activeCategory !== 'ALL') {
            items = items.filter(it => it.category_id === state.activeCategory);
        }

        // Filter by veg-only
        if (state.vegOnlyFilter) {
            items = items.filter(it => it.is_veg === true);
        }

        // Filter by search query
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            items = items.filter(it => 
                it.name.toLowerCase().includes(q) || 
                (it.description && it.description.toLowerCase().includes(q)) ||
                it.code.toLowerCase().includes(q)
            );
        }

        if (items.length === 0) {
            els.menuContainer.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                    <div style="font-size: 24px; margin-bottom: 8px;">🍽️</div>
                    <p>No dishes match the selected filter.</p>
                </div>
            `;
            return;
        }

        // Group by category if viewing 'ALL'
        let html = '';
        if (state.activeCategory === 'ALL') {
            const grouped = {};
            for (const it of items) {
                const catName = it.category_name || 'Specialties';
                if (!grouped[catName]) grouped[catName] = [];
                grouped[catName].push(it);
            }

            for (const [catName, catItems] of Object.entries(grouped)) {
                html += `<div class="category-title">${escapeHtml(catName)} <span>${catItems.length} items</span></div>`;
                for (const item of catItems) {
                    html += renderItemCard(item);
                }
            }
        } else {
            for (const item of items) {
                html += renderItemCard(item);
            }
        }

        els.menuContainer.innerHTML = html;
        bindItemActions();
    }

    /**
     * Render single item card
     */
    function renderItemCard(item) {
        const is86 = item.is_available === false;
        const priceFormatted = (parseInt(item.base_price_paise, 10) / 100).toFixed(0);
        const inCart = state.cart[item.id] ? state.cart[item.id].quantity : 0;

        return `
            <div class="item-card ${is86 ? 'is-86' : ''}" data-item-id="${item.id}">
                <div class="item-details">
                    <div class="item-diet-header">
                        <span class="diet-dot ${item.is_veg ? 'veg' : 'non-veg'}"></span>
                        <span class="item-code">${escapeHtml(item.code)}</span>
                    </div>
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    <div class="item-desc">${escapeHtml(item.description || '')}</div>
                    <div class="item-price">₹${priceFormatted}</div>
                </div>
                <div class="item-actions">
                    ${is86 ? `
                        <span class="badge-86">86 • OUT OF STOCK</span>
                    ` : inCart > 0 ? `
                        <div class="item-stepper">
                            <button type="button" class="stepper-btn btn-minus" data-id="${item.id}">−</button>
                            <span class="stepper-qty">${inCart}</span>
                            <button type="button" class="stepper-btn btn-plus" data-id="${item.id}">+</button>
                        </div>
                    ` : `
                        <button type="button" class="btn-add" data-id="${item.id}">
                            <span>+ ADD</span>
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Binds stepper and add buttons
     */
    function bindItemActions() {
        els.menuContainer.querySelectorAll('.btn-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const item = state.menuItems.find(it => it.id === id);
                if (item) addToCart(item);
            });
        });

        els.menuContainer.querySelectorAll('.btn-plus').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                updateCartQty(id, 1);
            });
        });

        els.menuContainer.querySelectorAll('.btn-minus').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                updateCartQty(id, -1);
            });
        });
    }

    /**
     * Cart operations
     */
    function addToCart(item) {
        if (!state.cart[item.id]) {
            state.cart[item.id] = { item, quantity: 1, notes: null };
        } else {
            state.cart[item.id].quantity += 1;
        }
        updateCartUI();
        renderMenuItems();
    }

    function updateCartQty(itemId, delta) {
        if (!state.cart[itemId]) return;
        state.cart[itemId].quantity += delta;
        if (state.cart[itemId].quantity <= 0) {
            delete state.cart[itemId];
        }
        updateCartUI();
        renderMenuItems();
        renderCartDrawerItems();
    }

    /**
     * Updates floating cart bar and totals
     */
    function updateCartUI() {
        let totalCount = 0;
        let subtotalPaise = 0;

        for (const entry of Object.values(state.cart)) {
            totalCount += entry.quantity;
            subtotalPaise += parseInt(entry.item.base_price_paise, 10) * entry.quantity;
        }

        const gstPaise = Math.round(subtotalPaise * 0.05);
        const grandTotalPaise = subtotalPaise + gstPaise;

        els.cartBadgeCount.textContent = totalCount;
        els.cartBarTotal.textContent = `₹${(grandTotalPaise / 100).toFixed(0)}`;
        els.btnOrderTotal.textContent = `₹${(grandTotalPaise / 100).toFixed(0)}`;

        els.billSubtotal.textContent = `₹${(subtotalPaise / 100).toFixed(2)}`;
        els.billGst.textContent = `₹${(gstPaise / 100).toFixed(2)}`;
        els.billGrandTotal.textContent = `₹${(grandTotalPaise / 100).toFixed(2)}`;

        if (totalCount > 0) {
            els.floatingCartBar.style.display = 'flex';
            els.btnPlaceOrder.disabled = false;
        } else {
            els.floatingCartBar.style.display = 'none';
            els.btnPlaceOrder.disabled = true;
            closeCartDrawer();
        }
    }

    /**
     * Renders items inside slide-up drawer
     */
    function renderCartDrawerItems() {
        const entries = Object.values(state.cart);
        if (entries.length === 0) {
            els.cartItemsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center;">Your cart is empty</p>`;
            return;
        }

        let html = '';
        for (const entry of entries) {
            const lineTotal = (parseInt(entry.item.base_price_paise, 10) * entry.quantity / 100).toFixed(2);
            html += `
                <div class="cart-line-item">
                    <div class="cart-line-info">
                        <h4>${escapeHtml(entry.item.name)}</h4>
                        <p>₹${(parseInt(entry.item.base_price_paise, 10) / 100).toFixed(0)} each</p>
                    </div>
                    <div class="cart-line-pricing">
                        <div class="item-stepper">
                            <button type="button" class="stepper-btn btn-drawer-minus" data-id="${entry.item.id}">−</button>
                            <span class="stepper-qty">${entry.quantity}</span>
                            <button type="button" class="stepper-btn btn-drawer-plus" data-id="${entry.item.id}">+</button>
                        </div>
                        <div class="cart-line-total">₹${lineTotal}</div>
                    </div>
                </div>
            `;
        }

        els.cartItemsList.innerHTML = html;

        els.cartItemsList.querySelectorAll('.btn-drawer-plus').forEach(btn => {
            btn.addEventListener('click', () => {
                updateCartQty(btn.getAttribute('data-id'), 1);
            });
        });

        els.cartItemsList.querySelectorAll('.btn-drawer-minus').forEach(btn => {
            btn.addEventListener('click', () => {
                updateCartQty(btn.getAttribute('data-id'), -1);
            });
        });
    }

    function openCartDrawer() {
        renderCartDrawerItems();
        els.cartModalBackdrop.classList.add('open');
    }

    function closeCartDrawer() {
        els.cartModalBackdrop.classList.remove('open');
    }

    /**
     * Submits order to POST /api/qr/orders
     */
    async function submitOrder() {
        const entries = Object.values(state.cart);
        if (entries.length === 0) return;

        const selectedPayment = document.querySelector('input[name="paymentOption"]:checked')?.value || 'UPI_INSTANT';
        const notes = els.orderNotesInput.value.trim();

        const orderPayload = {
            sessionToken: state.sessionToken,
            table: state.tableParam,
            outletId: state.outletId,
            items: entries.map(e => ({
                menuItemId: e.item.id,
                quantity: e.quantity,
                notes: e.notes
            })),
            notes: notes || null,
            paymentMethod: selectedPayment
        };

        try {
            els.btnPlaceOrder.disabled = true;
            els.btnPlaceOrder.innerHTML = `<span>⏳ Submitting to Kitchen...</span>`;

            const res = await fetch('/api/qr/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                alert(`Order Placement Error: ${data.detail || data.message || 'Failed to place order'}`);
                els.btnPlaceOrder.disabled = false;
                els.btnPlaceOrder.innerHTML = `<span>CONFIRM & SEND TO KITCHEN</span> <span>${els.cartBarTotal.textContent}</span>`;
                return;
            }

            // Success: Show Receipt & Live Progress
            state.currentOrderId = data.data.orderId;
            closeCartDrawer();
            els.floatingCartBar.style.display = 'none';
            els.menuContainer.style.display = 'none';
            els.categoryTabsNav.style.display = 'none';
            document.getElementById('filterBar').style.display = 'none';

            els.successView.style.display = 'block';
            els.receiptOrderNumber.textContent = data.data.orderNumber;
            els.receiptTableNumber.textContent = `TABLE ${data.data.tableNumber.replace(/^T-0*/i, '').padStart(2, '0')} • ${data.data.tableSection || 'INDOOR'}`;
            els.receiptTokenBadge.textContent = data.data.tokenNumber ? `Token #${data.data.tokenNumber}` : 'Token #--';
            els.receiptEtaValue.textContent = data.data.promiseDisplay || '20–25 minutes';

            els.btnLiveTrackerLink.href = data.data.trackingUrl || `/track/${data.data.orderId}`;

            // Reset cart
            state.cart = {};

            // Connect customer tracking websocket
            subscribeCustomerTracking(data.data.orderId);

        } catch (err) {
            console.error('Order submission error:', err);
            alert('Failed to connect to ordering server. Please try again.');
            els.btnPlaceOrder.disabled = false;
            els.btnPlaceOrder.innerHTML = `<span>CONFIRM & SEND TO KITCHEN</span> <span>${els.cartBarTotal.textContent}</span>`;
        }
    }

    /**
     * Realtime WebSocket connection for live KDS updates
     */
    function initWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            state.ws = new WebSocket(wsUrl);

            state.ws.onopen = () => {
                // Register as public customer terminal
                state.ws.send(JSON.stringify({
                    type: 'AUTH_REGISTER',
                    role: 'customer',
                    outletId: state.outletId
                }));
            };

            state.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    // Live 86 updates (stock.finished)
                    if (msg.event === 'stock.finished' && msg.data?.menuItemId) {
                        const item = state.menuItems.find(it => it.id === msg.data.menuItemId);
                        if (item) {
                            item.is_available = false;
                            delete state.cart[item.id];
                            updateCartUI();
                            renderMenuItems();
                        }
                    }
                } catch (e) { }
            };
        } catch (e) { }
    }

    function subscribeCustomerTracking(orderId) {
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

        state.ws.send(JSON.stringify({
            type: 'AUTH_REGISTER',
            role: 'customer',
            orderId: orderId,
            outletId: state.outletId
        }));

        state.ws.addEventListener('message', (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.event === 'order.accepted' || msg.event === 'order.preparing') {
                    els.stepCooking.classList.add('active');
                    els.realtimeSyncStatus.textContent = '🍳 Chefs actively preparing your dishes at Curry, Tandoor & Grill stations';
                } else if (msg.event === 'order.ready') {
                    els.stepCooking.classList.remove('active');
                    els.stepCooking.classList.add('completed');
                    els.stepReady.classList.add('completed');
                    els.realtimeSyncStatus.textContent = '🔔 All station tickets bumped ready! Waiter is serving dishes to Table 07';
                } else if (msg.event === 'order.served') {
                    els.stepServed.classList.add('completed');
                    els.realtimeSyncStatus.textContent = '🍽️ Order served. Enjoy your meal!';
                }
            } catch (e) { }
        });
    }

    /**
     * Show Security Error Card (Abuse prevention)
     */
    function showSecurityError(title, desc) {
        els.menuContainer.style.display = 'none';
        els.floatingCartBar.style.display = 'none';
        els.categoryTabsNav.style.display = 'none';
        document.getElementById('filterBar').style.display = 'none';
        els.securityErrorCard.style.display = 'block';

        els.securityErrorTitle.textContent = title;
        els.securityErrorDesc.innerHTML = desc;
    }

    /**
     * Event Listeners Setup
     */
    function setupEventListeners() {
        // Veg only toggle
        els.vegToggleBtn.addEventListener('click', () => {
            state.vegOnlyFilter = !state.vegOnlyFilter;
            els.vegToggleBtn.classList.toggle('active', state.vegOnlyFilter);
            renderMenuItems();
        });

        // Search input
        els.menuSearchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.trim();
            renderMenuItems();
        });

        // Cart Drawer
        els.floatingCartBar.addEventListener('click', openCartDrawer);
        els.drawerCloseBtn.addEventListener('click', closeCartDrawer);
        els.cartModalBackdrop.addEventListener('click', (e) => {
            if (e.target === els.cartModalBackdrop) closeCartDrawer();
        });

        // Allergy Chips
        document.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-note');
                const current = els.orderNotesInput.value.trim();
                if (!current.includes(text)) {
                    els.orderNotesInput.value = current ? `${current}, ${text}` : text;
                }
            });
        });

        // Payment Option selection radio styling
        document.querySelectorAll('input[name="paymentOption"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('.payment-radio-label').forEach(lbl => lbl.classList.remove('selected'));
                radio.closest('.payment-radio-label').classList.add('selected');
            });
        });

        // Order button
        els.btnPlaceOrder.addEventListener('click', submitOrder);

        // Order More Button
        els.btnOrderMore.addEventListener('click', () => {
            els.successView.style.display = 'none';
            els.menuContainer.style.display = 'block';
            els.categoryTabsNav.style.display = 'flex';
            document.getElementById('filterBar').style.display = 'flex';
            renderMenuItems();
        });

        // Generate Demo Session Button
        els.btnGenerateDemoSession.addEventListener('click', async () => {
            try {
                els.btnGenerateDemoSession.textContent = 'Generating Signed Token...';
                const res = await fetch('/api/qr/tables/7/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        outletId: state.outletId,
                        tableIdentifier: state.tableParam || '7',
                        expiresInMinutes: 120
                    })
                });
                const data = await res.json();
                if (data.success && data.data.sessionUrl) {
                    window.location.href = data.data.sessionUrl;
                } else {
                    alert('Failed to generate session: ' + (data.message || 'Unknown error'));
                }
            } catch (err) {
                alert('Connection error generating demo session');
            }
        });

        // Security Info Modal Alert
        els.securityInfoBtn.addEventListener('click', () => {
            alert(
                '🛡️ TABLE QR SECURITY ARCHITECTURE\n\n' +
                'This table session uses HMAC-SHA256 cryptographic signatures with short-lived expiration (120 min).\n\n' +
                '• Prevents remote prank orders after leaving the restaurant\n' +
                '• Prevents cross-table hijacking (/table/3 cannot tamper to /table/7)\n' +
                '• Automatically expires upon bill settlement or session timeout.'
            );
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Auto-run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
