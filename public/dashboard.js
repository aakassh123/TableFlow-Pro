// Operational Manager Board - Client Controller
// Live KPI sync, Kitchen Health traffic lights, Inventory thresholds, Cook Next Batch, and PO Approvals

(function() {
    'use strict';

    const state = {
        outletId: '33333333-3333-3333-3333-333333333301',
        data: null,
        ws: null
    };

    const els = {
        wsStatusText: document.getElementById('wsStatusText'),
        lastUpdatedText: document.getElementById('lastUpdatedText'),
        kpiIncome: document.getElementById('kpiIncome') || document.getElementById('kpiSales'),
        kpiSales: document.getElementById('kpiSales'),
        kpiDiscounts: document.getElementById('kpiDiscounts'),
        kpiDiscountRatio: document.getElementById('kpiDiscountRatio'),
        kpiNetSales: document.getElementById('kpiNetSales'),
        kpiTaxDisplay: document.getElementById('kpiTaxDisplay'),
        kpiOrders: document.getElementById('kpiOrders'),
        kpiAvgTicket: document.getElementById('kpiAvgTicket'),
        kpiPromiseHitRate: document.getElementById('kpiPromiseHitRate'),
        statOpen: document.getElementById('statOpen'),
        statDelayed: document.getElementById('statDelayed'),
        statLate: document.getElementById('statLate'),
        inventoryThresholdList: document.getElementById('inventoryThresholdList'),
        batchItemName: document.getElementById('batchItemName'),
        batchYieldDisplay: document.getElementById('batchYieldDisplay'),
        batchReasonDesc: document.getElementById('batchReasonDesc'),
        btnStartBatch: document.getElementById('btnStartBatch'),
        poCountBadge: document.getElementById('poCountBadge'),
        poListContainer: document.getElementById('poListContainer')
    };

    async function init() {
        setupEventListeners();
        await fetchDashboardData();
        initWebSocket();

        // Auto-poll every 15 seconds
        setInterval(fetchDashboardData, 15000);
    }

    async function fetchDashboardData() {
        try {
            const res = await fetch(`/api/dashboard/summary?outletId=${state.outletId}`);
            const json = await res.json();

            if (json.success && json.data) {
                state.data = json.data;
                renderDashboard(json.data);
                els.lastUpdatedText.textContent = `Updated at ${new Date().toLocaleTimeString()}`;
            }
        } catch (err) {
            console.error('Failed to fetch dashboard metrics:', err);
        }
    }

    function renderDashboard(d) {
        // 1. TODAY KPIs
        if (d.today) {
            if (els.kpiIncome) els.kpiIncome.textContent = d.today.totalIncomeFormatted || d.today.salesFormatted || '₹42,850';
            if (els.kpiSales) els.kpiSales.textContent = d.today.salesFormatted || '₹42,850';
            if (els.kpiDiscounts) els.kpiDiscounts.textContent = d.today.discountFormatted || '₹1,200';
            if (els.kpiNetSales) els.kpiNetSales.textContent = d.today.netSalesFormatted || '₹40,707.50';
            if (els.kpiTaxDisplay) els.kpiTaxDisplay.textContent = `Tax: ${d.today.taxFormatted || '₹2,142.50'}`;
            if (els.kpiOrders) els.kpiOrders.textContent = `${d.today.ordersCount} Orders`;
            if (els.kpiAvgTicket) els.kpiAvgTicket.textContent = `${d.today.avgTicketMinutes} min`;
            if (els.kpiPromiseHitRate) els.kpiPromiseHitRate.textContent = `${d.today.promiseHitRate}%`;
        }

        // 2. Kitchen Status
        if (d.kitchen) {
            els.statOpen.textContent = d.kitchen.openCount;
            els.statDelayed.textContent = d.kitchen.delayedCount;
            els.statLate.textContent = d.kitchen.lateCount;
        }

        // 3. Inventory Thresholds
        if (d.inventory && d.inventory.length > 0) {
            let invHtml = '';
            for (const item of d.inventory) {
                const badgeClass = item.trafficStatus.toLowerCase();
                invHtml += `
                    <div class="inventory-row ${badgeClass}">
                        <div class="inv-left">
                            <span class="inv-icon">${item.icon}</span>
                            <div>
                                <div class="inv-name">${escapeHtml(item.name)}</div>
                                <div class="inv-sub">${escapeHtml(item.fullName)} • Reorder ${item.unit === 'kg' ? (item.reorderLevelBaseUnits / 1000).toFixed(1) + 'kg' : (item.reorderLevelBaseUnits + 'g')}</div>
                            </div>
                        </div>
                        <div class="inv-right">
                            <div class="inv-balance">${escapeHtml(item.displayValue)}</div>
                            <span class="inv-badge ${badgeClass}">${escapeHtml(item.trafficStatus)}</span>
                        </div>
                    </div>
                `;
            }
            els.inventoryThresholdList.innerHTML = invHtml;
        }

        // 4. Cook Next Batch
        if (d.cookNextBatch) {
            els.batchItemName.textContent = d.cookNextBatch.item;
            els.batchYieldDisplay.textContent = d.cookNextBatch.yieldDisplay;
            els.batchReasonDesc.textContent = d.cookNextBatch.reason;
        }

        // 5. Purchase Orders
        if (d.purchaseOrders) {
            els.poCountBadge.textContent = `${d.purchaseOrders.awaitingApprovalCount} Awaiting Approval`;

            if (d.purchaseOrders.orders && d.purchaseOrders.orders.length > 0) {
                let poHtml = '';
                for (const po of d.purchaseOrders.orders) {
                    const isApproved = po.status === 'ISSUED';
                    poHtml += `
                        <div class="po-item-card">
                            <div class="po-details">
                                <h4>${escapeHtml(po.poNumber)} • ${escapeHtml(po.supplierName)}</h4>
                                <div class="po-meta">${escapeHtml(po.notes || 'Standard procurement replenishment')}</div>
                            </div>
                            <div class="po-actions">
                                <div class="po-amount">${escapeHtml(po.totalFormatted)}</div>
                                <button type="button" class="btn-approve-po" data-po-id="${po.id}" ${isApproved ? 'disabled style="background: rgba(16,185,129,0.3); border-color:#10b981; color:#fff;"' : ''}>
                                    ${isApproved ? '✓ Approved (ISSUED)' : '✓ Approve PO'}
                                </button>
                            </div>
                        </div>
                    `;
                }
                els.poListContainer.innerHTML = poHtml;
                bindPoApprovalButtons();
            }
        }
    }

    function bindPoApprovalButtons() {
        document.querySelectorAll('.btn-approve-po').forEach(btn => {
            btn.addEventListener('click', async () => {
                const poId = btn.getAttribute('data-po-id');
                if (!poId || btn.disabled) return;

                btn.disabled = true;
                btn.textContent = 'Approving...';

                try {
                    const res = await fetch(`/api/dashboard/purchase-orders/${poId}/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ outletId: state.outletId })
                    });
                    const json = await res.json();

                    if (json.success) {
                        btn.textContent = '✓ Approved (ISSUED)';
                        btn.style.background = 'rgba(16, 185, 129, 0.3)';
                        btn.style.borderColor = '#10b981';
                        btn.style.color = '#fff';
                        fetchDashboardData();
                    } else {
                        btn.disabled = false;
                        btn.textContent = '✓ Approve PO';
                        alert('Error: ' + (json.message || 'Failed to approve PO'));
                    }
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = '✓ Approve PO';
                    alert('Network error approving purchase order');
                }
            });
        });
    }

    function setupEventListeners() {
        // Start Batch Cooking Button
        els.btnStartBatch.addEventListener('click', async () => {
            els.btnStartBatch.disabled = true;
            els.btnStartBatch.innerHTML = `<span>⏳ Dispatching Prep Ticket...</span>`;

            try {
                const res = await fetch('/api/dashboard/batch-cook/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        outletId: state.outletId,
                        item: 'Makhani Gravy',
                        portions: 8,
                        stationCode: 'CURRY'
                    })
                });
                const json = await res.json();
                if (json.success) {
                    els.btnStartBatch.innerHTML = `<span>🍳 BATCH IN PROGRESS</span>`;
                    els.btnStartBatch.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                    els.btnStartBatch.style.color = '#fff';
                }
            } catch (e) {
                els.btnStartBatch.disabled = false;
                els.btnStartBatch.innerHTML = `<span>⚡ START BATCH NOW</span>`;
            }
        });
    }

    function initWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            state.ws = new WebSocket(wsUrl);

            state.ws.onopen = () => {
                state.ws.send(JSON.stringify({
                    type: 'AUTH_REGISTER',
                    role: 'manager',
                    outletId: state.outletId
                }));
                els.wsStatusText.textContent = 'Live Sync Active';
            };

            state.ws.onclose = () => {
                els.wsStatusText.textContent = 'Reconnecting...';
                setTimeout(initWebSocket, 3000);
            };

            state.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    // Refresh metrics on relevant kitchen, order, or stock events
                    if (msg.event && (msg.event.startsWith('order.') || msg.event.startsWith('kitchen.') || msg.event.startsWith('stock.'))) {
                        fetchDashboardData();
                    }
                } catch (e) { }
            };
        } catch (e) { }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Auto-run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
