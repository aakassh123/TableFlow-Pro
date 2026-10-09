-- Migration 004: Units, Suppliers, Ingredients, and Recipes (BOM)

-- ============================================================================
-- 1. UNITS OF MEASURE
-- Base units: MASS -> GRAM, VOLUME -> MILLILITRE, COUNT -> PIECE
-- ============================================================================

CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE, -- 'GRAM', 'MILLILITRE', 'PIECE', 'KILOGRAM', 'LITRE'
    name VARCHAR(50) NOT NULL,
    category unit_category_enum NOT NULL, -- MASS, VOLUME, COUNT
    is_base_unit BOOLEAN NOT NULL DEFAULT false,
    conversion_to_base NUMERIC(14, 6) NOT NULL CHECK (conversion_to_base > 0), -- e.g. 1 KILOGRAM = 1000 GRAM
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. SUPPLIERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    gstin VARCHAR(15),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_suppliers_outlet_name UNIQUE (outlet_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_outlet ON suppliers(outlet_id, is_active);

-- ============================================================================
-- 3. INGREDIENTS (Raw Materials)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    base_unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    cost_per_base_unit_paise BIGINT NOT NULL DEFAULT 0 CHECK (cost_per_base_unit_paise >= 0),
    reorder_level_base_units NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (reorder_level_base_units >= 0),
    default_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ingredients_outlet_code UNIQUE (outlet_id, code)
);

CREATE INDEX IF NOT EXISTS idx_ingredients_outlet_active ON ingredients(outlet_id, is_active);

-- ============================================================================
-- 4. RECIPES & RECIPE VERSIONS (Bill of Materials)
-- Invariant 6: Recipe versions cannot modify historical orders. Once ACTIVE or DEPRECATED,
-- the version and its items are immutable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES menu_item_variants(id) ON DELETE CASCADE, -- Optional: recipe can be for specific variant
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recipes_item_variant UNIQUE (menu_item_id, variant_id)
);

CREATE TABLE IF NOT EXISTS recipe_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    version_number INT NOT NULL CHECK (version_number > 0),
    status recipe_version_status_enum NOT NULL DEFAULT 'DRAFT',
    yield_quantity NUMERIC(10, 4) NOT NULL DEFAULT 1.0 CHECK (yield_quantity > 0),
    notes TEXT,
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recipe_versions_recipe_version UNIQUE (recipe_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_status ON recipe_versions(recipe_id, status);

CREATE TABLE IF NOT EXISTS recipe_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_version_id UUID NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity_base_units NUMERIC(14, 4) NOT NULL CHECK (quantity_base_units > 0), -- Stored in base units (g, ml, pcs)
    wastage_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (wastage_percentage >= 0 AND wastage_percentage < 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recipe_items_version_ingredient UNIQUE (recipe_version_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_version ON recipe_items(recipe_version_id);

-- Recipe modifier ingredient overrides/additions
CREATE TABLE IF NOT EXISTS recipe_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_version_id UUID NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
    modifier_option_id UUID NOT NULL REFERENCES modifier_options(id) ON DELETE RESTRICT,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity_delta_base_units NUMERIC(14, 4) NOT NULL CHECK (quantity_delta_base_units != 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recipe_modifiers_opt_ing UNIQUE (recipe_version_id, modifier_option_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_modifiers_version ON recipe_modifiers(recipe_version_id);
