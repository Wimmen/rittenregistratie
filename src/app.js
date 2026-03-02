// app.js

// State
let state = {
    user: null,
    principal: null,
    connectionId: null,
    lastMileage: 0,
    recentDrives: [],
    sortedDrives: [],
    addresses: new Set(),
    connected: false,
    editingId: null,
    editingIndex: null,
    car: { brand: '', licensePlate: '' }
};

// Constants
const BASE_URL = '/api';
const SSE_URL = 'https://sanme.azurewebsites.net/api/events/stream';
//const SSE_URL = 'http://localhost:54819/api/events/stream'; // External SSE URL

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const resetBtn = document.getElementById('reset-btn');
const saveBtn = document.getElementById('save-btn');
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
        showLogin();
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
            }
        } else {
            console.error('Connection failed', res);
            updateConnectionStatus(false);
            setTimeout(initConnection, 3000);
        }
    } catch (e) {
        console.error('Connection init failed', e);
        updateConnectionStatus(false);
        setTimeout(initConnection, 3000);
    }
}

// Event Listeners
resetBtn.addEventListener('click', () => {
    resetForm();
});

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

            if (targetId === 'view-history') {
                setupHistoryTabs();
            }
        });
    });
}

function setupHistoryTabs() {
    const tabs = document.querySelectorAll('.history-tab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetId = tab.dataset.tab;
            document.querySelectorAll('.history-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'history-stats') {
                initStatsControls();
            }
        };
    });
}

function initStatsControls() {
    const yearSelect = document.getElementById('stats-year');
    const monthSelect = document.getElementById('stats-month');
    const loadBtn = document.getElementById('load-stats-btn');

    if (yearSelect.options.length === 0) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= currentYear - 5; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }
        monthSelect.value = new Date().getMonth() + 1;
    }

    loadBtn.onclick = () => loadStatistics();

    // Copy buttons
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.onclick = () => copyToClipboard(btn.dataset.copy);
    });
}

async function loadStatistics() {
    const year = document.getElementById('stats-year').value;
    const month = document.getElementById('stats-month').value;
    const resultsContainer = document.getElementById('stats-results');

    resultsContainer.classList.add('hidden');
    await sendEvent('GetStatistics', { Year: parseInt(year), Month: parseInt(month) });
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

    eventSource.addEventListener('DriveLocationsList', (e) => {
        try {
            const data = JSON.parse(e.data);
            handleDriveLocations(data);
        } catch (err) { console.error('Error parsing DriveLocationsList', err); }
    });

    eventSource.addEventListener('StatisticsList', (e) => {
        try {
            const data = JSON.parse(e.data);
            renderStatistics(data);
        } catch (err) { console.error('Error parsing StatisticsList', err); }
    });


    eventSource.addEventListener('DriveRegistered', (e) => {
        handleSuccess('Rit succesvol opgeslagen!');
    });

    eventSource.addEventListener('DriveRegistrationFailed', (e) => {
        var error = JSON.parse(e.data);
        alert(error.Error);
    });

    eventSource.addEventListener('DriveUpdated', (e) => {
        if (state.editingId) {
            state.editingId = null;
            handleSuccess('Rit succesvol bijgewerkt!');
        }
    });

    eventSource.addEventListener('UserCreationSuccess', (e) => {
        console.log('User created or already exists');
    });

    eventSource.addEventListener('CarSaveError', (e) => {
        var error = JSON.parse(e.data);
        alert(error.Error);
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
        requestInitialData();
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
    sendEvent('GetDriveLocations', {});
    sendEvent('GetRecentDrives', {});
    sendEvent('GetUser', {});
    sendEvent('GetCar', {});
}

function handleDriveLocations(locations) {
    state.addresses = new Set(locations.map(location => location.location));
    renderAddressList();
}

function handleRecentDrives(drives) {
    state.recentDrives = drives || [];

    // Find last mileage
    // Assuming drives are ordered or we sort them. 
    // Let's sort by date/mileage desc just in case
    state.sortedDrives = [...state.recentDrives].sort((a, b) => b.mileage - a.mileage);

    if (state.sortedDrives.length > 0) {
        state.lastMileage = state.sortedDrives[0].mileage;
        document.getElementById('from').value = state.sortedDrives[0].to;
    } else {
        state.lastMileage = 0;
    }

    // Update UI
    prevMileageEl.textContent = state.lastMileage + ' km';
    updateCalculatedDistance();

    // Render list
    renderDrivesList(state.sortedDrives);
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
    state.editingIndex = index;
    state.editingId = drive.id;
    state.lastMileage = state.sortedDrives.length > index + 1 ? state.sortedDrives[index + 1].mileage : 0;

    // Fill form
    document.getElementById('date').value = drive.date.split('T')[0];
    document.getElementById('from').value = drive.from;
    document.getElementById('to').value = drive.to;
    prevMileageEl.textContent = state.lastMileage + ' km';
    document.getElementById('current-mileage').value = drive.mileage;
    document.getElementById('description').value = drive.description || '';

    if (drive.type === 'Zakelijk') document.getElementById('type-business').checked = true;
    else document.getElementById('type-private').checked = true;

    updateCalculatedDistance();

    // UI Update
    saveBtn.querySelector('.btn-text').textContent = 'Rit Bijwerken';

    // Switch view
    navItems[0].click(); // Go to 'New' tab
}

function resetForm() {
    state.editingId = null;
    state.editingIndex = null;
    driveForm.reset();
    document.getElementById('date').valueAsDate = new Date();
    document.querySelector('.loader').classList.add('hidden');
    saveBtn.querySelector('.btn-text').textContent = 'Rit Opslaan';
    saveBtn.disabled = false;
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

        const loader = saveBtn.querySelector('.loader');
        const text = saveBtn.querySelector('.btn-text');

        saveBtn.disabled = true;
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

        if (state.editingIndex) {
            const nextDrive = state.sortedDrives[state.editingIndex - 1];
            if (nextDrive) {
                nextDrive.distance = nextDrive.mileage - currentMileage;
                await sendEvent('UpdateDrive', nextDrive);
            }
        }

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

function updateCalculatedDistance() {
    const current = parseInt(currentMileageInput.value) || 0;
    const dist = Math.max(0, current - state.lastMileage);
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

function renderStatistics(drives) {
    const resultsContainer = document.getElementById('stats-results');
    const zakelijkEl = document.getElementById('total-zakelijk');
    const privateEl = document.getElementById('total-private');
    const locationsList = document.getElementById('stats-locations-list');
    const detailList = document.getElementById('stats-detail-list');

    resultsContainer.classList.remove('hidden');

    let totalZakelijk = 0;
    let totalPrivate = 0;
    const locationsMap = {};

    detailList.innerHTML = '';

    drives.forEach(drive => {
        if (drive.type === 'Zakelijk') totalZakelijk += drive.distance;
        else totalPrivate += drive.distance;

        // Group by location
        const key = `${drive.from} ➝ ${drive.to}`;
        locationsMap[key] = (locationsMap[key] || 0) + drive.distance;

        // Detail row
        const row = document.createElement('div');
        row.className = 'detail-row';
        row.innerHTML = `
            <span class="date">${formatDate(drive.date)}</span>
            <span class="route">${drive.from} ➝ ${drive.to}</span>
            <span class="dist">${drive.distance} km</span>
        `;
        detailList.appendChild(row);
    });

    zakelijkEl.textContent = totalZakelijk + ' km';
    privateEl.textContent = totalPrivate + ' km';

    // Render locations
    locationsList.innerHTML = '';
    Object.entries(locationsMap).sort((a, b) => b[1] - a[1]).forEach(([route, dist]) => {
        const row = document.createElement('div');
        row.className = 'stats-row';
        row.innerHTML = `
            <span class="loc">${route}</span>
            <span class="dist">${dist} km</span>
        `;
        locationsList.appendChild(row);
    });

    // Store current stats for copying
    state.currentStats = {
        drives: drives,
        locations: locationsMap,
        totals: { zakelijk: totalZakelijk, private: totalPrivate }
    };
}

function copyToClipboard(type) {
    if (!state.currentStats) return;

    let text = '';
    if (type === 'stats-totals') {
        text = `Type\tAfstand\nZakelijk\t${state.currentStats.totals.zakelijk} km\nPrivé\t${state.currentStats.totals.private} km`;
    } else if (type === 'stats-locations') {
        text = `Route\tAfstand\n`;
        Object.entries(state.currentStats.locations).forEach(([route, dist]) => {
            text += `${route}\t${dist} km\n`;
        });
    } else if (type === 'stats-detail-list') {
        text = `Datum\tVan\tNaar\tType\tAfstand\tOmschrijving\n`;
        state.currentStats.drives.forEach(d => {
            text += `${d.date.split('T')[0]}\t${d.from}\t${d.to}\t${d.type}\t${d.distance}\t${d.description || ''}\n`;
        });
    }

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector(`[data-copy="${type}"]`);
        const originalText = btn.textContent;
        btn.textContent = 'Gekopieerd!';
        setTimeout(() => btn.textContent = originalText, 2000);
    });
}

// Start
init();
