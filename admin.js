const AdminPage = (function() {
  const ITEMS_PER_PAGE = 10;
  
  let _users = [];
  let _passes = [];
  let _activities = [];
  
  let passesPage = 1;
  let activityPage = 1;
  let passesStatus = 'all';
  let passesSearch = '';

  function decodeJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) { base64 += '='; }
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('JWT Decode error:', e);
      return null;
    }
  }

  function setupAuthUI() {
    const token = localStorage.getItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token');
    if (!token || token === 'null' || token === 'undefined') {
      window.location.href = 'login.html';
      return;
    }
    
    let name = 'Administrator';
    let role = 'admin';
    let dept = 'Administration';
    
    const decoded = decodeJWT(token);
    if (decoded) {
      name = decoded.name || name;
      role = decoded.role || role;
      dept = decoded.department || dept;
    }

    if (role !== 'admin') {
      window.location.href = '/';
      return;
    }
    
    const initials = name.charAt(0).toUpperCase();

    // Populate user info
    document.getElementById('userNameTopbar').textContent = name;
    document.getElementById('userDeptTopbar').textContent = dept;
    document.getElementById('userAvatarTopbar').textContent = initials;
    
    document.getElementById('userNameSidebar').textContent = name;
    document.getElementById('userRoleSidebar').textContent = Utils.capitalize(role);
    document.getElementById('userAvatarSidebar').textContent = initials;

    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        Utils.clearSession();
        window.location.href = 'login.html';
      });
    }
  }

  function startDateClock() {
    const el = document.getElementById('liveDateDisplay');
    if (!el) return;
    const update = () => { el.textContent = Utils.formatDateLong(); };
    update();
    setInterval(update, 30000);
  }

  function bindNavTabs() {
    const links = document.querySelectorAll('.sidebar-nav .nav-link[data-tab]');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        const tabId = link.getAttribute('data-tab');
        document.querySelectorAll('.admin-tab').forEach(tab => {
          tab.classList.remove('active');
        });
        document.getElementById(`tab-${tabId}`).classList.add('active');
        
        // Load data on demand
        if (tabId === 'overview') loadOverview();
        if (tabId === 'users') loadUsers();
        if (tabId === 'passes') loadPasses();
        if (tabId === 'activity') loadActivity();
      });
    });
  }

  function animateCount(element, target, duration = 600) {
    if (!element) return;
    const start = performance.now();
    const step = (timestamp) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    const headers = { 'Authorization': `Bearer ${token}` };
    if (options.body) headers['Content-Type'] = 'application/json';
    
    const response = await fetch(CONFIG.API_BASE + endpoint, {
      ...options,
      headers
    });
    
    let data;
    try { data = await response.json(); } catch(e) { data = {}; }
    
    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }
    return data;
  }

  // --- OVERVIEW ---
  async function loadOverview() {
    try {
      const data = await fetchAPI('/admin/stats');
      animateCount(document.getElementById('statUsers'), data.totalUsers || 0);
      animateCount(document.getElementById('statPasses'), data.totalPasses || 0);
      animateCount(document.getElementById('statPending'), data.pendingApprovals || 0);
      animateCount(document.getElementById('statActivity'), data.gateActivityLogs || 0);
      
      const passesData = await fetchAPI('/admin/passes?limit=100');
      const pendingPasses = (passesData || []).filter(p => p.status === 'pending').slice(0, 5);
      renderOverviewPending(pendingPasses);
      
      const activityData = await fetchAPI('/admin/gate-activity?limit=5');
      renderOverviewActivity(activityData || []);
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }

  function renderOverviewPending(passes) {
    const tbody = document.getElementById('overviewPendingBody');
    if (!tbody) return;
    if (passes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="panel-empty">No pending passes requiring action.</td></tr>';
      return;
    }
    tbody.innerHTML = passes.map(p => {
      const typeTag = Utils.buildPassTypeTag ? Utils.buildPassTypeTag(p.pass_type) : `<span class="badge badge-pending">${Utils.capitalize(p.pass_type)}</span>`;
      return `
        <tr>
          <td class="font-medium">${Utils.escapeHtml(p.pass_id)}</td>
          <td>${typeTag}</td>
          <td>${Utils.escapeHtml(p.employee_name)}</td>
        </tr>
      `;
    }).join('');
  }

  function renderOverviewActivity(activities) {
    const tbody = document.getElementById('overviewActivityBody');
    if (!tbody) return;
    if (activities.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="panel-empty">No recent gate activity.</td></tr>';
      return;
    }
    tbody.innerHTML = activities.map(act => `
      <tr>
        <td><code style="font-family:var(--font-mono);font-size:var(--text-xs);background:var(--clr-neutral-100);padding:2px 6px;border-radius:var(--radius-sm);color:var(--clr-neutral-700);">${act.log_id}</code></td>
        <td class="font-medium">${Utils.escapeHtml(act.pass_id)}</td>
        <td class="text-sm text-muted">${act.actual_exit_time ? Utils.formatDateTime(act.actual_exit_time) : '—'}</td>
      </tr>
    `).join('');
  }

  // --- USERS ---
  async function loadUsers() {
    try {
      const data = await fetchAPI('/admin/users');
      _users = data || [];
      renderUsersTable();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }

  function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    if (_users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:2rem;">No users found</td></tr>`;
      return;
    }
    
    tbody.innerHTML = _users.map(u => {
      const statusBadge = u.is_active !== false 
        ? `<span class="badge badge-approved">Active</span>` 
        : `<span class="badge badge-rejected">Inactive</span>`;
        
      const actions = `
        <button class="btn btn-sm btn-ghost" title="Edit User" onclick="AdminPage.openUserModal(${u.user_id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        ${u.is_active !== false 
          ? `<button class="btn btn-sm btn-ghost" title="Deactivate User" style="color:var(--clr-danger-500);" onclick="AdminPage.deleteUser(${u.user_id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
              </svg>
            </button>`
          : `<button class="btn btn-sm btn-ghost" title="Reactivate User" style="color:var(--clr-success-500);" onclick="AdminPage.reactivateUser(${u.user_id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </button>`
        }
      `;
      
      return `
        <tr>
          <td><code style="font-family:var(--font-mono);font-size:var(--text-xs);background:var(--clr-neutral-100);padding:2px 6px;border-radius:var(--radius-sm);color:var(--clr-neutral-700);">${u.user_id}</code></td>
          <td class="font-medium">${Utils.escapeHtml(u.name)}</td>
          <td>${Utils.escapeHtml(u.email)}</td>
          <td><span class="badge badge-pending">${Utils.capitalize(u.role)}</span></td>
          <td>${Utils.escapeHtml(u.department || '—')}</td>
          <td>${statusBadge}</td>
          <td><div class="table-actions" style="display:flex; gap:4px;">${actions}</div></td>
        </tr>
      `;
    }).join('');
  }

  function openUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const form = document.getElementById('userForm');
    const pwHelp = document.getElementById('passwordHelpText');
    const idInput = document.getElementById('userId');
    
    form.reset();
    
    if (userId) {
      const user = _users.find(u => u.user_id === userId);
      if (!user) return;
      title.textContent = 'Edit User';
      pwHelp.textContent = 'Leave blank to keep existing password.';
      document.getElementById('userPasswordInput').required = false;
      
      idInput.value = user.user_id;
      document.getElementById('userNameInput').value = user.name;
      document.getElementById('userEmailInput').value = user.email;
      document.getElementById('userRoleInput').value = user.role;
      document.getElementById('userDeptInput').value = user.department || '';
    } else {
      title.textContent = 'Add New User';
      pwHelp.textContent = 'Required for new users.';
      document.getElementById('userPasswordInput').required = true;
      idInput.value = '';
    }
    
    modal.classList.add('show');
  }

  function closeUserModal() {
    document.getElementById('userModal').classList.remove('show');
  }

  async function saveUser() {
    const form = document.getElementById('userForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    const btn = document.getElementById('userSubmitBtn');
    const id = document.getElementById('userId').value;
    const isEdit = !!id;
    
    const payload = {
      name: document.getElementById('userNameInput').value.trim(),
      email: document.getElementById('userEmailInput').value.trim(),
      role: document.getElementById('userRoleInput').value,
      department: document.getElementById('userDeptInput').value.trim(),
      password: document.getElementById('userPasswordInput').value
    };
    
    if (isEdit && !payload.password) delete payload.password;
    
    try {
      btn.classList.add('loading');
      btn.disabled = true;
      
      const endpoint = isEdit ? `/admin/users/${id}` : `/admin/users`;
      const options = {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      };
      
      const res = await fetchAPI(endpoint, options);
      Utils.showToast(res.message, 'success');
      closeUserModal();
      loadUsers();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  async function deleteUser(id) {
    if (!confirm('Are you sure you want to deactivate this user? They will not be able to log in.')) return;
    
    try {
      const res = await fetchAPI(`/admin/users/${id}`, { method: 'DELETE' });
      Utils.showToast(res.message, 'success');
      loadUsers();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }

  async function reactivateUser(id) {
    if (!confirm('Reactivate this user? They will be able to log in again.')) return;
    
    try {
      const res = await fetchAPI(`/admin/users/${id}/reactivate`, { method: 'PUT' });
      Utils.showToast(res.message, 'success');
      loadUsers();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }

  // --- PASSES ---
  async function loadPasses() {
    try {
      const data = await fetchAPI('/admin/passes?limit=100');
      _passes = data || [];
      passesPage = 1;
      renderPassesTable();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }

  function bindPassesControls() {
    document.getElementById('passesStatusFilter').addEventListener('change', (e) => {
      passesStatus = e.target.value;
      passesPage = 1;
      renderPassesTable();
    });
    
    document.getElementById('passesSearch').addEventListener('input', Utils.debounce((e) => {
      passesSearch = e.target.value.toLowerCase();
      passesPage = 1;
      renderPassesTable();
    }));
    
    document.getElementById('passesPrevBtn').addEventListener('click', () => {
      if (passesPage > 1) { passesPage--; renderPassesTable(); }
    });
    document.getElementById('passesNextBtn').addEventListener('click', () => {
      passesPage++; renderPassesTable();
    });
  }

  function renderPassesTable() {
    let filtered = _passes;
    
    if (passesStatus !== 'all') {
      filtered = filtered.filter(p => p.status === passesStatus);
    }
    if (passesSearch) {
      filtered = filtered.filter(p => 
        (p.pass_id && p.pass_id.toLowerCase().includes(passesSearch)) ||
        (p.employee_name && p.employee_name.toLowerCase().includes(passesSearch)) ||
        (p.purpose && p.purpose.toLowerCase().includes(passesSearch))
      );
    }
    
    const tbody = document.getElementById('passesTableBody');
    const info = document.getElementById('passesPageInfo');
    const prev = document.getElementById('passesPrevBtn');
    const next = document.getElementById('passesNextBtn');
    
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">No passes found matching criteria</td></tr>`;
      info.textContent = `Showing 0 - 0 of 0 passes`;
      prev.disabled = true;
      next.disabled = true;
      return;
    }
    
    const startIdx = (passesPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIdx, endIdx);
    
    info.textContent = `Showing ${startIdx + 1} - ${Math.min(endIdx, filtered.length)} of ${filtered.length} passes`;
    prev.disabled = passesPage === 1;
    next.disabled = endIdx >= filtered.length;
    
    tbody.innerHTML = paginated.map(p => {
      let statusClass = 'badge-pending';
      if (p.status === 'approved') statusClass = 'badge-approved';
      if (p.status === 'rejected') statusClass = 'badge-rejected';
      if (p.status === 'used') statusClass = 'badge-used';
      
      const badgeHtml = `<span class="badge ${statusClass}">${Utils.capitalize(p.status)}</span>`;
      const typeTag = Utils.buildPassTypeTag ? Utils.buildPassTypeTag(p.pass_type) : `<span class="badge badge-pending">${Utils.capitalize(p.pass_type)}</span>`;
      
      return `
        <tr>
          <td class="font-medium">${Utils.escapeHtml(p.pass_id)}</td>
          <td>${typeTag}</td>
          <td>${Utils.escapeHtml(p.employee_name)}</td>
          <td><div class="truncate-text" style="max-width:200px;" title="${Utils.escapeHtml(p.purpose)}">${Utils.escapeHtml(p.purpose)}</div></td>
          <td>${p.exit_time ? Utils.formatDateTime(p.exit_time) : '—'}</td>
          <td>${badgeHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // --- ACTIVITY ---
  async function loadActivity() {
    try {
      const data = await fetchAPI('/admin/gate-activity?limit=100');
      _activities = data || [];
      activityPage = 1;
      renderActivityTable();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }

  function bindActivityControls() {
    document.getElementById('activityPrevBtn').addEventListener('click', () => {
      if (activityPage > 1) { activityPage--; renderActivityTable(); }
    });
    document.getElementById('activityNextBtn').addEventListener('click', () => {
      activityPage++; renderActivityTable();
    });
  }

  function renderActivityTable() {
    const tbody = document.getElementById('activityTableBody');
    const info = document.getElementById('activityPageInfo');
    const prev = document.getElementById('activityPrevBtn');
    const next = document.getElementById('activityNextBtn');
    
    if (_activities.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">No gate activity logs found</td></tr>`;
      info.textContent = `Showing 0 - 0 of 0 logs`;
      prev.disabled = true;
      next.disabled = true;
      return;
    }
    
    const startIdx = (activityPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginated = _activities.slice(startIdx, endIdx);
    
    info.textContent = `Showing ${startIdx + 1} - ${Math.min(endIdx, _activities.length)} of ${_activities.length} logs`;
    prev.disabled = activityPage === 1;
    next.disabled = endIdx >= _activities.length;
    
    tbody.innerHTML = paginated.map(act => `
      <tr>
        <td><code style="font-family:var(--font-mono);font-size:var(--text-xs);background:var(--clr-neutral-100);padding:2px 6px;border-radius:var(--radius-sm);color:var(--clr-neutral-700);">${act.log_id}</code></td>
        <td class="font-medium">${Utils.escapeHtml(act.pass_id)}</td>
        <td>${Utils.escapeHtml(act.employee_name)}</td>
        <td>${act.actual_exit_time ? Utils.formatDateTime(act.actual_exit_time) : '—'}</td>
        <td>${act.actual_return_time ? Utils.formatDateTime(act.actual_return_time) : '—'}</td>
        <td class="text-sm text-muted">${Utils.escapeHtml(act.verified_by)}</td>
      </tr>
    `).join('');
  }


  function switchTab(tabId) {
    const link = document.querySelector(`.sidebar-nav .nav-link[data-tab="${tabId}"]`);
    if (link) link.click();
  }

  function init() {
    setupAuthUI();
    startDateClock();
    bindNavTabs();
    bindPassesControls();
    bindActivityControls();
    
    // Load default tab
    loadOverview();
  }

  return {
    init,
    openUserModal,
    closeUserModal,
    saveUser,
    deleteUser,
    reactivateUser,
    switchTab,
    viewPass: () => {},
    cancelPass: () => {}
  };
})();

document.addEventListener('DOMContentLoaded', AdminPage.init);
