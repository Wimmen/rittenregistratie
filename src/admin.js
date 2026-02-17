// admin.js

// State
let state = {
    principal: null,
    connectionId: null,
    connected: false,
    view: 'users', // users, flows, executed
    pagination: {
        users: { offset: 0, limit: 10, total: 0, search: '' },
        flows: { offset: 0, limit: 10, total: 0, search: '' },
        executed: { offset: 0, limit: 10, total: 0, search: '' },
        authentications: { offset: 0, limit: 10, total: 0, search: '' },
        migrations: { offset: 0, limit: 10, total: 0, search: '' },
        keys: { offset: 0, limit: 10, total: 0, search: '' },
        roles: { offset: 0, limit: 10, total: 0, search: '' }
    },
    currentUser: null
};

// Constants
const BASE_URL = '/api';
//const SSE_URL = 'https://sanme.azurewebsites.net/api/events/stream';
const SSE_URL = 'http://localhost:54819/api/events/stream';

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app');
const connectionStatus = document.getElementById('connection-status');
const navPills = document.querySelectorAll('.nav-pill');
const views = document.querySelectorAll('.view');

// Init
async function init() {
    setupNavigation();
    setupSearch();
    setupPagination();
    setupModal();
    await checkAuth();
}

// Auth
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
            // Local dev fallback
            if (location.hostname === 'localhost') {
                console.log('Localhost: Dev Admin');
                state.principal = { userId: 'admin', userDetails: 'Admin' };
                showApp();
                initConnection();
            } else {
                authOverlay.classList.remove('hidden');
                appContainer.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error('Auth verification failed', e);
    }
}

document.getElementById('login-btn').addEventListener('click', () => {
    window.location.href = `/.auth/login/aad?post_login_redirect_url=${encodeURIComponent(window.location.href)}`;
});

document.getElementById('logout-btn').addEventListener('click', () => {
    window.location.href = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.href)}`;
});

function showApp() {
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
}

// Connection
async function initConnection() {
    try {
        const res = await fetch(`${BASE_URL}/connections`);
        if (res.ok || res.status === 202) {
            state.connectionId = await res.json();
            connectSSE();
        } else {
            updateConnectionStatus(false);
            setTimeout(initConnection, 3000);
        }
    } catch (e) {
        updateConnectionStatus(false);
        setTimeout(initConnection, 3000);
    }
}

function connectSSE() {
    const eventSource = new EventSource(`${SSE_URL}?connectionId=${state.connectionId}`);

    eventSource.onopen = () => {
        updateConnectionStatus(true);
        refreshCurrentView();
    }

    eventSource.addEventListener('AdminUsersList', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.pagination.users.total = data.Total;
            renderUsers(data.Items);
            updatePaginationUI('users');
        } catch (err) { console.error(err); }
    });

    eventSource.addEventListener('AdminFlowsList', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.pagination.flows.total = data.Total;
            renderFlows(data.Items);
            updatePaginationUI('flows');
        } catch (err) { console.error(err); }
    });

    eventSource.addEventListener('AdminExecutedFlowsList', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.pagination.executed.total = data.Total;
            renderExecutedFlows(data.Items);
            updatePaginationUI('executed');
        } catch (err) { console.error(err); }
    });

    eventSource.addEventListener('AdminMigrationsList', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.pagination.migrations.total = data.Total;
            renderMigrations(data.Items);
            updatePaginationUI('migrations');
        } catch (err) { console.error(err); }
    });

    eventSource.addEventListener('AdminAuthenticationsList', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.pagination.authentications.total = data.Total;
            renderAuthentications(data.Items);
            updatePaginationUI('authentications');
        } catch (err) { console.error(err); }
    });

    eventSource.addEventListener('AdminKeysList', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.pagination.keys.total = data.Total;
            renderKeys(data.Items);
            updatePaginationUI('keys');
        } catch (err) { console.error(err); }
    });

    eventSource.addEventListener('AdminRolesList', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.pagination.roles.total = data.Total;
            renderRoles(data.Items);
            updatePaginationUI('roles');
        } catch (err) { console.error(err); }
    });

    eventSource.addEventListener('AdminUserLoaded', (e) => {
        const data = JSON.parse(e.data);
        if (data && data.length > 0) openUserModal(data[0]);
    });

    eventSource.addEventListener('AdminUserUpdated', (e) => {
        alert('Gebruiker succesvol geüpdatet');
        document.getElementById('user-modal').classList.add('hidden');
        refreshCurrentView();
    });

    eventSource.addEventListener('AdminUserUpdateFailed', (e) => alert('Update mislukt'));

    eventSource.onerror = () => {
        updateConnectionStatus(false);
        eventSource.close();
        setTimeout(initConnection, 3000);
    }
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

async function sendEvent(eventName, data) {
    if (!state.connected) return;
    await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            connectionId: state.connectionId,
            event: eventName,
            version: '1.0',
            data: data
        })
    });
}

// Navigation
function setupNavigation() {
    navPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const target = pill.dataset.target;
            navPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            views.forEach(v => v.classList.remove('active'));
            document.getElementById(target).classList.add('active');

            if (target === 'view-users') state.view = 'users';
            else if (target === 'view-flows') state.view = 'flows';
            else if (target === 'view-executed') state.view = 'executed';
            else if (target === 'view-authentications') state.view = 'authentications';
            else if (target === 'view-migrations') state.view = 'migrations';
            else if (target === 'view-keys') state.view = 'keys';
            else if (target === 'view-roles') state.view = 'roles';

            refreshCurrentView();
        });
    });
}

function refreshCurrentView() {
    if (state.view === 'users') loadUsers();
    else if (state.view === 'flows') loadFlows();
    else if (state.view === 'executed') loadExecutedFlows();
    else if (state.view === 'authentications') loadAuthentications();
    else if (state.view === 'migrations') loadMigrations();
    else if (state.view === 'keys') loadKeys();
    else if (state.view === 'roles') loadRoles();
}

// Search & Pagination
function setupSearch() {
    ['users', 'flows', 'executed', 'authentications', 'migrations', 'keys', 'roles'].forEach(type => {
        const input = document.getElementById(`${type}-search`);
        let debounce;
        input.addEventListener('input', (e) => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                state.pagination[type].search = e.target.value;
                state.pagination[type].offset = 0;
                refreshCurrentView();
            }, 500);
        });
    });
}

function setupPagination() {
    ['users', 'flows', 'executed', 'authentications', 'migrations', 'keys', 'roles'].forEach(type => {
        const container = document.getElementById(`${type}-pagination`);
        container.querySelector('[data-action="prev"]').addEventListener('click', () => {
            if (state.pagination[type].offset > 0) {
                state.pagination[type].offset -= state.pagination[type].limit;
                refreshCurrentView();
            }
        });
        container.querySelector('[data-action="next"]').addEventListener('click', () => {
            if (state.pagination[type].offset + state.pagination[type].limit < state.pagination[type].total) {
                state.pagination[type].offset += state.pagination[type].limit;
                refreshCurrentView();
            }
        });
    });
}

function updatePaginationUI(type) {
    const p = state.pagination[type];
    const container = document.getElementById(`${type}-pagination`);
    const info = container.querySelector('.page-info');
    const start = p.offset + 1;
    const end = Math.min(p.offset + p.limit, p.total);

    info.textContent = p.total === 0 ? '0 - 0 van 0' : `${start} - ${end} van ${p.total}`;

    container.querySelector('[data-action="prev"]').disabled = p.offset === 0;
    container.querySelector('[data-action="next"]').disabled = (p.offset + p.limit) >= p.total;
}

// Loads
async function loadUsers() {
    const p = state.pagination.users;
    await sendEvent('AdminGetUsers', { offset: p.offset, limit: p.limit, search: p.search });
}

async function loadFlows() {
    const p = state.pagination.flows;
    await sendEvent('AdminGetFlows', { offset: p.offset, limit: p.limit, search: p.search });
}

async function loadExecutedFlows() {
    const p = state.pagination.executed;
    await sendEvent('AdminGetExecutedFlows', { offset: p.offset, limit: p.limit, search: p.search });
}

async function loadAuthentications() {
    const p = state.pagination.authentications;
    await sendEvent('AdminGetAuthentications', { offset: p.offset, limit: p.limit, search: p.search });
}

async function loadMigrations() {
    const p = state.pagination.migrations;
    await sendEvent('AdminGetMigrations', { offset: p.offset, limit: p.limit, search: p.search });
}

async function loadKeys() {
    const p = state.pagination.keys;
    await sendEvent('AdminGetKeys', { offset: p.offset, limit: p.limit, search: p.search });
}

async function loadRoles() {
    const p = state.pagination.roles;
    await sendEvent('AdminGetRoles', { offset: p.offset, limit: p.limit, search: p.search });
}

// Renders
function renderUsers(users) {
    const tbody = document.getElementById('users-list');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.onclick = () => fetchUserDetails(u.Id);
        tr.innerHTML = `
            <td>${u.FirstName || '-'} ${u.LastName || '-'}</td>
            <td>${u.Email || '-'}</td>
            <td>${u.Roles || '-'}</td>
            <td>${u.Disabled ? '<span class="badge badge-error">Disabled</span>' : '<span class="badge badge-success">Active</span>'}</td>
            <td>${new Date(u.LastLogin).toLocaleDateString() || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderFlows(flows) {
    const tbody = document.getElementById('flows-list');
    tbody.innerHTML = '';
    flows.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.Name}</td>
            <td>${f.Version}</td>
            <td><span class="badge badge-neutral">${f.Status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderExecutedFlows(list) {
    const tbody = document.getElementById('executed-list');
    tbody.innerHTML = '';
    list.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.Name}</td>
            <td>${new Date(i.Start + 'Z').toLocaleString()}</td>
            <td>${i.Duration}</td>
            <td>${i.UserId || '-'}</td>
            <td>${i.Status === 'Failed' ? '<span class="badge badge-error">Failed</span>' : `<span class="badge badge-success">${i.Status}</span>`}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderMigrations(list) {
    const tbody = document.getElementById('migrations-list');
    tbody.innerHTML = '';
    list.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.Name}</td>
            <td>${i.Query}</td>
            <td>${i.UserId || '-'}</td>
            <td>${new Date(i.ExecutedAt + 'Z').toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAuthentications(list) {
    const tbody = document.getElementById('authentications-list');
    tbody.innerHTML = '';
    list.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.Id}</td>
            <td>${i.Name}</td>
            <td>${i.Type}</td>
            <td>${i.Parameters}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderKeys(list) {
    const tbody = document.getElementById('keys-list');
    tbody.innerHTML = '';
    list.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.Name}</td>
            <td>${i.Type}</td>
            <td>${i.Key}</td>
            <td>${new Date(i.ValidUntil + 'Z').toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderRoles(list) {
    const tbody = document.getElementById('roles-list');
    tbody.innerHTML = '';
    list.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i.Name}</td>
        `;
        tbody.appendChild(tr);
    });
}

// User Detail Modal
async function fetchUserDetails(id) {
    await sendEvent('AdminGetUser', { id: id });
}

function setupModal() {
    document.querySelectorAll('.close-modal').forEach(b => {
        b.addEventListener('click', () => document.getElementById('user-modal').classList.add('hidden'));
    });

    document.getElementById('save-user-btn').addEventListener('click', async () => {
        if (!state.currentUser) return;

        const roles = document.getElementById('edit-roles').value;
        const disabled = document.getElementById('edit-disabled').checked;

        await sendEvent('AdminUpdateUser', {
            id: state.currentUser.Id,
            role: role,
            disabled: disabled ? 1 : 0
        });
    });
}

function openUserModal(user) {
    state.currentUser = user;
    const modal = document.getElementById('user-modal');
    const content = document.getElementById('user-detail-content');

    content.innerHTML = `
        <div class="form-group">
            <label>Naam</label>
            <input type="text" value="${user.FirstName} ${user.LastName}" disabled>
        </div>
        <div class="form-group">
            <label>Email</label>
            <input type="text" value="${user.Email}" disabled>
        </div>
        <div class="form-group">
            <label>Rollen</label>
            <select id="edit-roles" multiple style="width: 100%; padding: 12px; border-radius: 12px; border: 1px solid var(--border);">
                <option value="User" ${user.Roles.includes('User') ? 'selected' : ''}>User</option>
                <option value="Admin" ${user.Roles.includes('Admin') ? 'selected' : ''}>Admin</option>
            </select>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 12px;">
            <input type="checkbox" id="edit-disabled" ${user.Disabled ? 'checked' : ''} style="width: auto;">
            <label for="edit-disabled" style="margin: 0;">Gebruiker uitschakelen</label>
        </div>
    `;

    modal.classList.remove('hidden');
}

init();
