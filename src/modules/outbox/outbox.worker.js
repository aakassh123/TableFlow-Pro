// Transactional Outbox Background Queue Worker (PHASE 9 Reliability Model)
// Reads pending events committed from DB transactions, publishes to external channels (WhatsApp, Push, SMS),
// handles retries with exponential backoff, and guarantees duplicate delivery prevention.
import { OutboxService } from './outbox.service.js';
import { NotificationDispatcher, NOTIFICATION_CHANNELS } from '../notifications/notification.dispatcher.js';

export class OutboxWorker {
    constructor({
        db,
        pollIntervalMs = 2000,
        batchSize = 10,
        maxRetries = 5,
        baseDelaySeconds = 2,
        dispatcher = null
    }) {
        this.db = db;
        this.pollIntervalMs = pollIntervalMs;
        this.batchSize = batchSize;
        this.maxRetries = maxRetries;
        this.baseDelaySeconds = baseDelaySeconds;
        this.dispatcher = dispatcher || new NotificationDispatcher();

        this.isRunning = false;
        this.timer = null;
        this.processedCount = 0;
        this.failedCount = 0;
        this.duplicatePreventedCount = 0;
    }

    /**
     * Start Background Worker Polling Loop
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        const loop = async () => {
            if (!this.isRunning) return;
            try {
                await this.processBatch();
            } catch (err) {
                console.error('[OutboxWorker] Error during batch processing:', err);
            } finally {
                if (this.isRunning) {
                    this.timer = setTimeout(loop, this.pollIntervalMs);
                }
            }
        };

        // Start immediately
        this.timer = setTimeout(loop, 100);
        console.log(`✓ Outbox Worker started (Polling every ${this.pollIntervalMs}ms, Max retries: ${this.maxRetries})`);
    }

    /**
     * Gracefully Stop Worker Loop
     */
    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /**
     * Process Next Batch of Pending Events
     */
    async processBatch() {
        const events = await OutboxService.getPendingEvents(this.db, {
            limit: this.batchSize,
            maxRetries: this.maxRetries
        });

        if (events.length === 0) return 0;

        for (const event of events) {
            // Lock event by setting status to PROCESSING
            const acquired = await OutboxService.markProcessing(this.db, event.id);
            if (!acquired) continue; // Picked up by another concurrent worker

            try {
                // Publish domain event to external communication channels
                await this.publishEvent(event);

                // Mark processed successfully
                await OutboxService.markPublished(this.db, event.id);
                this.processedCount++;
            } catch (err) {
                // Handle retry with exponential backoff
                const retryResult = await OutboxService.markFailedOrRetry(this.db, {
                    eventId: event.id,
                    error: err,
                    currentRetryCount: event.retry_count,
                    maxRetries: this.maxRetries,
                    baseDelaySeconds: this.baseDelaySeconds
                });

                this.failedCount++;
                if (retryResult.willRetry) {
                    console.warn(`[OutboxWorker] Event ${event.id} (${event.event_type}) failed. Rescheduled with backoff (${retryResult.backoffSeconds}s delay, Attempt ${retryResult.retryCount}/${this.maxRetries}): ${err.message}`);
                } else {
                    console.error(`[OutboxWorker] Event ${event.id} (${event.event_type}) reached max retries (${this.maxRetries}). Marked FAILED.`);
                }
            }
        }

        return events.length;
    }

    /**
     * Publish Event to Destination Channels with Duplicate Delivery Prevention
     */
    async publishEvent(event) {
        const payload = event.payload || {};
        const outletId = event.outlet_id;
        const customerPhone = payload.customerPhone || '+919876543210';

        switch (event.event_type) {
            // 1. ORDER CREATED
            case 'ORDER_CREATED': {
                // Send Customer WhatsApp Confirmation
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.WHATSAPP,
                    recipient: customerPhone,
                    templateCode: 'ORDER_PLACED_CONFIRMATION',
                    payload: {
                        orderNumber: payload.orderNumber,
                        promiseDisplay: payload.promiseDisplay || '30–35 minutes',
                        totalAmount: payload.totalPaise ? `₹${(payload.totalPaise / 100).toFixed(2)}` : 'N/A'
                    },
                    senderFn: (args) => this.dispatcher.sendWhatsApp(args)
                });

                // Send Kitchen Push Alert
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.PUSH,
                    recipient: 'kitchen-kds-terminal-all',
                    templateCode: 'NEW_ORDER_PUSH',
                    payload: {
                        orderNumber: payload.orderNumber,
                        channel: payload.channel
                    },
                    senderFn: (args) => this.dispatcher.sendPush({
                        ...args,
                        title: 'New Order Received',
                        body: `Order ${payload.orderNumber} incoming to stations`
                    })
                });
                break;
            }

            // 2. ORDER ACCEPTED
            case 'ORDER_ACCEPTED': {
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.WHATSAPP,
                    recipient: customerPhone,
                    templateCode: 'ORDER_ACCEPTED_UPDATE',
                    payload: {
                        orderNumber: payload.orderNumber,
                        message: 'The kitchen has accepted your order.'
                    },
                    senderFn: (args) => this.dispatcher.sendWhatsApp(args)
                });
                break;
            }

            // 3. ORDER PREPARING
            case 'ORDER_PREPARING': {
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.WHATSAPP,
                    recipient: customerPhone,
                    templateCode: 'ORDER_COOKING_UPDATE',
                    payload: {
                        orderNumber: payload.orderNumber,
                        message: 'Your dishes are now cooking on active station lines.'
                    },
                    senderFn: (args) => this.dispatcher.sendWhatsApp(args)
                });
                break;
            }

            // 4. ORDER READY
            case 'ORDER_READY': {
                // WhatsApp Customer Ready Alert
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.WHATSAPP,
                    recipient: customerPhone,
                    templateCode: 'ORDER_READY_PICKUP',
                    payload: {
                        orderNumber: payload.orderNumber,
                        message: 'Your food is piping hot and packed ready for pickup / delivery!'
                    },
                    senderFn: (args) => this.dispatcher.sendWhatsApp(args)
                });

                // SMS Counter Token Alert
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.SMS,
                    recipient: customerPhone,
                    templateCode: 'TOKEN_READY_SMS',
                    payload: {
                        orderNumber: payload.orderNumber,
                        token: payload.tokenNumber || 'COUNTER-1'
                    },
                    senderFn: (args) => this.dispatcher.sendSMS({
                        ...args,
                        message: `Order ${payload.orderNumber} ready! Please collect at counter.`
                    })
                });
                break;
            }

            // 5. ORDER DELAYED
            case 'ORDER_DELAYED': {
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.WHATSAPP,
                    recipient: customerPhone,
                    templateCode: 'ORDER_DELAY_UPDATE',
                    payload: {
                        orderNumber: payload.orderNumber,
                        delayMinutes: payload.delayMinutes || 10,
                        reason: payload.reason || 'Kitchen rush surge'
                    },
                    senderFn: (args) => this.dispatcher.sendWhatsApp(args)
                });
                break;
            }

            // 6. ORDER DELIVERED / FULFILLED
            case 'ORDER_SERVED':
            case 'ORDER_COLLECTED':
            case 'ORDER_DELIVERED': {
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.WHATSAPP,
                    recipient: customerPhone,
                    templateCode: 'ORDER_COMPLETED_RECEIPT',
                    payload: {
                        orderNumber: payload.orderNumber,
                        message: 'Thank you for ordering with DUM HOUSE! Enjoy your meal.'
                    },
                    senderFn: (args) => this.dispatcher.sendWhatsApp(args)
                });
                break;
            }

            // 7. ORDER CANCELLED
            case 'ORDER_CANCELLED':
            case 'ORDER_CANCELLED_WITH_WASTE': {
                await this.deliverNotification({
                    outboxEventId: event.id,
                    outletId,
                    channel: NOTIFICATION_CHANNELS.WHATSAPP,
                    recipient: customerPhone,
                    templateCode: 'ORDER_CANCELLED_NOTICE',
                    payload: {
                        orderNumber: payload.orderNumber,
                        reason: payload.reason || 'Order cancelled'
                    },
                    senderFn: (args) => this.dispatcher.sendWhatsApp(args)
                });
                break;
            }

            default:
                // Other internal events
                break;
        }
    }

    /**
     * Deliver a Notification with Duplicate Delivery Prevention
     */
    async deliverNotification({
        outboxEventId,
        outletId,
        channel,
        recipient,
        templateCode,
        payload,
        senderFn
    }) {
        // Enforce Idempotent Duplicate Delivery Prevention
        const idempotencyKey = `notif_${outboxEventId}_${channel}`;
        const alreadyDelivered = await OutboxService.isDuplicateDelivery(this.db, idempotencyKey);

        if (alreadyDelivered) {
            this.duplicatePreventedCount++;
            return { duplicateSkipped: true, idempotencyKey };
        }

        // External delivery call via Dispatcher (WhatsApp / SMS / Push)
        const dispatchResult = await senderFn({
            recipient,
            templateCode,
            payload,
            idempotencyKey
        });

        // Record delivery audit
        await OutboxService.recordNotificationDelivery(this.db, {
            outletId,
            channel,
            recipient,
            templateCode,
            payload,
            idempotencyKey,
            outboxEventId,
            provider: dispatchResult.provider,
            providerMessageId: dispatchResult.providerMessageId,
            status: 'DELIVERED'
        });

        return dispatchResult;
    }
}
