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

    eventSource.addEventListener('AdminRoleAdded', (e) => {
        alert('Role toegevoegd');
        document.getElementById('role-modal').classList.add('hidden');
        refreshCurrentView();
    });

    eventSource.addEventListener('AdminRoleAddFailed', (e) => alert('Role toevoegen mislukt'));

    eventSource.addEventListener('AdminRoleUpdated', (e) => {
        alert('Role geüpdatet');
        document.getElementById('role-modal').classList.add('hidden');
        refreshCurrentView();
    });

    eventSource.addEventListener('AdminRoleUpdateFailed', (e) => alert('Role update mislukt'));

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

    // Role Button
    document.getElementById('add-role-btn').addEventListener('click', () => openRoleModal());

    // Key Button
    document.getElementById('add-key-btn').addEventListener('click', () => openKeyModal());
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
    ['users', 'flows', 'executed', 'authentications', 'migrations', 'roles'].forEach(type => {
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
    ['users', 'flows', 'executed', 'authentications', 'migrations', 'roles'].forEach(type => {
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
    const res = await fetch(BASE_URL + '/keys');
    const data = await res.json();
    renderKeys(data);
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
            <td>${i.name}</td>
            <td>${i.type}</td>
            <td>${i.userId}</td>
            <td>${i.key}</td>
            <td>${new Date(i.validUntil + 'Z').toLocaleString()}</td>
            <td>
                <button class="btn-icon delete-key-btn" data-key="${i.key}" title="Verwijderen">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.delete-key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteKey(btn.dataset.key);
        });
    });
}

function renderRoles(list) {
    const tbody = document.getElementById('roles-list');
    tbody.innerHTML = '';
    list.forEach(i => {
        const tr = document.createElement('tr');
        tr.onclick = () => openRoleModal(i);
        tr.style.cursor = 'pointer';
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
        b.addEventListener('click', () => {
            document.getElementById('user-modal').classList.add('hidden');
            document.getElementById('role-modal').classList.add('hidden');
            document.getElementById('key-modal').classList.add('hidden');
        });
    });

    document.getElementById('save-user-btn').addEventListener('click', async () => {
        if (!state.currentUser) return;

        const roles = Array.from(document.getElementById('edit-roles').selectedOptions).map(o => o.value);
        const disabled = document.getElementById('edit-disabled').checked;

        await sendEvent('AdminUpdateUser', {
            id: state.currentUser.Id,
            role: roles.join(', '), // Assuming single role string in DB or modify backend to handle array
            disabled: disabled ? 1 : 0
        });
    });

    document.getElementById('save-role-btn').addEventListener('click', async () => {
        const id = document.getElementById('role-id').value;
        const name = document.getElementById('role-name').value;

        if (!name) return alert('Role name is required');

        if (id) {
            await sendEvent('AdminUpdateRole', { id: id, name: name });
        } else {
            await sendEvent('AdminAddRole', { name: name });
        }
    });

    document.getElementById('save-key-btn').addEventListener('click', async () => {
        await saveKey();
    });

    // Listen for Role events
    /*
    This cannot be done here because eventSource is in initConnection Scope.
    We need to add listeners in connectSSE or use a global event bus. 
    For simplicity, we added listeners in connectSSE but they are not implemented there yet.
    Let's go back and add them there.
    */
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

function openRoleModal(role = null) {
    const modal = document.getElementById('role-modal');
    const title = document.getElementById('role-modal-title');
    const idInput = document.getElementById('role-id');
    const nameInput = document.getElementById('role-name');

    if (role) {
        title.textContent = 'Role Bewerken';
        idInput.value = role.Id;
        nameInput.value = role.Name;
    } else {
        title.textContent = 'Role Toevoegen';
        idInput.value = '';
        nameInput.value = '';
    }

    modal.classList.remove('hidden');
}

function openKeyModal() {
    const modal = document.getElementById('key-modal');
    document.getElementById('key-name').value = '';
    document.getElementById('key-type').value = 'Admin';
    modal.classList.remove('hidden');
}

async function saveKey() {
    const name = document.getElementById('key-name').value;
    const type = document.getElementById('key-type').value;
    const userId = document.getElementById('key-user-id').value;
    const validUntil = document.getElementById('key-valid-until').value;

    if (!name) return alert('Key naam is verplicht');
    if (!type) return alert('Key type is verplicht');

    try {
        const res = await fetch(BASE_URL + '/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, userId, validUntil })
        });

        if (res.ok) {
            alert('Key succesvol aangemaakt');
            document.getElementById('key-modal').classList.add('hidden');
            if (state.view === 'keys') loadKeys();
        } else {
            const err = await res.json();
            alert('Fout bij aanmaken key: ' + (err.error || 'Onbekende fout'));
        }
    } catch (e) {
        console.error(e);
        alert('Netwerkfout bij aanmaken key');
    }
}

async function deleteKey(key) {
    if (!confirm('Weet je zeker dat je deze key wilt verwijderen?')) return;

    try {
        const res = await fetch(BASE_URL + '/keys', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: key })
        });

        if (res.ok) {
            loadKeys();
        } else {
            const err = await res.json();
            alert('Fout bij verwijderen key: ' + (err.error || 'Onbekende fout'));
        }
    } catch (e) {
        console.error(e);
        alert('Netwerkfout bij verwijderen key');
    }
}

init();
