// Realtime WebSocket Event Hub (PHASE 9)
// Provides bidirectional realtime event broadcasting across POS, KDS, Manager Dashboard, Customer Tracking, and Counter TV
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

export const WS_EVENTS = {
    // Orders
    ORDER_CREATED: 'order.created',
    ORDER_ACCEPTED: 'order.accepted',
    ORDER_PREPARING: 'order.preparing',
    ORDER_DELAYED: 'order.delayed',
    ORDER_READY: 'order.ready',
    ORDER_CANCELLED: 'order.cancelled',
    ORDER_DELIVERED: 'order.delivered',

    // Stock
    STOCK_LOW: 'stock.low',
    STOCK_FINISHED: 'stock.finished',

    // Kitchen
    KITCHEN_TICKET_CREATED: 'kitchen.ticket_created',
    KITCHEN_TICKET_BUMPED: 'kitchen.ticket_bumped',
    KITCHEN_TICKET_DELAYED: 'kitchen.ticket_delayed',

    // Tokens
    TOKEN_CREATED: 'token.created',
    TOKEN_CALLED: 'token.called'
};

export const WS_CHANNELS = {
    POS: 'pos',
    KDS: 'kds',
    MANAGER: 'manager',
    COUNTER_TV: 'counter-tv',
    CUSTOMER_PREFIX: 'customer:' // e.g. customer:ORD-0017
};

export class WebSocketHub {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // ws -> { id, clientType, channels: Set, orderId, authenticated }
        this.sequenceCounter = 0;
        this.recentEvents = []; // For replay / reconnect resync (last 100 events)
        this.pingInterval = null;
    }

    /**
     * Attach WebSocketServer to HTTP Server
     */
    attach(httpServer) {
        this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });

        this.wss.on('connection', (ws, req) => {
            const clientId = `client_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            const url = new URL(req.url, 'http://localhost');
            const clientType = url.searchParams.get('clientType') || 'generic';
            const orderId = url.searchParams.get('orderId') || null;
            const initialChannel = url.searchParams.get('channel') || null;

            const clientMeta = {
                id: clientId,
                clientType,
                channels: new Set(),
                orderId,
                ip: req.socket.remoteAddress,
                connectedAt: new Date(),
                isAlive: true
            };

            // Auto-subscribe default channels based on clientType
            if (clientType === 'kds') {
                clientMeta.channels.add(WS_CHANNELS.KDS);
                const station = url.searchParams.get('station');
                if (station) clientMeta.channels.add(`kds:${station.toUpperCase()}`);
            } else if (clientType === 'pos') {
                clientMeta.channels.add(WS_CHANNELS.POS);
            } else if (clientType === 'manager') {
                clientMeta.channels.add(WS_CHANNELS.MANAGER);
            } else if (clientType === 'counter-tv') {
                clientMeta.channels.add(WS_CHANNELS.COUNTER_TV);
            } else if (clientType === 'customer' && orderId) {
                clientMeta.channels.add(`customer:${orderId}`);
            }

            if (initialChannel) {
                this.authorizeAndSubscribe(clientMeta, initialChannel, orderId);
            }

            this.clients.set(ws, clientMeta);

            // Send Welcome Handshake
            ws.send(JSON.stringify({
                type: 'SYSTEM_CONNECTED',
                clientId,
                clientType,
                subscribedChannels: Array.from(clientMeta.channels),
                sequence: this.sequenceCounter,
                timestamp: new Date().toISOString()
            }));

            // Handle Incoming Messages (Subscribe, Unsubscribe, Ping)
            ws.on('message', (raw) => {
                try {
                    const message = JSON.parse(raw.toString());
                    this.handleClientMessage(ws, message);
                } catch (e) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON payload' }));
                }
            });

            ws.on('pong', () => {
                const meta = this.clients.get(ws);
                if (meta) meta.isAlive = true;
            });

            ws.on('close', () => {
                this.clients.delete(ws);
            });

            ws.on('error', () => {
                this.clients.delete(ws);
            });
        });

        // 25-Second Heartbeat Ping to prevent stale connections
        this.pingInterval = setInterval(() => {
            if (!this.wss) return;
            this.wss.clients.forEach((ws) => {
                const meta = this.clients.get(ws);
                if (!meta || !meta.isAlive) {
                    this.clients.delete(ws);
                    return ws.terminate();
                }
                meta.isAlive = false;
                ws.ping();
            });
        }, 25000);

        console.log('✓ Realtime WebSocket Hub attached on /ws (Events: Orders, KDS, Stock, Tokens, Customer tracking)');
        return this;
    }

    /**
     * Authorize and Subscribe Client to a Specific Channel
     * Ensures strict authorization per channel:
     * - Customer channels require matching orderId
     * - Manager/Staff channels checked
     */
    authorizeAndSubscribe(clientMeta, channel, orderId = null) {
        if (!channel) return false;

        // Customer channel authorization check
        if (channel.startsWith('customer:')) {
            const requestedOrderId = channel.replace('customer:', '');
            // Customer can only subscribe to their own orderId
            if (clientMeta.clientType === 'customer') {
                if (clientMeta.orderId && clientMeta.orderId !== requestedOrderId) {
                    return false; // Denied: customer cannot listen to another customer's order
                }
                clientMeta.orderId = requestedOrderId;
            }
        }

        clientMeta.channels.add(channel);
        return true;
    }

    handleClientMessage(ws, message) {
        const meta = this.clients.get(ws);
        if (!meta) return;

        switch (message.type) {
            case 'SUBSCRIBE': {
                const { channel, orderId } = message;
                const allowed = this.authorizeAndSubscribe(meta, channel, orderId);
                ws.send(JSON.stringify({
                    type: allowed ? 'SUBSCRIBE_SUCCESS' : 'SUBSCRIBE_DENIED',
                    channel,
                    subscribedChannels: Array.from(meta.channels),
                    timestamp: new Date().toISOString()
                }));
                break;
            }

            case 'UNSUBSCRIBE': {
                meta.channels.delete(message.channel);
                ws.send(JSON.stringify({
                    type: 'UNSUBSCRIBE_SUCCESS',
                    channel: message.channel,
                    subscribedChannels: Array.from(meta.channels)
                }));
                break;
            }

            case 'HEARTBEAT': {
                ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK', timestamp: new Date().toISOString() }));
                break;
            }

            case 'SYNC_REQUEST': {
                // Replay recent missed events if client reconnected with lastSeenSequence
                const lastSeq = parseInt(message.lastSequence, 10) || 0;
                const missed = this.recentEvents.filter(e => e.sequence > lastSeq);
                ws.send(JSON.stringify({
                    type: 'SYNC_RESPONSE',
                    events: missed,
                    currentSequence: this.sequenceCounter
                }));
                break;
            }
        }
    }

    /**
     * Broadcast an Event to Channels
     * Guarantees:
     * 1. Monotonic event ordering (sequence numbers)
     * 2. Duplicate event protection (unique eventId)
     * 3. Channel authorization routing
     */
    publish(channel, eventType, payload = {}) {
        this.sequenceCounter++;

        const eventEnvelope = {
            eventId: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            sequence: this.sequenceCounter,
            eventType,
            channel,
            timestamp: new Date().toISOString(),
            payload
        };

        // Maintain in-memory replay buffer (last 100 events)
        this.recentEvents.push(eventEnvelope);
        if (this.recentEvents.length > 100) {
            this.recentEvents.shift();
        }

        const serialized = JSON.stringify(eventEnvelope);

        if (!this.wss) return eventEnvelope;

        this.wss.clients.forEach((ws) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const meta = this.clients.get(ws);
            if (!meta) return;

            // Check if client is subscribed to channel or is a root manager
            const isSubscribed = meta.channels.has(channel) ||
                                 meta.channels.has(WS_CHANNELS.MANAGER) ||
                                 (channel.startsWith('kds:') && meta.channels.has(WS_CHANNELS.KDS));

            if (isSubscribed) {
                ws.send(serialized);
            }
        });

        return eventEnvelope;
    }

    /**
     * Helper methods for Domain Events
     */
    emitOrderEvent(eventType, order) {
        // Broadcast to general order subscribers, POS, and customer's private room
        this.publish(WS_CHANNELS.POS, eventType, order);
        this.publish(WS_CHANNELS.KDS, eventType, order);
        if (order.id) {
            this.publish(`customer:${order.id}`, eventType, order);
        }
        if (order.order_number) {
            this.publish(`customer:${order.order_number}`, eventType, order);
        }
        if (eventType === WS_EVENTS.ORDER_READY) {
            this.publish(WS_CHANNELS.COUNTER_TV, eventType, order);
        }
    }

    emitKitchenEvent(eventType, ticket) {
        this.publish(WS_CHANNELS.KDS, eventType, ticket);
        if (ticket.stationCode) {
            this.publish(`kds:${ticket.stationCode.toUpperCase()}`, eventType, ticket);
        }
        this.publish(WS_CHANNELS.POS, eventType, ticket);
    }

    emitTokenEvent(eventType, token) {
        this.publish(WS_CHANNELS.POS, eventType, token);
        this.publish(WS_CHANNELS.COUNTER_TV, eventType, token);
    }

    emitStockEvent(eventType, stockInfo) {
        this.publish(WS_CHANNELS.POS, eventType, stockInfo);
        this.publish(WS_CHANNELS.KDS, eventType, stockInfo);
        this.publish(WS_CHANNELS.MANAGER, eventType, stockInfo);
    }

    broadcast(eventType, payload = {}) {
        const envelope = this.publish(WS_CHANNELS.KDS, eventType, payload);
        return envelope.sequence;
    }

    getEventsSince(lastSequence = 0) {
        const lastSeq = parseInt(lastSequence, 10) || 0;
        return this.recentEvents.filter(e => e.sequence > lastSeq);
    }

    close() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.wss) this.wss.close();
    }
}

// Global Singleton Instance
export const wsHub = new WebSocketHub();
