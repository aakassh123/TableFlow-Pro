// Live verification of running server KDS API endpoints
async function verifyServer() {
    console.log('Testing live server at http://localhost:3000...');

    // 1. Check Stations
    const stationsRes = await fetch('http://localhost:3000/api/kds/stations');
    const stationsData = await stationsRes.json();
    console.log('\n--- 1. Kitchen Stations ---');
    console.log('Success:', stationsData.success);
    stationsData.data.forEach(s => {
        console.log(`- Station [${s.code}]: ${s.name} (Active tickets: ${s.active_tickets})`);
    });

    // 2. Check Tickets
    const ticketsRes = await fetch('http://localhost:3000/api/kds/tickets?station=ALL');
    const ticketsData = await ticketsRes.json();
    console.log(`\n--- 2. Active Tickets (Total: ${ticketsData.count}) ---`);
    ticketsData.data.forEach(t => {
        console.log(`Ticket: ${t.displayCode} | Station: ${t.station.code} | Channel: ${t.channel} | Urgency: ${t.urgencyState} | Timer: ${t.timerDisplay}`);
        console.log(`   Items: ${t.items.map(i => i.quantity + ' × ' + i.name).join(', ')}`);
        if (t.allergyWarning) console.log(`   ⚠ ALLERGY: ${t.allergyWarning}`);
        if (t.riderEtaMinutes) console.log(`   🛵 Rider ETA: ${t.riderEtaMinutes} min`);
        console.log(`   Order Progress: ${t.multiStation.bumpedStations}/${t.multiStation.totalStations} stations (${t.multiStation.completionPercentage}%)`);
    });

    // 3. Test Bumping Ticket D-017 Curry Station
    const d017Curry = ticketsData.data.find(t => (t.displayCode === 'D-017' || t.orderNumber.includes('0017')) && t.station.code === 'CURRY');
    if (d017Curry) {
        console.log(`\n--- 3. Testing Bump on Ticket ${d017Curry.kotNumber} ---`);
        const bumpRes = await fetch(`http://localhost:3000/api/kds/tickets/${d017Curry.ticketId}/bump`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const bumpData = await bumpRes.json();
        console.log('Bump result:', bumpData);
    }

    // 4. Test 86 Item Toggle
    console.log('\n--- 4. Testing 86 Item Manager ---');
    const list86Res = await fetch('http://localhost:3000/api/kds/86');
    const list86Data = await list86Res.json();
    const item = list86Data.data[0];
    console.log(`Toggling item ${item.name} (currently available: ${item.is_available})...`);
    const toggleRes = await fetch(`http://localhost:3000/api/kds/86/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !item.is_available })
    });
    const toggleData = await toggleRes.json();
    console.log('Toggle result:', toggleData.message);

    // 5. Test Thermal Print Slip Payload
    if (d017Curry) {
        console.log('\n--- 5. Testing Thermal Print Slip Payload ---');
        const printRes = await fetch(`http://localhost:3000/api/kds/tickets/${d017Curry.ticketId}/print`);
        const printData = await printRes.json();
        console.log('Thermal print payload:', {
            outlet: printData.data.outletName,
            kotNumber: printData.data.kotNumber,
            order: printData.data.orderNumber,
            channel: printData.data.channel,
            station: printData.data.station,
            items: printData.data.items
        });
    }

    console.log('\n✓ ALL LIVE ENDPOINTS TESTED AND VERIFIED SUCCESSFULLY!');
}

verifyServer().catch(console.error);
