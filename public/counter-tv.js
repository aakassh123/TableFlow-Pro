// Counter TV Realtime Token Display Client (PHASE 9)
// Subscribes to counter-tv channel via WebSocket
(function() {
    let audioCtx = null;
    let isMuted = false;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const banner = document.getElementById('audio-unlock-banner');
        if (banner) banner.style.display = 'none';
    }

    function playDingDongChime() {
        if (!audioCtx || isMuted) return;
        try {
            const now = audioCtx.currentTime;

            // First note (High ding)
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, now); // E5
            gain1.gain.setValueAtTime(0.4, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.6);

            // Second note (Low dong)
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(523.25, now + 0.25); // C5
            gain2.gain.setValueAtTime(0.5, now + 0.25);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.start(now + 0.25);
            osc2.stop(now + 1.2);
        } catch (e) {
            console.warn('Audio play error:', e);
        }
    }

    // Digital clock
    function startClock() {
        const clockEl = document.getElementById('live-clock');
        function update() {
            if (clockEl) {
                const now = new Date();
                clockEl.textContent = now.toLocaleTimeString('en-IN', { hour12: false });
            }
        }
        update();
        setInterval(update, 1000);
    }

    // State
    const readyTokens = [
        { number: 'A-101', badge: 'TAKEAWAY • COUNTER 1', isNew: true },
        { number: 'D-017', badge: 'DELIVERY PICKUP', isNew: false },
        { number: 'A-102', badge: 'TAKEAWAY • COUNTER 2', isNew: false }
    ];

    const prepTokens = [
        { number: 'A-103', time: 'Est: 5–10m' },
        { number: 'D-019', time: 'Est: 10–15m' },
        { number: 'A-104', time: 'Est: 15–20m' },
        { number: 'W-088', time: 'Est: 5–10m' }
    ];

    function renderGrids() {
        const readyGrid = document.getElementById('ready-tokens-grid');
        const prepGrid = document.getElementById('prep-tokens-grid');
        const readyCount = document.getElementById('ready-count');
        const prepCount = document.getElementById('prep-count');

        if (readyGrid) {
            readyGrid.innerHTML = readyTokens.map(t => `
                <div class="token-card ${t.isNew ? 'newly-called' : ''}">
                    <div class="token-number">${t.number}</div>
                    <div class="token-type-badge">${t.badge}</div>
                </div>
            `).join('');
        }

        if (prepGrid) {
            prepGrid.innerHTML = prepTokens.map(t => `
                <div class="prep-card">
                    <div class="prep-number">${t.number}</div>
                    <div class="prep-time">${t.time}</div>
                </div>
            `).join('');
        }

        if (readyCount) readyCount.textContent = `${readyTokens.length} TOKENS`;
        if (prepCount) prepCount.textContent = `${prepTokens.length} TOKENS`;
    }

    // Token call action
    function handleTokenCalled(tokenNum, badgeText = 'COUNTER PICKUP') {
        // Move from prep if present
        const prepIdx = prepTokens.findIndex(p => p.number === tokenNum);
        if (prepIdx !== -1) {
            prepTokens.splice(prepIdx, 1);
        }

        // Add to ready tokens at top
        const existingIdx = readyTokens.findIndex(r => r.number === tokenNum);
        if (existingIdx !== -1) {
            readyTokens.splice(existingIdx, 1);
        }

        // Reset previous isNew
        readyTokens.forEach(r => r.isNew = false);

        readyTokens.unshift({
            number: tokenNum,
            badge: badgeText,
            isNew: true
        });

        if (readyTokens.length > 8) readyTokens.pop();

        renderGrids();
        playDingDongChime();
    }

    // WebSocket connection
    let ws = null;
    const seenEventIds = new Set();
    let lastSequence = 0;

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?clientType=counter-tv`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('✓ Counter TV connected to /ws channel counter-tv');
                if (lastSequence) {
                    ws.send(JSON.stringify({ type: 'SYNC_REQUEST', lastSequence }));
                }
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (!msg || !msg.eventType) return;

                    // Deduplication
                    if (msg.eventId && seenEventIds.has(msg.eventId)) return;
                    if (msg.eventId) seenEventIds.add(msg.eventId);

                    if (msg.sequence) lastSequence = msg.sequence;

                    if (msg.eventType === 'token.called') {
                        const num = msg.payload?.tokenNumber || msg.payload?.tokenId || 'A-100';
                        handleTokenCalled(num, 'NOW SERVING');
                    } else if (msg.eventType === 'order.ready') {
                        const num = msg.payload?.orderNumber ? `D-${msg.payload.orderNumber.slice(-3)}` : 'READY';
                        handleTokenCalled(num, 'READY FOR PICKUP');
                    } else if (msg.eventType === 'token.created') {
                        const num = msg.payload?.tokenNumber || 'A-100';
                        if (!prepTokens.some(p => p.number === num)) {
                            prepTokens.push({ number: num, time: 'Est: 10–15m' });
                            renderGrids();
                        }
                    }
                } catch (e) {}
            };

            ws.onclose = () => {
                setTimeout(connectWebSocket, 3000);
            };

            ws.onerror = () => {
                try { ws.close(); } catch (e) {}
            };
        } catch (err) {
            console.warn('Counter TV WebSocket connection error:', err);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        startClock();
        renderGrids();
        connectWebSocket();

        // Audio unlock triggers
        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('touchstart', initAudio, { once: true });

        const toggleBtn = document.getElementById('btn-sound-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                initAudio();
                isMuted = !isMuted;
                toggleBtn.textContent = isMuted ? '🔇 Audio Muted' : '🔊 Audio Alerts ON';
            });
        }
    });
})();
