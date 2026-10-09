// Explicit Permission Constants and Sensitive Action Catalog

export const PERMISSIONS = {
    // Orders
    ORDERS_READ: 'orders.read',
    ORDERS_CREATE: 'orders.create',
    ORDERS_CANCEL: 'orders.cancel',       // Sensitive: requires manager override
    ORDERS_MODIFY: 'orders.modify',
    ORDERS_REFUND: 'orders.refund',       // Sensitive: requires manager override
    ORDERS_DISCOUNT: 'orders.discount',   // Sensitive: requires manager override

    // Menu
    MENU_READ: 'menu.read',
    MENU_WRITE: 'menu.write',

    // Recipes
    RECIPES_READ: 'recipes.read',
    RECIPES_WRITE: 'recipes.write',

    // Inventory
    INVENTORY_READ: 'inventory.read',
    INVENTORY_ADJUST: 'inventory.adjust', // Sensitive: requires manager override
    INVENTORY_WASTE: 'inventory.waste',

    // Kitchen / KDS
    KITCHEN_READ: 'kitchen.read',
    KITCHEN_BUMP: 'kitchen.bump',
    KITCHEN_HOLD: 'kitchen.hold',
    KITCHEN_RECALL: 'kitchen.recall',

    // Payments
    PAYMENTS_READ: 'payments.read',
    PAYMENTS_REFUND: 'payments.refund',   // Sensitive: requires manager override

    // Reports
    REPORTS_READ: 'reports.read',

    // Delivery
    DELIVERY_READ: 'delivery.read',
    DELIVERY_ASSIGN: 'delivery.assign',

    // Settings
    SETTINGS_MANAGE: 'settings.manage'
};

export const ALL_PERMISSIONS_LIST = Object.values(PERMISSIONS);

/**
 * Sensitive operations that require a Manager PIN Override token if performed by non-managers
 */
export const SENSITIVE_ACTIONS = new Set([
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.ORDERS_DISCOUNT,
    PERMISSIONS.PAYMENTS_REFUND,
    PERMISSIONS.INVENTORY_ADJUST
]);

/**
 * Roles hierarchy
 */
export const ROLES = {
    OWNER: 'OWNER',
    MANAGER: 'MANAGER',
    CASHIER: 'CASHIER',
    WAITER: 'WAITER',
    CHEF: 'CHEF',
    RIDER: 'RIDER'
};
