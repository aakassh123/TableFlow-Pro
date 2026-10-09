// Transactional Outbox Service
// Guarantees atomic insertion of domain events in the caller's DB transaction
// and provides safe access methods for background queue workers.
import crypto from 'crypto';

export class OutboxService {
    /**
     * 1. Record Event within caller's active database transaction
     * Mandatory Invariant:
     * - Order update and Outbox event are committed in the SAME ACID TRANSACTION!
     * - Never send external notifications (WhatsApp, Push, SMS) directly in this transaction!
     */
    static async recordEvent(client, {
        outletId,
        eventType,
        aggregateType,
        aggregateId,
        payload = {},
        idempotencyKey = null
    }) {
        const payloadJson = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const key = idempotencyKey || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        const res = await client.query(`
            INSERT INTO outbox_events (
                outlet_id, event_type, aggregate_type, aggregate_id, payload,
                status, retry_count, next_retry_at, idempotency_key, created_at
            ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)
            RETURNING id, outlet_id, event_type, aggregate_type, aggregate_id, status, retry_count, created_at
        `, [outletId, eventType, aggregateType, aggregateId, payloadJson, key]);

        return res.rows[0];
    }

    /**
     * 2. Read Pending Events for Worker
     * Respects next_retry_at exponential backoff windows and maxRetries ceiling
     */
    static async getPendingEvents(db, {
        limit = 20,
        maxRetries = 5,
        now = new Date()
    } = {}) {
        const res = await db.query(`
            SELECT id, outlet_id, event_type, aggregate_type, aggregate_id, payload,
                   status, retry_count, next_retry_at, idempotency_key, created_at
            FROM outbox_events
            WHERE status = 'PENDING'
              AND (next_retry_at IS NULL OR next_retry_at <= $1)
              AND retry_count < $2
            ORDER BY created_at ASC
            LIMIT $3
        `, [now, maxRetries, limit]);

        return res.rows.map(row => ({
            ...row,
            payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
        }));
    }

    /**
     * 3. Mark Event as PROCESSING (Row lock defense against concurrent workers)
     */
    static async markProcessing(db, eventId) {
        const res = await db.query(`
            UPDATE outbox_events
            SET status = 'PROCESSING'
            WHERE id = $1 AND status = 'PENDING'
            RETURNING id, status
        `, [eventId]);

        return res.rows.length > 0;
    }

    /**
     * 4. Mark Event as PUBLISHED (Processed successfully)
     */
    static async markPublished(db, eventId) {
        await db.query(`
            UPDATE outbox_events
            SET status = 'PUBLISHED',
                processed_at = CURRENT_TIMESTAMP,
                last_error = NULL
            WHERE id = $1
        `, [eventId]);
    }

    /**
     * 5. Exponential Backoff Failure Handler
     * If retryCount < maxRetries -> reschedule for exponential backoff (2^retry * baseSeconds)
     * If retryCount >= maxRetries -> mark as FAILED
     */
    static async markFailedOrRetry(db, {
        eventId,
        error,
        currentRetryCount = 0,
        maxRetries = 5,
        baseDelaySeconds = 2
    }) {
        const nextRetryCount = currentRetryCount + 1;
        const errorMessage = error?.message || String(error);

        if (nextRetryCount >= maxRetries) {
            // Reached dead-letter limit: Mark FAILED
            await db.query(`
                UPDATE outbox_events
                SET status = 'FAILED',
                    retry_count = $1,
                    last_error = $2,
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [nextRetryCount, errorMessage, eventId]);

            return {
                status: 'FAILED',
                retryCount: nextRetryCount,
                willRetry: false,
                errorMessage
            };
        } else {
            // Exponential backoff: base * 2^currentRetryCount (e.g. 2s, 4s, 8s, 16s, 32s)
            const backoffSeconds = Math.min(300, baseDelaySeconds * Math.pow(2, currentRetryCount));
            const nextRetryDate = new Date(Date.now() + backoffSeconds * 1000);

            await db.query(`
                UPDATE outbox_events
                SET status = 'PENDING',
                    retry_count = $1,
                    next_retry_at = $2,
                    last_error = $3
                WHERE id = $4
            `, [nextRetryCount, nextRetryDate, errorMessage, eventId]);

            return {
                status: 'PENDING',
                retryCount: nextRetryCount,
                nextRetryAt: nextRetryDate,
                backoffSeconds,
                willRetry: true,
                errorMessage
            };
        }
    }

    /**
     * 6. Duplicate Delivery Protection
     * Checks if notification has already been sent for this unique key
     */
    static async isDuplicateDelivery(db, idempotencyKey) {
        if (!idempotencyKey) return false;

        const res = await db.query(`
            SELECT id FROM notifications
            WHERE idempotency_key = $1 AND status IN ('SENT', 'DELIVERED')
            LIMIT 1
        `, [idempotencyKey]);

        return res.rows.length > 0;
    }

    /**
     * 7. Record Notification Delivery Audit
     */
    static async recordNotificationDelivery(db, {
        outletId,
        channel,
        recipient,
        templateCode,
        payload = {},
        idempotencyKey = null,
        outboxEventId = null,
        provider = 'GUPSHUP_WHATSAPP',
        providerMessageId = null,
        status = 'DELIVERED',
        errorMessage = null
    }) {
        const notifRes = await db.query(`
            INSERT INTO notifications (
                outlet_id, channel, recipient, template_code, payload,
                idempotency_key, outbox_event_id, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, channel, recipient, status
        `, [
            outletId, channel, recipient, templateCode,
            JSON.stringify(payload), idempotencyKey, outboxEventId, status
        ]);

        const notif = notifRes.rows[0];

        await db.query(`
            INSERT INTO notification_deliveries (
                notification_id, attempt_number, provider, provider_message_id,
                response_code, error_message, delivered_at, created_at
            ) VALUES ($1, 1, $2, $3, '200', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [notif.id, provider, providerMessageId, errorMessage]);

        return notif;
    }
}
