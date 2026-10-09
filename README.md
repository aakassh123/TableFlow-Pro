# TableFlow Pro - Enterprise Restaurant Operating Platform (ROP)

[![Live Demo](https://img.shields.io/badge/Demo-Live%20on%20Vercel-success?style=for-the-badge&logo=vercel)](https://table-flow-pro.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?style=for-the-badge&logo=node.js)](package.json)

> **🚀 Live Public Demo:** [https://table-flow-pro.vercel.app](https://table-flow-pro.vercel.app)  
> *No login required — open to anyone for immediate review and testing.*

High-throughput, ACID-compliant Restaurant Operating System featuring real-time KOT/KDS routing, offline-first edge sync, recipe-driven inventory ledger, dynamic ETA scheduling, staff & shift access management, and contactless QR ordering.

---


## 1. Schema Modules & Tables (46 Domain Tables)

### A. Core Multi-Tenancy & Access Control
- `restaurants`: Entity profile, Legal name, GSTIN (15-char), FSSAI license (14-digit), PAN.
- `outlets`: Physical restaurant branch (address, phone, currency INR, timezone `Asia/Kolkata`).
- `roles`: RBAC roles (`Store Manager`, `Head Chef`, `Cashier`, `Captain / Waiter`).
- `permissions`: Fine-grained actions (`order:create`, `order:item_void`, `order:settle`, etc.).
- `role_permissions`: Role-to-permission mapping.
- `users`: Staff credentials (Argon2id password hashes, 4-digit PIN hashes for POS switch).
- `user_roles`: User-to-role associations.
- `tables`: Dining floor layout (`table_number`, section `INDOOR_AC`/`GARDEN_TERRACE`, capacity, status).
- `customers`: Guest profiles with phone number uniqueness, loyalty notes, and B2B GSTIN.

### B. Catalog & Menu
- `categories`: Menu classifications (`Starters`, `Dum Biryanis`, `Main Course`, `Breads`, `Beverages`).
- `menu_items`: Food and drink items with Indian GST rate (5.00% composite F&B rate), HSN/SAC code `996331`, base price in integer paise.
- `menu_item_variants`: Portions and sizes (`Half`, `Full`, `Boneless`) with SKU and paise pricing.
- `modifiers`: Option groups (`Flavour Choice`, `Spice Level`, `Add-ons`).
- `modifier_options`: Selection options with incremental price delta in paise.
- `menu_item_modifiers`: Join table between items and modifiers.

### C. Ingredients, Recipes & Bill of Materials (BOM)
- `units`: Standard physical units with base conversion (`GRAM`, `MILLILITRE`, `PIECE`, `KILOGRAM`, `LITRE`).
- `suppliers`: Vendor records with GSTIN, address, and contact details.
- `ingredients`: Raw food commodities with cost per base unit in paise and reorder levels.
- `recipes`: Master recipe mapping to menu items and variants.
- `recipe_versions`: Immutable recipe iterations with status (`DRAFT`, `ACTIVE`, `DEPRECATED`), yield factor, and activation timestamp.
- `recipe_items`: BOM composition specifying gross quantity in base units (`g`, `ml`, `pcs`) and wastage percentage.
- `recipe_modifiers`: Ingredient quantity overrides for specific modifier choices.

### D. Inventory & Append-Only Stock Ledger
- `stock_items`: Outlet-level stock balance per ingredient in base units with average unit cost in paise.
- `stock_batches`: FIFO/Lot tracking with batch number, initial/current quantities, and expiration dates.
- `stock_reservations`: Temporary holds placed on stock when an order is created.
- `stock_ledger`: **Strict append-only financial ledger** tracking all movements (`OPENING`, `PURCHASE_GRN`, `CONSUME`, `RELEASE`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, `WASTE`).
- `stock_adjustments`: Manager-approved physical inventory count adjustments.
- `waste_entries`: Mandatory waste logging with non-empty reason.

### E. Orders & Kitchen Display System (KDS)
- `orders`: Central order record with strict status state machine, monetary amounts in integer paise, idempotency key, and round-off in paise.
- `order_items`: Order line items with reference to frozen `recipe_version_id` snapshot.
- `order_item_modifiers`: Customer customization choices per line item.
- `order_status_history`: Historical transition timeline with `(order_id, status)` uniqueness.
- `order_events`: Operational event log (`ITEM_ADDED`, `ITEM_VOIDED`, `DISCOUNT_APPLIED`, `KOT_PRINTED`).
- `kitchen_stations`: Prep station partitions (`TANDOOR`, `CURRY`, `BEVERAGE`, `EXPO`).
- `station_items`: Item-to-station routing.
- `kitchen_tickets`: KOT tickets dispatched to stations with bump timestamps.
- `kitchen_ticket_items`: Line items grouped on individual KOT tickets.

### F. Tokens, Payments & Purchasing
- `tokens`: Digital tokens for takeaway / QSR calling buzzer.
- `payments`: Tax invoice records with total, paid, balance, and tip amounts in integer paise.
- `payment_transactions`: Tenders (`CASH`, `UPI`, `CARD`, `WALLET`) with gateway references and terminal IDs.
- `purchase_orders`: Supplier purchase orders with line items in base units and paise.
- `purchase_order_items`: Line items on purchase orders.
- `goods_receipts`: Goods Receipt Note (GRN) capturing physical vendor delivery into stock.

### G. Notifications, Auditing, Idempotency & Outbox
- `notifications`: Multi-channel communication records (`WHATSAPP`, `SMS`, `PUSH`, `EMAIL`).
- `notification_deliveries`: Delivery attempts, provider IDs, and error logging.
- `audit_logs`: Central immutable audit trail capturing user, action, table, old values, new values.
- `idempotency_keys`: Prevents duplicate payment or order submissions.
- `outbox_events`: Transactional outbox for guaranteed event publishing.

---

## 2. Invariants & Guarantees

| Invariant | Enforcement Mechanism |
| :--- | :--- |
| **1. Stock cannot become negative** | `CHECK (current_balance_base_units >= 0)` on `stock_items` & `CHECK (current_quantity_base_units >= 0)` on `stock_batches`, backed by ledger validation trigger `fn_process_stock_ledger_entry`. |
| **2. Ledger is append-only** | Trigger `trg_prevent_stock_ledger_mutation` blocks any `UPDATE` or `DELETE` on `stock_ledger`. |
| **3. Every consume must reference a reservation** | `CHECK (entry_type != 'CONSUME' OR reservation_id IS NOT NULL)` on `stock_ledger`. |
| **4. Every release must reference a reservation** | `CHECK (entry_type != 'RELEASE' OR reservation_id IS NOT NULL)` on `stock_ledger`. |
| **5. Every waste entry must have a reason** | `CHECK (length(trim(reason)) > 0)` on `waste_entries`. |
| **6. Recipe versions cannot modify historical orders** | `order_items` stores frozen `recipe_version_id`. Trigger `trg_prevent_recipe_item_modification` locks `recipe_items` and `recipe_modifiers` once version status $\ne$ `'DRAFT'`. |
| **7. Order status transitions must be validated** | Trigger `trg_validate_order_status_transition` validates state machine: `DRAFT` $\rightarrow$ `CONFIRMED` $\rightarrow$ `IN_PREPARATION` $\rightarrow$ `READY` $\rightarrow$ `SERVED` $\rightarrow$ `BILLED` $\rightarrow$ `SETTLED` $\rightarrow$ `CLOSED` (or `CANCELLED`). |
| **8. Idempotency keys prevent duplicate orders** | Unique index `uq_orders_outlet_idempotency` and `uq_idempotency_outlet_key`. |
| **9. (order_id, status) prevents duplicate status events** | Unique constraint `uq_order_status_history` on `(order_id, status)`. |
| **10. Monetary values never use floating point** | All monetary amounts stored as `BIGINT` in paise (1 INR = 100 paise) with `CHECK (amount >= 0)`. |
| **11. Quantities use base units** | Physical quantities stored in `NUMERIC(14, 4)` in base units (`GRAM`, `MILLILITRE`, `PIECE`). |
| **12. Important mutations are auditable** | Automated triggers on `orders`, `payments`, `stock_adjustments`, `waste_entries` logging before/after state to `audit_logs`. |

---

## 4. Authentication, RBAC & Security Architecture

### Role-Based Access Control (RBAC) Matrix
The platform implements 6 distinct staff roles mapped to 23 granular permissions:

| Permission | Category | Sensitive (Manager PIN)? | OWNER | MANAGER | CASHIER | WAITER | CHEF | RIDER |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `orders.read` | Orders | No | X | X | X | X | | X |
| `orders.create` | Orders | No | X | X | X | X | | |
| `orders.modify` | Orders | No | X | X | X | X | | |
| `orders.cancel` | Orders | **YES** | X | X | *(Override)* | *(Override)* | | |
| `orders.refund` | Orders | **YES** | X | X | *(Override)* | | | |
| `orders.discount` | Orders | **YES** | X | X | *(Override)* | | | |
| `menu.read` | Menu | No | X | X | X | X | X | |
| `menu.write` | Menu | No | X | X | | | | |
| `recipes.read` | Recipes | No | X | X | | | X | |
| `recipes.write` | Recipes | No | X | X | | | | |
| `inventory.read` | Inventory | No | X | X | | | X | |
| `inventory.adjust` | Inventory | **YES** | X | X | | | *(Override)* | |
| `inventory.waste` | Inventory | No | X | X | | | X | |
| `kitchen.read` | Kitchen | No | X | X | | | X | |
| `kitchen.bump` | Kitchen | No | X | X | | | X | |
| `kitchen.hold` | Kitchen | No | X | X | | | X | |
| `kitchen.recall` | Kitchen | No | X | X | | | X | |
| `payments.read` | Payments | No | X | X | X | | | |
| `payments.refund` | Payments | **YES** | X | X | *(Override)* | | | |
| `reports.read` | Reports | No | X | X | X | | | |
| `delivery.read` | Delivery | No | X | X | | | | X |
| `delivery.assign` | Delivery | No | X | X | | | | |
| `settings.manage` | Settings | No | X | X | | | | |

### Core Security Guarantees
1. **Never Rely on Frontend Route Protection**: Every backend HTTP endpoint enforces authentication and backend permissions using `requirePermission(code)`. Requests without the required permission fail immediately with `403 Forbidden`.
2. **Password & PIN Hashing**: All passwords and POS 4-digit staff PINs are hashed using `bcrypt` (work factor 10) with salt rounds.
3. **Session Management & Refresh Token Family Rotation**:
   - Short-lived Access Tokens (15 minutes).
   - Long-lived Refresh Tokens (7 days) tied to a cryptographically generated `family_id`.
   - **Theft / Replay Detection**: Submitting an already-revoked refresh token revokes the entire token family immediately, terminates all concurrent sessions for that user, and emits a high-priority alert to `audit_logs`.
4. **Manager PIN Override Protocol**:
   - Non-manager staff (Cashiers, Waiters) attempting sensitive actions (`orders.discount`, `orders.cancel`, `orders.refund`, `inventory.adjust`, `payments.refund`) must request an authorization token via `POST /api/auth/manager-override`.
   - The manager enters their 4-digit PIN. The system validates the PIN against `pin_hash` and issues an ephemeral, cryptographically signed `manager_override_token` valid for 120 seconds and strictly scoped to that action.
   - The subsequent request includes `X-Manager-Override-Token: <token>`.
5. **Audit Trail for Every Privileged Action**:
   - Every login, manager override grant, discount, cancellation, and inventory modification writes directly to `audit_logs` capturing actor `user_id`, authorizing manager `manager_id`, action name, entity ID, metadata payload, IP address, and timestamp.

---

## 5. Inventory Engine Architecture

### Core Rule: The Ledger is the Single Source of Truth
Stock quantity is **never directly edited as an independent scalar value**. All inventory state changes flow through the immutable, append-only `stock_ledger` table with strict row-level locking.

### Inventory Lifecycle Operations

```
                   +-----------------------------------------------+
                   |           RECEIVE GOODS (PURCHASE GRN)        |
                   | * Ingests physical raw ingredients            |
                   | * Creates FIFO stock_batches                  |
                   | * Computes weighted average unit cost         |
                   | * Appends PURCHASE_GRN entry to stock_ledger  |
                   +-----------------------+-----------------------+
                                           |
                                           v
                   +-----------------------------------------------+
                   |            RESERVE STOCK (Order Placed)       |
                   | * Atomic conditional lock (SELECT FOR UPDATE) |
                   | * Increases reserved_quantity_base_units      |
                   | * Decreases available_stock                   |
                   | * Creates stock_reservations record (PENDING) |
                   +-----------------------+-----------------------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
                    v (Kitchen Cooks Item)                        v (Order Cancelled/Voided)
    +--------------------------------+           +--------------------------------+
    |     CONSUME RESERVED STOCK     |           |       RELEASE RESERVATION      |
    | * Decrements on_hand & reserved|           | * Decrements reserved_quantity |
    | * Deducts FIFO batch balance   |           | * Restores available stock     |
    | * Marks reservation CONSUMED   |           | * Marks reservation RELEASED   |
    | * Appends CONSUME delta to     |           | * Appends RELEASE entry to     |
    |   immutable stock_ledger       |           |   immutable stock_ledger       |
    +--------------------------------+           +--------------------------------+
```

### Concurrency Guarantees & Race Condition Defenses
1. **Serialized Row-Level Locking**: `SELECT ... FROM stock_items WHERE id = $1 FOR UPDATE` serializes concurrent transactions on the exact ingredient row.
2. **Atomic CAS Update Predicate**:
   ```sql
   UPDATE stock_items
   SET reserved_quantity_base_units = reserved_quantity_base_units + $1,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $2
     AND outlet_id = $3
     AND (current_balance_base_units - reserved_quantity_base_units) >= $1
   RETURNING id, current_balance_base_units, reserved_quantity_base_units;
   ```
   If remaining available stock is insufficient, the update matches 0 rows and immediately throws `InsufficientStockError`.
3. **Dual Invariant Guarantees**:
   - `available_stock < 0` is mathematically prevented (`current_balance - reserved >= 0`).
   - `reserved_stock > on_hand` is strictly prevented by the database constraint `chk_stock_available_non_negative`.
   - `CONSUME without RESERVE` is rejected with `ReservationNotFoundError` / `InvalidReservationStateError`.
   - `RELEASE without RESERVE` is rejected with `ReservationNotFoundError`.
   - `WASTE without valid reason` is rejected with `ValidationError` and checked via `length(trim(reason)) > 0`.

---

## 6. Order Service & Strict Server-Side State Machine

### Supported Channels
- `WALK_IN`: Over-the-counter walk-in ordering (allocates Takeaway Token, fulfilled via `collectOrder`).
- `DINE_IN`: Table-side dining order with table allocation (fulfilled via `serveOrder`).
- `QR`: Table or counter self-ordering with upfront UPI/Card payment integration (fulfilled via `serveOrder`).
- `WEBSITE`: Direct online takeaway order (fulfilled via `collectOrder`).
- `WHATSAPP`: Conversational commerce order (fulfilled via `collectOrder`).
- `DELIVERY`: Direct or aggregator delivery dispatch (dispatched via `handToRider`, fulfilled via `deliverOrder`).

### Strict Server-Side State Machine

```
Pending Payment (UPI / Online Gateway)
      ↓
    Placed
      ↓
   Accepted
      ↓
  Preparing (Kitchen KOT in progress)
      ↓
    Ready (Pass / Expediter)
      ↓
 ┌────────────────┬─────────────────────┬──────────────────┐
 │                │                     │                  │
 ▼                ▼                     ▼                  ▼
Served        Collected           Handed to Rider      Delivered
(Dine-In/QR)  (Walk-In/Web/WA)    (Delivery Rider)     (Delivery Fulfilled)

Terminal Failure / Cancellation States:
- Expired: Unpaid orders timing out from PENDING_PAYMENT (releases stock holds)
- Rejected: Rejected by kitchen at PLACED (releases stock holds)
- Cancelled: Pre-cooking cancellation at PLACED or ACCEPTED (releases stock holds, no waste)
- Cancelled + Waste: Post-cooking cancellation at PREPARING, READY, HANDED_TO_RIDER (consumes stock reservations, logs waste_entries)
```

### Allowed Transitions Table

| Current Status | Allowed Target Statuses | Trigger / Method | Channel Rules / Actions |
| :--- | :--- | :--- | :--- |
| `PENDING_PAYMENT` | `PLACED`, `EXPIRED`, `CANCELLED` | Webhook / `expireOrder` / `cancelOrder` | Transitions to `PLACED` on payment capture or releases reservations on timeout |
| `PLACED` | `ACCEPTED`, `REJECTED`, `CANCELLED` | `acceptOrder`, `rejectOrder`, `cancelOrder` | Rejection or pre-cook cancellation releases inventory hold |
| `ACCEPTED` | `PREPARING`, `CANCELLED` | `startPreparing`, `cancelOrder` | Kitchen starts preparation or pre-cook cancellation |
| `PREPARING` | `READY`, `CANCELLED_WITH_WASTE` | `markReady`, `cancelOrder` | Cancellation consumes reservations and logs `waste_entries` with reasons |
| `READY` | `SERVED`, `COLLECTED`, `HANDED_TO_RIDER`, `CANCELLED_WITH_WASTE` | `serveOrder`, `collectOrder`, `handToRider`, `cancelOrder` | `SERVED` (Dine-In/QR), `COLLECTED` (Walk-In/Web/WA), `HANDED_TO_RIDER` (Delivery) |
| `HANDED_TO_RIDER` | `DELIVERED`, `CANCELLED_WITH_WASTE` | `deliverOrder`, `cancelOrder` | Delivery fulfillment consumes stock reservations |
| Terminal States | None (Strictly Immutable) | — | All outbound mutations rejected with `InvalidOrderTransitionError` (409) |

### Single ACID Transaction Order Creation Boundary
Order creation is executed entirely inside one database transaction:
1. **Idempotency validation**: Queries `orders` and `idempotency_keys`. If previously processed, replays original order immediately.
2. **Order creation**: Inserts `orders` row with calculated subtotals, GST, and channel code.
3. **Order item creation**: Inserts `order_items` line items with variants and quantities.
4. **Recipe snapshot**: Resolves and locks active BOM `recipe_version_id` onto each line item.
5. **Stock reservation**: Calls `InventoryService.reserveStock` inside the transaction for all ingredients (using gross quantity with wastage calculations). Insufficient stock immediately rolls back the entire transaction.
6. **Token allocation**: Generates atomic sequential token number for the outlet.
7. **Outbox event creation**: Appends `ORDER_CREATED` event into `outbox_events`.

*Either everything succeeds or everything rolls back. Zero external API calls inside this transaction.*

---

## 7. Running Tests & Migrations

```bash
# Run database invariant tests (12/12)
npm test

# Run authentication, RBAC, and manager PIN test suite (21/21)
npm run test:auth

# Run inventory engine & concurrent race condition test suite (16/16)
npm run test:inventory

# Run order service & state machine test suite (40/40)
npm run test:orders

# Run all test suites combined (89/89 tests passing, 100% success)
npm run test:all

# Apply migrations to live PostgreSQL
export DATABASE_URL="postgresql://user:password@localhost:5432/restaurant_db"
npm run migrate
```



