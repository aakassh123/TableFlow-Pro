// Kitchen Display System (KDS) Client Controller
// Android Tablet & Touch Optimized

class KitchenAudioSynthesizer {
    constructor() {
        this.ctx = null;
        this.isMuted = localStorage.getItem('kds_audio_muted') === 'true';
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('kds_audio_muted', String(this.isMuted));
        return this.isMuted;
    }

    // Pleasant kitchen service bell (double ding)
    playNewOrderBell() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const playTone = (freq, time, duration) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(time);
            osc.stop(time + duration);
        };

        playTone(880, now, 0.4);       // A5
        playTone(1174.66, now + 0.18, 0.6); // D6
    }

    // Satisfying ticket bump tone (positive ascending chirp)
    playBumpChime() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    // Attention-grabbing late alarm
    playWarningAlarm() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(330, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

class KDSApplication {
    constructor() {
        this.audio = new KitchenAudioSynthesizer();
        this.activeStation = 'ALL';
        this.tickets = [];
        this.knownTicketIds = new Set();
        this.seenEventIds = new Set();
        this.lastSequence = 0;
        this.ws = null;
        this.pollInterval = null;
        this.timerInterval = null;

        this.dom = {
            stationTabsNav: document.getElementById('station-tabs-nav'),
            ticketsGrid: document.getElementById('kds-tickets-grid'),
            activeStationTitle: document.getElementById('active-station-title'),
            liveClock: document.getElementById('live-kitchen-clock'),
            kpiOnTime: document.getElementById('kpi-ontime-count'),
            kpiWarning: document.getElementById('kpi-warning-count'),
            kpiLate: document.getElementById('kpi-late-count'),
            soundToggleBtn: document.getElementById('btn-sound-toggle'),
            soundIcon: document.getElementById('sound-icon'),
            soundLabel: document.getElementById('sound-label'),
            fullscreenToggleBtn: document.getElementById('btn-fullscreen-toggle'),
            rushOrderBtn: document.getElementById('btn-rush-order'),
            recallModalBtn: document.getElementById('btn-recall-modal'),
            recalledCountBadge: document.getElementById('recalled-count-badge'),
            btn86Modal: document.getElementById('btn-86-modal'),
            banner86: document.getElementById('kds-86-banner'),
            banner86Items: document.getElementById('kds-86-items-list'),
            btnOpen86FromBanner: document.getElementById('btn-open-86-from-banner'),
            recallModal: document.getElementById('recall-modal'),
            btnCloseRecall: document.getElementById('btn-close-recall'),
            recallTicketsList: document.getElementById('recall-tickets-list'),
            item86Modal: document.getElementById('item-86-modal'),
            btnClose86: document.getElementById('btn-close-86'),
            item86List: document.getElementById('item-86-list'),
            printModal: document.getElementById('print-modal'),
            btnClosePrint: document.getElementById('btn-close-print'),
            btnDismissPrint: document.getElementById('btn-dismiss-print'),
            btnTriggerPrint: document.getElementById('btn-trigger-print'),
            thermalSlipContent: document.getElementById('thermal-slip-content'),
            toastContainer: document.getElementById('kds-toast-container')
        };
    }

    init() {
        this.setupEventListeners();
        this.startClock();
        this.updateSoundButtonUI();
        this.fetchTickets();
        this.fetch86List();
        this.fetchRecalledTicketsCount();
        this.connectRealtime();

        // 4-second API polling for fallback background sync
        this.pollInterval = setInterval(() => {
            this.fetchTickets(true);
            this.fetch86List();
        }, 4000);

        // 1-second interval for smooth countdown timers and urgency color states
        this.timerInterval = setInterval(() => {
            this.tickTimers();
        }, 1000);
    }

    connectRealtime() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?clientType=kds&station=${this.activeStation}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('✓ KDS Realtime WebSocket connected on /ws (station: ' + this.activeStation + ')');
                if (this.lastSequence) {
                    this.ws.send(JSON.stringify({
                        type: 'SYNC_REQUEST',
                        lastSequence: this.lastSequence
                    }));
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleRealtimeEvent(msg);
                } catch (e) {}
            };

            this.ws.onclose = () => {
                // Auto-reconnect after 3s
                setTimeout(() => this.connectRealtime(), 3000);
            };

            this.ws.onerror = () => {
                try { this.ws.close(); } catch (e) {}
            };
        } catch (err) {
            console.warn('Realtime connection unavailable:', err);
        }
    }

    handleRealtimeEvent(msg) {
        if (!msg || !msg.eventType) return;

        // Duplicate event protection: ignore if already handled
        if (msg.eventId && this.seenEventIds.has(msg.eventId)) return;
        if (msg.eventId) this.seenEventIds.add(msg.eventId);

        // Track sequence for seamless reconnect sync
        if (msg.sequence) this.lastSequence = msg.sequence;

        // Stale event protection: drop events older than 60s
        if (msg.timestamp) {
            const ageMs = Date.now() - new Date(msg.timestamp).getTime();
            if (ageMs > 60000) return;
        }

        switch (msg.eventType) {
            case 'kitchen.ticket_created':
                this.audio.playNewOrderBell();
                this.showToast(`🔔 New Ticket: ${msg.payload?.kotNumber || 'New Order'}`, 'info');
                this.fetchTickets();
                break;

            case 'kitchen.ticket_bumped':
                if (msg.payload?.globalOrderReady) {
                    this.showToast(`✓ Order ${msg.payload?.orderNumber} is READY!`, 'success');
                } else {
                    this.showToast(`Station ticket bumped (${msg.payload?.completionPercentage}% done)`, 'info');
                }
                this.fetchTickets(true);
                this.fetchRecalledTicketsCount();
                break;

            case 'kitchen.ticket_delayed':
                this.showToast(`⚠ Ticket delayed (+${msg.payload?.delayMinutes} min): ${msg.payload?.reason || ''}`, 'warning');
                this.fetchTickets(true);
                break;

            case 'stock.finished':
                this.showToast(`🚨 Item 86 Out of Stock: ${msg.payload?.name || ''}`, 'warning');
                this.fetch86List();
                this.fetchTickets(true);
                break;

            case 'stock.low':
                this.showToast(`Stock updated: ${msg.payload?.name || ''}`, 'info');
                this.fetch86List();
                break;
        }
    }

    setupEventListeners() {
        // Station filter tab taps
        this.dom.stationTabsNav.addEventListener('click', (e) => {
            const tab = e.target.closest('.station-tab');
            if (!tab) return;
            const station = tab.dataset.station;
            this.setActiveStation(station);
        });

        // Audio unlock on any tap
        document.addEventListener('touchstart', () => this.audio.init(), { once: true });
        document.addEventListener('click', () => this.audio.init(), { once: true });

        // Sound toggle
        this.dom.soundToggleBtn.addEventListener('click', () => {
            const isMuted = this.audio.toggleMute();
            this.updateSoundButtonUI();
            this.showToast(isMuted ? 'Audio muted' : 'Audio alerts enabled', 'info');
        });

        // Fullscreen toggle
        this.dom.fullscreenToggleBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Rush order creation
        this.dom.rushOrderBtn.addEventListener('click', () => {
            this.createRushDemoOrder();
        });

        // Recall modal
        this.dom.recallModalBtn.addEventListener('click', () => {
            this.openRecallModal();
        });
        this.dom.btnCloseRecall.addEventListener('click', () => {
            this.dom.recallModal.classList.add('hidden');
        });

        // 86 Items modal
        this.dom.btn86Modal.addEventListener('click', () => {
            this.open86Modal();
        });
        this.dom.btnOpen86FromBanner.addEventListener('click', () => {
            this.open86Modal();
        });
        this.dom.btnClose86.addEventListener('click', () => {
            this.dom.item86Modal.classList.add('hidden');
        });

        // Print modal dismissal
        this.dom.btnClosePrint.addEventListener('click', () => {
            this.dom.printModal.classList.add('hidden');
        });
        this.dom.btnDismissPrint.addEventListener('click', () => {
            this.dom.printModal.classList.add('hidden');
        });
        this.dom.btnTriggerPrint.addEventListener('click', () => {
            window.print();
        });

        // Ticket action delegation on grid (BUMP, HOLD, PRINT)
        this.dom.ticketsGrid.addEventListener('click', (e) => {
            const bumpBtn = e.target.closest('.bump-btn');
            if (bumpBtn) {
                const ticketId = bumpBtn.dataset.ticketId;
                this.bumpTicket(ticketId, bumpBtn);
                return;
            }

            const holdBtn = e.target.closest('.hold-btn');
            if (holdBtn) {
                const ticketId = holdBtn.dataset.ticketId;
                this.holdTicket(ticketId);
                return;
            }

            const printBtn = e.target.closest('.print-btn');
            if (printBtn) {
                const ticketId = printBtn.dataset.ticketId;
                this.openPrintModal(ticketId);
                return;
            }
        });
    }

    startClock() {
        const update = () => {
            const now = new Date();
            this.dom.liveClock.textContent = now.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        };
        update();
        setInterval(update, 1000);
    }

    updateSoundButtonUI() {
        if (this.audio.isMuted) {
            this.dom.soundIcon.textContent = '🔇';
            this.dom.soundLabel.textContent = 'Muted';
        } else {
            this.dom.soundIcon.textContent = '🔊';
            this.dom.soundLabel.textContent = 'Sound ON';
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn('Fullscreen request failed:', err.message);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    setActiveStation(station) {
        this.activeStation = station;
        document.querySelectorAll('.station-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.station === station);
        });

        this.dom.activeStationTitle.textContent = station === 'ALL'
            ? 'ALL STATIONS'
            : `${station} STATION`;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'SUBSCRIBE',
                channel: station === 'ALL' ? 'kds' : `kds:${station}`
            }));
        }

        this.renderTickets();
    }

    async fetchTickets(isBackground = false) {
        try {
            const res = await fetch(`/api/kds/tickets?station=ALL&status=ACTIVE`);
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                const incomingTickets = data.data;

                // Check for brand new incoming tickets to chime bell
                if (isBackground && this.knownTicketIds.size > 0) {
                    const newFound = incomingTickets.some(t => !this.knownTicketIds.has(t.ticketId));
                    if (newFound) {
                        this.audio.playNewOrderBell();
                        this.showToast('🔔 New kitchen order ticket received!', 'info');
                    }
                }

                // Update known IDs
                this.knownTicketIds.clear();
                incomingTickets.forEach(t => this.knownTicketIds.add(t.ticketId));

                this.tickets = incomingTickets;
                this.updateStationCounts();
                this.renderTickets();
                this.updateKpiCounters();
            }
        } catch (err) {
            console.error('Failed to fetch kitchen tickets:', err);
        }
    }

    updateStationCounts() {
        const counts = {
            ALL: this.tickets.length,
            CURRY: 0,
            TANDOOR: 0,
            GRILL: 0,
            WOK: 0,
            PACKING: 0
        };

        this.tickets.forEach(t => {
            const code = t.station?.code?.toUpperCase();
            if (counts[code] !== undefined) {
                counts[code]++;
            }
        });

        document.getElementById('count-all').textContent = counts.ALL;
        document.getElementById('count-curry').textContent = counts.CURRY;
        document.getElementById('count-tandoor').textContent = counts.TANDOOR;
        document.getElementById('count-grill').textContent = counts.GRILL;
        document.getElementById('count-wok').textContent = counts.WOK;
        document.getElementById('count-packing').textContent = counts.PACKING;
    }

    updateKpiCounters() {
        let onTime = 0;
        let warning = 0;
        let late = 0;

        this.tickets.forEach(t => {
            if (t.urgencyState === 'NORMAL') onTime++;
            else if (t.urgencyState === 'AMBER') warning++;
            else if (t.urgencyState === 'LATE') late++;
        });

        this.dom.kpiOnTime.textContent = onTime;
        this.dom.kpiWarning.textContent = warning;
        this.dom.kpiLate.textContent = late;
    }

    tickTimers() {
        if (!this.tickets.length) return;

        const now = Date.now();
        this.tickets.forEach(t => {
            const createdAtMs = new Date(t.createdAt).getTime();
            t.elapsedSeconds = Math.max(0, Math.floor((now - createdAtMs) / 1000));
            const targetSeconds = (t.targetPrepMinutes || 12) * 60;
            t.remainingSeconds = targetSeconds - t.elapsedSeconds;

            if (t.remainingSeconds <= 0) {
                t.urgencyState = 'LATE';
            } else if (t.remainingSeconds <= 180) {
                t.urgencyState = 'AMBER';
            } else {
                t.urgencyState = 'NORMAL';
            }

            // Format timer display
            if (t.remainingSeconds >= 0) {
                const mins = String(Math.floor(t.remainingSeconds / 60)).padStart(2, '0');
                const secs = String(t.remainingSeconds % 60).padStart(2, '0');
                t.timerDisplay = `${mins}:${secs}`;
            } else {
                const overdue = Math.abs(t.remainingSeconds);
                const mins = String(Math.floor(overdue / 60)).padStart(2, '0');
                const secs = String(overdue % 60).padStart(2, '0');
                t.timerDisplay = `+${mins}:${secs}`;
            }

            // Live update DOM node without full re-render
            const card = document.getElementById(`ticket-card-${t.ticketId}`);
            if (card) {
                const timerEl = card.querySelector('.countdown-timer');
                if (timerEl) {
                    timerEl.textContent = t.timerDisplay;
                }
                card.className = `ticket-card urgency-${t.urgencyState.toLowerCase()} ${t.isHeld ? 'held-state' : ''}`;
            }
        });

        this.updateKpiCounters();
    }

    renderTickets() {
        const filtered = this.tickets.filter(t => {
            if (this.activeStation === 'ALL') return true;
            return t.station?.code?.toUpperCase() === this.activeStation;
        });

        if (filtered.length === 0) {
            this.dom.ticketsGrid.innerHTML = `
                <div class="kds-empty-state">
                    <div class="empty-icon">✨👨‍🍳</div>
                    <h3 class="empty-title">All Caught Up on ${this.activeStation}!</h3>
                    <p class="empty-desc">No tickets currently in queue for this station. When orders are placed at POS or delivery apps, tickets will appear automatically.</p>
                    <button class="touch-action-btn btn-rush" id="empty-state-rush-btn">
                        <span>⚡</span> Create Test Rush Order
                    </button>
                </div>
            `;
            const emptyRush = document.getElementById('empty-state-rush-btn');
            if (emptyRush) {
                emptyRush.addEventListener('click', () => this.createRushDemoOrder());
            }
            return;
        }

        this.dom.ticketsGrid.innerHTML = filtered.map(t => this.generateTicketHTML(t)).join('');
    }

    generateTicketHTML(t) {
        const urgencyClass = `urgency-${t.urgencyState?.toLowerCase() || 'normal'}`;
        const isHeld = (t.kotNumber || '').includes('[HOLD]');
        const heldClass = isHeld ? 'held-state' : '';

        // Station color class
        const stationCode = (t.station?.code || 'CURRY').toLowerCase();

        // Channel formatted
        const channel = (t.channel || 'DINE_IN').toLowerCase();
        let channelIcon = '🍽️';
        if (channel === 'delivery') channelIcon = '🛵';
        else if (channel === 'walk_in') channelIcon = '🛍️';
        else if (channel === 'qr') channelIcon = '📱';

        // Multi-station completion percentage & progress
        const completionPct = t.multiStation?.completionPercentage || 0;
        const totalStations = t.multiStation?.totalStations || 1;
        const bumpedStations = t.multiStation?.bumpedStations || 0;

        // Rider ETA
        let riderEtaHTML = '';
        if (t.channel === 'DELIVERY') {
            const etaMins = t.riderEtaMinutes || 3;
            riderEtaHTML = `
                <div class="rider-eta-box">
                    <span class="rider-eta-label">🛵 Rider ETA:</span>
                    <span class="rider-eta-time">${String(etaMins).padStart(2, '0')} min</span>
                </div>
            `;
        }

        // Allergy Warning Strip
        let allergyHTML = '';
        if (t.allergyWarning) {
            allergyHTML = `
                <div class="allergy-alert-box">
                    <span class="allergy-icon">⚠️</span>
                    <div class="allergy-text">ALLERGY: ${t.allergyWarning}</div>
                </div>
            `;
        }

        // Items HTML
        const itemsHTML = (t.items || []).map(item => `
            <div class="ticket-item-row ${item.is86 ? 'is-86' : ''}" data-item-id="${item.menuItemId}" title="Tap to inspect">
                <span class="item-qty">${item.quantity} ×</span>
                <div class="item-details">
                    <span class="item-name">${item.name}</span>
                    ${item.variant ? `<span class="item-modifier">(${item.variant})</span>` : ''}
                    ${item.notes ? `<span class="item-note">${item.notes}</span>` : ''}
                </div>
            </div>
        `).join('');

        return `
            <div class="ticket-card ${urgencyClass} ${heldClass}" id="ticket-card-${t.ticketId}">
                ${isHeld ? `<div class="held-overlay-banner">⏸ ON HOLD - DELAYED</div>` : ''}
                
                <!-- Ticket Header -->
                <div class="ticket-header">
                    <div class="header-left">
                        <span class="ticket-code">${t.displayCode || t.orderNumber}</span>
                        <span class="channel-badge ${channel}">
                            <span>${channelIcon}</span> ${t.channel}
                        </span>
                    </div>
                    <div class="timer-container" title="Target Countdown Timer">
                        <span class="countdown-timer">${t.timerDisplay || '12:00'}</span>
                    </div>
                </div>

                <!-- Station & Multi-Station Meta Strip -->
                <div class="ticket-station-strip">
                    <div class="station-badge-row">
                        <span class="station-tag ${stationCode}">[${t.station?.code || 'STATION'}]</span>
                        <span class="order-kot-number">${t.kotNumber}</span>
                    </div>

                    <!-- Multi-Station Global Order Completion Progress -->
                    <div class="completion-progress-wrapper" title="Global order becomes READY only when every required station ticket is bumped">
                        <div class="completion-label-row">
                            <span>Order Progress (${bumpedStations}/${totalStations} Stations):</span>
                            <span class="completion-percentage-val">${completionPct}%</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: ${completionPct}%;"></div>
                        </div>
                    </div>
                </div>

                <!-- Distance, JIT Scheduling & Token Strip -->
                ${t.distanceKm > 0 ? `
                    <div class="kds-distance-jit-strip" style="display: flex; justify-content: space-between; align-items: center; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 6px; padding: 5px 8px; margin: 4px 12px 8px 12px; font-size: 11px; color: #38bdf8;">
                        <span>🚗 <strong>${t.distanceKm.toFixed(1)} km away</strong> (~${Math.ceil(((t.distanceKm / 15) * 3600 + 120) / 60)} min)</span>
                        <span style="font-weight: 700; color: #10b981;">🎫 Token #${t.tokenNumber || 15} · JIT Arrival Sync</span>
                    </div>
                ` : (t.tokenNumber ? `
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); padding: 0 12px 4px 12px;">
                        <span>🎫 Token #${t.tokenNumber}</span>
                        <span>⚡ Direct Counter Prep</span>
                    </div>
                ` : '')}

                <!-- Items List -->
                <div class="ticket-items-list">
                    ${itemsHTML}
                </div>

                <!-- Allergy Notice -->
                ${allergyHTML}

                <!-- Rider ETA -->
                ${riderEtaHTML}

                <!-- Action Controls: One Tap BUMP & Auxiliary -->
                <div class="ticket-actions-bar">
                    <button class="bump-btn" data-ticket-id="${t.ticketId}" aria-label="Bump station ticket">
                        <span>✓</span> BUMP
                    </button>
                    <div class="secondary-actions-row">
                        <button class="ticket-sub-btn hold-btn ${isHeld ? 'active' : ''}" data-ticket-id="${t.ticketId}">
                            <span>${isHeld ? '▶ Resume' : '⏸ Hold'}</span>
                        </button>
                        <button class="ticket-sub-btn print-btn" data-ticket-id="${t.ticketId}">
                            <span>🖨 Print KOT</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async bumpTicket(ticketId, btnElement) {
        // Immediate visual tactile feedback
        if (btnElement) {
            btnElement.style.transform = 'scale(0.95)';
            btnElement.disabled = true;
            btnElement.innerHTML = `<span>⏳</span> BUMPING...`;
        }

        // Play positive sound chime
        this.audio.playBumpChime();

        try {
            const res = await fetch(`/api/kds/tickets/${ticketId}/bump`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const data = await res.json();
            if (data.success) {
                // Card animated disappearance
                const card = document.getElementById(`ticket-card-${ticketId}`);
                if (card) {
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.85) translateY(20px)';
                }

                // If this bump completed the global order, celebrate!
                if (data.data?.globalOrderReady) {
                    this.showToast(`🎉 Order ${data.data.orderNumber} is now READY! All stations completed.`, 'success');
                } else {
                    this.showToast(`✓ Ticket bumped (${data.data?.completionPercentage}% ready)`, 'success');
                }

                // Refresh after 300ms
                setTimeout(() => {
                    this.fetchTickets();
                    this.fetchRecalledTicketsCount();
                }, 300);
            } else {
                this.showToast(data.message || 'Error bumping ticket', 'error');
                if (btnElement) btnElement.disabled = false;
            }
        } catch (err) {
            console.error('Bump failed:', err);
            this.showToast('Network error while bumping ticket', 'error');
            if (btnElement) btnElement.disabled = false;
        }
    }

    async holdTicket(ticketId) {
        try {
            const res = await fetch(`/api/kds/tickets/${ticketId}/hold`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Kitchen delay hold' })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(data.data?.isHeld ? '⏸ Ticket placed on HOLD' : '▶ Ticket resumed from hold', 'info');
                this.fetchTickets();
            }
        } catch (err) {
            console.error('Hold toggle failed:', err);
        }
    }

    async openPrintModal(ticketId) {
        try {
            const res = await fetch(`/api/kds/tickets/${ticketId}/print`);
            const data = await res.json();
            if (data.success) {
                const p = data.data;
                const itemsList = p.items.map(i => `
                    <div class="slip-item-row">
                        <span>${i.quantity} × ${i.name}</span>
                        <span>[ ]</span>
                    </div>
                    ${i.notes ? `<div style="font-size:12px; font-style:italic;">* ${i.notes}</div>` : ''}
                `).join('');

                this.dom.thermalSlipContent.innerHTML = `
                    <div class="slip-center">
                        <div style="font-size:16px;">${p.outletName}</div>
                        <div style="font-size:13px; margin:4px 0;">KITCHEN DISPLAY TICKET</div>
                        <div style="font-size:18px; font-weight:bold;">${p.kotNumber}</div>
                    </div>
                    <div class="slip-hr"></div>
                    <div><strong>ORDER:</strong> ${p.orderNumber} (${p.channel})</div>
                    <div><strong>STATION:</strong> ${p.station}</div>
                    <div><strong>TABLE:</strong> ${p.tableNumber} | <strong>SERVER:</strong> ${p.serverName}</div>
                    <div><strong>DATE:</strong> ${new Date(p.printedAt).toLocaleTimeString()}</div>
                    ${p.orderNotes ? `<div style="margin-top:6px; padding:4px; background:#eee; font-weight:bold;">${p.orderNotes}</div>` : ''}
                    <div class="slip-hr"></div>
                    <div style="margin-bottom:6px; font-weight:bold;">ITEMS TO PREPARE:</div>
                    ${itemsList}
                    <div class="slip-hr"></div>
                    <div class="slip-center" style="font-size:11px;">*** DISPATCH WHEN READY ***</div>
                `;

                this.dom.printModal.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Failed to load print preview:', err);
        }
    }

    async fetchRecalledTicketsCount() {
        try {
            const res = await fetch('/api/kds/tickets/recalled');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                this.dom.recalledCountBadge.textContent = data.data.length;
            }
        } catch (e) { /* ignore */ }
    }

    async openRecallModal() {
        try {
            const res = await fetch('/api/kds/tickets/recalled');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                if (data.data.length === 0) {
                    this.dom.recallTicketsList.innerHTML = `
                        <div style="text-align:center; padding:30px; color:var(--text-muted);">
                            No bumped tickets available to recall right now.
                        </div>
                    `;
                } else {
                    this.dom.recallTicketsList.innerHTML = data.data.map(t => {
                        const items = t.items.map(i => `${i.quantity} × ${i.item_name}`).join(', ');
                        const bumpedTime = t.bumpedAt ? new Date(t.bumpedAt).toLocaleTimeString() : 'Recently';
                        return `
                            <div class="recall-item-card">
                                <div>
                                    <div style="font-size:1.1rem; font-weight:800; color:#fff;">
                                        ${t.kotNumber} • ${t.orderNumber} (${t.stationCode})
                                    </div>
                                    <div style="font-size:0.85rem; color:var(--text-secondary); margin:4px 0;">
                                        ${items}
                                    </div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">
                                        Bumped at: ${bumpedTime}
                                    </div>
                                </div>
                                <button class="recall-btn" data-recall-id="${t.ticketId}">
                                    ↩ RECALL
                                </button>
                            </div>
                        `;
                    }).join('');

                    // Add recall button handlers
                    this.dom.recallTicketsList.querySelectorAll('.recall-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const ticketId = btn.dataset.recallId;
                            await this.recallTicket(ticketId);
                        });
                    });
                }

                this.dom.recallModal.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Failed to open recall modal:', err);
        }
    }

    async recallTicket(ticketId) {
        try {
            const res = await fetch(`/api/kds/tickets/${ticketId}/recall`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (data.success) {
                this.showToast('Ticket restored to active kitchen queue!', 'success');
                this.dom.recallModal.classList.add('hidden');
                this.fetchTickets();
                this.fetchRecalledTicketsCount();
            }
        } catch (err) {
            console.error('Recall error:', err);
        }
    }

    async fetch86List() {
        try {
            const res = await fetch('/api/kds/86');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                const unavailable = data.data.filter(i => !i.is_available);
                if (unavailable.length > 0) {
                    this.dom.banner86.classList.remove('hidden');
                    this.dom.banner86Items.textContent = unavailable.map(i => i.name).join(', ');
                } else {
                    this.dom.banner86.classList.add('hidden');
                }
            }
        } catch (e) { /* ignore */ }
    }

    async open86Modal() {
        try {
            const res = await fetch('/api/kds/86');
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                this.dom.item86List.innerHTML = data.data.map(i => `
                    <div class="item-86-row">
                        <div class="item-86-info">
                            <h4>${i.name}</h4>
                            <span>${i.category_name} • ₹${(i.base_price_paise / 100).toFixed(0)}</span>
                        </div>
                        <div class="toggle-switch ${i.is_available ? '' : 'is-86'}"
                             data-item-id="${i.id}"
                             data-current-state="${i.is_available}"
                             title="${i.is_available ? 'Available (tap to 86)' : '86 Out of Stock (tap to restore)'}">
                        </div>
                    </div>
                `).join('');

                // Toggle click handlers
                this.dom.item86List.querySelectorAll('.toggle-switch').forEach(sw => {
                    sw.addEventListener('click', async () => {
                        const itemId = sw.dataset.itemId;
                        const currentState = sw.dataset.currentState === 'true';
                        await this.toggle86Item(itemId, !currentState);
                    });
                });

                this.dom.item86Modal.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Failed to open 86 modal:', err);
        }
    }

    async toggle86Item(itemId, newAvailableState) {
        try {
            const res = await fetch(`/api/kds/86/${itemId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isAvailable: newAvailableState })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(data.message, newAvailableState ? 'success' : 'warning');
                this.open86Modal();
                this.fetch86List();
                this.fetchTickets();
            }
        } catch (err) {
            console.error('Toggle 86 failed:', err);
        }
    }

    async createRushDemoOrder() {
        try {
            this.showToast('Generating rush delivery order...', 'info');
            const res = await fetch('/api/kds/rush-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: 'DELIVERY',
                    allergy: 'PEANUT',
                    riderEta: 3
                })
            });

            const data = await res.json();
            if (data.success) {
                this.audio.playNewOrderBell();
                this.showToast(`⚡ Rush Order ${data.order?.order_number} created!`, 'success');
                this.fetchTickets();
            }
        } catch (err) {
            console.error('Rush order creation failed:', err);
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `kds-toast ${type}`;
        toast.textContent = message;
        this.dom.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Instantiate on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
    window.kdsApp = new KDSApplication();
    window.kdsApp.init();
});
