// Customer Realtime Order Tracking Client (PHASE 9)
// Subscribes to isolated customer channel via WebSocket
(function() {
    const params = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/');
    const pathOrderId = pathParts[pathParts.length - 1];

    const orderId = params.get('orderId') || (pathOrderId && pathOrderId !== 'track' ? pathOrderId : 'ORD-20261007-0017');

    const dom = {
        orderNumber: document.getElementById('order-number'),
        orderChannel: document.getElementById('order-channel'),
        promiseRange: document.getElementById('promise-range'),
        delayBadge: document.getElementById('delay-badge'),
        statusHero: document.getElementById('status-hero'),
        statusPulse: document.getElementById('status-pulse'),
        statusHeading: document.getElementById('status-heading'),
        statusSubtext: document.getElementById('status-subtext'),
        itemsList: document.getElementById('items-list'),
        wsIndicator: document.getElementById('ws-indicator'),
        wsStatusText: document.getElementById('ws-status-text'),
        stepPlaced: document.getElementById('step-placed'),
        stepAccepted: document.getElementById('step-accepted'),
        stepPreparing: document.getElementById('step-preparing'),
        stepReady: document.getElementById('step-ready'),
        stepDelivered: document.getElementById('step-delivered')
    };

    let ws = null;
    const seenEventIds = new Set();
    let lastSequence = 0;

    async function loadInitialOrder() {
        try {
            const res = await fetch(`/api/public/orders/${orderId}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    renderOrder(json.data);
                }
            }
        } catch (e) {
            console.warn('Initial order fetch fallback to default state');
        }
    }

    function renderOrder(data) {
        if (dom.orderNumber) dom.orderNumber.textContent = data.order_number || orderId;
        if (dom.orderChannel) dom.orderChannel.textContent = data.channel || 'DELIVERY';
        if (dom.promiseRange && data.promise_display) {
            dom.promiseRange.textContent = data.promise_display;
        }

        if (data.items && data.items.length > 0 && dom.itemsList) {
            dom.itemsList.innerHTML = data.items.map(i => `
                <div class="item-row">
                    <span>${i.quantity} × ${i.name}</span>
                    <span style="color:var(--text-muted)">Station Ticket</span>
                </div>
            `).join('');
        }

        updateStatus(data.status);
    }

    function updateStatus(status) {
        // Reset steps
        const steps = [dom.stepPlaced, dom.stepAccepted, dom.stepPreparing, dom.stepReady, dom.stepDelivered];
        steps.forEach(s => {
            if (s) {
                s.classList.remove('active', 'done');
            }
        });

        switch (status) {
            case 'PLACED':
            case 'PENDING_PAYMENT':
                dom.stepPlaced?.classList.add('active');
                setHero('Order Placed', 'Your order has been received by our kitchen system.', 'preparing');
                break;
            case 'ACCEPTED':
                dom.stepPlaced?.classList.add('done');
                dom.stepAccepted?.classList.add('active');
                setHero('Order Accepted', 'Kitchen has accepted your ticket and assigned to stations.', 'preparing');
                break;
            case 'PREPARING':
                dom.stepPlaced?.classList.add('done');
                dom.stepAccepted?.classList.add('done');
                dom.stepPreparing?.classList.add('active');
                setHero('Cooking Fresh', 'Chefs are currently preparing your meal at active stations.', 'preparing');
                break;
            case 'READY':
                dom.stepPlaced?.classList.add('done');
                dom.stepAccepted?.classList.add('done');
                dom.stepPreparing?.classList.add('done');
                dom.stepReady?.classList.add('active');
                setHero('Order is READY!', 'Hot and packed! Ready for pickup / delivery dispatch.', 'ready');
                break;
            case 'HANDED_TO_RIDER':
            case 'SERVED':
            case 'COLLECTED':
            case 'DELIVERED':
                dom.stepPlaced?.classList.add('done');
                dom.stepAccepted?.classList.add('done');
                dom.stepPreparing?.classList.add('done');
                dom.stepReady?.classList.add('done');
                dom.stepDelivered?.classList.add('done');
                setHero('Completed', 'Your delicious meal has been handed over. Enjoy!', 'ready');
                break;
            case 'CANCELLED':
            case 'CANCELLED_WITH_WASTE':
                setHero('Order Cancelled', 'This order was cancelled.', 'cancelled');
                break;
        }
    }

    function setHero(heading, subtext, mode) {
        if (dom.statusHeading) dom.statusHeading.textContent = heading;
        if (dom.statusSubtext) dom.statusSubtext.textContent = subtext;
        if (dom.statusHero) {
            dom.statusHero.className = `status-hero ${mode}`;
        }
    }

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?clientType=customer&orderId=${orderId}&channel=customer:${orderId}`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                if (dom.wsIndicator) dom.wsIndicator.classList.remove('disconnected');
                if (dom.wsStatusText) dom.wsStatusText.textContent = `Connected to Realtime Tracking (${orderId})`;

                if (lastSequence) {
                    ws.send(JSON.stringify({ type: 'SYNC_REQUEST', lastSequence }));
                }
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleRealtimeEvent(msg);
                } catch (e) {}
            };

            ws.onclose = () => {
                if (dom.wsIndicator) dom.wsIndicator.classList.add('disconnected');
                if (dom.wsStatusText) dom.wsStatusText.textContent = 'Disconnected. Reconnecting...';
                setTimeout(connectWebSocket, 3000);
            };

            ws.onerror = () => {
                try { ws.close(); } catch (e) {}
            };
        } catch (e) {
            console.warn('Customer WebSocket error:', e);
        }
    }

    function handleRealtimeEvent(msg) {
        if (!msg || !msg.eventType) return;

        // Deduplication
        if (msg.eventId && seenEventIds.has(msg.eventId)) return;
        if (msg.eventId) seenEventIds.add(msg.eventId);

        if (msg.sequence) lastSequence = msg.sequence;

        switch (msg.eventType) {
            case 'order.accepted':
                updateStatus('ACCEPTED');
                break;
            case 'order.preparing':
                updateStatus('PREPARING');
                break;
            case 'order.ready':
                updateStatus('READY');
                break;
            case 'order.delivered':
                updateStatus('DELIVERED');
                break;
            case 'order.delayed':
                if (dom.delayBadge) {
                    dom.delayBadge.textContent = `+${msg.payload?.delayMinutes || 10}m delay`;
                    dom.delayBadge.classList.remove('hidden');
                }
                if (msg.payload?.promiseRange?.rangeDisplay && dom.promiseRange) {
                    dom.promiseRange.textContent = msg.payload.promiseRange.rangeDisplay;
                }
                break;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadInitialOrder();
        connectWebSocket();
    });
})();
