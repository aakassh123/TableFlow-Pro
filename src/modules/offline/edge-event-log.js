// Edge Event Log - Append-Only Monotonic Local Sequence Store
// Invariant: Sequence numbers are strictly monotonic per outlet, ensuring deterministic ordering on reconnect
import crypto from 'crypto';

export class EdgeEventLog {
    /**
     * Appends an event to the local append-only sequence log
     */
    static async appendEvent(db, {
        outletId = '33333333-3333-3333-3333-333333333301',
        eventType,
        aggregateType,
        aggregateId,
        payload,
        idempotencyKey = null
    }) {
        // Compute next monotonic sequence number for the outlet
        const seqRes = await db.query(`
            SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
            FROM edge_event_log
            WHERE outlet_id = $1
        `, [outletId]);

        const nextSeq = parseInt(seqRes.rows[0].next_seq, 10);
        const eventId = crypto.randomUUID();

        const insertRes = await db.query(`
            INSERT INTO edge_event_log (
                outlet_id, sequence_number, event_id, event_type,
                aggregate_type, aggregate_id, payload, idempotency_key,
                sync_status, local_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', CURRENT_TIMESTAMP)
            RETURNING id, outlet_id, sequence_number, event_id, event_type,
                      aggregate_type, aggregate_id, payload, sync_status, local_timestamp
        `, [
            outletId,
            nextSeq,
            eventId,
            eventType,
            aggregateType,
            aggregateId,
            typeof payload === 'string' ? payload : JSON.stringify(payload),
            idempotencyKey
        ]);

        return insertRes.rows[0];
    }

    /**
     * Retrieve all un-synced events ordered by monotonic sequence
     */
    static async getPendingEvents(db, outletId = '33333333-3333-3333-3333-333333333301', limit = 100) {
        const res = await db.query(`
            SELECT id, outlet_id, sequence_number, event_id, event_type,
                   aggregate_type, aggregate_id, payload, idempotency_key,
                   sync_status, local_timestamp
            FROM edge_event_log
            WHERE outlet_id = $1 AND sync_status = 'PENDING'
            ORDER BY sequence_number ASC
            LIMIT $2
        `, [outletId, limit]);

        return res.rows;
    }

    /**
     * Mark an event as successfully synced to Cloud
     */
    static async markEventSynced(db, eventId) {
        await db.query(`
            UPDATE edge_event_log
            SET sync_status = 'SYNCED', synced_at = CURRENT_TIMESTAMP
            WHERE event_id = $1 OR id = $1
        `, [eventId]);
    }

    /**
     * Mark an event in CONFLICT state
     */
    static async markEventConflict(db, eventId, errorMessage) {
        await db.query(`
            UPDATE edge_event_log
            SET sync_status = 'CONFLICT', error_message = $2
            WHERE event_id = $1 OR id = $1
        `, [eventId, errorMessage]);
    }
}
