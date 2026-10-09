// Deterministic ETA Engine
// Based on exact deterministic queuing mathematics from system specification:
// station_load = sum(prep_seconds of queued items) / parallelism
// item_ready = now + station_load + prep_time
// order_ready = max(item_ready) + packing_time
// promise_time = order_ready + buffer (Returned strictly as a range, e.g. "30–35 minutes")

export class ETAEngine {
    /**
     * 1. Calculate Station Load (in seconds)
     * station_load = sum(prep_seconds of queued items) / parallelism
     */
    static calculateStationLoad({
        queuedItems = [],
        capacity = 4, // parallelism / concurrent capacity
        rushLevel = 1.0
    }) {
        const parallelism = Math.max(1, capacity);
        let queuedPrepSeconds = 0;

        for (const item of queuedItems) {
            const qty = item.quantity || 1;
            // Use item historical prep time if available, otherwise base prep time, default 600s (10 min)
            const prep = item.historicalPrepTimeSeconds || item.prepTimeSeconds || 600;
            queuedPrepSeconds += prep * qty;
        }

        // Apply rush factor to queued load
        const totalLoadWithRush = queuedPrepSeconds * Math.max(0.5, rushLevel);
        const stationLoadSeconds = Math.round(totalLoadWithRush / parallelism);

        return {
            stationLoadSeconds,
            parallelism,
            queuedItemsCount: queuedItems.length,
            rawQueuedSeconds: queuedPrepSeconds,
            rushLevel
        };
    }

    /**
     * 2. Calculate Item Ready Time
     * item_ready = now + station_load + prep_time
     */
    static calculateItemReadyTime({
        now = Date.now(),
        stationLoadSeconds = 0,
        prepTimeSeconds = 600,
        rushLevel = 1.0
    }) {
        const effectivePrepSeconds = Math.round(prepTimeSeconds * Math.max(0.5, rushLevel));
        const itemReadySeconds = stationLoadSeconds + effectivePrepSeconds;
        const itemReadyTimestamp = new Date(now + itemReadySeconds * 1000);

        return {
            itemReadySeconds,
            itemReadyTimestamp,
            prepTimeSeconds: effectivePrepSeconds,
            stationLoadSeconds
        };
    }

    /**
     * 3. Calculate Order Ready Time
     * order_ready = max(item_ready) + packing_time
     */
    static calculateOrderReadyTime({
        itemReadyTimes = [],
        packingTimeSeconds = 180 // default 3 minutes for expo & packing
    }) {
        const maxItemReadySeconds = itemReadyTimes.length > 0
            ? Math.max(...itemReadyTimes.map(i => i.itemReadySeconds))
            : 600;

        const orderReadySeconds = maxItemReadySeconds + packingTimeSeconds;

        return {
            orderReadySeconds,
            maxItemReadySeconds,
            packingTimeSeconds
        };
    }

    /**
     * 4. Calculate Promise Range (ALWAYS a range instead of fake precision)
     * promise_time = order_ready + buffer
     * Example: "30–35 minutes", not: "32 minutes"
     */
    static calculatePromiseRange({
        now = Date.now(),
        orderReadySeconds,
        channel = 'DELIVERY',
        customBufferSeconds = null
    }) {
        // Channel-specific delivery and queue buffer tolerances
        let bufferSeconds = customBufferSeconds;
        if (bufferSeconds === null || bufferSeconds === undefined) {
            if (channel === 'DELIVERY') {
                // Delivery has 15% transit/handoff buffer (min 4 minutes)
                bufferSeconds = Math.max(240, Math.round(orderReadySeconds * 0.15));
            } else if (channel === 'WALK_IN' || channel === 'WEBSITE' || channel === 'WHATSAPP') {
                // Takeaway has 10% counter buffer (min 3 minutes)
                bufferSeconds = Math.max(180, Math.round(orderReadySeconds * 0.10));
            } else {
                // Dine-in / QR has 8% pass buffer (min 2 minutes)
                bufferSeconds = Math.max(120, Math.round(orderReadySeconds * 0.08));
            }
        }

        const minPromiseSeconds = orderReadySeconds;
        const maxPromiseSeconds = orderReadySeconds + bufferSeconds;

        const minMinutes = Math.floor(minPromiseSeconds / 60);
        const maxMinutes = Math.ceil(maxPromiseSeconds / 60);

        // Discretize into honest 5-minute confidence windows
        // e.g. 32 minutes becomes "30–35 minutes", 18 minutes becomes "15–20 minutes"
        let lowerBucket = Math.floor(minMinutes / 5) * 5;
        if (lowerBucket < 5) lowerBucket = 5;

        let upperBucket = Math.ceil(maxMinutes / 5) * 5;
        if (upperBucket <= lowerBucket) {
            upperBucket = lowerBucket + 5;
        }

        const rangeDisplay = `${lowerBucket}–${upperBucket} minutes`;

        return {
            minMinutes: lowerBucket,
            maxMinutes: upperBucket,
            rangeDisplay,
            bufferSeconds,
            promiseTimeMin: new Date(now + lowerBucket * 60 * 1000),
            promiseTimeMax: new Date(now + upperBucket * 60 * 1000),
            orderReadySeconds
        };
    }

    /**
     * 4b. Calculate Distance Transit Time and JIT Kitchen Scheduling
     * Ensures distant customers (e.g. 1 km away) have food ready on arrival without
     * blocking or stalling other active orders in the kitchen.
     */
    static calculateDistanceAndJITSchedule({
        distanceKm = 0,
        kitchenPrepSeconds = 600,
        averageSpeedKmh = 15,
        now = Date.now()
    }) {
        const dist = Math.max(0, parseFloat(distanceKm) || 0);
        // Urban transit model: (dist / speed) in hours -> seconds, plus 120s buffer for parking/traffic
        const travelSeconds = dist > 0
            ? Math.round((dist / averageSpeedKmh) * 3600) + 120
            : 0;

        const travelMinutes = Math.ceil(travelSeconds / 60);
        const prepMinutes = Math.ceil(kitchenPrepSeconds / 60);

        // Synchronized ready time: customer arrives when food is freshly ready
        const totalEstimatedSeconds = Math.max(kitchenPrepSeconds, travelSeconds);
        const totalEstimatedMinutes = Math.ceil(totalEstimatedSeconds / 60);

        // JIT (Just-In-Time) Lead Time Analysis
        // If customer travel takes longer than cooking, schedule target fire time
        // so kitchen processes other orders smoothly without leaving food cold on the pass!
        const leadTimeSeconds = Math.max(0, travelSeconds - kitchenPrepSeconds);
        const targetFireTimestamp = new Date(now + leadTimeSeconds * 1000);

        const jitStrategy = leadTimeSeconds > 180
            ? {
                status: 'QUEUED_FOR_ARRIVAL',
                fireInSeconds: leadTimeSeconds,
                fireInMinutes: Math.round(leadTimeSeconds / 60),
                targetFireAt: targetFireTimestamp,
                summary: `Customer is ${dist.toFixed(1)} km away (~${travelMinutes} min transit). JIT fire in ${Math.round(leadTimeSeconds / 60)} min — keeping stations smooth for active orders.`,
                shouldHoldFire: true
            }
            : {
                status: 'FIRE_NOW',
                fireInSeconds: 0,
                fireInMinutes: 0,
                targetFireAt: new Date(now),
                summary: dist > 0
                    ? `Customer is ${dist.toFixed(1)} km away (~${travelMinutes} min transit). Fire immediately (Prep: ~${prepMinutes} min).`
                    : `Immediate preparation (Prep: ~${prepMinutes} min).`,
                shouldHoldFire: false
            };

        return {
            distanceKm: dist,
            travelSeconds,
            travelMinutes,
            kitchenPrepSeconds,
            prepMinutes,
            totalEstimatedSeconds,
            totalEstimatedMinutes,
            customerArrivalTimestamp: new Date(now + travelSeconds * 1000),
            jitStrategy
        };
    }

    /**
     * 5. End-to-End Deterministic ETA Computation for an Order
     */
    static async computeOrderETA(db, {
        orderId,
        outletId = '33333333-3333-3333-3333-333333333301',
        rushLevel = 1.0,
        packingTimeSeconds = 180,
        distanceKm = null,
        now = Date.now()
    }) {
        // 1. Fetch order details
        const orderRes = await db.query(`
            SELECT id, order_number, channel, created_at, status,
                   COALESCE(distance_km, 0) as distance_km
            FROM orders
            WHERE id = $1
        `, [orderId]);

        if (orderRes.rows.length === 0) {
            throw new Error(`Order ${orderId} not found`);
        }
        const order = orderRes.rows[0];

        // Effective distance: passed param or stored order distance
        const effectiveDistance = distanceKm !== null && distanceKm !== undefined
            ? parseFloat(distanceKm)
            : parseFloat(order.distance_km || 0);

        // 2. Fetch order items with menu item prep times and stations
        const itemsRes = await db.query(`
            SELECT oi.id as order_item_id, oi.menu_item_id, oi.quantity,
                   mi.name as item_name,
                   COALESCE(mi.prep_time_seconds, 600) as prep_time_seconds,
                   COALESCE(mi.historical_prep_time_seconds, 600) as historical_prep_time_seconds,
                   ks.id as station_id,
                   COALESCE(ks.code, 'CURRY') as station_code,
                   COALESCE(ks.capacity, 4) as station_capacity
            FROM order_items oi
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            LEFT JOIN station_items si ON mi.id = si.menu_item_id
            LEFT JOIN kitchen_stations ks ON si.station_id = ks.id
            WHERE oi.order_id = $1
        `, [orderId]);

        const orderItems = itemsRes.rows;

        // Group stations needed by order
        const stationsMap = {};
        for (const it of orderItems) {
            const stCode = (it.station_code || 'CURRY').toUpperCase();
            if (!stationsMap[stCode]) {
                stationsMap[stCode] = {
                    stationId: it.station_id,
                    code: stCode,
                    capacity: it.station_capacity || 4,
                    items: []
                };
            }
            stationsMap[stCode].items.push(it);
        }

        // 3. For each station, calculate station load from currently queued tickets
        const stationLoads = {};

        for (const [code, station] of Object.entries(stationsMap)) {
            // Find all active tickets currently queued at this station ahead of or concurrent
            const queuedRes = await db.query(`
                SELECT kti.quantity,
                       COALESCE(mi.prep_time_seconds, 600) as prep_time_seconds,
                       COALESCE(mi.historical_prep_time_seconds, 600) as historical_prep_time_seconds
                FROM kitchen_tickets kt
                JOIN kitchen_ticket_items kti ON kt.id = kti.kitchen_ticket_id
                JOIN order_items oi ON kti.order_item_id = oi.id
                JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE kt.outlet_id = $1
                  AND kt.station_id = $2
                  AND kt.status IN ('QUEUED', 'IN_PROGRESS')
                  AND kt.order_id != $3
            `, [outletId, station.stationId || 'dddddddd-dddd-dddd-dddd-ddddddddddd2', orderId]);

            const loadCalc = this.calculateStationLoad({
                queuedItems: queuedRes.rows,
                capacity: station.capacity,
                rushLevel
            });

            stationLoads[code] = loadCalc;
        }

        // 4. Calculate item_ready for every item in order
        const itemReadyTimes = [];

        for (const it of orderItems) {
            const stCode = (it.station_code || 'CURRY').toUpperCase();
            const stationLoadSec = stationLoads[stCode]?.stationLoadSeconds || 0;

            const prepTime = it.historical_prep_time_seconds || it.prep_time_seconds || 600;

            const itemReady = this.calculateItemReadyTime({
                now,
                stationLoadSeconds: stationLoadSec,
                prepTimeSeconds: prepTime,
                rushLevel
            });

            itemReadyTimes.push({
                orderItemId: it.order_item_id,
                itemName: it.item_name,
                stationCode: stCode,
                ...itemReady
            });
        }

        // 5. Calculate order_ready = max(item_ready) + packing_time
        const orderReady = this.calculateOrderReadyTime({
            itemReadyTimes,
            packingTimeSeconds
        });

        // 6. Distance Transit & JIT Analysis (e.g. for customer ordering 1km away)
        const distanceAnalysis = effectiveDistance > 0
            ? this.calculateDistanceAndJITSchedule({
                distanceKm: effectiveDistance,
                kitchenPrepSeconds: orderReady.orderReadySeconds,
                now
            })
            : null;

        const finalReadySeconds = distanceAnalysis
            ? Math.max(orderReady.orderReadySeconds, distanceAnalysis.totalEstimatedSeconds)
            : orderReady.orderReadySeconds;

        // 7. Calculate promise_time = order_ready + buffer (discretized into range)
        const promiseRange = this.calculatePromiseRange({
            now,
            orderReadySeconds: finalReadySeconds,
            channel: order.channel
        });

        // 8. Store calculated promise range, distance, and JIT status on order
        const travelSecs = distanceAnalysis ? distanceAnalysis.travelSeconds : 0;
        const jitStat = distanceAnalysis ? distanceAnalysis.jitStrategy.status : 'NORMAL';
        const jitFireAt = distanceAnalysis ? distanceAnalysis.jitStrategy.targetFireAt : null;

        await db.query(`
            UPDATE orders
            SET promise_range_min = $1,
                promise_range_max = $2,
                promise_display = $3,
                rush_level = $4,
                distance_km = $5,
                travel_time_seconds = $6,
                jit_status = $7,
                jit_fire_at = $8,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
        `, [
            promiseRange.minMinutes,
            promiseRange.maxMinutes,
            promiseRange.rangeDisplay,
            rushLevel,
            effectiveDistance,
            travelSecs,
            jitStat,
            jitFireAt,
            orderId
        ]);

        return {
            orderId,
            orderNumber: order.order_number,
            channel: order.channel,
            stationLoads,
            itemReadyTimes,
            orderReadySeconds: finalReadySeconds,
            orderReadyTimestamp: new Date(now + finalReadySeconds * 1000),
            packingTimeSeconds,
            promiseRange,
            distanceAnalysis,
            calculatedAt: new Date(now)
        };
    }

    /**
     * 6. Actuals Tracking: accepted_at, started_at, ready_at
     */
    static async recordOrderAccepted(db, orderId, timestamp = new Date()) {
        await db.query(`
            UPDATE orders
            SET accepted_at = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND accepted_at IS NULL
        `, [timestamp, orderId]);
    }

    static async recordOrderStarted(db, orderId, timestamp = new Date()) {
        await db.query(`
            UPDATE orders
            SET started_at = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND started_at IS NULL
        `, [timestamp, orderId]);
    }

    static async recordOrderReady(db, orderId, timestamp = new Date()) {
        await db.query(`
            UPDATE orders
            SET ready_at = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND ready_at IS NULL
        `, [timestamp, orderId]);
    }

    /**
     * 7. Rolling Median Preparation Time Engine
     * Calculates rolling median preparation time from actuals (ready_at - started_at)
     * and updates historical preparation times to continuously calibrate future ETAs!
     */
    static async calculateRollingMedianPrepTimes(db, outletId = '33333333-3333-3333-3333-333333333301') {
        const actualsRes = await db.query(`
            SELECT oi.menu_item_id,
                   o.started_at,
                   o.ready_at
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.outlet_id = $1
              AND o.ready_at IS NOT NULL
              AND o.started_at IS NOT NULL
        `, [outletId]);

        // Group actuals by menu item
        const byItem = {};
        for (const row of actualsRes.rows) {
            const startMs = new Date(row.started_at).getTime();
            const readyMs = new Date(row.ready_at).getTime();
            const sec = Math.round((readyMs - startMs) / 1000);
            if (!isNaN(sec) && sec > 0) {
                if (!byItem[row.menu_item_id]) byItem[row.menu_item_id] = [];
                byItem[row.menu_item_id].push(sec);
            }
        }

        const medians = {};
        for (const [menuItemId, times] of Object.entries(byItem)) {
            times.sort((a, b) => a - b);
            const mid = Math.floor(times.length / 2);
            const medianSec = times.length % 2 !== 0
                ? times[mid]
                : Math.round((times[mid - 1] + times[mid]) / 2);

            medians[menuItemId] = medianSec;

            // Update item historical prep time with rolling median
            await db.query(`
                UPDATE menu_items
                SET historical_prep_time_seconds = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [medianSec, menuItemId]);
        }

        return medians;
    }
}
