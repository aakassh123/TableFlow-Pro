-- Migration 001: Extensions and Shared Types
-- Database: PostgreSQL 14+ compatible

-- Enable standard UUID generation and cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Table status
CREATE TYPE table_status_enum AS ENUM (
    'AVAILABLE',
    'OCCUPIED',
    'RESERVED',
    'BILLED',
    'CLEANING',
    'OUT_OF_SERVICE'
);

-- Order types
CREATE TYPE order_type_enum AS ENUM (
    'DINE_IN',
    'TAKEAWAY',
    'DIRECT_DELIVERY',
    'AGGREGATOR'
);

-- Order channels
CREATE TYPE order_channel_enum AS ENUM (
    'WALK_IN',
    'DINE_IN',
    'QR',
    'WEBSITE',
    'WHATSAPP',
    'DELIVERY'
);

-- Order statuses (Strict State Machine)
CREATE TYPE order_status_enum AS ENUM (
    'PENDING_PAYMENT',
    'PLACED',
    'ACCEPTED',
    'PREPARING',
    'READY',
    'SERVED',
    'COLLECTED',
    'HANDED_TO_RIDER',
    'DELIVERED',
    'EXPIRED',
    'REJECTED',
    'CANCELLED',
    'CANCELLED_WITH_WASTE',
    'DRAFT',
    'CONFIRMED',
    'IN_PREPARATION',
    'BILLED',
    'SETTLED',
    'CLOSED'
);

-- Order item statuses
CREATE TYPE order_item_status_enum AS ENUM (
    'PENDING',
    'SENT_TO_KITCHEN',
    'PREPARING',
    'READY',
    'SERVED',
    'VOIDED'
);

-- Recipe version statuses
CREATE TYPE recipe_version_status_enum AS ENUM (
    'DRAFT',
    'ACTIVE',
    'DEPRECATED'
);

-- Stock ledger entry types
CREATE TYPE stock_ledger_entry_type_enum AS ENUM (
    'OPENING',
    'PURCHASE_GRN',
    'CONSUME',
    'RELEASE',
    'ADJUSTMENT_INCREASE',
    'ADJUSTMENT_DECREASE',
    'WASTE'
);

-- Stock reservation statuses
CREATE TYPE reservation_status_enum AS ENUM (
    'PENDING',
    'CONSUMED',
    'RELEASED',
    'EXPIRED'
);

-- Kitchen ticket statuses
CREATE TYPE kitchen_ticket_status_enum AS ENUM (
    'QUEUED',
    'IN_PROGRESS',
    'READY',
    'SERVED',
    'RECALLED',
    'CANCELLED'
);

-- Token statuses
CREATE TYPE token_status_enum AS ENUM (
    'ISSUED',
    'CALLED',
    'COLLECTED',
    'CANCELLED'
);

-- Payment statuses
CREATE TYPE payment_status_enum AS ENUM (
    'PENDING',
    'PARTIALLY_PAID',
    'PAID',
    'REFUNDED',
    'FAILED'
);

-- Payment transaction methods
CREATE TYPE payment_method_enum AS ENUM (
    'CASH',
    'UPI',
    'CARD',
    'WALLET',
    'SPLIT'
);

-- Payment transaction statuses
CREATE TYPE transaction_status_enum AS ENUM (
    'INITIATED',
    'SUCCESS',
    'FAILED',
    'REFUNDED'
);

-- Purchase order statuses
CREATE TYPE po_status_enum AS ENUM (
    'DRAFT',
    'ISSUED',
    'PARTIALLY_RECEIVED',
    'COMPLETED',
    'CANCELLED'
);

-- Unit measurement categories
CREATE TYPE unit_category_enum AS ENUM (
    'MASS',
    'VOLUME',
    'COUNT'
);

-- Notification channels
CREATE TYPE notification_channel_enum AS ENUM (
    'WHATSAPP',
    'SMS',
    'PUSH',
    'EMAIL'
);

-- Outbox status
CREATE TYPE outbox_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'PUBLISHED',
    'FAILED'
);
