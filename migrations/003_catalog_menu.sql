-- Migration 003: Catalog and Menu Schema

-- ============================================================================
-- 1. CATEGORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_categories_outlet_name UNIQUE (outlet_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_outlet_active ON categories(outlet_id, is_active, display_order);

-- ============================================================================
-- 2. MENU ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_veg BOOLEAN NOT NULL DEFAULT true,
    is_beverage BOOLEAN NOT NULL DEFAULT false,
    base_price_paise BIGINT NOT NULL CHECK (base_price_paise >= 0), -- Stored in paise (1 INR = 100 paise)
    gst_rate_percentage NUMERIC(5, 2) NOT NULL DEFAULT 5.00 CHECK (gst_rate_percentage >= 0),
    hsn_sac_code VARCHAR(10) DEFAULT '996331', -- GST HSN/SAC code for restaurant food services
    is_available BOOLEAN NOT NULL DEFAULT true, -- 86-list toggle
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT NOT NULL DEFAULT 0,
    prep_time_seconds INT NOT NULL DEFAULT 600,
    historical_prep_time_seconds INT NOT NULL DEFAULT 600,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_menu_items_outlet_code UNIQUE (outlet_id, code)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_outlet_cat ON menu_items(outlet_id, category_id, is_active);

-- ============================================================================
-- 3. MENU ITEM VARIANTS (e.g. Regular / Large, Half / Full)
-- ============================================================================

CREATE TABLE IF NOT EXISTS menu_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g. 'Half', 'Full', 'Boneless'
    sku VARCHAR(100) NOT NULL UNIQUE,
    price_paise BIGINT NOT NULL CHECK (price_paise >= 0), -- Total price in paise for this variant
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_menu_item_variants_item_name UNIQUE (menu_item_id, name)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item ON menu_item_variants(menu_item_id, is_active);

-- ============================================================================
-- 4. MODIFIERS & MODIFIER OPTIONS (e.g. Spice Level, Extra Cheese)
-- ============================================================================

CREATE TABLE IF NOT EXISTS modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL, -- e.g. 'Spice Level', 'Cheese Options'
    is_mandatory BOOLEAN NOT NULL DEFAULT false,
    min_selections INT NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections INT NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_modifiers_outlet_name UNIQUE (outlet_id, name)
);

CREATE TABLE IF NOT EXISTS modifier_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_id UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g. 'Mild', 'Medium', 'Extra Hot', 'Extra Cheese'
    price_delta_paise BIGINT NOT NULL DEFAULT 0 CHECK (price_delta_paise >= 0), -- Additional charge in paise
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_modifier_options_mod_name UNIQUE (modifier_id, name)
);

CREATE INDEX IF NOT EXISTS idx_modifier_options_mod ON modifier_options(modifier_id, is_active);

-- Association between Menu Items and applicable Modifiers
CREATE TABLE IF NOT EXISTS menu_item_modifiers (
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    modifier_id UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (menu_item_id, modifier_id)
);
