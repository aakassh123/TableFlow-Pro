import http from 'http';

http.get('http://localhost:3000/', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        const hasDarkToken = body.includes('id="success-token-display"') && body.includes('color: #0f172a');
        const hasHiddenTransit = body.includes('id="success-distance-banner"') && body.includes('display: none');
        const hasHighContrastPreset = body.includes('id="takeaway-distance-input"') && body.includes('color: #92400e');
        
        console.log('HTTP Verification Results for Payment Successful UI:');
        console.log('1. High contrast Token display (#0f172a):', hasDarkToken ? 'PASS' : 'FAIL');
        console.log('2. Transit banner hidden by default (display: none):', hasHiddenTransit ? 'PASS' : 'FAIL');
        console.log('3. Preset distance chip high contrast (#92400e):', hasHighContrastPreset ? 'PASS' : 'FAIL');
        
        if (hasDarkToken && hasHiddenTransit && hasHighContrastPreset) {
            console.log('\nALL UI VERIFICATION CHECKS PASSED!');
            process.exit(0);
        } else {
            console.error('\nSOME UI CHECKS FAILED!');
            process.exit(1);
        }
    });
}).on('error', (err) => {
    console.error('Request failed:', err.message);
    process.exit(1);
});
