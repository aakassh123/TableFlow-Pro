// Edge Sync Service - Two-Way Cloud Synchronization Engine
// Preserves monotonic sequence ordering, deduplicates events, detects conflicts, and guarantees zero silent data loss
import { EdgeEventLog } from './edge-event-log.js';
import { ConflictQueueService } from './conflict-queue.service.js';

export class EdgeSyncService {
    /**
     * Replays pending edge events to the Cloud database in monotonic sequence order
     */
    static async syncEvents(edgeDb, cloudDb, {
        outletId = '33333333-3333-3333-3333-333333333301'
    } = {}) {
        // 1. Mark node in SYNCING state
        await edgeDb.query(`
            UPDATE edge_node_state
            SET connectivity_state = 'SYNCING', last_sync_attempt_at = CURRENT_TIMESTAMP
            WHERE outlet_id = $1
        `, [outletId]);

        const pendingEvents = await EdgeEventLog.getPendingEvents(edgeDb, outletId, 200);

        let syncedCount = 0;
        let conflictCount = 0;
        let skippedDuplicates = 0;
        let lastSyncedSeq = 0;

        for (const evt of pendingEvents) {
            const payload = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;

            try {
                // A. Deduplication Check on Cloud
                if (evt.idempotency_key) {
                    const existingCloud = await cloudDb.query(`
                        SELECT id FROM orders WHERE outlet_id = $1 AND idempotency_key = $2
                    `, [outletId, evt.idempotency_key]);

                    if (existingCloud.rows.length > 0) {
                        skippedDuplicates++;
                        await EdgeEventLog.markEventSynced(edgeDb, evt.id);
                        lastSyncedSeq = evt.sequence_number;
                        continue;
                    }
                }

                // B. Handle specific event types
                if (evt.event_type === 'EDGE_ORDER_CREATED') {
                    // Check if cloud already has an order with the same order_number
                    const cloudOrderRes = await cloudDb.query(`
                        SELECT id, status, total_paise, updated_at
                        FROM orders
                        WHERE outlet_id = $1 AND (id = $2 OR order_number = $3)
                    `, [outletId, evt.aggregate_id, payload.orderNumber]);

                    if (cloudOrderRes.rows.length > 0) {
                        const cloudOrd = cloudOrderRes.rows[0];
                        // If cloud status conflicts with edge placed status
                        if (cloudOrd.status !== payload.status && cloudOrd.status !== 'PLACED') {
                            conflictCount++;
                            await ConflictQueueService.recordConflict(edgeDb, {
                                outletId,
                                eventId: evt.id,
                                conflictType: 'CONCURRENT_ORDER_UPDATE',
                                entityType: 'ORDER',
                                entityId: evt.aggregate_id,
                                localState: payload,
                                cloudState: cloudOrd,
                                conflictReason: `Order ${payload.orderNumber} was modified on Cloud to '${cloudOrd.status}' while Edge placed '${payload.status}'`
                            });
                            await EdgeEventLog.markEventConflict(edgeDb, evt.id, 'Concurrent order conflict queued');
                            continue;
                        }
                    } else {
                        // Apply order into Cloud Database
                        await cloudDb.query(`
                            INSERT INTO orders (
                                id, outlet_id, order_number, table_id, customer_id, channel,
                                status, subtotal_paise, discount_paise, tax_paise, total_paise,
                                round_off_paise, guest_count, notes, idempotency_key, created_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, 0, $11, $12, $13, $14)
                            ON CONFLICT (id) DO NOTHING
                        `, [
                            evt.aggregate_id, outletId, payload.orderNumber, payload.tableId || null,
                            payload.customerId || null, payload.channel || 'WALK_IN', payload.status || 'PLACED',
                            payload.subtotalPaise || payload.totalPaise, payload.taxPaise || 0, payload.totalPaise,
                            payload.guestCount || 1, payload.notes || null, evt.idempotency_key, evt.local_timestamp
                        ]);

                        // Sync order items if present in payload
                        if (payload.items && Array.isArray(payload.items)) {
                            for (const item of payload.items) {
                                await cloudDb.query(`
                                    INSERT INTO order_items (
                                        id, order_id, menu_item_id, variant_id, quantity,
                                        unit_price_paise, total_price_paise, status
                                    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'PENDING')
                                `, [
                                    evt.aggregate_id, item.menuItemId, item.variantId || null,
                                    item.quantity, item.unitPricePaise || 0, item.totalPricePaise || 0
                                ]);
                            }
                        }
                    }
                } else if (evt.event_type === 'EDGE_KDS_BUMP') {
                    // Update kitchen ticket status on Cloud
                    await cloudDb.query(`
                        UPDATE kitchen_tickets
                        SET status = 'READY', bumped_at = $1, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2 AND outlet_id = $3
                    `, [evt.local_timestamp, evt.aggregate_id, outletId]);
                } else if (evt.event_type === 'EDGE_STOCK_CONSUMED') {
                    // Check cloud stock availability
                    const cloudStockRes = await cloudDb.query(`
                        SELECT id, current_balance_base_units FROM stock_items WHERE id = $1 AND outlet_id = $2
                    `, [evt.aggregate_id, outletId]);

                    if (cloudStockRes.rows.length > 0) {
                        const currentCloudBal = parseFloat(cloudStockRes.rows[0].current_balance_base_units);
                        const qtyDelta = parseFloat(payload.quantityDeltaBaseUnits || 0);

                        if (currentCloudBal + qtyDelta < 0) {
                            // Inventory shortage conflict on cloud
                            conflictCount++;
                            await ConflictQueueService.recordConflict(edgeDb, {
                                outletId,
                                eventId: evt.id,
                                conflictType: 'INVENTORY_SHORTAGE',
                                entityType: 'STOCK_ITEM',
                                entityId: evt.aggregate_id,
                                localState: payload,
                                cloudState: { currentCloudBalance: currentCloudBal, attemptedDelta: qtyDelta },
                                conflictReason: `Cloud stock insufficient (${currentCloudBal}) for offline consumed quantity (${Math.abs(qtyDelta)}). Physical meal was already cooked at outlet.`
                            });
                            await EdgeEventLog.markEventConflict(edgeDb, evt.id, 'Inventory shortage conflict queued');
                            continue;
                        }
                    }
                }

                // C. Mark event successfully synced
                await EdgeEventLog.markEventSynced(edgeDb, evt.id);
                syncedCount++;
                lastSyncedSeq = evt.sequence_number;

            } catch (err) {
                console.error(`[EdgeSyncService] Failed to sync event ${evt.id}:`, err.message);
                conflictCount++;
                await ConflictQueueService.recordConflict(edgeDb, {
                    outletId,
                    eventId: evt.id,
                    conflictType: 'SYNC_EXECUTION_FAILURE',
                    entityType: evt.aggregate_type,
                    entityId: evt.aggregate_id,
                    localState: payload,
                    cloudState: {},
                    conflictReason: `Sync error: ${err.message}`
                });
                await EdgeEventLog.markEventConflict(edgeDb, evt.id, err.message);
            }
        }

        // 3. Update Edge Node State
        await edgeDb.query(`
            UPDATE edge_node_state
            SET connectivity_state = 'ONLINE',
                last_successful_sync_at = CURRENT_TIMESTAMP,
                last_synced_sequence = GREATEST(last_synced_sequence, $2),
                pending_events_count = (SELECT COUNT(*) FROM edge_event_log WHERE outlet_id = $1 AND sync_status = 'PENDING'),
                updated_at = CURRENT_TIMESTAMP
            WHERE outlet_id = $1
        `, [outletId, lastSyncedSeq]);

        return {
            totalPending: pendingEvents.length,
            syncedCount,
            conflictCount,
            skippedDuplicates,
            lastSyncedSequence: lastSyncedSeq
        };
    }
}
