// app.js

// State
let state = {
    user: null,
    principal: null,
    connectionId: null,
    lastMileage: 0,
    recentDrives: [],
    addresses: new Set(),
    connected: false,
    editingId: null,
    car: { brand: '', licensePlate: '' }
};

// Constants
const BASE_URL = '/api';
const SSE_URL = 'https://sanme.azurewebsites.net/api/events/stream'; // External SSE URL

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const connectionStatus = document.getElementById('connection-status');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const driveForm = document.getElementById('drive-form');
const prevMileageEl = document.getElementById('prev-mileage');
const currentMileageInput = document.getElementById('current-mileage');
const calculatedDistanceEl = document.getElementById('calculated-distance');
const addressList = document.getElementById('address-list');
const drivesListContainer = document.getElementById('drives-list');

// Profile Elements
const profileForm = document.getElementById('profile-form');
const profileFirstName = document.getElementById('profile-firstname');
const profileLastName = document.getElementById('profile-lastname');
const profileEmail = document.getElementById('profile-email');
const profileInitials = document.getElementById('profile-initials');
const carForm = document.getElementById('car-form');
const carBrandInput = document.getElementById('car-brand');
const carLicenseInput = document.getElementById('car-license');

// Init
async function init() {
    registerServiceWorker();
    setupNavigation();
    setupForm();
    await checkAuth();
}

// Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('SW Registered'))
                .catch(err => console.log('SW Failed', err));
        });
    }
}

// Authentication
async function checkAuth() {
    try {
        const res = await fetch('/.auth/me');
        const data = await res.json();
        const clientPrincipal = data.clientPrincipal;

        if (clientPrincipal) {
            state.principal = clientPrincipal;
            showApp();
            initConnection();
        } else {
            showLogin();
        }
    } catch (e) {
        console.error('Auth check failed', e);
        // Fallback for local dev without generic auth provider
        if (location.hostname === 'localhost') {
            console.log('Localhost detected, bypassing auth for dev');
            state.principal = { userId: 'dev-user', userDetails: 'Developer' };
            showApp();
            initConnection();
        } else {
            showLogin();
        }
    }
}

function showLogin() {
    authOverlay.classList.remove('hidden');
    appContainer.classList.add('hidden');
}

function showApp() {
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // Set today's date
    document.getElementById('date').valueAsDate = new Date();
}

loginBtn.addEventListener('click', () => {
    window.location.href = `/.auth/login/aad?post_login_redirect_url=${encodeURIComponent(window.location.href)}`;
});

logoutBtn.addEventListener('click', () => {
    window.location.href = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.href)}`;
});

// Navigation
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.target;

            // UI Updates
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            views.forEach(view => view.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// Connection & Data
async function initConnection() {
    try {
        const res = await fetch(`${BASE_URL}/connections`);
        if (res.ok || res.status === 202) {
            state.connectionId = await res.json();
            connectSSE();

            // If 202, it means we are connected but maybe first time setup is needed or we want to force profile check
            // Requirement: "When a 202 is received... tab should become active and user created"
            if (res.status === 202) {
                handleNewConnection();
            } else {
                requestInitialData();
            }
        } else {
            console.error('Connection failed', res);
            updateConnectionStatus(false);
            setTimeout(initConnection, 3000);
        }
    } catch (e) {
        console.error('Connection failed', e);
        updateConnectionStatus(false);
        setTimeout(initConnection, 3000);
    }
}

function connectSSE() {
    const eventSource = new EventSource(`${SSE_URL}?connectionId=${state.connectionId}`);

    eventSource.onopen = () => updateConnectionStatus(true);

    eventSource.addEventListener('connection', (e) => {
        console.log('Connected', e.data);
    });

    // Handle Custom Events
    eventSource.addEventListener('RecentDrivesList', (e) => {
        try {
            const data = JSON.parse(e.data);
            handleRecentDrives(data);
        } catch (err) { console.error('Error parsing RecentDrivesList', err); }
    });

    eventSource.addEventListener('DriveRegistered', (e) => {
        handleSuccess('Rit succesvol opgeslagen!');
    });

    eventSource.addEventListener('DriveUpdated', (e) => {
        handleSuccess('Rit succesvol bijgewerkt!');
    });

    eventSource.addEventListener('UserCreationSuccess', (e) => {
        console.log('User created or already exists');
    });

    eventSource.addEventListener('CarTableCreated', (e) => {
        console.log('Car table ready');
    });

    eventSource.addEventListener('CarLoaded', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data && data.length > 0) {
                state.car = data[0];
                updateProfileUI(); // Fill form
            }
        } catch (err) { console.error('Error parsing CarLoaded', err); }
    });

    eventSource.addEventListener('UserLoaded', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data && data.length > 0) {
                state.user = data[0];
                updateProfileUI(); // Fill form
            }
        } catch (err) { console.error('Error parsing UserLoaded', err); }
    });

    eventSource.addEventListener('CarSaved', (e) => {
        const btn = document.getElementById('save-car-btn');
        btn.textContent = 'Opgeslagen!';
        setTimeout(() => btn.innerHTML = '<span class="btn-text">Auto Opslaan</span>', 2000);
    });

    eventSource.addEventListener('UserSaved', (e) => {
        const btn = document.getElementById('save-profile-btn');
        btn.textContent = 'Opgeslagen!';
        setTimeout(() => btn.innerHTML = '<span class="btn-text">Profiel Opslaan</span>', 2000);
    });

    function handleSuccess(msg) {
        requestInitialData();
        resetForm();
        alert(msg);
    }

    eventSource.onerror = () => {
        updateConnectionStatus(false);
        eventSource.close();
        setTimeout(initConnection, 3000);
    };
}

function updateConnectionStatus(connected) {
    state.connected = connected;
    if (connected) {
        connectionStatus.textContent = 'Verbonden';
        connectionStatus.classList.remove('disconnected');
        connectionStatus.classList.add('connected');
    } else {
        connectionStatus.textContent = 'Verbinden...';
        connectionStatus.classList.remove('connected');
        connectionStatus.classList.add('disconnected');
    }
}

// Logic
function requestInitialData() {
    // We trigger a flow that returns the list of drives
    // Ideally this flow "GetRecentDrives" is triggered by an event
    sendEvent('GetRecentDrives', {});
    sendEvent('GetUser', {});
    sendEvent('GetCar', {});
}

function handleRecentDrives(drives) {
    state.recentDrives = drives || [];

    // Find last mileage
    // Assuming drives are ordered or we sort them. 
    // Let's sort by date/mileage desc just in case
    const sortedDrives = [...state.recentDrives].sort((a, b) => b.mileage - a.mileage);

    if (sortedDrives.length > 0) {
        state.lastMileage = sortedDrives[0].mileage;
    } else {
        state.lastMileage = 0;
    }

    // Update UI
    prevMileageEl.textContent = state.lastMileage + ' km';
    updateCalculatedDistance();

    // Render list
    renderDrivesList(sortedDrives);

    // Update addresses
    state.addresses = new Set();
    state.recentDrives.forEach(d => {
        if (d.from) state.addresses.add(d.from);
        if (d.to) state.addresses.add(d.to);
    });
    renderAddressList();
}

function renderDrivesList(drives) {
    drivesListContainer.innerHTML = '';

    if (!drives || drives.length === 0) {
        drivesListContainer.innerHTML = '<div class="empty-state">Geen recente ritten gevonden.</div>';
        return;
    }

    drives.forEach((drive, index) => {
        const el = document.createElement('div');
        el.className = 'drive-item';
        el.onclick = () => editDrive(drive, index); // Simple edit trigger

        // Add description if exists
        const descHtml = drive.description ? `<div class="drive-desc">${drive.description}</div>` : '';

        el.innerHTML = `
            <div class="drive-main">
                <span class="drive-route">${drive.from} ➝ ${drive.to}</span>
                <span class="drive-meta">${formatDate(drive.date)} • ${drive.type}</span>
                ${descHtml}
            </div>
            <div class="drive-right">
                <span class="drive-distance">${drive.distance} km</span>
                <span class="edit-icon">✎</span>
            </div>
        `;
        drivesListContainer.appendChild(el);
    });
}

function renderAddressList() {
    addressList.innerHTML = '';
    state.addresses.forEach(addr => {
        const opt = document.createElement('option');
        opt.value = addr;
        addressList.appendChild(opt);
    });
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    } catch (e) { return dateStr; }
}

function editDrive(drive, index) {
    state.editingId = drive.id;
    state.lastMileage = sortedDrives.length > index + 1 ? sortedDrives[index + 1].mileage : 0;

    // Fill form
    document.getElementById('date').value = drive.date.split('T')[0];
    document.getElementById('from').value = drive.from;
    document.getElementById('to').value = drive.to;
    document.getElementById('prev-mileage').value = state.lastMileage;
    document.getElementById('current-mileage').value = drive.mileage;
    document.getElementById('description').value = drive.description || '';

    if (drive.type === 'Zakelijk') document.getElementById('type-business').checked = true;
    else document.getElementById('type-private').checked = true;

    updateCalculatedDistance();

    // UI Update
    document.querySelector('.btn-text').textContent = 'Rit Bijwerken';

    // Switch view
    navItems[0].click(); // Go to 'New' tab
}

function resetForm() {
    state.editingId = null;
    driveForm.reset();
    document.getElementById('date').valueAsDate = new Date();
    document.querySelector('.btn-text').textContent = 'Rit Opslaan';
    document.querySelector('.loader').classList.add('hidden');
    document.getElementById('save-btn').disabled = false;
}

// Form Logic
function setupForm() {
    currentMileageInput.addEventListener('input', updateCalculatedDistance);

    driveForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!state.connected) {
            alert('Geen verbinding. Probeer later opnieuw.');
            return;
        }

        const btn = document.getElementById('save-btn');
        const loader = btn.querySelector('.loader');
        const text = btn.querySelector('.btn-text');

        btn.disabled = true;
        text.textContent = 'Opslaan...';
        loader.classList.remove('hidden');

        const currentMileage = parseInt(currentMileageInput.value) || 0;
        const dist = currentMileage - state.lastMileage;

        const payload = {
            id: state.editingId, // Include ID if editing
            date: document.getElementById('date').value,
            type: document.querySelector('input[name="type"]:checked').value,
            from: document.getElementById('from').value,
            to: document.getElementById('to').value,
            mileage: currentMileage,
            distance: dist,
            description: document.getElementById('description').value
        };

        const eventName = state.editingId ? 'UpdateDrive' : 'RegisterDrive';
        await sendEvent(eventName, payload);

        // Timeout override if no response
        setTimeout(() => {
            if (btn.disabled) {
                btn.disabled = false;
                loader.classList.add('hidden');
                // Don't reset text here, it depends on state
            }
        }, 5000);
    });
}

function updateCalculatedDistance(lastMileage) {
    const current = parseInt(currentMileageInput.value) || 0;
    const dist = Math.max(0, current - lastMileage);
    calculatedDistanceEl.textContent = dist + ' km';
}

async function sendEvent(eventName, data) {
    const payload = {
        connectionId: state.connectionId,
        event: eventName,
        version: '1.0',
        data: data
    };

    await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// Profile & User Logic
async function handleNewConnection() {
    // 1. Switch to Profile Tab
    const profileTab = document.querySelector('.nav-item[data-target="view-profile"]');
    if (profileTab) profileTab.click();

    // 2. Create User
    // Parse user details
    getUserInfo();
    console.log('Creating user with info:', state.user);

    // Update local profile UI immediately
    updateProfileUI();

    // 3. Get User Info
    await sendEvent('GetUser', {});
    // 4. Get Car Info
    await sendEvent('GetCar', {});

    // 5. Also get drives
    requestInitialData();
}

function getUserInfo() {
    // Default fallback
    state.user = { firstName: '', lastName: '', email: '' };

    if (state.principal) {
        if (state.principal.userDetails) {
            state.user.email = state.principal.userDetails;
            // Simple name parsing from email if no other data
            // If userDetails is just "Developer", handle that
            if (state.user.email === 'Developer') {
                state.user.firstName = 'Developer';
            } else if (state.user.email.includes('@')) {
                const parts = state.user.email.split('@')[0].split('.');
                if (parts.length > 0) state.user.firstName = capitalize(parts[0]);
                if (parts.length > 1) state.user.lastName = capitalize(parts[1]);
            }
        }
    }
}

function capitalize(s) {
    return s && s[0].toUpperCase() + s.slice(1);
}

function updateProfileUI() {
    if (state.user) {
        profileFirstName.value = state.user.firstName;
        profileLastName.value = state.user.lastName;
        profileEmail.value = state.user.email;
    }

    // Car form
    if (state.car) {
        carBrandInput.value = state.car.brand || '';
        carLicenseInput.value = state.car.licensePlate || '';
    }
}

// Car Form
if (carForm) {
    carForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-car-btn');
        btn.textContent = 'Opslaan...';

        const brand = carBrandInput.value;
        const license = carLicenseInput.value;

        await sendEvent('SaveCar', {
            brand: brand,
            licensePlate: license
        });
    });
}

// Profile Form
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-profile-btn');
        btn.textContent = 'Opslaan...';

        const firstName = profileFirstName.value;
        const lastName = profileLastName.value;
        const email = profileEmail.value;

        await sendEvent('CreateUser', {
            firstName: firstName,
            lastName: lastName,
            email: email
        });
    });
}

// Start
init();
