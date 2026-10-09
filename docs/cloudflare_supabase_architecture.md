# Production Infrastructure Architecture: Cloudflare + Supabase (PostgreSQL)

> **Document Reference**: Architectural Blueprint per `DOC-20261007-WA0006`  
> **Target Topology**: Cloudflare Edge Security & CDN + Next.js + Backend API + Supabase (PostgreSQL ACID) + Redis

---

## 1. System Topology Overview

```
                           ┌───────────────────────────┐
                           │        CLOUDFLARE         │
                           │      DNS / CDN / WAF      │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │     Next.js Frontend      │
                           │  (PWA, POS, KDS Displays) │
                           └─────────────┬─────────────┘
                                         │
                                         ▼
                           ┌───────────────────────────┐
                           │        Backend API        │
                           │   Express / Node Runtime  │
                           └─────────────┬─────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
            ┌───────────────────────────┐  ┌───────────────────────────┐
            │        Supabase DB        │  │           Redis           │
            │   PostgreSQL (ACID Core)  │  │  (Pub/Sub, Station Cache) │
            └────────────┬──────────────┘  └───────────────────────────┘
                         │
                         ▼
            ┌───────────────────────────┐
            │       Storage / R2        │
            │ (Invoices, Menu Media)    │
            └───────────────────────────┘
```

---

## 2. Core Architectural Principle: The Transactional Boundary

> [!CAUTION]
> **CRITICAL RULE**: Never place core order creation, stock reservation, or financial ledger logic directly inside stateless edge functions (e.g. Cloudflare Workers).  
> Edge functions operate globally distributed without native cross-region ACID coordination, creating severe risks of split-brain inventory depletion, overselling, and ghost transactions.

### Role Partitioning & Responsibilities

| Responsibility Layer | Technology | Primary Tasks | Why This Technology? |
| :--- | :--- | :--- | :--- |
| **Edge Security & Routing** | **Cloudflare** | DNS, Anycast CDN, WAF, DDoS Shield, Edge Routing, SSL | Sub-millisecond TTFB, global asset caching, rate-limiting table QR requests. |
| **Asset Storage** | **Cloudflare R2** | Dish imagery, Tax Invoices (PDF), Audit exports | Zero-egress fee object storage, S3-compatible API. |
| **Client Interface** | **Next.js** | POS Terminal, KDS Tablet, Customer Table PWA, Dashboard | Modern React streaming, responsive touch UI, service worker PWA offline resilience. |
| **High-Speed Cache** | **Redis** | KDS queue load caches, Rolling Median ETA buffers, WebSocket pub/sub | In-memory microsecond reads; decouples high-frequency polling from DB. |
| **Transactional Core** | **Supabase (PostgreSQL)** | Orders, Inventory Ledger, BOM Recipes, Payments, Outbox | **Strict ACID guarantees**, Row-level locks (`SELECT FOR UPDATE`), triggers, constraints. |

---

## 3. Why PostgreSQL Must Own the Core Entities

The Restaurant Operating Platform enforces **12 Core Database Invariants** that cannot be guaranteed in an edge-only or document datastore:

1. **Non-Negative Inventory (Invariant 1 & 2)**:
   - When an order for 2× Butter Chicken is submitted simultaneously from Table 07 and the POS, PostgreSQL enforces row-level locking (`SELECT ... FOR UPDATE`) on `stock_items`.
   - The second transaction detects depleted safety stock and rolls back immediately, preventing overselling.
2. **Immutable Append-Only Ledger (Invariants 2, 3, 4, 11)**:
   - Every stock intake, consume, release, or waste creates a permanent ledger row.
   - Database triggers (`trg_process_stock_ledger_entry`) prevent any update or delete operation on `stock_ledger`.
3. **BOM Version Freeze (Invariant 6)**:
   - Dish recipes freeze the active `recipe_version_id` at the moment of order placement.
4. **Exact Monetary Arithmetic (Invariant 10)**:
   - All monetary amounts are strictly persisted as `BIGINT` integer paise (e.g., `4285000` paise = ₹42,850.00), preventing IEEE 754 floating-point drift.
5. **Transactional Outbox Guarantee**:
   - Business state updates (order placed) and outbound notification events (`ORDER_CREATED`) are committed in the **exact same ACID transaction boundary**.

---

## 4. Cloudflare Configuration Best Practices

### A. WAF Rules for Customer Table QR Ordering
To prevent brute-force token enumeration or prank order floods:
```jsonc
// Cloudflare WAF Custom Rule: Protect Table QR Ordering
{
  "description": "Rate limit customer table QR ordering API",
  "action": "rate_limit",
  "expression": "(http.request.uri.path contains \"/api/qr/orders\" or http.request.uri.path contains \"/api/qr/session\")",
  "rate_limit": {
    "characteristics": ["ip.src"],
    "period": 60,
    "requests_per_period": 30
  }
}
```

### B. CDN Caching Policy
* **Cache Everything**: `/qr-order.css`, `/dashboard.css`, `/kds.css`, `/index.css`, fonts, images.
* **Bypass Cache**: `/api/*`, `/ws`, `/table/*/session/*` (must always validate token authenticity and TTL on backend).

---

## 5. Supabase Connection Strategy

* **Connection Pooling**: Use Supabase Transaction Pooler (PgBouncer on port `6543`) for high-concurrency API instances.
* **Direct Connection**: Port `5432` reserved for migrations, transactional outbox background worker, and schema changes.
* **RLS (Row Level Security)**: Configured with tenancy policy `outlet_id = auth.current_outlet_id()` for tenant isolation.
