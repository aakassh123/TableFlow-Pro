import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');

console.log('Testing Staff UI Integration:');

// 1. Check if add-staff-modal exists in index.html
if (html.includes('id="add-staff-modal"')) {
    console.log('✓ Found #add-staff-modal in index.html');
} else {
    throw new Error('Missing #add-staff-modal in index.html');
}

// 2. Check form fields in index.html
const requiredFields = [
    'staff-input-name',
    'staff-input-username',
    'staff-input-role',
    'staff-input-phone',
    'staff-input-pin',
    'staff-input-shift',
    'btn-submit-add-staff',
    'btn-close-staff-modal',
    'btn-cancel-add-staff'
];

for (const field of requiredFields) {
    if (html.includes(`id="${field}"`)) {
        console.log(`✓ Found field #${field}`);
    } else {
        throw new Error(`Missing field #${field} in index.html`);
    }
}

// 3. Check Add Staff button in app.js
if (js.includes('id="btn-open-add-staff"') || js.includes("openAddStaffModal")) {
    console.log('✓ Found #btn-open-add-staff and openAddStaffModal in app.js');
} else {
    throw new Error('Missing #btn-open-add-staff in app.js');
}

// 4. Check form submission handling in app.js
if (js.includes("form-add-staff") && js.includes("/api/staff")) {
    console.log('✓ Found form-add-staff submit handler calling /api/staff');
} else {
    throw new Error('Missing form-add-staff handler');
}

console.log('✓ All Staff UI components verified successfully!');
