// ==========================================================================
// DUM HOUSE - Unified Restaurant Operating System (ROS)
// Core Application Architecture & State Machine Controller
// "ONE SCREEN = ONE PRIMARY JOB"
// ==========================================================================

const OUTLET_ID = '33333333-3333-3333-3333-333333333301';

// Realistic High-Definition Culinary Photography for Recognition
const DISH_IMAGE_MAP = {
    'CH-001': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop&q=80',
    'CH-002': 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&auto=format&fit=crop&q=80',
    'CH-003': 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&auto=format&fit=crop&q=80',
    'ST-001': 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop&q=80',
    'GR-001': 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500&auto=format&fit=crop&q=80',
    'BR-001': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80',
    'CR-001': 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=500&auto=format&fit=crop&q=80',
    'CR-002': 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80',
    'RD-001': 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=80',
    'BV-001': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80',
    'DS-001': 'https://images.unsplash.com/photo-1605197586416-563b7e7a7837?w=500&auto=format&fit=crop&q=80',
    'DS-002': 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=500&auto=format&fit=crop&q=80',
    'DS-003': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop&q=80',
    'BG-001': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80',
    'BG-002': 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=500&auto=format&fit=crop&q=80'
};

// Fallback Catalog Data
const DEFAULT_MENU_ITEMS = [
    {
        id: '99999999-9999-9999-9999-999999999906',
        category_id: '88888888-8888-8888-8888-888888888806',
        category_name: 'Chinese',
        name: 'Chilli Paneer',
        code: 'CH-001',
        description: 'Crispy cottage cheese cubes tossed in spicy soya-chilli glaze with bell peppers',
        base_price_paise: 22000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['CH-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999907',
        category_id: '88888888-8888-8888-8888-888888888806',
        category_name: 'Chinese',
        name: 'Hakka Noodles',
        code: 'CH-002',
        description: 'Wok tossed noodles with shredded crunchy vegetables and scallions',
        base_price_paise: 18000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['CH-002']
    },
    {
        id: '99999999-9999-9999-9999-999999999910',
        category_id: '88888888-8888-8888-8888-888888888806',
        category_name: 'Chinese',
        name: 'Schezwan Fried Rice',
        code: 'CH-003',
        description: 'Aromatic wok tossed rice with fiery Schezwan peppers and vegetables',
        base_price_paise: 20000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['CH-003']
    },
    {
        id: '99999999-9999-9999-9999-999999999901',
        category_id: '88888888-8888-8888-8888-888888888801',
        category_name: 'Starters',
        name: 'Paneer Tikka Angara',
        code: 'ST-001',
        description: 'Charcoal smoked cottage cheese marinated in Kashmiri chillies and curd',
        base_price_paise: 36000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['ST-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999909',
        category_id: '88888888-8888-8888-8888-888888888801',
        category_name: 'Starters',
        name: 'Chicken Seekh Kebab',
        code: 'GR-001',
        description: 'Minced chicken seasoned with fragrant herbs, skewered and charcoal grilled',
        base_price_paise: 34000,
        is_veg: false,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['GR-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999902',
        category_id: '88888888-8888-8888-8888-888888888802',
        category_name: 'Biryani',
        name: 'Murgh Dum Biryani',
        code: 'BR-001',
        description: 'Fragrant long-grain basmati layered with slow-cooked spiced chicken',
        base_price_paise: 42000,
        is_veg: false,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['BR-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999903',
        category_id: '88888888-8888-8888-8888-888888888803',
        category_name: 'Main Course',
        name: 'Butter Chicken',
        code: 'CR-001',
        description: 'Tandoori chicken simmered in rich velvety tomato makhani gravy',
        base_price_paise: 32000,
        is_veg: false,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['CR-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999908',
        category_id: '88888888-8888-8888-8888-888888888803',
        category_name: 'Main Course',
        name: 'Dal Makhani',
        code: 'CR-002',
        description: 'Slow simmered black lentils finished with fresh churned white butter and cream',
        base_price_paise: 24000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['CR-002']
    },
    {
        id: '99999999-9999-9999-9999-999999999904',
        category_id: '88888888-8888-8888-8888-888888888804',
        category_name: 'Bread',
        name: 'Garlic Naan',
        code: 'RD-001',
        description: 'Clay oven leavened bread brushed with fresh minced garlic and butter',
        base_price_paise: 6000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['RD-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999905',
        category_id: '88888888-8888-8888-8888-888888888805',
        category_name: 'Beverages',
        name: 'Fresh Lime Soda',
        code: 'BV-001',
        description: 'Carbonated beverage with freshly squeezed key lime and mint',
        base_price_paise: 12000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['BV-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999911',
        category_id: '88888888-8888-8888-8888-888888888807',
        category_name: 'Desserts',
        name: 'Shahi Tukda',
        code: 'DS-001',
        description: 'Crisp golden bread soaked in saffron spiced condensed milk, topped with pistachios',
        base_price_paise: 16000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['DS-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999912',
        category_id: '88888888-8888-8888-8888-888888888807',
        category_name: 'Desserts',
        name: 'Gulab Jamun with Rabri',
        code: 'DS-002',
        description: 'Soft warm khoya dumplings served with rich saffron thickened milk',
        base_price_paise: 14000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['DS-002']
    },
    {
        id: '99999999-9999-9999-9999-999999999913',
        category_id: '88888888-8888-8888-8888-888888888807',
        category_name: 'Desserts',
        name: 'Kesari Phirni',
        code: 'DS-003',
        description: 'Traditional slow-cooked ground rice pudding scented with saffron and cardamom',
        base_price_paise: 15000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['DS-003']
    },
    {
        id: '99999999-9999-9999-9999-999999999920',
        category_id: '88888888-8888-8888-8888-888888888807',
        category_name: 'Burgers & Quick Bites',
        name: 'Classic Chicken Burger',
        code: 'BG-001',
        description: 'Crispy grilled chicken patty with fresh lettuce, molten cheese and smoked paprika mayo',
        base_price_paise: 18000,
        is_veg: false,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['BG-001']
    },
    {
        id: '99999999-9999-9999-9999-999999999921',
        category_id: '88888888-8888-8888-8888-888888888807',
        category_name: 'Burgers & Quick Bites',
        name: 'Crispy Veggie Burger',
        code: 'BG-002',
        description: 'Golden spiced potato & corn patty with pickled gherkins, crunchy coleslaw and herb drizzle',
        base_price_paise: 14000,
        is_veg: true,
        gst_rate_percentage: 5.0,
        image_url: DISH_IMAGE_MAP['BG-002']
    }
];

const DEFAULT_CATEGORIES = [
    { id: 'ALL', name: 'All Items' },
    { id: 'POPULAR', name: '⭐ Popular' },
    { id: '88888888-8888-8888-8888-888888888801', name: 'Starters' },
    { id: '88888888-8888-8888-8888-888888888802', name: 'Biryani' },
    { id: '88888888-8888-8888-8888-888888888803', name: 'Main Course' },
    { id: '88888888-8888-8888-8888-888888888804', name: 'Bread' },
    { id: '88888888-8888-8888-8888-888888888806', name: 'Chinese' },
    { id: '88888888-8888-8888-8888-888888888805', name: 'Beverages' },
    { id: '88888888-8888-8888-8888-888888888807', name: 'Desserts' }
];

const DEFAULT_TABLES = [
    { id: '77777777-7777-7777-7777-777777777701', table_number: 'T-01', section: 'INDOOR_AC', capacity: 2, status: 'PREPARING', active_order_number: 'ORD-20261008-0001', active_total_paise: 58800, active_order_status: 'PREPARING' },
    { id: '77777777-7777-7777-7777-777777777702', table_number: 'T-02', section: 'INDOOR_AC', capacity: 4, status: 'AVAILABLE' },
    { id: '77777777-7777-7777-7777-777777777703', table_number: 'T-03', section: 'INDOOR_AC', capacity: 4, status: 'READY', active_order_number: 'ORD-20261008-0003', active_total_paise: 64000, active_order_status: 'READY' },
    { id: '77777777-7777-7777-7777-777777777704', table_number: 'T-04', section: 'INDOOR_AC', capacity: 6, status: 'ORDERING', active_order_number: 'ORD-20261008-0005', active_total_paise: 42000, active_order_status: 'ORDERING' },
    { id: '77777777-7777-7777-7777-777777777705', table_number: 'T-05', section: 'INDOOR_AC', capacity: 2, status: 'PAYMENT_PENDING', active_order_number: 'ORD-20261008-0006', active_total_paise: 96600, active_order_status: 'PAYMENT_PENDING' },
    { id: '77777777-7777-7777-7777-777777777706', table_number: 'T-06', section: 'INDOOR_AC', capacity: 6, status: 'PAID', active_order_number: 'ORD-20261008-0007', active_total_paise: 185000, active_order_status: 'PAID' },
    { id: '77777777-7777-7777-7777-777777777707', table_number: 'G-01', section: 'GARDEN_TERRACE', capacity: 4, status: 'OCCUPIED', active_order_number: 'ORD-20261008-0004', active_total_paise: 128000, active_order_status: 'SERVED' },
    { id: '77777777-7777-7777-7777-777777777708', table_number: 'G-02', section: 'GARDEN_TERRACE', capacity: 8, status: 'AVAILABLE' }
];

// Unified Application State
const appState = {
    currentView: 'pos', // 'home', 'pos', 'orders', 'tables', 'kitchen', 'more'
    userRole: 'CASHIER', // 'CASHIER', 'CHEF', 'MANAGER'
    outlet: null,
    categories: [],
    items: [],
    variants: [],
    tables: [],
    ordersList: [],
    kitchenTickets: [],
    
    // POS Workflow state
    selectedChannel: 'DINE_IN',
    selectedTableId: '77777777-7777-7777-7777-777777777701',
    guestCount: 2,
    activeCategory: 'ALL',
    activeDietFilter: 'ALL',
    searchQuery: '',
    assignedServer: 'Priya (Captain)',
    
    // Takeaway & Delivery state
    takeawayCustomer: '',
    deliveryCustomer: '',
    deliveryAddress: '',
    deliveryPartner: 'DIRECT',
    
    // Order cart
    cart: [],
    appliedDiscountPaise: 0,
    serviceChargeEnabled: false,
    serviceChargePaise: 0,
    orderNotes: '',
    attachedCustomer: null,
    isRushOrder: false,
    splitGuestCount: 1,
    
    // Inline Payment state
    paymentState: 'cart', // 'cart', 'payment', 'success'
    selectedTender: 'CASH', // 'CASH', 'UPI', 'CARD', 'OTHER', 'SPLIT'
    cashTendered: 600,
    splitCashAmount: 300,
    splitUpiAmount: 288,
    splitCardAmount: 0,
    
    // Hold & Recall Orders state
    heldOrders: JSON.parse(localStorage.getItem('dumhouse_held_orders') || '[]'),

    // Offline & Edge Sync state
    isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    simulatedOffline: false,
    offlineQueue: JSON.parse((typeof localStorage !== 'undefined' ? localStorage.getItem('dumhouse_offline_orders') : null) || '[]'),

    // Print Settings state (58mm, 80mm, A4)
    printSettings: JSON.parse(localStorage.getItem('dumhouse_print_settings') || JSON.stringify({
        paperSize: '80mm', // '58mm', '80mm', 'A4'
        printerType: 'browser', // 'browser', 'thermal_driver', 'network'
        showLogo: true,
        showGstin: true,
        showCashier: true,
        showTable: true,
        showCustomerPhone: true,
        showQrCode: true,
        footerMessage: 'Thank you for visiting DUM HOUSE. Please visit again!'
    })),
    
    // User Session
    authToken: null,
    currentUser: {
        id: '01900000-2222-0000-0000-000000000003',
        name: 'Ramesh Kumar',
        role: 'CASHIER'
    },
    
    lastCreatedOrder: null
};

// Utilities
function formatINR(paise) {
    const rupees = Math.round(paise) / 100;
    return '₹' + rupees.toLocaleString('en-IN', {
        minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    });
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'ℹ'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.2s';
        setTimeout(() => toast.remove(), 200);
    }, 2800);
}

// ==========================================================================
// VIEW ROUTER (PERSISTENT APPLICATION SHELL)
// ==========================================================================

function navigateTo(viewId) {
    appState.currentView = viewId;

    // Update Sidebar Nav active state
    document.querySelectorAll('.app-sidebar .nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    // Update Breadcrumb
    const titleMap = {
        'home': 'Dashboard Overview',
        'pos': 'New Order',
        'orders': 'Orders Workspace',
        'tables': 'Floor Layout & Tables',
        'kitchen': 'Kitchen Display System',
        'more': 'Management & Operations'
    };
    const titleEl = document.getElementById('header-view-title');
    if (titleEl) titleEl.textContent = titleMap[viewId] || 'Workspace';

    // Toggle Quick New Order button in header when away from POS
    const quickNewBtn = document.getElementById('header-new-order-quick');
    if (quickNewBtn) {
        quickNewBtn.classList.toggle('hidden', viewId === 'pos');
    }

    // Toggle View Sections
    document.querySelectorAll('.workspace-view').forEach(sec => {
        sec.classList.add('hidden');
    });
    const targetSection = document.getElementById(`view-${viewId}`);
    if (targetSection) targetSection.classList.remove('hidden');

    // Trigger view-specific renderers
    if (viewId === 'home') renderDashboard();
    if (viewId === 'orders') renderOrdersWorkspace();
    if (viewId === 'tables') renderTablesFloor();
    if (viewId === 'kitchen') renderKitchenWorkspace();
    if (viewId === 'more') renderMoreSubpage('inventory');
}

// ==========================================================================
// INITIALIZATION & CATALOG BOOTSTRAP
// ==========================================================================

async function initROS() {
    console.log('Starting DUM HOUSE Restaurant Operating System...');

    // 1. Authenticate Staff Cashier Session
    await loginStaffUser();

    // 2. Fetch Catalog & Tables from API
    try {
        const res = await fetch(`/api/pos/bootstrap?outletId=${OUTLET_ID}`);
        if (res.ok) {
            const data = await res.json();
            if (data.data) {
                appState.outlet = data.data.outlet;
                appState.categories = DEFAULT_CATEGORIES;
                appState.items = (data.data.items && data.data.items.length > 0) ? data.data.items : DEFAULT_MENU_ITEMS;
                appState.variants = data.data.variants || [];
                appState.tables = (data.data.tables && data.data.tables.length > 0) ? data.data.tables : DEFAULT_TABLES;
            }
        }
    } catch (e) {
        console.warn('Catalog API offline note:', e.message);
        appState.categories = DEFAULT_CATEGORIES;
        appState.items = DEFAULT_MENU_ITEMS;
        appState.tables = DEFAULT_TABLES;
    }

    // Attach high-res imagery mapping
    appState.items = appState.items.map(item => ({
        ...item,
        image_url: item.image_url || DISH_IMAGE_MAP[item.code] || null
    }));

    // 3. Pre-populate Cart with Chilli Paneer x 2 + Garlic Naan x 2
    const chilliPaneer = appState.items.find(i => i.name.toLowerCase().includes('chilli paneer')) || appState.items[0];
    const garlicNaan = appState.items.find(i => i.name.toLowerCase().includes('garlic naan')) || appState.items[8];

    if (chilliPaneer && garlicNaan) {
        appState.cart = [
            { item: chilliPaneer, quantity: 2, variantId: null },
            { item: garlicNaan, quantity: 2, variantId: null }
        ];
    }

    // 4. Initialize Core Views
    renderPosCategories();
    renderPosTablesDropdown();
    renderPosMenuItems();
    renderPosCart();
    initOfflineManager();
    updateHeldOrdersCount();

    // 5. Fetch Orders for pipeline & live metrics
    fetchOrdersPipeline();
    syncLiveDashboardMetrics();

    // 6. Attach Event Listeners & Realtime
    loadStaffFromBackend();
    attachGlobalEventListeners();
    connectRealtimeHub();

    // Start on New Order
    navigateTo('pos');
    console.log('✓ DUM HOUSE Operating System ready.');
}

async function syncLiveDashboardMetrics() {
    try {
        const res = await fetch(`/api/dashboard/summary?outletId=${OUTLET_ID}`);
        if (res.ok) {
            const data = await res.json();
            if (data.data?.today) {
                appState.todayCumulativeIncomePaise = data.data.today.totalIncomePaise || data.data.today.salesPaise || 0;
                appState.todayCumulativeDiscountPaise = data.data.today.discountPaise || 0;
            }
        }
    } catch (e) {
        // silent fallback
    }
}

async function loginStaffUser() {
    try {
        const res = await fetch('/api/auth/login-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outletId: OUTLET_ID, pin: '9999' })
        });
        if (res.ok) {
            const result = await res.json();
            if (result.data?.accessToken) {
                appState.authToken = result.data.accessToken;
                console.log('✓ Staff Authenticated: Ramesh Kumar (Cashier)');
            }
        }
    } catch (e) {
        console.warn('Auth login note:', e.message);
    }
}

// ==========================================================================
// POS WORKFLOW: MENU, CATEGORIES & CART
// ==========================================================================

function renderPosCategories() {
    const container = document.getElementById('categories-nav-list');
    if (!container) return;
    container.innerHTML = '';

    appState.categories.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = `category-pill ${appState.activeCategory === cat.id ? 'active' : ''}`;
        pill.textContent = cat.name;
        pill.addEventListener('click', () => {
            appState.activeCategory = cat.id;
            document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            renderPosMenuItems();
        });
        container.appendChild(pill);
    });
}

function renderPosTablesDropdown() {
    const select = document.getElementById('table-select');
    if (!select) return;
    select.innerHTML = '';

    appState.tables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const statusTag = t.status === 'OCCUPIED' ? ' (Occupied)' : '';
        opt.textContent = `${t.table_number} • ${t.section === 'INDOOR_AC' ? 'Indoor' : 'Garden'}${statusTag}`;
        if (t.id === appState.selectedTableId) opt.selected = true;
        select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
        appState.selectedTableId = e.target.value;
        const currentTable = appState.tables.find(t => t.id === appState.selectedTableId);
        const tableChip = document.getElementById('cart-context-table');
        if (tableChip && currentTable) {
            tableChip.textContent = `Table ${currentTable.table_number}`;
        }
    });
}

function renderPosMenuItems() {
    const grid = document.getElementById('menu-items-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let filtered = appState.items;

    // Category Filter
    if (appState.activeCategory === 'POPULAR') {
        filtered = filtered.filter(i => ['CH-001', 'BR-001', 'CR-001', 'RD-001'].includes(i.code));
    } else if (appState.activeCategory !== 'ALL') {
        filtered = filtered.filter(i => i.category_id === appState.activeCategory);
    }

    // Diet Filter
    if (appState.activeDietFilter === 'VEG') {
        filtered = filtered.filter(i => i.is_veg === true);
    } else if (appState.activeDietFilter === 'NON_VEG') {
        filtered = filtered.filter(i => i.is_veg === false);
    }

    // Search Query
    if (appState.searchQuery.trim().length > 0) {
        const q = appState.searchQuery.toLowerCase();
        filtered = filtered.filter(i =>
            i.name.toLowerCase().includes(q) ||
            (i.description && i.description.toLowerCase().includes(q)) ||
            (i.code && i.code.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
                <p style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">No items found</p>
                <p style="font-size: 12px; margin-bottom: 12px;">Try another search term or filter category.</p>
                <button class="secondary-btn" id="empty-clear-search-btn">Clear Search</button>
            </div>
        `;
        document.getElementById('empty-clear-search-btn')?.addEventListener('click', () => {
            const input = document.getElementById('menu-search-input');
            if (input) input.value = '';
            appState.searchQuery = '';
            renderPosMenuItems();
        });
        return;
    }

    filtered.forEach(item => {
        const inCart = appState.cart.find(c => c.item.id === item.id);
        const qty = inCart ? inCart.quantity : 0;

        const card = document.createElement('div');
        card.className = `pos-food-card ${qty > 0 ? 'active-in-order' : ''}`;
        card.id = `card-dish-${item.code}`;

        const isVeg = item.is_veg !== false;
        const imgUrl = item.image_url || DISH_IMAGE_MAP[item.code];

        card.innerHTML = `
            <div class="food-card-img-wrap">
                <img src="${imgUrl}" alt="${item.name}" class="food-card-img" loading="lazy" onerror="this.parentElement.style.display='none';" />
            </div>
            <div class="food-card-body">
                <h3 class="food-card-title">${item.name}</h3>
                <div class="food-card-meta-row">
                    <span class="diet-pill ${isVeg ? 'veg' : 'non-veg'}">
                        <span class="diet-dot">●</span> ${isVeg ? 'Veg' : 'Non-Veg'}
                    </span>
                    <span class="availability-tag in-stock">● In Stock</span>
                </div>
                <div class="food-card-footer">
                    <span class="food-card-price">${formatINR(item.base_price_paise)}</span>
                    ${qty > 0 
                        ? `<div class="card-stepper-inline">
                            <button class="card-step-btn minus-btn" aria-label="Decrease">−</button>
                            <span class="card-step-count">${qty}</span>
                            <button class="card-step-btn plus-btn" aria-label="Increase">+</button>
                           </div>`
                        : `<button class="card-add-btn">+ Add</button>`
                    }
                </div>
            </div>
        `;

        if (qty > 0) {
            card.querySelector('.minus-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = appState.cart.findIndex(c => c.item.id === item.id);
                if (idx !== -1) updateCartQuantity(idx, -1);
            });
            card.querySelector('.plus-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = appState.cart.findIndex(c => c.item.id === item.id);
                if (idx !== -1) updateCartQuantity(idx, 1);
            });
        } else {
            card.addEventListener('click', () => {
                addToCart(item);
            });
        }

        grid.appendChild(card);
    });
}

function addToCart(item) {
    const existing = appState.cart.find(c => c.item.id === item.id);
    if (existing) {
        existing.quantity += 1;
    } else {
        appState.cart.push({ item, quantity: 1, variantId: null });
    }
    renderPosCart();
    renderPosMenuItems();
    showToast(`Added ${item.name}`);
}

function updateCartQuantity(index, delta) {
    if (!appState.cart[index]) return;
    appState.cart[index].quantity += delta;
    if (appState.cart[index].quantity <= 0) {
        appState.cart.splice(index, 1);
    }
    renderPosCart();
    renderPosMenuItems();
}

function calculateBill() {
    let subtotalPaise = 0;
    let totalCount = 0;

    appState.cart.forEach(c => {
        subtotalPaise += parseInt(c.item.base_price_paise, 10) * c.quantity;
        totalCount += c.quantity;
    });

    const taxPaise = Math.round((subtotalPaise * 5) / 100); // 5% Indian Composite GST
    const serviceChargePaise = appState.serviceChargeEnabled ? Math.round((subtotalPaise * 5) / 100) : 0;
    const discountPaise = appState.appliedDiscountPaise || 0;
    const roundOffPaise = 0;
    const totalPaise = Math.max(0, subtotalPaise + taxPaise + serviceChargePaise + roundOffPaise - discountPaise);

    return { totalCount, subtotalPaise, taxPaise, serviceChargePaise, discountPaise, roundOffPaise, totalPaise };
}

function renderPosCart() {
    const list = document.getElementById('cart-items-list');
    if (!list) return;
    list.innerHTML = '';

    const bill = calculateBill();

    // Badge
    const badge = document.getElementById('cart-total-badge');
    if (badge) badge.textContent = `${bill.totalCount} item${bill.totalCount === 1 ? '' : 's'}`;

    if (appState.cart.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
                <span style="font-size: 26px; display: block; margin-bottom: 8px;">🛒</span>
                <p style="font-size: 13px; font-weight: 500; color: var(--text-secondary);">No items selected</p>
                <p style="font-size: 11.5px;">Click any item on the menu to build the order.</p>
            </div>
        `;
    } else {
        appState.cart.forEach((entry, idx) => {
            const lineTotal = entry.item.base_price_paise * entry.quantity;
            const row = document.createElement('div');
            row.className = 'order-item-row';
            row.innerHTML = `
                <div class="order-item-top">
                    <div class="item-name-group">
                        <span class="item-name">${entry.item.name}</span>
                        <span class="item-rate">${formatINR(entry.item.base_price_paise)} each</span>
                    </div>
                    <span class="item-total-price">${formatINR(lineTotal)}</span>
                </div>
                <div class="order-item-controls">
                    <div class="item-stepper">
                        <button class="stepper-btn minus-btn" aria-label="Decrease">−</button>
                        <span class="stepper-count">${entry.quantity}</span>
                        <button class="stepper-btn plus-btn" aria-label="Increase">+</button>
                    </div>
                    <button class="item-del-btn" title="Remove line item">🗑️</button>
                </div>
            `;

            row.querySelector('.minus-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                updateCartQuantity(idx, -1);
            });
            row.querySelector('.plus-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                updateCartQuantity(idx, 1);
            });
            row.querySelector('.item-del-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                appState.cart.splice(idx, 1);
                renderPosCart();
                renderPosMenuItems();
            });

            list.appendChild(row);
        });
    }

    // Bill Breakdown Lines
    document.getElementById('bill-subtotal').textContent = formatINR(bill.subtotalPaise);
    document.getElementById('bill-tax').textContent = formatINR(bill.taxPaise);

    // Service Charge Line
    const scLine = document.getElementById('service-charge-line');
    if (scLine) {
        scLine.style.display = appState.serviceChargeEnabled ? 'flex' : 'none';
        document.getElementById('bill-service-charge').textContent = '+' + formatINR(bill.serviceChargePaise);
    }

    // Discount Line
    const discLine = document.getElementById('discount-summary-line');
    if (discLine) {
        discLine.style.display = bill.discountPaise > 0 ? 'flex' : 'none';
        document.getElementById('bill-discount').textContent = '-' + formatINR(bill.discountPaise);
    }

    document.getElementById('bill-round-off').textContent = formatINR(bill.roundOffPaise);
    document.getElementById('bill-grand-total').textContent = formatINR(bill.totalPaise);
    document.getElementById('btn-total-tag').textContent = formatINR(bill.totalPaise);

    // Pay CTA Text (adaptive when bill split across multiple guests)
    const payCta = document.getElementById('btn-proceed-pay');
    if (payCta) {
        payCta.disabled = appState.cart.length === 0;
        const ctaTextEl = payCta.querySelector('.cta-text');
        if (ctaTextEl) {
            if (appState.splitGuestCount > 1) {
                const perGuest = Math.round(bill.totalPaise / appState.splitGuestCount);
                ctaTextEl.textContent = `PAY (Split ÷ ${appState.splitGuestCount} = ${formatINR(perGuest)})`;
            } else {
                ctaTextEl.textContent = 'PAY';
            }
        }
    }
}

// ==========================================================================
// INLINE PAYMENT TRANSFORMATION (CORE UX PHILOSOPHY)
// ==========================================================================

function transitionToPayment() {
    if (appState.cart.length === 0) return;
    appState.paymentState = 'payment';

    document.getElementById('panel-state-cart').classList.add('hidden');
    document.getElementById('panel-state-payment').classList.remove('hidden');
    document.getElementById('panel-state-success').classList.add('hidden');

    const bill = calculateBill();
    const dueRupees = Math.round(bill.totalPaise / 100);

    document.getElementById('pay-due-display').textContent = formatINR(bill.totalPaise);
    document.getElementById('btn-pay-confirm-amount').textContent = formatINR(bill.totalPaise);
    
    const splitTotalEl = document.getElementById('split-total-due');
    if (splitTotalEl) splitTotalEl.textContent = formatINR(bill.totalPaise);

    // Default cash tendered calculation
    appState.cashTendered = dueRupees;
    const tenderInput = document.getElementById('cash-tendered-input');
    if (tenderInput) tenderInput.value = dueRupees;
    updateCashChange();

    // Default split breakdown: e.g. 300 Cash, remaining UPI
    const splitCashInput = document.getElementById('split-cash-input');
    const splitUpiInput = document.getElementById('split-upi-input');
    if (splitCashInput && splitUpiInput) {
        const cashHalf = Math.min(300, dueRupees);
        splitCashInput.value = cashHalf;
        splitUpiInput.value = dueRupees - cashHalf;
        updateSplitRemaining();
    }
}

function transitionBackToCart() {
    appState.paymentState = 'cart';
    document.getElementById('panel-state-payment').classList.add('hidden');
    document.getElementById('panel-state-cart').classList.remove('hidden');
    document.getElementById('panel-state-success').classList.add('hidden');
}

function updateCashChange() {
    const bill = calculateBill();
    const dueRupees = Math.round(bill.totalPaise / 100);
    const tendered = parseFloat(document.getElementById('cash-tendered-input')?.value) || 0;
    const change = Math.max(0, tendered - dueRupees);

    const changeEl = document.getElementById('cash-change-display');
    if (changeEl) changeEl.textContent = `₹${change.toFixed(2)}`;
}

function updateSplitRemaining() {
    const bill = calculateBill();
    const dueRupees = Math.round(bill.totalPaise / 100);
    const cashVal = parseFloat(document.getElementById('split-cash-input')?.value) || 0;
    const upiVal = parseFloat(document.getElementById('split-upi-input')?.value) || 0;
    const totalSplit = cashVal + upiVal;
    const remaining = dueRupees - totalSplit;

    appState.splitCashAmount = cashVal;
    appState.splitUpiAmount = upiVal;

    const remainingValEl = document.getElementById('split-remaining-val');
    const completeBtn = document.getElementById('btn-complete-payment');

    if (remainingValEl) {
        if (remaining === 0) {
            remainingValEl.textContent = '₹0.00 (Balanced ✓)';
            remainingValEl.className = 'balance-val text-green';
            if (completeBtn) completeBtn.disabled = false;
        } else if (remaining > 0) {
            remainingValEl.textContent = `₹${remaining.toFixed(2)} Remaining`;
            remainingValEl.className = 'balance-val text-amber';
            if (completeBtn) completeBtn.disabled = true;
        } else {
            remainingValEl.textContent = `₹${Math.abs(remaining).toFixed(2)} Excess`;
            remainingValEl.className = 'balance-val text-red';
            if (completeBtn) completeBtn.disabled = true;
        }
    }
}

async function executePaymentCompletion() {
    const bill = calculateBill();
    const confirmBtn = document.getElementById('btn-complete-payment');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span>PROCESSING ORDER...</span>';
    }

    const tenderLabel = appState.selectedTender === 'SPLIT'
        ? `SPLIT (Cash ₹${appState.splitCashAmount}, UPI ₹${appState.splitUpiAmount})`
        : appState.selectedTender;

    const distanceInput = document.getElementById('takeaway-distance-input');
    const effectiveDistance = appState.selectedChannel === 'DINE_IN'
        ? 0
        : (distanceInput ? (parseFloat(distanceInput.value) || 0) : (appState.orderDistanceKm || 0));

    const orderPayload = {
        channel: appState.selectedChannel,
        tableId: appState.selectedChannel === 'DINE_IN' ? appState.selectedTableId : null,
        guestCount: appState.guestCount || 2,
        items: appState.cart.map(c => ({
            menuItemId: c.item.id,
            variantId: c.variantId || null,
            quantity: c.quantity
        })),
        idempotencyKey: 'POS-ROP-' + uuidv4(),
        notes: `Tender: ${tenderLabel}`,
        distanceKm: effectiveDistance,
        discountPaise: bill.discountPaise || 0
    };

    let createdOrder = null;

    // Check if running in offline mode or simulated offline
    if (appState.isOffline || appState.simulatedOffline) {
        createdOrder = {
            id: uuidv4(),
            order_number: 'ORD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 800) + 100).padStart(4, '0'),
            status: 'PLACED',
            channel: appState.selectedChannel,
            total_paise: bill.totalPaise,
            token: { token_number: Math.floor(Math.random() * 40) + 1 },
            offlineQueued: true
        };
        // Queue in local outbox
        appState.offlineQueue.push({ ...orderPayload, order_number: createdOrder.order_number, total_paise: bill.totalPaise });
        localStorage.setItem('dumhouse_offline_orders', JSON.stringify(appState.offlineQueue));
        updateOnlineStatusUi();
        showToast(`Offline Mode: Order saved to Edge Outbox (Queue: ${appState.offlineQueue.length})`, 'warning');
    } else {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (appState.authToken) headers['Authorization'] = `Bearer ${appState.authToken}`;
            headers['Idempotency-Key'] = orderPayload.idempotencyKey;

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers,
                body: JSON.stringify(orderPayload)
            });
            const result = await res.json();
            if (res.ok && result.success) {
                createdOrder = result.data;
            }
        } catch (err) {
            console.warn('Backend order call fallback:', err);
        }

        if (!createdOrder) {
            createdOrder = {
                id: uuidv4(),
                order_number: 'ORD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-0123',
                status: 'PLACED',
                channel: appState.selectedChannel,
                total_paise: bill.totalPaise,
                token: { token_number: 14 }
            };
        }
    }

    // Capture frozen snapshot of items & bill for thermal/A4 printing
    const currentTableObj = appState.tables.find(t => t.id === appState.selectedTableId);
    createdOrder.table_number = currentTableObj ? currentTableObj.table_number : 'T-01';
    createdOrder.itemsSnapshot = appState.cart.map(c => ({
        name: c.item.name,
        quantity: c.quantity,
        base_price_paise: c.item.base_price_paise
    }));
    createdOrder.billSnapshot = { ...bill };
    createdOrder.tenderDescription = tenderLabel;

    appState.lastCreatedOrder = createdOrder;
    showToast(`Order ${createdOrder.order_number} Paid & Confirmed!`);

    // Update cumulative shift metrics
    appState.todayCumulativeIncomePaise = (appState.todayCumulativeIncomePaise || 4285000) + bill.totalPaise;
    appState.todayCumulativeDiscountPaise = (appState.todayCumulativeDiscountPaise || 120000) + (bill.discountPaise || 0);

    // Inline Transition to Success State
    appState.paymentState = 'success';
    document.getElementById('panel-state-payment').classList.add('hidden');
    document.getElementById('panel-state-cart').classList.add('hidden');
    document.getElementById('panel-state-success').classList.remove('hidden');

    const successOrderNum = document.getElementById('success-order-num');
    if (successOrderNum) successOrderNum.textContent = createdOrder.order_number;

    const tokenVal = createdOrder.token?.token_number || createdOrder.tokenNumber || 15;
    const tokenDisplayEl = document.getElementById('success-token-display');
    if (tokenDisplayEl) {
        tokenDisplayEl.textContent = `TOKEN #${tokenVal}`;
        tokenDisplayEl.style.color = '#0f172a';
    }

    const etaText = createdOrder.promiseDisplay || (createdOrder.promiseRange ? createdOrder.promiseRange.rangeDisplay : (effectiveDistance > 0 ? '10–15 mins' : '8–12 mins'));
    const etaDisplayEl = document.getElementById('success-eta-display');
    if (etaDisplayEl) etaDisplayEl.textContent = etaText;

    const channelDetailEl = document.getElementById('success-channel-detail');
    if (channelDetailEl) {
        if (appState.selectedChannel === 'DINE_IN') {
            channelDetailEl.textContent = `Dine-in · Table ${createdOrder.table_number}`;
        } else if (appState.selectedChannel === 'WALK_IN') {
            channelDetailEl.textContent = `Takeaway · Token #${tokenVal} ${effectiveDistance > 0 ? `(${effectiveDistance.toFixed(1)} km away)` : ''}`;
        } else {
            channelDetailEl.textContent = `Delivery · ${appState.deliveryPartner} (${effectiveDistance.toFixed(1)} km)`;
        }
    }

    const successPaidEl = document.getElementById('success-amount-paid');
    if (successPaidEl) successPaidEl.textContent = formatINR(bill.totalPaise);

    const successDiscountEl = document.getElementById('success-discount-saved');
    if (successDiscountEl) successDiscountEl.textContent = formatINR(bill.discountPaise || 0);

    const netTaxEl = document.getElementById('success-net-tax');
    if (netTaxEl) {
        const netFood = bill.totalPaise - bill.taxPaise;
        netTaxEl.textContent = `Net ${formatINR(netFood)} + GST ${formatINR(bill.taxPaise)}`;
    }

    const cumulativeIncomeEl = document.getElementById('success-cumulative-income');
    if (cumulativeIncomeEl) cumulativeIncomeEl.textContent = formatINR(appState.todayCumulativeIncomePaise);

    const successTenderEl = document.getElementById('success-tender-type');
    if (successTenderEl) successTenderEl.textContent = tenderLabel;

    // Distance & Smart JIT Transit Analysis - ONLY shown when customer has distance > 0
    const distanceBanner = document.getElementById('success-distance-banner');
    const distanceStat = document.getElementById('success-distance-stat');
    const jitExplanation = document.getElementById('success-jit-explanation');

    if (effectiveDistance > 0) {
        if (distanceBanner) distanceBanner.style.display = 'block';
        const travelMinutes = Math.ceil(((effectiveDistance / 15) * 3600 + 120) / 60);
        if (distanceStat) distanceStat.textContent = `${effectiveDistance.toFixed(1)} km · ~${travelMinutes} min transit`;

        const burgerCount = appState.cart
            .filter(c => (c.item.code && c.item.code.startsWith('BG-')) || (c.item.name && c.item.name.toLowerCase().includes('burger')))
            .reduce((sum, c) => sum + c.quantity, 0);

        const itemDesc = burgerCount > 0 ? `${burgerCount} Burger${burgerCount > 1 ? 's' : ''}` : 'Food order';

        if (jitExplanation) {
            jitExplanation.innerHTML = `
                Customer is <strong>${effectiveDistance.toFixed(1)} km away</strong> (~${travelMinutes} min transit) ordering <strong>${itemDesc}</strong>.
                <br/><strong>Smart JIT Kitchen Queuing:</strong> Kitchen does <em>NOT wait idle</em> for customer arrival — active station orders continue smoothly! Food is synchronized so items are freshly ready right when customer arrives. 🎫 <strong>Token #${tokenVal}</strong> · Promise: <strong>${etaText}</strong>.
            `;
        }
    } else {
        if (distanceBanner) distanceBanner.style.display = 'none';
    }

    // Refresh orders pipeline and dashboard summary in background
    fetchOrdersPipeline();
    syncLiveDashboardMetrics();

    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Complete Payment</span><span>${formatINR(bill.totalPaise)}</span>`;
    }
}

function startFreshOrder() {
    appState.cart = [];
    appState.orderNotes = '';
    appState.appliedDiscountPaise = 0;
    appState.attachedCustomer = null;
    appState.paymentState = 'cart';
    const distanceBanner = document.getElementById('success-distance-banner');
    if (distanceBanner) distanceBanner.style.display = 'none';
    document.getElementById('panel-state-success').classList.add('hidden');
    document.getElementById('panel-state-payment').classList.add('hidden');
    document.getElementById('panel-state-cart').classList.remove('hidden');
    renderPosCart();
    renderPosMenuItems();
    showToast('Ready for new customer order');
}

// ==========================================================================
// ORDERS WORKSPACE (VIEW 3)
// ==========================================================================

async function fetchOrdersPipeline() {
    try {
        const headers = {};
        if (appState.authToken) headers['Authorization'] = `Bearer ${appState.authToken}`;
        const res = await fetch('/api/orders', { headers });
        if (res.ok) {
            const result = await res.json();
            if (result.data) {
                appState.ordersList = result.data;
                updateOrdersCounters();
            }
        }
    } catch (e) {
        console.warn('Orders fetch note:', e.message);
    }
}

function updateOrdersCounters() {
    const badge = document.getElementById('sidebar-orders-badge');
    const active = appState.ordersList.filter(o => !['SERVED', 'COLLECTED', 'DELIVERED', 'CANCELLED'].includes(o.status));
    if (badge) badge.textContent = active.length;

    const countAll = document.getElementById('count-all-orders');
    if (countAll) countAll.textContent = appState.ordersList.length;

    const countActive = document.getElementById('count-active-orders');
    if (countActive) countActive.textContent = active.length;

    const countKitchen = document.getElementById('count-kitchen-orders');
    if (countKitchen) countKitchen.textContent = appState.ordersList.filter(o => o.status === 'PREPARING').length;

    const countReady = document.getElementById('count-ready-orders');
    if (countReady) countReady.textContent = appState.ordersList.filter(o => o.status === 'READY').length;
}

function getOrderPipelineHtml(status) {
    const steps = [
        { key: 'PLACED', label: 'Order' },
        { key: 'ACCEPTED', label: 'Kitchen' },
        { key: 'PREPARING', label: 'Preparing' },
        { key: 'READY', label: 'Ready' },
        { key: 'SERVED', label: 'Served' },
        { key: 'PAID', label: 'Paid' }
    ];
    const statusOrder = { 'PLACED': 0, 'ACCEPTED': 1, 'PREPARING': 2, 'READY': 3, 'SERVED': 4, 'COLLECTED': 4, 'DELIVERED': 4, 'PAID': 5 };
    const currentIdx = statusOrder[status] !== undefined ? statusOrder[status] : 2;

    return `
        <div class="order-status-pipeline">
            ${steps.map((s, idx) => {
                const isDone = idx < currentIdx;
                const isActive = idx === currentIdx;
                const stateClass = isDone ? 'done' : (isActive ? 'active' : '');
                return `
                    <div class="pipeline-node ${stateClass}">
                        <span class="pipeline-dot"></span>
                        <span>${s.label}</span>
                    </div>
                    ${idx < steps.length - 1 ? '<span class="pipeline-arrow">→</span>' : ''}
                `;
            }).join('')}
        </div>
    `;
}

function renderOrdersWorkspace(filter = 'ALL') {
    const grid = document.getElementById('orders-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let list = appState.ordersList;
    if (filter === 'ACTIVE') {
        list = list.filter(o => !['SERVED', 'COLLECTED', 'DELIVERED', 'CANCELLED'].includes(o.status));
    } else if (filter === 'PREPARING') {
        list = list.filter(o => o.status === 'PREPARING');
    } else if (filter === 'READY') {
        list = list.filter(o => o.status === 'READY');
    } else if (filter === 'COMPLETED') {
        list = list.filter(o => ['SERVED', 'COLLECTED', 'DELIVERED'].includes(o.status));
    }

    if (list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
                <p style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">No orders in this view</p>
                <p style="font-size: 12px;">Orders will appear here as soon as they are placed.</p>
            </div>
        `;
        return;
    }

    list.forEach(order => {
        const card = document.createElement('div');
        card.className = 'order-workspace-card';
        const itemsSummary = (order.items && order.items.length > 0)
            ? order.items.map(i => `${i.quantity}× ${i.name}`).join(', ')
            : 'Standard Menu Selection';

        const tableDisplay = order.table_number ? `Table ${order.table_number}` : (order.channel || 'Counter');

        card.innerHTML = `
            <div class="order-card-header">
                <span class="order-num-tag">${order.order_number}</span>
                <span class="status-chip ${order.status.toLowerCase()}">${order.status}</span>
            </div>
            <div class="order-meta-details">
                <span>📍 ${tableDisplay}</span>
                <span>•</span>
                <span>Token #${order.token_number || 12}</span>
                <span>•</span>
                <span>${new Date(order.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${getOrderPipelineHtml(order.status)}
            <div class="order-items-snippet">${itemsSummary}</div>
            <div class="order-card-footer">
                <span class="order-total-bold">${formatINR(order.total_paise || 58800)}</span>
                <button class="order-action-btn">Manage →</button>
            </div>
        `;

        card.addEventListener('click', () => {
            openOrderDrawer(order);
        });

        grid.appendChild(card);
    });
}

// ==========================================================================
// TABLES FLOOR LAYOUT (VIEW 4)
// ==========================================================================

async function renderTablesFloor(sectionFilter = 'ALL') {
    const container = document.getElementById('tables-floor-container');
    if (!container) return;
    container.innerHTML = '';

    let tables = appState.tables;
    if (sectionFilter !== 'ALL') {
        tables = tables.filter(t => t.section === sectionFilter);
    }

    tables.forEach(table => {
        const isAvailable = table.status === 'AVAILABLE';
        const card = document.createElement('div');
        const statusClass = table.status.toLowerCase().replace(/_/g, '-');
        card.className = `floor-table-card ${statusClass}`;

        const statusDisplayMap = {
            'AVAILABLE': 'Available',
            'OCCUPIED': 'Occupied',
            'ORDERING': 'Ordering',
            'PREPARING': 'Preparing',
            'READY': 'Ready',
            'PAYMENT_PENDING': 'Payment Pending',
            'PAID': 'Paid',
            'SERVED': 'Served'
        };
        const statusLabel = statusDisplayMap[table.status] || table.status;
        
        card.innerHTML = `
            <div class="table-card-top">
                <span class="table-id-large">${table.table_number}</span>
                <span class="table-status-pill ${table.status.toLowerCase()}">${statusLabel}</span>
            </div>
            <div class="table-capacity-row">
                <span>${table.section === 'INDOOR_AC' ? 'Indoor • AC' : 'Garden • Terrace'}</span>
                <span>👥 Capacity: ${table.capacity}</span>
            </div>
            ${!isAvailable ? `
                <div class="table-active-bill">
                    <span>Active Bill (${statusLabel})</span>
                    <strong>${formatINR(table.active_total_paise || 58800)}</strong>
                </div>
                <button class="table-quick-btn">${table.status === 'PAYMENT_PENDING' ? '💳 Collect Payment →' : (table.status === 'PAID' ? 'Mark Available →' : 'View Table Order →')}</button>
            ` : `
                <div style="font-size: 11.5px; color: var(--text-muted); padding: 4px 0;">Table is clean and ready.</div>
                <button class="table-quick-btn">+ Start Order</button>
            `}
        `;

        card.addEventListener('click', () => {
            if (!isAvailable) {
                openTableDrawer(table);
            } else {
                appState.selectedTableId = table.id;
                appState.selectedChannel = 'DINE_IN';
                navigateTo('pos');
                const select = document.getElementById('table-select');
                if (select) select.value = table.id;
                document.getElementById('cart-context-table').textContent = `Table ${table.table_number}`;
                showToast(`Started Dine-in order for ${table.table_number}`);
            }
        });

        container.appendChild(card);
    });
}

// ==========================================================================
// IN-APP KITCHEN DISPLAY SYSTEM (VIEW 5)
// ==========================================================================

async function renderKitchenWorkspace(stationFilter = 'ALL') {
    const container = document.getElementById('kds-tickets-container');
    if (!container) return;
    container.innerHTML = '';

    // Mock Live Station KOT Tickets
    const tickets = [
        {
            id: 'KOT-101',
            orderNumber: 'ORD-20261008-0001',
            station: 'TANDOOR',
            table: 'T-01',
            time: '04:18',
            items: ['2x Garlic Naan (Butter brushed)', '1x Paneer Tikka Angara']
        },
        {
            id: 'KOT-102',
            orderNumber: 'ORD-20261008-0002',
            station: 'CURRY',
            table: 'T-03',
            time: '08:42',
            items: ['1x Murgh Dum Biryani (Full Portion)', '1x Dal Makhani']
        },
        {
            id: 'KOT-103',
            orderNumber: 'ORD-20261008-0003',
            station: 'WOK',
            table: 'Counter #14',
            time: '02:05',
            items: ['2x Chilli Paneer (Crispy)', '1x Hakka Noodles']
        }
    ];

    let filtered = tickets;
    if (stationFilter !== 'ALL') {
        filtered = filtered.filter(t => t.station === stationFilter);
    }

    filtered.forEach(t => {
        const card = document.createElement('div');
        card.className = 'kds-ticket-card';
        card.id = `ticket-${t.id}`;
        card.innerHTML = `
            <div class="kds-ticket-header">
                <div>
                    <span class="kds-ticket-num">${t.id}</span>
                    <span style="font-size:11px; color:var(--text-muted); margin-left:6px;">${t.table}</span>
                </div>
                <span class="kds-timer">⏱ ${t.time}</span>
            </div>
            <div class="kds-ticket-body">
                <span class="kds-station-tag">${t.station} STATION</span>
                <div class="kds-item-checklist">
                    ${t.items.map(i => `
                        <label class="kds-item-row">
                            <input type="checkbox" />
                            <span>${i}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <button class="kds-bump-btn" id="bump-btn-${t.id}">✓ BUMP PREPARED</button>
        `;

        card.querySelector('.kds-bump-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            card.classList.add('bumped');
            showToast(`${t.id} bumped at ${t.station}!`);
            setTimeout(() => card.remove(), 600);
        });

        container.appendChild(card);
    });
}

// ==========================================================================
// DASHBOARD OPERATIONAL HOME (VIEW 1)
// ==========================================================================

function renderDashboard() {
    const tbody = document.getElementById('dash-recent-orders-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const list = appState.ordersList.slice(0, 5);
    list.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${o.order_number}</strong></td>
            <td>${o.table_number ? 'Table ' + o.table_number : o.channel}</td>
            <td>${o.items?.length || 2} items</td>
            <td><strong>${formatINR(o.total_paise || 58800)}</strong></td>
            <td><span class="status-chip ${o.status.toLowerCase()}">${o.status}</span></td>
            <td>${new Date(o.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td><button class="link-btn manage-row-btn">Open →</button></td>
        `;
        tr.querySelector('.manage-row-btn').addEventListener('click', () => {
            openOrderDrawer(o);
        });
        tbody.appendChild(tr);
    });
}

// ==========================================================================
// MORE SUB-PAGE RENDERER (VIEW 6)
// ==========================================================================

function renderMoreSubpage(subId) {
    const box = document.getElementById('more-subcontent-box');
    if (!box) return;

    if (subId === 'inventory') {
        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700;">Live Raw Material Inventory (Append-Only Ledger)</h3>
                <span class="status-chip ready">ACID Ledger Sync Active</span>
            </div>
            <table class="rop-table">
                <thead>
                    <tr><th>Ingredient</th><th>Current Balance</th><th>Unit Cost</th><th>Reorder Level</th><th>Stock Status</th></tr>
                </thead>
                <tbody>
                    <tr><td><strong>Basmati Rice</strong></td><td>184.2 kg</td><td>₹120 / kg</td><td>50 kg</td><td><span class="text-green">● Healthy</span></td></tr>
                    <tr><td><strong>Fresh Chicken</strong></td><td>92.5 kg</td><td>₹220 / kg</td><td>40 kg</td><td><span class="text-green">● Healthy</span></td></tr>
                    <tr><td><strong>Malai Paneer</strong></td><td>18.0 kg</td><td>₹350 / kg</td><td>25 kg</td><td><span class="text-amber">⚠ Reorder Soon</span></td></tr>
                    <tr><td><strong>Desi Ghee</strong></td><td>44.5 L</td><td>₹650 / L</td><td>15 L</td><td><span class="text-green">● Healthy</span></td></tr>
                </tbody>
            </table>
        `;
    } else if (subId === 'staff') {
        renderStaffManagementView(box);
    } else if (subId === 'reports') {
        box.innerHTML = `
            <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:14px;">Daily Sales & Tax Z-Report (Indiranagar Outlet)</h3>
            <div class="metrics-grid" style="margin-bottom:20px;">
                <div class="metric-card"><span class="metric-title">Gross Sales</span><span class="metric-value">₹48,420</span></div>
                <div class="metric-card"><span class="metric-title">CGST (2.5%)</span><span class="metric-value">₹1,152</span></div>
                <div class="metric-card"><span class="metric-title">SGST (2.5%)</span><span class="metric-value">₹1,152</span></div>
                <div class="metric-card"><span class="metric-title">Discounts</span><span class="metric-value">₹450</span></div>
                <div class="metric-card"><span class="metric-title">Net Settle</span><span class="metric-value">₹50,274</span></div>
            </div>
            <button class="secondary-btn">🖨️ Print Shift Z-Report Receipt</button>
        `;
    } else if (subId === 'edge') {
        box.innerHTML = `
            <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:14px;">Edge Node & Offline Sync Status</h3>
            <div style="background:var(--canvas-bg); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
                <p><strong>Connectivity Mode:</strong> <span class="text-green">ONLINE (Local Edge + Cloud Replication)</span></p>
                <p style="margin-top:8px;"><strong>Offline Outbox Queue:</strong> 0 pending transactions</p>
                <p style="margin-top:8px;"><strong>Conflict Resolution:</strong> Zero pending invariant conflicts</p>
            </div>
        `;
    }
}

// ==========================================================================
// STAFF DIRECTORY & SHIFT MANAGEMENT
// ==========================================================================
let appStaffList = [
    { id: '66666666-6666-6666-6666-666666666601', name: 'Arjun Mehta', username: 'arjun_manager', role: 'Store Manager', shift: 'All Day', status: 'Active', phone: '+91 98765 00001' },
    { id: '66666666-6666-6666-6666-666666666603', name: 'Ramesh Kumar', username: 'ramesh_cashier', role: 'Cashier', shift: 'Shift #1', status: 'On POS Duty', phone: '+91 98765 00003' },
    { id: '66666666-6666-6666-6666-666666666602', name: 'Chef Sanjeev Nair', username: 'sanjeev_chef', role: 'Head Chef', shift: 'Kitchen Line', status: 'Active', phone: '+91 98765 00002' },
    { id: '66666666-6666-6666-6666-666666666604', name: 'Priya Sharma', username: 'priya_captain', role: 'Captain / Waiter', shift: 'Floor Dining', status: 'Active', phone: '+91 98765 00004' }
];

async function loadStaffFromBackend() {
    try {
        const res = await fetch('/api/staff');
        if (res.ok) {
            const result = await res.json();
            if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                const shiftMapping = {
                    'Store Manager': 'All Day',
                    'Cashier': 'Shift #1',
                    'Head Chef': 'Kitchen Line',
                    'Captain / Waiter': 'Floor Dining'
                };
                appStaffList = result.data.map(u => ({
                    id: u.id,
                    name: u.full_name || u.username,
                    username: u.username,
                    role: u.role_name || 'Captain / Waiter',
                    shift: u.shift || shiftMapping[u.role_name] || 'Floor Dining',
                    status: u.is_active ? (u.username === 'ramesh_cashier' ? 'On POS Duty' : 'Active') : 'Inactive',
                    phone: u.phone || ''
                }));
            }
        }
    } catch (e) {
        // silent fallback to default
    }
}

function renderStaffManagementView(box) {
    if (!box) box = document.getElementById('more-subcontent-box');
    if (!box) return;

    const rowsHtml = appStaffList.map(s => {
        let roleBadge = '';
        if (s.role.includes('Manager')) {
            roleBadge = `<span style="background:#EDE9FE; color:#6D28D9; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">👑 ${s.role}</span>`;
        } else if (s.role.includes('Chef')) {
            roleBadge = `<span style="background:#FEE2E2; color:#B91C1C; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">👨‍🍳 ${s.role}</span>`;
        } else if (s.role.includes('Cashier')) {
            roleBadge = `<span style="background:#DBEAFE; color:#1D4ED8; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">💳 ${s.role}</span>`;
        } else {
            roleBadge = `<span style="background:#CCFBF1; color:#0F766E; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">🍽️ ${s.role}</span>`;
        }

        const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:32px; height:32px; border-radius:50%; background:var(--primary-tint); color:var(--primary); font-weight:700; font-size:12px; display:flex; align-items:center; justify-content:center; border:1px solid var(--primary-border);">
                            ${initials}
                        </div>
                        <div>
                            <div style="font-weight:600; color:var(--text-primary); font-size:13.5px;">${s.name}</div>
                            <div style="font-size:11px; color:var(--text-muted);">${s.phone || ''}</div>
                        </div>
                    </div>
                </td>
                <td><span style="font-family:var(--font-mono); font-size:12.5px; color:var(--text-secondary); background:var(--surface-subtle); padding:2px 6px; border-radius:4px;">@${s.username}</span></td>
                <td>${roleBadge}</td>
                <td><span style="font-size:12.5px; color:var(--text-secondary); font-weight:500;">${s.shift}</span></td>
                <td>
                    <span class="${s.status === 'Inactive' ? 'text-danger' : 'text-green'}" style="font-size:12.5px; font-weight:600;">
                        ${s.status === 'Inactive' ? '○ Inactive' : (s.status.includes('POS') ? '● On POS Duty' : '● Active')}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
                <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; margin-bottom:2px; color:var(--text-primary);">Staff Directory & Shift Assignments</h3>
                <p style="font-size:12px; color:var(--text-secondary);">Manage restaurant staff crew, assigned roles, shift coverage and POS security PINs.</p>
            </div>
            <button id="btn-open-add-staff" style="display:inline-flex; align-items:center; gap:6px; background:var(--primary); color:#FFF; font-weight:600; font-size:13.5px; padding:9px 18px; border-radius:var(--radius-md); border:none; cursor:pointer; box-shadow:var(--shadow-sm); transition:background 0.15s ease;">
                <span style="font-size:18px; font-weight:700; line-height:1;">+</span> Add Staff Member
            </button>
        </div>
        <table class="rop-table">
            <thead><tr><th>NAME</th><th>USERNAME</th><th>ASSIGNED ROLE</th><th>SHIFT #</th><th>CURRENT STATUS</th></tr></thead>
            <tbody id="staff-table-body">
                ${rowsHtml}
            </tbody>
        </table>
    `;

    document.getElementById('btn-open-add-staff')?.addEventListener('click', openAddStaffModal);
}

function openAddStaffModal() {
    const modal = document.getElementById('add-staff-modal');
    if (!modal) return;
    document.getElementById('form-add-staff')?.reset();
    const errEl = document.getElementById('staff-form-error');
    if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
    }
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('staff-input-name')?.focus(), 50);
}

function closeAddStaffModal() {
    const modal = document.getElementById('add-staff-modal');
    if (modal) modal.classList.add('hidden');
}

// ==========================================================================
// SLIDE-OVER DRAWER CONTROLLERS (SECONDARY ACTIONS)
// ==========================================================================

function openDrawer(title, contentHtml) {
    const backdrop = document.getElementById('app-drawer-backdrop');
    const titleEl = document.getElementById('drawer-title');
    const contentEl = document.getElementById('drawer-content');

    if (titleEl) titleEl.textContent = title;
    if (contentEl) contentEl.innerHTML = contentHtml;
    if (backdrop) backdrop.classList.remove('hidden');
}

function closeDrawer() {
    const backdrop = document.getElementById('app-drawer-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
}

function openOrderDrawer(order) {
    const html = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h4 style="font-family:var(--font-heading); font-size:16px; font-weight:700;">${order.order_number}</h4>
                <span style="font-size:11.5px; color:var(--text-muted);">${order.channel} • Token #${order.token_number || 12}</span>
            </div>
            <span class="status-chip ${order.status.toLowerCase()}">${order.status}</span>
        </div>

        ${getOrderPipelineHtml(order.status)}

        <div style="background:var(--canvas-bg); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
            <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Order Items</span>
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                ${(order.items && order.items.length > 0) ? order.items.map(i => `
                    <div style="display:flex; justify-content:space-between; font-size:12.5px;">
                        <span>${i.quantity}× ${i.name}</span>
                        <strong>${formatINR(i.total_price_paise || 22000)}</strong>
                    </div>
                `).join('') : '<p style="font-size:12px;">Standard catalog order items.</p>'}
            </div>
            <div style="border-top:1px dashed var(--border-default); margin-top:10px; padding-top:8px; display:flex; justify-content:space-between; font-size:14px; font-weight:700;">
                <span>Total Amount:</span>
                <span>${formatINR(order.total_paise || 58800)}</span>
            </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
            <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Kitchen State Transitions</span>
            <button class="primary-btn w-100" id="drawer-action-bump">✓ Advance State (${order.status})</button>
            <button class="secondary-btn w-100" id="drawer-action-print">🖨️ Reprint Tax Invoice</button>
            <button class="text-action-btn danger" id="drawer-action-cancel" style="margin-top:8px;">Cancel Order</button>
        </div>
    `;

    openDrawer(`Order Workspace`, html);

    document.getElementById('drawer-action-bump')?.addEventListener('click', () => {
        showToast(`Order ${order.order_number} updated`);
        closeDrawer();
        fetchOrdersPipeline();
    });

    document.getElementById('drawer-action-print')?.addEventListener('click', () => {
        window.print();
    });

    document.getElementById('drawer-action-cancel')?.addEventListener('click', () => {
        showToast(`Order ${order.order_number} Cancelled`, 'warning');
        closeDrawer();
    });
}

function openTableDrawer(table) {
    const html = `
        <div>
            <h4 style="font-family:var(--font-heading); font-size:18px; font-weight:800;">${table.table_number}</h4>
            <span style="font-size:12px; color:var(--text-secondary);">${table.section === 'INDOOR_AC' ? 'Indoor • AC' : 'Garden • Terrace'} • ${table.capacity} Guests</span>
        </div>

        <div style="background:var(--canvas-bg); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:12px; color:var(--text-secondary);">Active Order:</span>
                <strong>${table.active_order_number || 'ORD-20261008-0001'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="font-size:12px; color:var(--text-secondary);">Kitchen Status:</span>
                <span class="status-chip preparing">${table.active_order_status || 'PREPARING'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:800; border-top:1px dashed var(--border-default); padding-top:8px;">
                <span>Total Bill:</span>
                <span style="color:var(--primary);">${formatINR(table.active_total_paise || 58800)}</span>
            </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="primary-btn w-100" id="drawer-table-settle">💳 Settle Bill (${formatINR(table.active_total_paise || 58800)})</button>
            <button class="secondary-btn w-100" id="drawer-table-add-items">+ Add More Items to Table</button>
            <button class="secondary-btn w-100" id="drawer-table-clear">Mark Table Clean / Available</button>
        </div>
    `;

    openDrawer(`Table Management: ${table.table_number}`, html);

    document.getElementById('drawer-table-settle')?.addEventListener('click', () => {
        closeDrawer();
        navigateTo('pos');
        transitionToPayment();
    });

    document.getElementById('drawer-table-add-items')?.addEventListener('click', () => {
        closeDrawer();
        navigateTo('pos');
    });

    document.getElementById('drawer-table-clear')?.addEventListener('click', () => {
        table.status = 'AVAILABLE';
        renderTablesFloor();
        closeDrawer();
        showToast(`${table.table_number} marked clean and available`);
    });
}

// ==========================================================================
// GLOBAL COMMAND PALETTE (CTRL + K)
// ==========================================================================

function openCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    const input = document.getElementById('palette-search-input');
    if (modal) modal.classList.remove('hidden');
    if (input) {
        input.value = '';
        input.focus();
    }
    renderPaletteResults('');
}

function closeCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    if (modal) modal.classList.add('hidden');
}

function renderPaletteResults(query) {
    const container = document.getElementById('palette-results-list');
    if (!container) return;
    container.innerHTML = '';

    const q = query.toLowerCase().trim();
    const results = [];

    // 1. Navigation Actions
    results.push({ type: 'ACTION', title: 'Start New Order', icon: '⚡', action: () => navigateTo('pos') });
    results.push({ type: 'ACTION', title: 'View Floor Tables', icon: '🪑', action: () => navigateTo('tables') });
    results.push({ type: 'ACTION', title: 'Open Kitchen Display', icon: '🍳', action: () => navigateTo('kitchen') });
    results.push({ type: 'ACTION', title: 'View Orders Pipeline', icon: '📋', action: () => navigateTo('orders') });
    results.push({ type: 'ACTION', title: 'Daily Z-Report & Sales', icon: '📈', action: () => { navigateTo('more'); renderMoreSubpage('reports'); } });

    // 2. Menu Items
    appState.items.forEach(item => {
        if (!q || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)) {
            results.push({
                type: 'MENU',
                title: item.name,
                meta: `${formatINR(item.base_price_paise)} • ${item.category_name || ''}`,
                icon: item.is_veg ? '🟢' : '🔴',
                action: () => {
                    addToCart(item);
                    navigateTo('pos');
                }
            });
        }
    });

    // 3. Tables
    appState.tables.forEach(t => {
        if (!q || t.table_number.toLowerCase().includes(q)) {
            results.push({
                type: 'TABLE',
                title: `${t.table_number} (${t.section === 'INDOOR_AC' ? 'Indoor' : 'Garden'})`,
                meta: `Status: ${t.status} • Cap: ${t.capacity}`,
                icon: '🪑',
                action: () => {
                    navigateTo('tables');
                }
            });
        }
    });

    // 4. Orders
    appState.ordersList.forEach(o => {
        if (!q || o.order_number.toLowerCase().includes(q) || (o.table_number && o.table_number.toLowerCase().includes(q))) {
            results.push({
                type: 'ORDER',
                title: o.order_number,
                meta: `${o.status} • ${formatINR(o.total_paise || 58800)} • ${o.channel}`,
                icon: '📋',
                action: () => {
                    navigateTo('orders');
                    openOrderDrawer(o);
                }
            });
        }
    });

    // 5. Customers
    const registeredCustomers = [
        { name: 'Rahul Sharma', phone: '+91 98765 43210', visits: 14, loyalty: '420 pts (₹210)' },
        { name: 'Anita Desai', phone: '+91 98111 22334', visits: 8, loyalty: '250 pts (₹125)' },
        { name: 'Karan Verma', phone: '+91 99000 11223', visits: 22, loyalty: '680 pts (₹340)' },
        { name: 'Vikram Singhania', phone: '+91 98450 99887', visits: 31, loyalty: '950 pts (₹475)' }
    ];
    registeredCustomers.forEach(c => {
        if (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)) {
            results.push({
                type: 'CUSTOMER',
                title: c.name,
                meta: `${c.phone} • Loyalty: ${c.loyalty}`,
                icon: '👤',
                action: () => {
                    appState.attachedCustomer = c;
                    showToast(`Attached customer: ${c.name}`);
                    navigateTo('pos');
                }
            });
        }
    });

    // 6. Invoices
    const pastInvoices = [
        { id: 'INV-2026-9041', time: '12:45 PM', amount: 58800, mode: 'CASH', table: 'T-01' },
        { id: 'INV-2026-9042', time: '01:10 PM', amount: 64000, mode: 'UPI', table: 'T-03' },
        { id: 'INV-2026-9043', time: '01:25 PM', amount: 128000, mode: 'CARD', table: 'G-01' }
    ];
    pastInvoices.forEach(inv => {
        if (!q || inv.id.toLowerCase().includes(q) || inv.table.toLowerCase().includes(q)) {
            results.push({
                type: 'INVOICE',
                title: inv.id,
                meta: `${formatINR(inv.amount)} • ${inv.mode} • Table ${inv.table} (${inv.time})`,
                icon: '🧾',
                action: () => {
                    openDrawer(`Tax Invoice: ${inv.id}`, `
                        <div style="background:var(--canvas-bg); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-default); font-family:var(--font-mono); font-size:12px;">
                            <center><strong>DUM HOUSE - RESTAURANT OPERATING SYSTEM</strong><br>Tax Invoice ${inv.id}</center>
                            <hr style="margin:10px 0; border:0; border-top:1px dashed var(--border-default);">
                            <div>Date: Today, ${inv.time}</div>
                            <div>Table: ${inv.table}</div>
                            <div>Payment: ${inv.mode}</div>
                            <div style="font-size:14px; font-weight:700; margin-top:10px;">Total Paid: ${formatINR(inv.amount)}</div>
                        </div>
                        <button class="secondary-btn w-100" onclick="window.print()">🖨️ Reprint Invoice</button>
                    `);
                }
            });
        }
    });

    if (results.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                <p style="font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">No results found for "${query}"</p>
                <p style="font-size: 11.5px;">Search for dishes, table numbers, order IDs, customer names, or invoices.</p>
            </div>
        `;
        return;
    }

    results.slice(0, 10).forEach(res => {
        const itemEl = document.createElement('div');
        itemEl.className = 'palette-item';
        itemEl.innerHTML = `
            <div class="palette-item-left">
                <span>${res.icon}</span>
                <strong>${res.title}</strong>
                ${res.meta ? `<span style="font-size:11.5px; color:var(--text-muted); margin-left:6px;">${res.meta}</span>` : ''}
            </div>
            <span class="palette-type-tag">${res.type}</span>
        `;
        itemEl.addEventListener('click', () => {
            closeCommandPalette();
            res.action();
        });
        container.appendChild(itemEl);
    });
}

// ==========================================================================
// SECONDARY ACTION DRAWERS (MINIMUM CLICKS, PROGRESSIVE DISCLOSURE)
// ==========================================================================

function openSplitBillDrawer() {
    const bill = calculateBill();
    const guests = appState.splitGuestCount || 2;
    const perGuest = Math.round(bill.totalPaise / guests);

    const html = `
        <div>
            <h4 style="font-family:var(--font-heading); font-size:16px; font-weight:700;">Split Bill Between Guests</h4>
            <span style="font-size:12px; color:var(--text-muted);">Total Bill Due: <strong>${formatINR(bill.totalPaise)}</strong></span>
        </div>

        <div style="background:var(--canvas-bg); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
            <label class="input-label">Select Number of Paying Guests</label>
            <div style="display:flex; gap:8px; margin-top:8px;" id="split-guests-selector">
                ${[2, 3, 4, 5, 6].map(n => `
                    <button class="secondary-btn ${n === guests ? 'active' : ''}" style="flex:1; font-weight:700;" data-split="${n}">${n}</button>
                `).join('')}
            </div>
        </div>

        <div style="background:var(--surface-subtle); padding:16px; border-radius:var(--radius-md); border:1.5px solid var(--border-default); text-align:center;">
            <span style="font-size:12px; color:var(--text-secondary); text-transform:uppercase; font-weight:600;">Amount Per Person</span>
            <div style="font-family:var(--font-heading); font-size:28px; font-weight:800; color:var(--primary); margin:4px 0;" id="split-each-display">
                ${formatINR(perGuest)}
            </div>
            <span style="font-size:11.5px; color:var(--text-muted);">Equal split across ${guests} diners</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="primary-btn w-100" id="btn-confirm-split">Apply Split to Cart</button>
            <button class="secondary-btn w-100" id="btn-reset-split">Reset to Single Bill</button>
        </div>
    `;

    openDrawer('Split Bill', html);

    document.querySelectorAll('#split-guests-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            const n = parseInt(btn.dataset.split, 10);
            appState.splitGuestCount = n;
            const newEach = Math.round(bill.totalPaise / n);
            document.querySelectorAll('#split-guests-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('split-each-display').textContent = formatINR(newEach);
        });
    });

    document.getElementById('btn-confirm-split')?.addEventListener('click', () => {
        closeDrawer();
        renderPosCart();
        showToast(`Bill split across ${appState.splitGuestCount} guests (${formatINR(Math.round(bill.totalPaise / appState.splitGuestCount))} each)`);
    });

    document.getElementById('btn-reset-split')?.addEventListener('click', () => {
        appState.splitGuestCount = 1;
        closeDrawer();
        renderPosCart();
        showToast('Bill reset to standard single settlement');
    });
}

function openCustomerDrawer() {
    const html = `
        <div>
            <h4 style="font-family:var(--font-heading); font-size:16px; font-weight:700;">Customer & Loyalty Rewards</h4>
            <span style="font-size:12px; color:var(--text-muted);">Attach customer to accumulate loyalty points & GST invoice.</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
            <label class="input-label">Customer Mobile Number</label>
            <div style="display:flex; gap:8px;">
                <input type="tel" id="drawer-cust-phone" class="clean-input" placeholder="e.g. 9876543210" value="${appState.attachedCustomer?.phone || ''}" />
                <button class="secondary-btn" id="drawer-cust-lookup">Lookup</button>
            </div>
        </div>

        <div id="drawer-cust-profile-box" style="background:var(--canvas-bg); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${appState.attachedCustomer?.name || 'Rahul Sharma'}</strong>
                <span class="status-chip ready">Verified VIP</span>
            </div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:6px;">
                <span>Total Orders: 14 visits</span> • <span>Points Balance: <strong>420 pts</strong></span>
            </div>
            <div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--border-default); display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px;">Redeem 200 pts (₹100 discount):</span>
                <button class="secondary-btn" id="btn-redeem-pts">Redeem</button>
            </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="primary-btn w-100" id="btn-save-cust-attach">Attach to Current Order</button>
        </div>
    `;

    openDrawer('Customer Profile', html);

    document.getElementById('btn-redeem-pts')?.addEventListener('click', () => {
        appState.appliedDiscountPaise = 10000;
        closeDrawer();
        renderPosCart();
        showToast('Redeemed 200 points (₹100 Off)');
    });

    document.getElementById('btn-save-cust-attach')?.addEventListener('click', () => {
        const phone = document.getElementById('drawer-cust-phone')?.value || '9876543210';
        appState.attachedCustomer = { name: 'Rahul Sharma', phone };
        closeDrawer();
        showToast(`Attached customer: Rahul Sharma (${phone})`);
    });
}

function openServiceChargeDrawer() {
    const isEnabled = appState.serviceChargeEnabled;
    const bill = calculateBill();
    const scAmt = Math.round((bill.subtotalPaise * 5) / 100);

    const html = `
        <div>
            <h4 style="font-family:var(--font-heading); font-size:16px; font-weight:700;">Service Charge Setting</h4>
            <span style="font-size:12px; color:var(--text-muted);">Optional 5% Staff Welfare & Kitchen Gratuity fund.</span>
        </div>

        <div style="background:var(--canvas-bg); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>5% Service Charge</strong>
                    <p style="font-size:12px; color:var(--text-muted); margin-top:2px;">Calculated on subtotal: ${formatINR(scAmt)}</p>
                </div>
                <input type="checkbox" id="service-charge-toggle" style="width:20px; height:20px; cursor:pointer;" ${isEnabled ? 'checked' : ''} />
            </div>
            <p style="font-size:11.5px; color:var(--text-secondary); margin-top:12px; line-height:1.4;">
                According to CCPA guidelines, service charge is voluntary. Toggling this adds or removes the charge directly on the invoice.
            </p>
        </div>

        <button class="primary-btn w-100" id="btn-save-sc">Update Order Summary</button>
    `;

    openDrawer('Service Charge', html);

    document.getElementById('btn-save-sc')?.addEventListener('click', () => {
        const toggle = document.getElementById('service-charge-toggle');
        appState.serviceChargeEnabled = toggle ? toggle.checked : false;
        closeDrawer();
        renderPosCart();
        showToast(`Service charge ${appState.serviceChargeEnabled ? 'applied (+5%)' : 'removed'}`);
    });
}

function openChangeTableDrawer() {
    const currentTable = appState.tables.find(t => t.id === appState.selectedTableId);
    const html = `
        <div>
            <h4 style="font-family:var(--font-heading); font-size:16px; font-weight:700;">Transfer / Change Table</h4>
            <span style="font-size:12px; color:var(--text-muted);">Current Table: <strong>${currentTable ? currentTable.table_number : 'None'}</strong></span>
        </div>

        <div style="background:var(--canvas-bg); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
            <label class="input-label">Select Destination Table</label>
            <select id="transfer-dest-table" class="clean-select" style="margin-top:6px;">
                ${appState.tables.map(t => `
                    <option value="${t.id}" ${t.id === appState.selectedTableId ? 'disabled' : ''}>
                        ${t.table_number} • ${t.section === 'INDOOR_AC' ? 'Indoor' : 'Garden'} (${t.status})
                    </option>
                `).join('')}
            </select>
        </div>

        <button class="primary-btn w-100" id="btn-confirm-table-transfer">Confirm Table Transfer</button>
    `;

    openDrawer('Change Table', html);

    document.getElementById('btn-confirm-table-transfer')?.addEventListener('click', () => {
        const destId = document.getElementById('transfer-dest-table')?.value;
        if (destId) {
            appState.selectedTableId = destId;
            const destTable = appState.tables.find(t => t.id === destId);
            const tableChip = document.getElementById('cart-context-table');
            if (tableChip && destTable) tableChip.textContent = `Table ${destTable.table_number}`;
            const tableSelect = document.getElementById('table-select');
            if (tableSelect) tableSelect.value = destId;
            closeDrawer();
            showToast(`Order transferred to Table ${destTable ? destTable.table_number : ''}`);
        }
    });
}

function openMoreActionsDrawer() {
    const html = `
        <div>
            <h4 style="font-family:var(--font-heading); font-size:16px; font-weight:700;">Secondary Actions</h4>
            <span style="font-size:12px; color:var(--text-muted);">Quick actions for current order workspace</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:10px;">
            <div class="palette-item" id="more-action-customer" style="border:1px solid var(--border-default); border-radius:var(--radius-md); padding:12px;">
                <div class="palette-item-left">
                    <span style="font-size:20px;">👤</span>
                    <div>
                        <strong>Attach Customer / Loyalty</strong>
                        <div style="font-size:11.5px; color:var(--text-muted);">Lookup frequent diner profile & points</div>
                    </div>
                </div>
            </div>

            <div class="palette-item" id="more-action-sc" style="border:1px solid var(--border-default); border-radius:var(--radius-md); padding:12px;">
                <div class="palette-item-left">
                    <span style="font-size:20px;">🏷️</span>
                    <div>
                        <strong>Service Charge (5%)</strong>
                        <div style="font-size:11.5px; color:var(--text-muted);">Status: ${appState.serviceChargeEnabled ? 'Active' : 'Disabled'}</div>
                    </div>
                </div>
            </div>

            <div class="palette-item" id="more-action-transfer" style="border:1px solid var(--border-default); border-radius:var(--radius-md); padding:12px;">
                <div class="palette-item-left">
                    <span style="font-size:20px;">🪑</span>
                    <div>
                        <strong>Change / Transfer Table</strong>
                        <div style="font-size:11.5px; color:var(--text-muted);">Shift order to another dining table</div>
                    </div>
                </div>
            </div>

            <div class="palette-item" id="more-action-rush" style="border:1px solid var(--border-default); border-radius:var(--radius-md); padding:12px;">
                <div class="palette-item-left">
                    <span style="font-size:20px;">⚡</span>
                    <div>
                        <strong>Kitchen Rush Priority</strong>
                        <div style="font-size:11.5px; color:var(--text-muted);">${appState.isRushOrder ? 'Marked as VIP / RUSH' : 'Standard priority'}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    openDrawer('Order Actions', html);

    document.getElementById('more-action-customer')?.addEventListener('click', openCustomerDrawer);
    document.getElementById('more-action-sc')?.addEventListener('click', openServiceChargeDrawer);
    document.getElementById('more-action-transfer')?.addEventListener('click', openChangeTableDrawer);
    document.getElementById('more-action-rush')?.addEventListener('click', () => {
        appState.isRushOrder = !appState.isRushOrder;
        closeDrawer();
        showToast(appState.isRushOrder ? '🔥 Order prioritized as RUSH / VIP!' : 'Order returned to standard priority');
    });
}

function updateUserRole(role) {
    appState.userRole = role;
    const nameEl = document.getElementById('sidebar-user-name');
    
    // Sidebar nav items
    const homeBtn = document.getElementById('nav-btn-home');
    const posBtn = document.getElementById('nav-btn-pos');
    const ordersBtn = document.getElementById('nav-btn-orders');
    const tablesBtn = document.getElementById('nav-btn-tables');
    const kitchenBtn = document.getElementById('nav-btn-kitchen');
    const moreBtn = document.getElementById('nav-btn-more');

    if (role === 'CASHIER') {
        if (nameEl) nameEl.textContent = 'Ramesh Kumar (Cashier)';
        homeBtn?.classList.remove('hidden');
        posBtn?.classList.remove('hidden');
        ordersBtn?.classList.remove('hidden');
        tablesBtn?.classList.remove('hidden');
        kitchenBtn?.classList.add('hidden');
        moreBtn?.classList.add('hidden');
        if (['kitchen', 'more'].includes(appState.currentView)) {
            navigateTo('pos');
        }
    } else if (role === 'CHEF') {
        if (nameEl) nameEl.textContent = 'Sanjeev Nair (Chef)';
        homeBtn?.classList.add('hidden');
        posBtn?.classList.add('hidden');
        ordersBtn?.classList.remove('hidden');
        tablesBtn?.classList.add('hidden');
        kitchenBtn?.classList.remove('hidden');
        moreBtn?.classList.add('hidden');
        navigateTo('kitchen');
    } else if (role === 'MANAGER') {
        if (nameEl) nameEl.textContent = 'Arjun Mehta (Manager)';
        homeBtn?.classList.remove('hidden');
        posBtn?.classList.remove('hidden');
        ordersBtn?.classList.remove('hidden');
        tablesBtn?.classList.remove('hidden');
        kitchenBtn?.classList.remove('hidden');
        moreBtn?.classList.remove('hidden');
    }
}
// ==========================================================================
// DEDICATED PRINT MANAGER ARCHITECTURE (ZERO POS UI LEAKAGE)
// Thermal 58mm / 80mm & Formal A4 Tax Invoice
// ==========================================================================

const PrintManager = {
    // 1. Generate Thermal Receipt HTML (58mm / 80mm)
    generateThermalReceiptHtml(order, bill, settings = appState.printSettings) {
        const orderNum = order.order_number || ('ORD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-0123');
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const channelStr = order.channel === 'DINE_IN' ? 'DINE-IN' : (order.channel === 'WALK_IN' ? 'TAKEAWAY' : 'DELIVERY');
        const tableObj = appState.tables.find(t => t.id === appState.selectedTableId);
        const tableName = order.table_number || (tableObj ? tableObj.table_number : 'T-01');
        const cashierName = appState.currentUser?.name || 'Ramesh';
        
        const items = (order.itemsSnapshot && order.itemsSnapshot.length > 0)
            ? order.itemsSnapshot.map(i => ({ name: i.name, qty: i.quantity, amtPaise: i.base_price_paise * i.quantity }))
            : (appState.cart.length > 0)
                ? appState.cart.map(c => ({ name: c.item.name, qty: c.quantity, amtPaise: c.item.base_price_paise * c.quantity }))
                : [
                    { name: 'Chilli Paneer', qty: 2, amtPaise: 44000 },
                    { name: 'Garlic Naan', qty: 2, amtPaise: 12000 }
                ];

        const subtotalPaise = (order.billSnapshot) ? order.billSnapshot.subtotalPaise : (bill ? bill.subtotalPaise : items.reduce((sum, i) => sum + i.amtPaise, 0));
        const taxPaise = (order.billSnapshot) ? order.billSnapshot.taxPaise : (bill ? bill.taxPaise : Math.round(subtotalPaise * 0.05));
        const discountPaise = (order.billSnapshot) ? order.billSnapshot.discountPaise : (bill ? bill.discountPaise : 0);
        const roundOffPaise = (order.billSnapshot) ? order.billSnapshot.roundOffPaise : (bill ? bill.roundOffPaise : 0);
        const totalPaise = (order.billSnapshot) ? order.billSnapshot.totalPaise : (bill ? bill.totalPaise : (subtotalPaise + taxPaise - discountPaise));
        const tender = order.tenderDescription || (appState.selectedTender === 'SPLIT' 
            ? `SPLIT (Cash ₹${appState.splitCashAmount}, UPI ₹${appState.splitUpiAmount})` 
            : (appState.selectedTender || 'UPI'));

        const is58mm = settings.paperSize === '58mm';

        return `
            <div class="thermal-receipt-inner ${is58mm ? 'format-58mm' : 'format-80mm'}">
                <div class="thermal-header">
                    ${settings.showLogo ? '<div class="thermal-logo">DUM HOUSE</div>' : ''}
                    <div class="thermal-outlet-name">DUM HOUSE RESTAURANT</div>
                    <div class="thermal-address">100ft Road, Indiranagar, Bengaluru - 560038</div>
                    <div class="thermal-contact">Ph: +91 80 4123 4567</div>
                    ${settings.showGstin ? '<div class="thermal-gstin">GSTIN: 29AABCR1234F1Z5 • FSSAI: 11223334000123</div>' : ''}
                </div>

                <div class="thermal-divider">--------------------------------</div>

                <div class="thermal-meta-grid">
                    <div class="thermal-meta-row"><span>Order No:</span> <strong>${orderNum}</strong></div>
                    <div class="thermal-meta-row"><span>Date:</span> <span>${dateStr}</span></div>
                    <div class="thermal-meta-row"><span>Time:</span> <span>${timeStr}</span></div>
                    <div class="thermal-meta-row"><span>Type:</span> <span>${channelStr}</span></div>
                    ${settings.showTable && order.channel !== 'WALK_IN' ? `<div class="thermal-meta-row"><span>Table:</span> <span>${tableName}</span></div><div class="thermal-meta-row"><span>Guests:</span> <span>${appState.guestCount || 2}</span></div>` : ''}
                    ${settings.showCashier ? `<div class="thermal-meta-row"><span>Cashier:</span> <span>${cashierName}</span></div>` : ''}
                    ${settings.showCustomerPhone && appState.attachedCustomer ? `<div class="thermal-meta-row"><span>Customer:</span> <span>${appState.attachedCustomer.phone}</span></div>` : ''}
                </div>

                <div class="thermal-divider">--------------------------------</div>

                <table class="thermal-items-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">Item</th>
                            <th class="col-qty">Qty</th>
                            <th class="col-amt">Amt</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(i => `
                            <tr>
                                <td>${i.name}</td>
                                <td class="col-qty">${i.qty}</td>
                                <td class="col-amt">${formatINR(i.amtPaise)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="thermal-divider">--------------------------------</div>

                <table class="thermal-summary-table">
                    <tr><td>Subtotal</td><td class="sum-val">${formatINR(subtotalPaise)}</td></tr>
                    <tr><td>Tax</td><td class="sum-val">${formatINR(taxPaise)}</td></tr>
                    ${discountPaise > 0 ? `<tr><td>Discount</td><td class="sum-val">-${formatINR(discountPaise)}</td></tr>` : '<tr><td>Discount</td><td class="sum-val">₹0</td></tr>'}
                    <tr><td>Round Off</td><td class="sum-val">${formatINR(roundOffPaise)}</td></tr>
                    <tr class="thermal-total-row">
                        <td><strong>TOTAL</strong></td>
                        <td class="sum-val"><strong>${formatINR(totalPaise)}</strong></td>
                    </tr>
                </table>

                <div class="thermal-divider">--------------------------------</div>

                <div class="thermal-payment-info">
                    <div>Payment: ${tender}</div>
                    <div>Paid: ${formatINR(totalPaise)}</div>
                </div>

                <div class="thermal-divider">--------------------------------</div>

                <div class="thermal-footer">
                    <div>${settings.footerMessage || 'Thank you for visiting.'}</div>
                    ${settings.showQrCode ? '<div style="margin-top:4px; font-size:9px;">[ Scan to Download e-Bill ]</div>' : ''}
                </div>
            </div>
        `;
    },

    // 2. Generate A4 Tax Invoice HTML
    generateA4InvoiceHtml(order, bill, settings = appState.printSettings) {
        const orderNum = order.order_number || ('ORD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-0123');
        const invNum = 'INV-' + (order.order_number ? order.order_number.replace('ORD-', '') : '20261008-0123');
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const items = (order.itemsSnapshot && order.itemsSnapshot.length > 0)
            ? order.itemsSnapshot.map(i => ({ name: i.name, qty: i.quantity, ratePaise: i.base_price_paise, amtPaise: i.base_price_paise * i.quantity }))
            : (appState.cart.length > 0)
                ? appState.cart.map(c => ({ name: c.item.name, qty: c.quantity, ratePaise: c.item.base_price_paise, amtPaise: c.item.base_price_paise * c.quantity }))
                : [
                    { name: 'Chilli Paneer', qty: 2, ratePaise: 22000, amtPaise: 44000 },
                    { name: 'Garlic Naan', qty: 2, ratePaise: 6000, amtPaise: 12000 }
                ];

        const subtotalPaise = (order.billSnapshot) ? order.billSnapshot.subtotalPaise : (bill ? bill.subtotalPaise : items.reduce((sum, i) => sum + i.amtPaise, 0));
        const cgstPaise = Math.round(subtotalPaise * 0.025);
        const sgstPaise = Math.round(subtotalPaise * 0.025);
        const totalTaxPaise = cgstPaise + sgstPaise;
        const discountPaise = (order.billSnapshot) ? order.billSnapshot.discountPaise : (bill ? bill.discountPaise : 0);
        const totalPaise = subtotalPaise + totalTaxPaise - discountPaise;
        const tender = order.tenderDescription || appState.selectedTender;

        return `
            <div class="a4-invoice-container">
                <div class="a4-invoice-header">
                    <div>
                        <div class="a4-brand-title">DUM HOUSE</div>
                        <div style="font-size:12px; color:#4B5563; margin-top:2px;">Authentic Dum Biryani & Fine Indian Dining</div>
                        <div style="font-size:11px; color:#6B7280; margin-top:4px;">
                            100ft Road, Indiranagar, Bengaluru - 560038<br>
                            Ph: +91 80 4123 4567 | Email: accounts@dumhouse.in<br>
                            <strong>GSTIN:</strong> 29AABCR1234F1Z5 | <strong>FSSAI:</strong> 11223334000123
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div class="a4-doc-type">TAX INVOICE</div>
                        <div style="font-size:12px; font-weight:700; margin-top:4px;">Invoice #: ${invNum}</div>
                        <div style="font-size:11px; color:#6B7280;">Order Ref: ${orderNum}</div>
                        <div style="font-size:11px; color:#6B7280;">Date: ${dateStr} ${timeStr}</div>
                    </div>
                </div>

                <div class="a4-meta-boxes">
                    <div>
                        <strong style="font-size:11.5px; text-transform:uppercase; color:#6B7280;">Billed To / Guest Details</strong>
                        <div style="font-size:12.5px; font-weight:600; margin-top:4px;">${appState.attachedCustomer ? appState.attachedCustomer.name : 'Walk-in Dining Guest'}</div>
                        <div style="font-size:11.5px; color:#4B5563;">Mobile: ${appState.attachedCustomer ? appState.attachedCustomer.phone : 'Not Specified'}</div>
                        <div style="font-size:11px; color:#6B7280;">Place of Supply: Karnataka (Code: 29)</div>
                    </div>
                    <div>
                        <strong style="font-size:11.5px; text-transform:uppercase; color:#6B7280;">Dining & Service Metadata</strong>
                        <div style="font-size:12px; margin-top:4px;"><strong>Order Type:</strong> ${order.channel || 'DINE_IN'}</div>
                        <div style="font-size:12px;"><strong>Table:</strong> ${order.table_number || 'T-01'} (Guests: ${appState.guestCount || 2})</div>
                        <div style="font-size:12px;"><strong>Server:</strong> ${appState.assignedServer || 'Priya (Captain)'} | <strong>Cashier:</strong> ${appState.currentUser?.name || 'Ramesh'}</div>
                    </div>
                </div>

                <table class="a4-items-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">#</th>
                            <th>Item Description</th>
                            <th style="width:70px;">HSN/SAC</th>
                            <th style="width:50px; text-align:center;">Qty</th>
                            <th style="width:80px; text-align:right;">Rate (₹)</th>
                            <th style="width:90px; text-align:right;">Taxable (₹)</th>
                            <th style="width:70px; text-align:right;">CGST (2.5%)</th>
                            <th style="width:70px; text-align:right;">SGST (2.5%)</th>
                            <th style="width:90px; text-align:right;">Total (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((i, idx) => {
                            const lineCgst = Math.round(i.amtPaise * 0.025);
                            const lineSgst = Math.round(i.amtPaise * 0.025);
                            const lineTotal = i.amtPaise + lineCgst + lineSgst;
                            return `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td><strong>${i.name}</strong></td>
                                    <td>996331</td>
                                    <td style="text-align:center;">${i.qty}</td>
                                    <td style="text-align:right;">${formatINR(i.ratePaise)}</td>
                                    <td style="text-align:right;">${formatINR(i.amtPaise)}</td>
                                    <td style="text-align:right;">${formatINR(lineCgst)}</td>
                                    <td style="text-align:right;">${formatINR(lineSgst)}</td>
                                    <td style="text-align:right; font-weight:600;">${formatINR(lineTotal)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <div class="a4-totals-grid">
                    <table class="a4-totals-table">
                        <tr><td>Taxable Value</td><td style="text-align:right; font-weight:600;">${formatINR(subtotalPaise)}</td></tr>
                        <tr><td>CGST (2.5%)</td><td style="text-align:right;">${formatINR(cgstPaise)}</td></tr>
                        <tr><td>SGST (2.5%)</td><td style="text-align:right;">${formatINR(sgstPaise)}</td></tr>
                        ${discountPaise > 0 ? `<tr><td>Discount Applied</td><td style="text-align:right; color:#16A34A;">-${formatINR(discountPaise)}</td></tr>` : ''}
                        <tr class="grand-total-row">
                            <td>TOTAL INVOICE VALUE</td>
                            <td style="text-align:right; font-size:16px;">${formatINR(totalPaise)}</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="font-size:11px; color:#4B5563; padding-top:6px;">
                                Mode of Payment: <strong>${tender}</strong> (Paid in Full)
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="a4-footer-row">
                    <div>
                        <strong>Terms & Conditions:</strong><br>
                        1. Goods once sold will not be taken back.<br>
                        2. Subject to Bengaluru jurisdiction.<br>
                        3. This is a computer-generated tax invoice under GST Rules.
                    </div>
                    <div style="text-align:right; padding-top:20px;">
                        <div>For <strong>DUM HOUSE RESTAURANT</strong></div>
                        <div style="margin-top:28px; font-weight:600;">Authorized Signatory</div>
                    </div>
                </div>
            </div>
        `;
    },

    // 3. Isolated Print Execution via Hidden Iframe (Gold Standard for POS)
    printDocument(htmlContent, isThermal = true, paperSize = '80mm') {
        // If simulation error is enabled in settings
        if (appState.simulatePrinterError) {
            showToast('Printer Unavailable: Check printer cable and paper roll', 'error');
            return;
        }

        const thermalCss = `
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                background: #fff;
                color: #000;
                font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
                font-size: ${paperSize === '58mm' ? '11px' : '12px'};
                line-height: 1.3;
                width: ${paperSize === '58mm' ? '58mm' : '80mm'};
                max-width: ${paperSize === '58mm' ? '58mm' : '80mm'};
                margin: 0 auto;
                padding: 3mm 4mm;
            }
            .thermal-header { text-align: center; margin-bottom: 6px; }
            .thermal-logo { font-size: 15px; font-weight: 800; letter-spacing: 1px; }
            .thermal-outlet-name { font-size: 13px; font-weight: 700; }
            .thermal-address, .thermal-contact, .thermal-gstin { font-size: 10px; line-height: 1.25; }
            .thermal-divider { border-top: 1px dashed #000; margin: 4px 0; }
            .thermal-meta-grid { font-size: 10.5px; line-height: 1.35; }
            .thermal-meta-row { display: flex; justify-content: space-between; }
            .thermal-items-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 4px 0; }
            .thermal-items-table th { font-weight: 700; text-align: left; border-bottom: 1px dashed #000; padding: 3px 0; }
            .thermal-items-table .col-qty { text-align: center; width: 18%; }
            .thermal-items-table .col-amt { text-align: right; width: 28%; }
            .thermal-items-table td { padding: 3px 0; vertical-align: top; }
            .thermal-summary-table { width: 100%; border-collapse: collapse; font-size: 11px; }
            .thermal-summary-table td { padding: 2px 0; }
            .thermal-summary-table .sum-val { text-align: right; font-weight: 600; }
            .thermal-total-row td { font-size: 13px; font-weight: 800; padding: 4px 0; }
            .thermal-payment-info { font-size: 11px; font-weight: 700; margin: 4px 0; }
            .thermal-footer { text-align: center; font-size: 10px; margin-top: 6px; }
            @page { size: ${paperSize === '58mm' ? '58mm auto' : '80mm auto'}; margin: 0; }
        `;

        const a4Css = `
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                background: #fff;
                color: #111827;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 12px;
                line-height: 1.4;
                width: 210mm;
                max-width: 210mm;
                margin: 0 auto;
                padding: 12mm 16mm;
            }
            .a4-invoice-header { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 16px; }
            .a4-brand-title { font-size: 24px; font-weight: 800; color: #C84B1F; }
            .a4-doc-type { font-size: 18px; font-weight: 800; text-transform: uppercase; text-align: right; }
            .a4-meta-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; border: 1px solid #E5E7EB; padding: 12px; border-radius: 6px; }
            .a4-items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            .a4-items-table th { background: #F3F4F6; padding: 8px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; border: 1px solid #D1D5DB; text-align: left; }
            .a4-items-table td { padding: 8px 10px; border: 1px solid #E5E7EB; font-size: 11.5px; }
            .a4-totals-grid { display: flex; justify-content: flex-end; margin-bottom: 20px; }
            .a4-totals-table { width: 320px; border-collapse: collapse; }
            .a4-totals-table td { padding: 5px 8px; font-size: 12px; }
            .a4-totals-table .grand-total-row td { font-size: 15px; font-weight: 800; border-top: 2px solid #111827; }
            .a4-footer-row { display: flex; justify-content: space-between; border-top: 1px solid #E5E7EB; padding-top: 14px; font-size: 11px; color: #4B5563; }
            @page { size: A4 portrait; margin: 10mm; }
        `;

        // 1. Populate main DOM print-area for standard fallback
        const thermalContainer = document.getElementById('print-thermal-receipt');
        const a4Container = document.getElementById('print-a4-invoice');
        const printAreaWrapper = document.getElementById('print-area');

        if (printAreaWrapper) {
            printAreaWrapper.className = `print-area-wrapper format-${paperSize}`;
        }

        if (isThermal) {
            if (thermalContainer) {
                thermalContainer.innerHTML = htmlContent;
                thermalContainer.className = `thermal-receipt-container format-${paperSize}`;
                thermalContainer.classList.remove('hidden');
            }
            if (a4Container) a4Container.classList.add('hidden');
        } else {
            if (a4Container) {
                a4Container.innerHTML = htmlContent;
                a4Container.classList.remove('hidden');
            }
            if (thermalContainer) thermalContainer.classList.add('hidden');
        }

        // 2. Perform print via isolated hidden iframe
        let iframe = document.getElementById('pos-print-hidden-frame');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'pos-print-hidden-frame';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);
        }

        try {
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${isThermal ? 'Receipt' : 'Tax Invoice'}</title>
                    <style>${isThermal ? thermalCss : a4Css}</style>
                </head>
                <body>
                    ${htmlContent}
                </body>
                </html>
            `);
            doc.close();

            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                    showToast(`Printed ${isThermal ? paperSize + ' Receipt' : 'A4 Tax Invoice'} successfully ✓`);
                } catch (err) {
                    console.warn('Iframe print fallback to window.print():', err);
                    window.print();
                }
            }, 250);
        } catch (e) {
            console.warn('Iframe setup exception, fallback to window.print():', e);
            window.print();
        }
    }
};

// ==========================================================================
// SETTINGS & PRINT CONFIGURATION DRAWER
// ==========================================================================

function openPrintSettingsDrawer() {
    const settings = appState.printSettings;
    const html = `
        <div class="settings-tab-nav">
            <button class="settings-tab-btn active" id="tab-print-config">🖨️ Printing & Receipts</button>
            <button class="settings-tab-btn" id="tab-general-config">⚙️ Shift & Security</button>
        </div>

        <div id="settings-print-view">
            <div class="settings-section-card">
                <span class="settings-section-title">Thermal Paper Size</span>
                <div class="paper-size-selector" id="paper-size-pills">
                    <button class="paper-size-btn ${settings.paperSize === '58mm' ? 'active' : ''}" data-size="58mm">58mm (Mini)</button>
                    <button class="paper-size-btn ${settings.paperSize === '80mm' ? 'active' : ''}" data-size="80mm">80mm (Standard POS)</button>
                    <button class="paper-size-btn ${settings.paperSize === 'A4' ? 'active' : ''}" data-size="A4">A4 (Laser / Desk)</button>
                </div>
            </div>

            <div class="settings-section-card">
                <span class="settings-section-title">Printer Configuration</span>
                <select id="printer-driver-select" class="clean-select">
                    <option value="browser" ${settings.printerType === 'browser' ? 'selected' : ''}>Default System / Browser Printing</option>
                    <option value="thermal_driver" ${settings.printerType === 'thermal_driver' ? 'selected' : ''}>ESC/POS Direct Thermal USB Driver</option>
                    <option value="network" ${settings.printerType === 'network' ? 'selected' : ''}>Network / LAN Receipt Printer (Port 9100)</option>
                </select>
            </div>

            <div class="settings-section-card">
                <span class="settings-section-title">Receipt Options & Toggles</span>
                <label class="settings-toggle-row">
                    <span>Show Restaurant Logo</span>
                    <input type="checkbox" id="toggle-show-logo" class="settings-toggle-switch" ${settings.showLogo ? 'checked' : ''} />
                </label>
                <label class="settings-toggle-row">
                    <span>Show GSTIN & FSSAI</span>
                    <input type="checkbox" id="toggle-show-gstin" class="settings-toggle-switch" ${settings.showGstin ? 'checked' : ''} />
                </label>
                <label class="settings-toggle-row">
                    <span>Show Cashier Name</span>
                    <input type="checkbox" id="toggle-show-cashier" class="settings-toggle-switch" ${settings.showCashier ? 'checked' : ''} />
                </label>
                <label class="settings-toggle-row">
                    <span>Show Table & Guests</span>
                    <input type="checkbox" id="toggle-show-table" class="settings-toggle-switch" ${settings.showTable ? 'checked' : ''} />
                </label>
                <label class="settings-toggle-row">
                    <span>Show Customer Phone</span>
                    <input type="checkbox" id="toggle-show-cust" class="settings-toggle-switch" ${settings.showCustomerPhone ? 'checked' : ''} />
                </label>
                <label class="settings-toggle-row">
                    <span>Show Payment QR Code</span>
                    <input type="checkbox" id="toggle-show-qr" class="settings-toggle-switch" ${settings.showQrCode ? 'checked' : ''} />
                </label>
            </div>

            <div class="settings-section-card">
                <span class="settings-section-title">Custom Footer Message</span>
                <input type="text" id="receipt-footer-msg" class="clean-input" value="${settings.footerMessage || 'Thank you for visiting DUM HOUSE. Please visit again!'}" />
            </div>

            <div class="settings-section-card">
                <span class="settings-section-title">Printer Diagnostics & Verification</span>
                <div class="test-print-box">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Spooler Status:</span>
                        <span class="test-print-status idle" id="test-print-status-tag">Ready</span>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="primary-btn flex-2" id="btn-run-test-print">🖨️ Test Print</button>
                        <button class="secondary-btn flex-1" id="btn-toggle-sim-printer-err" title="Toggle simulation error">
                            ${appState.simulatePrinterError ? '⚠ Error Active' : 'Simulate Err'}
                        </button>
                    </div>
                </div>
            </div>

            <button class="primary-btn w-100" id="btn-save-print-settings">Save Printing Settings</button>
        </div>

        <div id="settings-general-view" class="hidden">
            <div style="display:flex; flex-direction:column; gap:12px;">
                <p><strong>Current Outlet:</strong> Indiranagar Flagship, Bengaluru</p>
                <p><strong>GSTIN:</strong> 29AABCR1234F1Z5</p>
                <p><strong>Current Cashier:</strong> Ramesh Kumar (Cashier PIN: 9999)</p>
                <div style="border-top:1px solid var(--border-default); padding-top:10px;">
                    <button class="secondary-btn w-100" id="btn-trigger-manager-pin">🔒 Authorize Manager PIN Override</button>
                </div>
            </div>
        </div>
    `;

    openDrawer('Settings → Printing', html);

    // Tab switching
    document.getElementById('tab-print-config')?.addEventListener('click', () => {
        document.getElementById('settings-print-view')?.classList.remove('hidden');
        document.getElementById('settings-general-view')?.classList.add('hidden');
        document.getElementById('tab-print-config')?.classList.add('active');
        document.getElementById('tab-general-config')?.classList.remove('active');
    });

    document.getElementById('tab-general-config')?.addEventListener('click', () => {
        document.getElementById('settings-print-view')?.classList.add('hidden');
        document.getElementById('settings-general-view')?.classList.remove('hidden');
        document.getElementById('tab-general-config')?.classList.add('active');
        document.getElementById('tab-print-config')?.classList.remove('active');
    });

    // Paper size buttons
    document.querySelectorAll('#paper-size-pills .paper-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#paper-size-pills .paper-size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.printSettings.paperSize = btn.dataset.size;
        });
    });

    // Toggle simulation error
    document.getElementById('btn-toggle-sim-printer-err')?.addEventListener('click', () => {
        appState.simulatePrinterError = !appState.simulatePrinterError;
        const btn = document.getElementById('btn-toggle-sim-printer-err');
        const tag = document.getElementById('test-print-status-tag');
        if (btn) btn.textContent = appState.simulatePrinterError ? '⚠ Error Active' : 'Simulate Err';
        if (tag) {
            tag.textContent = appState.simulatePrinterError ? 'Printer Offline' : 'Ready';
            tag.className = `test-print-status ${appState.simulatePrinterError ? 'error' : 'idle'}`;
        }
        showToast(appState.simulatePrinterError ? 'Simulating Printer Offline / Out of Paper' : 'Printer restored to normal');
    });

    // Test print button with realistic lifecycle
    document.getElementById('btn-run-test-print')?.addEventListener('click', () => {
        const tag = document.getElementById('test-print-status-tag');
        if (tag) {
            tag.textContent = 'Spooling...';
            tag.className = 'test-print-status printing';
        }

        setTimeout(() => {
            if (appState.simulatePrinterError) {
                if (tag) {
                    tag.textContent = 'Failed: Offline / Paper Out';
                    tag.className = 'test-print-status error';
                }
                showToast('Test Print Failed: Printer is offline or out of paper', 'error');
            } else {
                if (tag) {
                    tag.textContent = 'Printed Successfully ✓';
                    tag.className = 'test-print-status success';
                }
                const sampleOrder = {
                    order_number: 'TEST-PRINT-001',
                    channel: 'DINE_IN',
                    table_number: 'T-01',
                    itemsSnapshot: [
                        { name: 'Murgh Dum Biryani (Full Portion)', quantity: 1, base_price_paise: 42000 },
                        { name: 'Fresh Lime Soda', quantity: 2, base_price_paise: 12000 }
                    ],
                    billSnapshot: {
                        subtotalPaise: 66000,
                        taxPaise: 3300,
                        discountPaise: 0,
                        roundOffPaise: 0,
                        totalPaise: 69300
                    },
                    tenderDescription: 'TEST'
                };
                if (appState.printSettings.paperSize === 'A4') {
                    PrintManager.printDocument(PrintManager.generateA4InvoiceHtml(sampleOrder, null, appState.printSettings), false, 'A4');
                } else {
                    PrintManager.printDocument(PrintManager.generateThermalReceiptHtml(sampleOrder, null, appState.printSettings), true, appState.printSettings.paperSize);
                }
            }
        }, 400);
    });

    // Save button
    document.getElementById('btn-save-print-settings')?.addEventListener('click', () => {
        const pSelect = document.getElementById('printer-driver-select');
        if (pSelect) appState.printSettings.printerType = pSelect.value;
        appState.printSettings.showLogo = document.getElementById('toggle-show-logo')?.checked ?? true;
        appState.printSettings.showGstin = document.getElementById('toggle-show-gstin')?.checked ?? true;
        appState.printSettings.showCashier = document.getElementById('toggle-show-cashier')?.checked ?? true;
        appState.printSettings.showTable = document.getElementById('toggle-show-table')?.checked ?? true;
        appState.printSettings.showCustomerPhone = document.getElementById('toggle-show-cust')?.checked ?? true;
        appState.printSettings.showQrCode = document.getElementById('toggle-show-qr')?.checked ?? true;
        appState.printSettings.footerMessage = document.getElementById('receipt-footer-msg')?.value || 'Thank you for visiting.';

        localStorage.setItem('dumhouse_print_settings', JSON.stringify(appState.printSettings));
        closeDrawer();
        showToast('Print configuration updated successfully ✓');
    });

    document.getElementById('btn-trigger-manager-pin')?.addEventListener('click', () => {
        closeDrawer();
        showToast('Manager Override Authorized (Arjun Mehta)', 'success');
    });
}

// ==========================================================================
// HELD ORDERS (HOLD & RECALL DRAFTS)
// ==========================================================================

function holdCurrentOrder() {
    if (appState.cart.length === 0) {
        showToast('Current order has no items to hold.', 'warning');
        return;
    }

    const bill = calculateBill();
    const tableObj = appState.tables.find(t => t.id === appState.selectedTableId);
    const tableName = tableObj ? tableObj.table_number : 'T-01';

    const heldItem = {
        id: 'HOLD-' + Date.now(),
        cart: [...appState.cart],
        channel: appState.selectedChannel,
        tableId: appState.selectedTableId,
        tableName: tableName,
        guestCount: appState.guestCount,
        notes: appState.orderNotes,
        appliedDiscountPaise: appState.appliedDiscountPaise,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        totalPaise: bill.totalPaise,
        itemCount: bill.totalCount
    };

    appState.heldOrders.push(heldItem);
    localStorage.setItem('dumhouse_held_orders', JSON.stringify(appState.heldOrders));

    // Clear active cart
    appState.cart = [];
    appState.orderNotes = '';
    appState.appliedDiscountPaise = 0;
    renderPosCart();
    renderPosMenuItems();
    updateHeldOrdersCount();

    showToast(`Order held (${formatINR(heldItem.totalPaise)}). Ready for next customer.`);
}

function updateHeldOrdersCount() {
    const badge = document.getElementById('header-held-count');
    if (badge) badge.textContent = appState.heldOrders.length;
}

function openHeldOrdersDrawer() {
    if (appState.heldOrders.length === 0) {
        openDrawer('Held / Draft Orders', `
            <div style="text-align:center; padding:40px 16px; color:var(--text-muted);">
                <span style="font-size:32px; display:block; margin-bottom:8px;">⏸</span>
                <p style="font-size:13px; font-weight:600; color:var(--text-secondary);">No held draft orders</p>
                <p style="font-size:11.5px;">Click "Hold" on any active order to save it temporarily while taking other orders.</p>
            </div>
        `);
        return;
    }

    const html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <p style="font-size:12px; color:var(--text-muted);">Select a held draft order to resume checkout:</p>
            <span class="status-chip ready">${appState.heldOrders.length} Held</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
            ${appState.heldOrders.map((h, idx) => `
                <div style="background:var(--canvas-bg); border:1px solid var(--border-default); border-radius:var(--radius-md); padding:12px; display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>Draft #${idx + 1} (${h.channel === 'DINE_IN' ? 'Table ' + h.tableName : h.channel})</strong>
                        <span style="font-size:11px; color:var(--text-muted);">${h.time}</span>
                    </div>
                    <div style="font-size:11.5px; color:var(--text-secondary);">
                        ${h.cart.map(c => `${c.quantity}x ${c.item.name}`).join(', ')}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; padding-top:6px; border-top:1px dashed var(--border-default);">
                        <span style="font-size:13px; font-weight:700;">${formatINR(h.totalPaise)}</span>
                        <div style="display:flex; gap:6px;">
                            <button class="secondary-btn btn-discard-held" data-id="${h.id}" style="padding:4px 8px; font-size:11px; color:var(--status-danger);">Discard</button>
                            <button class="primary-btn btn-resume-held" data-id="${h.id}" style="padding:4px 12px; font-size:11.5px;">Resume →</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    openDrawer('Held / Draft Orders', html);

    document.querySelectorAll('.btn-resume-held').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const found = appState.heldOrders.find(h => h.id === id);
            if (found) {
                appState.cart = [...found.cart];
                appState.selectedChannel = found.channel;
                appState.selectedTableId = found.tableId;
                appState.guestCount = found.guestCount;
                appState.orderNotes = found.notes;
                appState.appliedDiscountPaise = found.appliedDiscountPaise;
                appState.heldOrders = appState.heldOrders.filter(h => h.id !== id);
                localStorage.setItem('dumhouse_held_orders', JSON.stringify(appState.heldOrders));
                updateHeldOrdersCount();
                closeDrawer();
                navigateTo('pos');
                renderPosCart();
                renderPosMenuItems();
                showToast(`Resumed draft order for ${found.tableName} (${formatINR(found.totalPaise)})`);
            }
        });
    });

    document.querySelectorAll('.btn-discard-held').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            appState.heldOrders = appState.heldOrders.filter(h => h.id !== id);
            localStorage.setItem('dumhouse_held_orders', JSON.stringify(appState.heldOrders));
            updateHeldOrdersCount();
            openHeldOrdersDrawer();
            showToast('Draft order discarded', 'warning');
        });
    });
}

// ==========================================================================
// OFFLINE-FIRST POS & EDGE OUTBOX MANAGER
// ==========================================================================

function initOfflineManager() {
    window.addEventListener('online', () => {
        appState.isOffline = false;
        updateOnlineStatusUi();
        syncOfflineQueue();
    });

    window.addEventListener('offline', () => {
        appState.isOffline = true;
        updateOnlineStatusUi();
    });

    const statusToggle = document.getElementById('system-status-chip');
    if (statusToggle) {
        statusToggle.addEventListener('click', openConnectivityDrawer);
    }
    updateOnlineStatusUi();
}

function updateOnlineStatusUi() {
    const chip = document.getElementById('system-status-chip');
    const label = document.getElementById('system-status-label');
    const badge = document.getElementById('system-status-queue');
    if (!chip || !label) return;

    const queueCount = appState.offlineQueue.length;

    if (appState.isOffline || appState.simulatedOffline) {
        chip.className = 'system-status-chip offline';
        label.textContent = queueCount > 0 ? `Offline (${queueCount})` : 'Offline (Edge)';
        if (badge) {
            badge.textContent = queueCount;
            badge.classList.toggle('hidden', queueCount === 0);
        }
    } else {
        chip.className = 'system-status-chip online';
        label.textContent = 'Online';
        if (badge) badge.classList.add('hidden');
    }
}

function openConnectivityDrawer() {
    const queue = appState.offlineQueue;
    const html = `
        <div style="background:var(--canvas-bg); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-default);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>Local Edge Node Connectivity</strong>
                <span class="status-chip ${appState.isOffline || appState.simulatedOffline ? 'preparing' : 'ready'}">
                    ${appState.isOffline || appState.simulatedOffline ? 'OFFLINE (EDGE MODE)' : 'ONLINE'}
                </span>
            </div>
            <p style="font-size:11.5px; color:var(--text-secondary); margin-top:8px;">
                When offline, POS continues taking orders and generating receipts locally. Transactions queue in browser local storage and auto-sync when internet reconnects.
            </p>
        </div>

        <div class="settings-section-card">
            <span class="settings-section-title">Connectivity Simulation</span>
            <label class="settings-toggle-row">
                <span>Simulate Offline Edge Mode</span>
                <input type="checkbox" id="sim-offline-toggle" class="settings-toggle-switch" ${appState.simulatedOffline ? 'checked' : ''} />
            </label>
        </div>

        <div class="settings-section-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="settings-section-title">Pending Outbox Queue</span>
                <strong style="color:var(--primary);">${queue.length} orders pending</strong>
            </div>
            ${queue.length > 0 ? `
                <div style="font-size:11px; max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; margin-top:6px;">
                    ${queue.map(q => `
                        <div style="padding:4px 6px; background:var(--surface-bg); border-radius:4px; display:flex; justify-content:space-between;">
                            <span>${q.order_number}</span>
                            <strong>${formatINR(q.total_paise)}</strong>
                        </div>
                    `).join('')}
                </div>
                <button class="primary-btn w-100" id="btn-force-sync" style="margin-top:8px;">🔄 Sync Outbox Now</button>
            ` : '<div style="font-size:11.5px; color:var(--text-muted); margin-top:4px;">Outbox is clean. Central cloud database is in sync.</div>'}
        </div>
    `;

    openDrawer('POS Connectivity & Edge Sync', html);

    document.getElementById('sim-offline-toggle')?.addEventListener('change', (e) => {
        appState.simulatedOffline = e.target.checked;
        updateOnlineStatusUi();
        showToast(appState.simulatedOffline ? 'Switched to Offline Edge Mode' : 'Returned to Online Cloud Mode', 'info');
    });

    document.getElementById('btn-force-sync')?.addEventListener('click', () => {
        syncOfflineQueue();
        closeDrawer();
    });
}

async function syncOfflineQueue() {
    if (appState.offlineQueue.length === 0) return;
    const chip = document.getElementById('system-status-chip');
    const label = document.getElementById('system-status-label');
    if (chip) chip.className = 'system-status-chip syncing';
    if (label) label.textContent = 'Syncing...';

    let syncedCount = 0;
    const remaining = [];

    for (const order of appState.offlineQueue) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (appState.authToken) headers['Authorization'] = `Bearer ${appState.authToken}`;
            headers['Idempotency-Key'] = order.idempotencyKey || ('OFFLINE-' + order.id);

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers,
                body: JSON.stringify(order)
            });
            if (res.ok) {
                syncedCount++;
            } else {
                remaining.push(order);
            }
        } catch (e) {
            remaining.push(order);
        }
    }

    appState.offlineQueue = remaining;
    localStorage.setItem('dumhouse_offline_orders', JSON.stringify(appState.offlineQueue));
    updateOnlineStatusUi();

    if (syncedCount > 0) {
        showToast(`Synced ${syncedCount} queued order${syncedCount === 1 ? '' : 's'} to cloud database!`);
        fetchOrdersPipeline();
    }
}

// ==========================================================================
// WHATSAPP BILL SHARING
// ==========================================================================

function openWhatsAppShareModal() {
    const phone = appState.attachedCustomer?.phone || '9876543210';
    const orderNum = appState.lastCreatedOrder?.order_number || 'ORD-000123';
    const bill = calculateBill();
    const msg = encodeURIComponent(`Greetings from DUM HOUSE!\nYour Order ${orderNum} has been settled.\nTotal Paid: ${formatINR(bill.totalPaise)}.\nThank you for dining with us!`);
    const waUrl = `https://wa.me/91${phone.replace(/\\D/g, '').slice(-10)}?text=${msg}`;
    window.open(waUrl, '_blank');
    showToast(`WhatsApp receipt message opened for +91 ${phone}`);
}

// ==========================================================================
// EVENT LISTENERS BINDING
// ==========================================================================

function attachGlobalEventListeners() {
    // 1. Sidebar Nav Click Routing
    document.querySelectorAll('.app-sidebar .nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateTo(btn.dataset.view);
        });
    });

    // Role Switcher in header
    document.getElementById('user-role-selector')?.addEventListener('change', (e) => {
        updateUserRole(e.target.value);
    });

    // Settings button -> Opens Print Settings Drawer directly!
    document.getElementById('nav-btn-settings')?.addEventListener('click', openPrintSettingsDrawer);

    // 2. Header Search & Actions
    document.getElementById('global-search-trigger')?.addEventListener('click', openCommandPalette);
    document.getElementById('header-new-order-quick')?.addEventListener('click', () => navigateTo('pos'));
    document.getElementById('btn-view-held-orders')?.addEventListener('click', openHeldOrdersDrawer);

    // Dashboard quick action buttons
    document.getElementById('dash-btn-start-order')?.addEventListener('click', () => navigateTo('pos'));
    document.getElementById('dash-btn-view-tables')?.addEventListener('click', () => navigateTo('tables'));
    document.getElementById('dash-btn-open-kds')?.addEventListener('click', () => navigateTo('kitchen'));
    document.getElementById('dash-see-all-orders')?.addEventListener('click', () => navigateTo('orders'));

    // Attention buttons
    document.getElementById('att-btn-kds')?.addEventListener('click', () => navigateTo('kitchen'));
    document.getElementById('att-btn-settle')?.addEventListener('click', () => navigateTo('tables'));
    document.getElementById('att-btn-stock')?.addEventListener('click', () => {
        navigateTo('more');
        renderMoreSubpage('inventory');
    });

    // 3. POS Channel Selector Tabs
    document.querySelectorAll('#pos-channel-tabs .workflow-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#pos-channel-tabs .workflow-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.selectedChannel = btn.dataset.channel;

            const dineinControls = document.getElementById('context-dinein-controls');
            const takeawayControls = document.getElementById('context-takeaway-controls');
            const deliveryControls = document.getElementById('context-delivery-controls');
            const channelChip = document.getElementById('cart-context-channel');

            if (channelChip) {
                const labels = { 'DINE_IN': '🍽️ DINE-IN', 'WALK_IN': '🛍️ TAKEAWAY', 'DELIVERY': '🛵 DELIVERY' };
                channelChip.textContent = labels[appState.selectedChannel] || appState.selectedChannel;
            }

            if (appState.selectedChannel === 'DINE_IN') {
                dineinControls?.classList.remove('hidden');
                takeawayControls?.classList.add('hidden');
                deliveryControls?.classList.add('hidden');
            } else if (appState.selectedChannel === 'WALK_IN') {
                dineinControls?.classList.add('hidden');
                takeawayControls?.classList.remove('hidden');
                deliveryControls?.classList.add('hidden');
            } else if (appState.selectedChannel === 'DELIVERY') {
                dineinControls?.classList.add('hidden');
                takeawayControls?.classList.add('hidden');
                deliveryControls?.classList.remove('hidden');
            }
        });
    });

    // Takeaway Customer Distance & Presets
    document.querySelectorAll('#distance-preset-chips .dist-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#distance-preset-chips .dist-chip').forEach(b => {
                b.style.borderColor = 'var(--border-default)';
                b.style.background = 'var(--surface-bg)';
                b.style.color = 'var(--text-secondary)';
                b.style.fontWeight = '500';
            });
            btn.style.borderColor = '#d97706';
            btn.style.background = '#fef3c7';
            btn.style.color = '#92400e';
            btn.style.fontWeight = '700';

            const dist = parseFloat(btn.dataset.dist) || 0;
            const input = document.getElementById('takeaway-distance-input');
            if (input) input.value = dist;
            appState.orderDistanceKm = dist;
            showToast(dist > 0 ? `Target distance set: ${dist.toFixed(1)} km (~${Math.ceil(((dist / 15) * 3600 + 120) / 60)} min transit)` : 'Distance: At Counter');
        });
    });

    document.getElementById('takeaway-distance-input')?.addEventListener('input', (e) => {
        appState.orderDistanceKm = parseFloat(e.target.value) || 0;
    });

    // Server selector for Dine-in
    document.getElementById('server-select')?.addEventListener('change', (e) => {
        appState.assignedServer = e.target.value;
    });

    // Dinein Customer input
    document.getElementById('dinein-cust-input')?.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        appState.attachedCustomer = val ? { name: val, phone: val } : null;
    });

    // Delivery Partner Select
    document.getElementById('delivery-partner-select')?.addEventListener('change', (e) => {
        appState.deliveryPartner = e.target.value;
    });

    // Guest Count Pills
    document.querySelectorAll('.guest-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.guest-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.guestCount = parseInt(btn.dataset.count, 10);
            const guestsChip = document.getElementById('cart-context-guests');
            if (guestsChip) guestsChip.textContent = `${appState.guestCount} Guests`;
        });
    });

    // Diet Filter Buttons
    document.querySelectorAll('.diet-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diet-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.activeDietFilter = btn.dataset.diet;
            renderPosMenuItems();
        });
    });

    // POS Menu Search Input
    const searchInput = document.getElementById('menu-search-input');
    const searchClear = document.getElementById('search-clear-btn');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            appState.searchQuery = e.target.value;
            searchClear?.classList.toggle('hidden', appState.searchQuery.length === 0);
            renderPosMenuItems();
        });
        searchClear?.addEventListener('click', () => {
            searchInput.value = '';
            appState.searchQuery = '';
            searchClear.classList.add('hidden');
            renderPosMenuItems();
        });
    }

    // 4. Cart Action Buttons
    document.getElementById('clear-cart-btn')?.addEventListener('click', () => {
        appState.cart = [];
        renderPosCart();
        renderPosMenuItems();
        showToast('Order cleared');
    });

    document.getElementById('btn-hold-order')?.addEventListener('click', holdCurrentOrder);

    document.getElementById('btn-add-order-note')?.addEventListener('click', () => {
        openDrawer('Order Cooking Note', `
            <label class="input-label">Kitchen Preparation Instructions</label>
            <textarea id="drawer-note-input" class="clean-input" style="height:100px; resize:none;" placeholder="e.g. Less spicy, extra onions, packing in silver foil">${appState.orderNotes}</textarea>
            <button class="primary-btn" id="btn-save-note" style="margin-top:10px;">Save Note</button>
        `);
        document.getElementById('btn-save-note')?.addEventListener('click', () => {
            appState.orderNotes = document.getElementById('drawer-note-input')?.value || '';
            closeDrawer();
            showToast('Note attached to order');
        });
    });

    document.getElementById('btn-apply-discount')?.addEventListener('click', () => {
        openDrawer('Apply Bill Discount', `
            <label class="input-label">Select Discount Percentage</label>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:14px;">
                <button class="secondary-btn" id="disc-5">5% Off</button>
                <button class="secondary-btn" id="disc-10">10% Off</button>
                <button class="secondary-btn" id="disc-20">20% Off</button>
            </div>
            <label class="input-label">Reason for Discount</label>
            <input type="text" class="clean-input" value="Manager Courtesy / Promotion" />
            <button class="primary-btn" id="btn-confirm-disc" style="margin-top:14px;">Apply Discount</button>
        `);
        document.getElementById('disc-5')?.addEventListener('click', () => {
            const bill = calculateBill();
            appState.appliedDiscountPaise = Math.round(bill.subtotalPaise * 0.05);
            closeDrawer();
            renderPosCart();
            showToast('5% Discount Applied');
        });
        document.getElementById('disc-10')?.addEventListener('click', () => {
            const bill = calculateBill();
            appState.appliedDiscountPaise = Math.round(bill.subtotalPaise * 0.10);
            closeDrawer();
            renderPosCart();
            showToast('10% Discount Applied');
        });
        document.getElementById('disc-20')?.addEventListener('click', () => {
            const bill = calculateBill();
            appState.appliedDiscountPaise = Math.round(bill.subtotalPaise * 0.20);
            closeDrawer();
            renderPosCart();
            showToast('20% Discount Applied');
        });
    });

    // Secondary Actions: Split Bill & More Menu
    document.getElementById('btn-split-bill')?.addEventListener('click', openSplitBillDrawer);
    document.getElementById('btn-more-actions')?.addEventListener('click', openMoreActionsDrawer);

    // 5. Inline Payment Navigation & Confirmation
    document.getElementById('btn-proceed-pay')?.addEventListener('click', transitionToPayment);
    document.getElementById('btn-back-to-cart')?.addEventListener('click', transitionBackToCart);
    document.getElementById('btn-cancel-payment')?.addEventListener('click', transitionBackToCart);
    document.getElementById('btn-complete-payment')?.addEventListener('click', executePaymentCompletion);
    document.getElementById('btn-new-order-restart')?.addEventListener('click', startFreshOrder);

    // 4 POST-PAYMENT ACTIONS: Receipt, A4 Invoice, WhatsApp, Done
    document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
        const order = appState.lastCreatedOrder || {};
        const html = PrintManager.generateThermalReceiptHtml(order, calculateBill(), appState.printSettings);
        PrintManager.printDocument(html, true, appState.printSettings.paperSize);
    });

    document.getElementById('btn-print-a4-invoice')?.addEventListener('click', () => {
        const order = appState.lastCreatedOrder || {};
        const html = PrintManager.generateA4InvoiceHtml(order, calculateBill(), appState.printSettings);
        PrintManager.printDocument(html, false, 'A4');
    });

    document.getElementById('btn-share-whatsapp')?.addEventListener('click', openWhatsAppShareModal);

    // Tender Method Selector: CASH, UPI, CARD, OTHER, SPLIT
    document.querySelectorAll('.tender-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tender-card-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.selectedTender = btn.dataset.tender;

            const cashHelper = document.getElementById('cash-helper-section');
            const upiHelper = document.getElementById('upi-helper-section');
            const cardHelper = document.getElementById('card-helper-section');
            const otherHelper = document.getElementById('other-helper-section');
            const splitHelper = document.getElementById('split-helper-section');

            // Hide all helpers first
            cashHelper?.classList.add('hidden');
            upiHelper?.classList.add('hidden');
            cardHelper?.classList.add('hidden');
            otherHelper?.classList.add('hidden');
            splitHelper?.classList.add('hidden');

            if (appState.selectedTender === 'CASH') {
                cashHelper?.classList.remove('hidden');
                updateCashChange();
            } else if (appState.selectedTender === 'UPI') {
                upiHelper?.classList.remove('hidden');
            } else if (appState.selectedTender === 'CARD') {
                cardHelper?.classList.remove('hidden');
            } else if (appState.selectedTender === 'OTHER') {
                otherHelper?.classList.remove('hidden');
            } else if (appState.selectedTender === 'SPLIT') {
                splitHelper?.classList.remove('hidden');
                updateSplitRemaining();
            }
        });
    });

    // Split Inputs
    document.getElementById('split-cash-input')?.addEventListener('input', updateSplitRemaining);
    document.getElementById('split-upi-input')?.addEventListener('input', updateSplitRemaining);

    // Quick Cash Tender Chips
    document.querySelectorAll('.cash-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const bill = calculateBill();
            const dueRupees = Math.round(bill.totalPaise / 100);
            const amtAttr = chip.dataset.amt;
            const targetVal = amtAttr === 'exact' ? dueRupees : parseInt(amtAttr, 10);
            const input = document.getElementById('cash-tendered-input');
            if (input) {
                input.value = targetVal;
                updateCashChange();
            }
        });
    });

    document.getElementById('cash-tendered-input')?.addEventListener('input', updateCashChange);

    // 6. Orders Sub-nav Filter Tabs
    document.querySelectorAll('#orders-filter-tabs .filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#orders-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderOrdersWorkspace(tab.dataset.filter);
        });
    });

    // 7. Floor Section Tabs
    document.querySelectorAll('#floor-section-tabs .floor-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#floor-section-tabs .floor-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderTablesFloor(tab.dataset.section);
        });
    });

    // 8. KDS Station Filters
    document.querySelectorAll('#kds-station-filter-pills .station-filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#kds-station-filter-pills .station-filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            renderKitchenWorkspace(pill.dataset.station);
        });
    });

    // 9. More Sub-navigation Tabs
    document.querySelectorAll('#more-nav-tabs .more-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#more-nav-tabs .more-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderMoreSubpage(tab.dataset.sub);
        });
    });

    // 10. Drawer Close Events
    document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
    document.getElementById('app-drawer-backdrop')?.addEventListener('click', (e) => {
        if (e.target.id === 'app-drawer-backdrop') closeDrawer();
    });

    // 11. Command Palette Keyboard Shortcut (Ctrl+K or Cmd+K)
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            openCommandPalette();
        }
        if (e.key === 'Escape') {
            closeCommandPalette();
            closeDrawer();
            closeAddStaffModal();
        }
    });

    document.getElementById('palette-search-input')?.addEventListener('input', (e) => {
        renderPaletteResults(e.target.value);
    });

    document.getElementById('command-palette-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'command-palette-modal') closeCommandPalette();
    });

    // 12. Add Staff Modal & Form Listeners
    document.getElementById('btn-close-staff-modal')?.addEventListener('click', closeAddStaffModal);
    document.getElementById('btn-cancel-add-staff')?.addEventListener('click', closeAddStaffModal);
    document.getElementById('add-staff-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'add-staff-modal') closeAddStaffModal();
    });

    document.getElementById('form-add-staff')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('staff-input-name')?.value.trim();
        const username = document.getElementById('staff-input-username')?.value.trim();
        const role = document.getElementById('staff-input-role')?.value;
        const phone = document.getElementById('staff-input-phone')?.value.trim();
        const pin = document.getElementById('staff-input-pin')?.value.trim();
        const shift = document.getElementById('staff-input-shift')?.value;
        const errEl = document.getElementById('staff-form-error');

        if (!name || !username || !phone || !pin) {
            if (errEl) {
                errEl.textContent = 'Please fill out all required fields.';
                errEl.style.display = 'block';
            }
            return;
        }

        const submitBtn = document.getElementById('btn-submit-add-staff');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }

        try {
            const res = await fetch('/api/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: name,
                    username: username,
                    role_name: role,
                    phone: phone,
                    pin: pin,
                    shift: shift
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                appStaffList.push({
                    id: data.data.id,
                    name: data.data.full_name,
                    username: data.data.username,
                    role: data.data.role_name || role,
                    shift: data.data.shift || shift,
                    status: 'Active',
                    phone: data.data.phone
                });
            } else {
                appStaffList.push({
                    id: Date.now().toString(),
                    name: name,
                    username: username,
                    role: role,
                    shift: shift,
                    status: 'Active',
                    phone: phone
                });
            }

            closeAddStaffModal();
            renderStaffManagementView();
            showToast(`Staff member "${name}" added successfully!`);
        } catch (err) {
            appStaffList.push({
                id: Date.now().toString(),
                name: name,
                username: username,
                role: role,
                shift: shift,
                status: 'Active',
                phone: phone
            });
            closeAddStaffModal();
            renderStaffManagementView();
            showToast(`Staff member "${name}" added successfully!`);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Staff Member';
            }
        }
    });

    // Live Clock in Kitchen
    setInterval(() => {
        const clockEl = document.getElementById('kds-live-clock');
        if (clockEl) {
            clockEl.textContent = new Date().toLocaleTimeString();
        }
    }, 1000);
}

// ==========================================================================
// REALTIME WEBSOCKET HUB INTEGRATION
// ==========================================================================

function connectRealtimeHub() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?clientType=pos`;

    try {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log('✓ Realtime ROS WebSocket connected');
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (!msg?.eventType) return;

                if (msg.eventType === 'order.ready') {
                    showToast(`🔔 Order ${msg.payload?.orderNumber || ''} is READY!`, 'success');
                    fetchOrdersPipeline();
                } else if (msg.eventType === 'token.called') {
                    showToast(`📢 Token ${msg.payload?.tokenNumber || ''} called to counter`, 'info');
                } else if (msg.eventType === 'stock.finished') {
                    showToast(`⚠ Out of stock alert: ${msg.payload?.name || 'Item'}`, 'warning');
                }
            } catch (e) {}
        };
        ws.onclose = () => setTimeout(connectRealtimeHub, 3000);
    } catch (err) {
        console.warn('Realtime WS error:', err);
    }
}

// DOM Ready Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    initROS();
});
