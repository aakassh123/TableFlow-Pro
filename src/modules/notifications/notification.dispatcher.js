// External Notification Dispatcher (WhatsApp, SMS, Push)
// CALLED STRICTLY BY BACKGROUND OUTBOX WORKER - NEVER FROM INSIDE DB TRANSACTIONS!
import crypto from 'crypto';

export const NOTIFICATION_CHANNELS = {
    WHATSAPP: 'WHATSAPP',
    SMS: 'SMS',
    PUSH: 'PUSH',
    EMAIL: 'EMAIL'
};

export class NotificationDispatcher {
    constructor({ shouldSimulateErrors = false, failureRate = 0 } = {}) {
        this.shouldSimulateErrors = shouldSimulateErrors;
        this.failureRate = failureRate;
        this.sentMessages = []; // For inspection and testing
        this.simulatedFailuresCount = 0;
    }

    /**
     * Send WhatsApp Message (e.g. Gupshup / WhatsApp Business Cloud API)
     */
    async sendWhatsApp({
        recipient,
        templateCode,
        payload = {},
        idempotencyKey = null
    }) {
        this.maybeSimulateTransientError('WhatsApp Gateway 503 Service Unavailable');

        const messageId = `wamid.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
        const record = {
            id: crypto.randomUUID(),
            channel: NOTIFICATION_CHANNELS.WHATSAPP,
            recipient,
            templateCode,
            payload,
            provider: 'GUPSHUP_WHATSAPP',
            providerMessageId: messageId,
            idempotencyKey,
            sentAt: new Date(),
            status: 'DELIVERED'
        };

        this.sentMessages.push(record);
        return record;
    }

    /**
     * Send SMS Notification (e.g. MSG91 / Twilio)
     */
    async sendSMS({
        recipient,
        templateCode,
        payload = {},
        idempotencyKey = null
    }) {
        this.maybeSimulateTransientError('SMS Gateway 504 Gateway Timeout');

        const messageId = `msg91_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const record = {
            id: crypto.randomUUID(),
            channel: NOTIFICATION_CHANNELS.SMS,
            recipient,
            templateCode,
            payload,
            provider: 'MSG91',
            providerMessageId: messageId,
            idempotencyKey,
            sentAt: new Date(),
            status: 'DELIVERED'
        };

        this.sentMessages.push(record);
        return record;
    }

    /**
     * Send Mobile Push Notification (e.g. Firebase Cloud Messaging / APNs)
     */
    async sendPush({
        recipient,
        title,
        body,
        data = {},
        idempotencyKey = null
    }) {
        this.maybeSimulateTransientError('FCM 500 Internal Connection Drop');

        const messageId = `fcm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const record = {
            id: crypto.randomUUID(),
            channel: NOTIFICATION_CHANNELS.PUSH,
            recipient,
            templateCode: 'PUSH_NOTIFICATION',
            payload: { title, body, data },
            provider: 'FIREBASE_FCM',
            providerMessageId: messageId,
            idempotencyKey,
            sentAt: new Date(),
            status: 'DELIVERED'
        };

        this.sentMessages.push(record);
        return record;
    }

    maybeSimulateTransientError(errorText) {
        if (this.shouldSimulateErrors) {
            this.simulatedFailuresCount++;
            throw new Error(`[SIMULATED_TRANSIENT_ERROR] ${errorText}`);
        }
    }
}
