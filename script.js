/**
 * NLC Integrated Gate Pass System — Frontend Logic
 * =============================================================
 * File: script.js
 * Scope: Login authentication flow + Employee Dashboard rendering
 *
 * ARCHITECTURE NOTE:
 * This file is organized into self-contained modules using IIFEs.
 * When Flask backend is added, replace the mock functions with
 * actual fetch() calls to the /api/* endpoints documented inline.
 *
 * Auth token lifecycle:
 *   Login  → store token in localStorage['igps_token']
 *   Each   → attach as Authorization: Bearer <token>
 *   Logout → clear localStorage + redirect
 *   Expiry → intercepted in API.request(), redirect to login
 * =============================================================
 */

'use strict';

/* ──────────────────────────────────────────────────────────────
   1. CONSTANTS & CONFIG
   ────────────────────────────────────────────────────────────── */
const BASE_URL = window.location.origin;

const CONFIG = {
  API_BASE: BASE_URL + '/api',           // Flask backend base URL
  TOKEN_KEY: 'token',
  USER_KEY:  'user',
  SESSION_DURATION: 8 * 60,  // minutes — match backend JWT expiry
  DEBOUNCE_DELAY: 250,        // ms — for search input
};

/* ──────────────────────────────────────────────────────────────
   2. UTILITY FUNCTIONS
   ────────────────────────────────────────────────────────────── */
const Utils = {

  /**
   * Format a JS Date to a readable string for the topbar.
   * Output: "Monday, 14 July 2025 · 09:42 AM"
   */
  formatDateLong(date = new Date()) {
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const d  = days[date.getDay()];
    const mo = months[date.getMonth()];
    const dd = String(date.getDate()).padStart(2, '0');
    const yr = date.getFullYear();
    let   hr = date.getHours();
    const mn = String(date.getMinutes()).padStart(2, '0');
    const ap = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    return `${d}, ${dd} ${mo} ${yr} · ${hr}:${mn} ${ap}`;
  },

  /**
   * Capitalize the first letter of a string.
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /**
   * Format ISO date string to "DD Mon YYYY"
   * e.g. "2025-07-14T08:30:00" → "14 Jul 2025"
   */
  formatDate(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  },

  /**
   * Format to "DD Mon · HH:MM"
   */
  formatDateTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    let hr = d.getHours(), mn = String(d.getMinutes()).padStart(2,'0');
    const ap = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} · ${hr}:${mn} ${ap}`;
  },

  /**
   * Debounce: delay execution until after 'wait' ms of no calls.
   * Used for the table search filter.
   */
  debounce(fn, wait = CONFIG.DEBOUNCE_DELAY) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  },

  /**
   * Sanitize string for safe innerHTML insertion.
   * Prevents XSS from user-supplied data in future API responses.
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  },

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'warning'|'error'|'info'} type
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
      warning: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      error:   '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
      info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    };

    const colors = {
      success: '#059669',
      warning: '#d97706',
      error:   '#dc2626',
      info:    '#3a6dc4',
    };

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${icons[type]}
      </svg>
      <span>${Utils.escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  },

  /** Pad a number to N digits (for session timer) */
  pad(n, digits = 2) {
    return String(n).padStart(digits, '0');
  },

  /** Retrieve stored user object from localStorage */
  getStoredUser() {
    try {
      const raw = localStorage.getItem(CONFIG.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /** Update common UI elements (Topbar, Sidebar) with stored user info */
  updateUserInfo() {
    const user = this.getStoredUser() || {};
    const name = user.name || 'User';
    const role = user.role || 'Employee';
    const dept = user.department || '—';
    const initials = name.charAt(0).toUpperCase();

    const getRoleColor = (r) => {
        if (r === 'admin') return '#dc2626';
        if (r === 'security') return '#d97706';
        if (r === 'manager') return '#9333ea';
        return '#2563eb'; // employee
    };
    const color = getRoleColor(user.role);

    // Names
    document.querySelectorAll('.user-card-name, .topbar-profile-name, #topbarName, #profileName').forEach(el => el.textContent = name);

    // Departments
    document.querySelectorAll('.topbar-profile-dept, #topbarDept, #profileDeptDisplay').forEach(el => el.textContent = dept);

    // Roles
    document.querySelectorAll('.user-card-role').forEach(el => el.textContent = role.charAt(0).toUpperCase() + role.slice(1));

    // Avatars
    document.querySelectorAll('.user-avatar, .user-card-avatar, #topbarAvatar, #profileAvatar').forEach(el => {
        el.textContent = initials;
        el.style.backgroundColor = color;
    });
  },

  /** Build pass type tag HTML */
  buildPassTypeTag(type) {
    const labels = {
      employee:   'Employee',
      visitor:    'Visitor',
      material:   'Material',
      contractor: 'Contractor',
    };
    const label = labels[type] || type;
    return `<span class="pass-type-tag ${Utils.escapeHtml(type)}">${label}</span>`;
  },

  /** Store user object and token after login */
  storeSession(token, user) {
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
    localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
  },

  /** Clear all session data */
  clearSession() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
  },
};


/* ──────────────────────────────────────────────────────────────
   3. API MODULE
   Replace mock responses here with actual fetch() calls.
   ────────────────────────────────────────────────────────────── */
const API = {

  async request(endpoint, options = {}) {
    let token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (token === 'null' || token === 'undefined') token = null;
    
    const customHeaders = options.headers || {};
    const fetchOptions = { ...options };
    delete fetchOptions.headers;

    const res = await fetch(CONFIG.API_BASE + endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...customHeaders
      },
      ...fetchOptions,
    });
    if (res.status === 401 && !endpoint.includes('/auth/login')) {
      Utils.clearSession();
      window.location.href = 'login.html?expired=1';
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async login(employeeId, password, role) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ employee_id: employeeId, password, role })
    });
  },

  async getDashboardMetrics() {
    return this.request('/dashboard/metrics');
  },

  async getRecentPasses() {
    return this.request('/passes?limit=10');
  },
};


/* ──────────────────────────────────────────────────────────────
   4. LOGIN PAGE MODULE
   ────────────────────────────────────────────────────────────── */
const LoginPage = {

  init() {
    // Only run on login page
    if (!document.getElementById('loginForm')) return;

    this.bindRoleSelector();
    this.bindPasswordToggle();
    this.bindFormSubmit();
    this.checkForExpiredSession();
  },

  /**
   * Role selector — clicking a label activates it visually
   * and updates the hidden radio input.
   */
  bindRoleSelector() {
    const tabs = document.querySelectorAll('.role-tab');
    tabs.forEach(tab => {
      // Click handler
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-checked', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-checked', 'true');
        const radio = tab.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });

      // Keyboard handler (Space/Enter to select)
      tab.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          tab.click();
        }
      });
    });
  },

  /** Toggle password visibility */
  bindPasswordToggle() {
    const btn  = document.getElementById('togglePassword');
    const input = document.getElementById('password');
    const iconShow = document.getElementById('eye-show');
    const iconHide = document.getElementById('eye-hide');
    if (!btn || !input) return;

    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      iconShow.style.display = isPassword ? 'none' : '';
      iconHide.style.display = isPassword ? '' : 'none';
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  },

  /** Validate a single field, return true if valid */
  validateField(inputEl, groupId, errorId) {
    const group = document.getElementById(groupId);
    const val   = inputEl.value.trim();
    if (!val) {
      group.classList.add('has-error');
      return false;
    }
    group.classList.remove('has-error');
    return true;
  },

  /** Show global error banner */
  showError(message) {
    const err = document.getElementById('loginError');
    const msg = document.getElementById('loginErrorMsg');
    if (err && msg) {
      msg.textContent = message;
      err.style.display = '';
      err.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  /** Hide global error banner */
  hideError() {
    const err = document.getElementById('loginError');
    if (err) err.style.display = 'none';
  },

  /** Get currently selected role value */
  getSelectedRole() {
    const checked = document.querySelector('input[name="role"]:checked');
    return checked ? checked.value : 'employee';
  },

  /** Handle form submission */
  bindFormSubmit() {
    const form = document.getElementById('loginForm');
    const btn  = document.getElementById('loginBtn');
    const empId = document.getElementById('employeeId');
    const pwd   = document.getElementById('password');
    if (!form) return;

    // Clear errors on input
    empId.addEventListener('input', () => {
      document.getElementById('empid-group').classList.remove('has-error');
      this.hideError();
    });
    pwd.addEventListener('input', () => {
      document.getElementById('password-group').classList.remove('has-error');
      this.hideError();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.hideError();

      // Client-side validation
      const empValid = this.validateField(empId, 'empid-group', 'empid-error');
      const pwdValid = this.validateField(pwd,   'password-group', 'password-error');
      if (!empValid || !pwdValid) return;

      const role = this.getSelectedRole();

      // Show loading state
      btn.classList.add('loading');
      btn.disabled = true;

      try {
        const data = await API.login(
          empId.value.trim(),
          pwd.value,
          role
        );

        // Store session
        Utils.storeSession(data.token, data.user);

        // Redirect based on role
        const redirectMap = {
          'employee':   'dashboard.html',
          'manager':    'manager.html',
          'admin':      'admin.html',
          'security':   'security.html'
        };
        window.location.href = redirectMap[data.user.role] || 'dashboard.html';

      } catch (err) {
        this.showError(err.message || 'Login failed. Please try again.');
        btn.classList.remove('loading');
        btn.disabled = false;
        pwd.value = '';
        pwd.focus();
      }
    });
  },

  /**
   * If redirected from session expiry (?expired=1),
   * show a contextual notice.
   */
  checkForExpiredSession() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('expired') === '1') {
      this.showError('Your session has expired. Please sign in again to continue.');
    }
  },
};


/* ──────────────────────────────────────────────────────────────
   5. DASHBOARD PAGE MODULE
   ────────────────────────────────────────────────────────────── */
const DashboardPage = {

  _allPasses: [],         // cache for client-side filtering
  _sessionStart: null,    // tracks session duration

  init() {
    if (!document.getElementById('metricsGrid')) return;

    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (!token || token === 'null' || token === 'undefined') {
      window.location.href = 'login.html';
      return;
    }
    Utils.updateUserInfo();

    this._sessionStart = Date.now();
    this.startDateClock();
    this.startSessionTimer();
    this.bindSidebarMobile();
    this.bindDismissNotice();
    this.bindLogout();
    this.loadData();
    this.loadStats();
    setInterval(() => this.loadStats(), 30000);
  },

  /** Live clock in top bar */
  startDateClock() {
    const el = document.getElementById('liveDateDisplay');
    if (!el) return;
    const update = () => { el.textContent = Utils.formatDateLong(); };
    update();
    setInterval(update, 30000); // update every 30s
  },

  /** Session duration counter */
  startSessionTimer() {
    const el = document.getElementById('sessionTimer');
    if (!el) return;
    setInterval(() => {
      const elapsed = Math.floor((Date.now() - this._sessionStart) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      el.textContent = `Session: ${h > 0 ? Utils.pad(h)+':' : ''}${Utils.pad(m)}:${Utils.pad(s)}`;
    }, 1000);
  },

  /** Mobile sidebar toggle */
  bindSidebarMobile() {
    const sidebar  = document.getElementById('sidebar');
    const toggle   = document.getElementById('sidebarToggle');
    const overlay  = document.getElementById('sidebarOverlay');
    if (!sidebar || !toggle) return;

    const open  = () => { sidebar.classList.add('open');  overlay.classList.add('show'); };
    const close = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };

    toggle.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    overlay.addEventListener('click', close);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
    });
  },

  /** Dismiss system notice bar */
  bindDismissNotice() {
    const btn = document.getElementById('dismissNotice');
    const bar = document.getElementById('welcomeNotice');
    if (!btn || !bar) return;
    btn.addEventListener('click', () => {
      bar.style.transition = 'opacity 0.2s ease';
      bar.style.opacity = '0';
      setTimeout(() => { bar.style.display = 'none'; }, 220);
    });
  },

  /** Logout */
  bindLogout() {
    const link = document.getElementById('logoutLink');
    if (!link) return;
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      Utils.clearSession();
      window.location.href = 'login.html';
    });
  },

  /** Load all dashboard data concurrently */
  async loadData() {
    try {
      this.loadStats(); // Call loadStats on refresh
      let responseData = await API.getRecentPasses();
      console.log('API /passes response:', responseData);
      
      let passes = responseData;
      if (passes && typeof passes === 'object' && !Array.isArray(passes)) {
          passes = passes.passes || passes.data || [];
      }
      if (!Array.isArray(passes)) passes = [];
      this._allPasses = passes;
      this.renderTable(passes);
      this.bindTableSearch();
    } catch (err) {
      console.error('Dashboard load error:', err);
      Utils.showToast('Failed to load dashboard data. Please refresh.', 'error');
    }
  },

  /** Fetch and render live stats */
  async loadStats() {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (!token || token === 'null' || token === 'undefined') return;
    
    try {
      const response = await fetch(window.location.origin + '/api/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        Utils.clearSession();
        window.location.href = 'login.html';
        return;
      }
      
      if (!response.ok) throw new Error('Failed to fetch stats');
      
      const stats = await response.json();
      
      // Update numbers with animation
      this.renderMetrics(stats);
      
      // Helper to generate SVG icon
      const getIcon = (type) => {
        if (type === 'up') return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
        if (type === 'down') return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 9 12 15 6 9"/></svg>`;
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      };
      
      // Total Sub-label
      const totalDesc = document.getElementById('metric-total-desc');
      if (totalDesc) {
        const trendCls = stats.this_month_total > 0 ? 'up' : 'flat';
        const iconType = stats.this_month_total > 0 ? 'up' : 'flat';
        totalDesc.innerHTML = `<span class="metric-trend ${trendCls}">${getIcon(iconType)} +${stats.this_month_total}</span><span>this month</span>`;
      }
      
      // Approved Sub-label
      const approvedDesc = document.getElementById('metric-approved-desc');
      if (approvedDesc) {
        approvedDesc.innerHTML = `<span class="metric-trend flat">${getIcon('flat')} ${stats.approval_rate}%</span><span>approval rate</span>`;
      }
      
      // Pending Sub-label
      const pendingDesc = document.getElementById('metric-pending-desc');
      if (pendingDesc) {
        if (stats.pending > 0) {
          pendingDesc.innerHTML = `<span class="metric-trend up">${getIcon('up')}</span><span>awaiting approval</span>`;
        } else {
          pendingDesc.innerHTML = `<span class="metric-trend flat">${getIcon('flat')}</span><span>none pending</span>`;
        }
      }
      
      // Rejected Sub-label
      const rejectedDesc = document.getElementById('metric-rejected-desc');
      if (rejectedDesc) {
        if (stats.last_month_rejected > 0) {
          rejectedDesc.innerHTML = `<span class="metric-trend down">${getIcon('down')} -${stats.last_month_rejected}</span><span>vs last month</span>`;
        } else {
          rejectedDesc.innerHTML = `<span class="metric-trend flat">${getIcon('flat')} 0</span><span>vs last month</span>`;
        }
      }
      
    } catch (err) {
      console.error('Stats load error:', err);
    }
  },

  /** Animate metric count from 0 to target value */
  animateCount(element, target, duration = 600) {
    const start = performance.now();
    const step = (timestamp) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      element.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  /** Render metric cards */
  renderMetrics(metrics) {
    const fields = {
      'metric-total':    metrics.total,
      'metric-approved': metrics.approved,
      'metric-pending':  metrics.pending,
      'metric-rejected': metrics.rejected,
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) this.animateCount(el, val);
    });
  },

  /**
   * Build status badge HTML
   * @param {'approved'|'pending'|'rejected'} status
   */
  buildStatusBadge(status) {
    const map = {
      approved: 'badge-approved',
      pending:  'badge-pending',
      rejected: 'badge-rejected',
    };
    const cls = map[status] || 'badge-pending';
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    return `<span class="badge ${cls}" aria-label="Status: ${label}">${label}</span>`;
  },

  /** Build pass type tag HTML (deprecated, moved to Utils) */
  buildPassTypeTag(type) {
    return Utils.buildPassTypeTag(type);
  },

  /** Render table rows from pass data array */
  renderTable(passes) {
    const tbody = document.getElementById('recentRequestsBody');
    const empty = document.getElementById('tableEmptyState');
    if (!tbody) return;

    if (!passes || passes.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }

    if (empty) empty.style.display = 'none';

    tbody.innerHTML = passes.map(pass => `
      <tr data-pass-id="${Utils.escapeHtml(pass.pass_id)}">
        <td>
          <code style="font-family:var(--font-mono);font-size:var(--text-xs);
                       background:var(--clr-neutral-100);padding:2px 6px;
                       border-radius:var(--radius-sm);color:var(--clr-neutral-700);">
            ${Utils.escapeHtml(pass.pass_id)}
          </code>
        </td>
        <td>${this.buildPassTypeTag(pass.pass_type)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
            title="${Utils.escapeHtml(pass.purpose)}">
          ${Utils.escapeHtml(pass.purpose)}
        </td>
        <td>${Utils.formatDate(pass.request_date)}</td>
        <td>
          <span style="font-size:var(--text-xs);line-height:1.6;">
            ${Utils.formatDateTime(pass.exit_time)}<br>
            <span style="color:var(--clr-neutral-400);">→ ${pass.return_time ? Utils.formatDateTime(pass.return_time) : 'One-way'}</span>
          </span>
        </td>
        <td>${this.buildStatusBadge(pass.status)}</td>
        <td style="font-size:var(--text-xs);color:var(--clr-neutral-600);">
          ${Utils.escapeHtml(pass.approved_by)}
        </td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" title="View details"
                    onclick="DashboardPage.viewPass('${Utils.escapeHtml(pass.pass_id)}')"
                    aria-label="View details for ${Utils.escapeHtml(pass.pass_id)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>

          </div>
        </td>
      </tr>
    `).join('');
  },

  /** Client-side table filtering by Pass ID or type */
  bindTableSearch() {
    const input = document.getElementById('tableSearch');
    if (!input) return;

    const doFilter = Utils.debounce((query) => {
      const q = query.toLowerCase().trim();
      if (!q) {
        this.renderTable(this._allPasses);
        return;
      }
      const filtered = this._allPasses.filter(p =>
        p.pass_id.toLowerCase().includes(q) ||
        p.pass_type.toLowerCase().includes(q) ||
        p.purpose.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
      );
      this.renderTable(filtered);
    });

    input.addEventListener('input', (e) => doFilter(e.target.value));
  },

  viewPass(passId) {
    const pass = this._allPasses.find(p => p.pass_id === passId);
    if (!pass) return;

    let html = `<div style="display:grid; gap: var(--sp-3);">`;
    html += `<div><strong>Pass ID:</strong> ${pass.pass_id}</div>`;
    html += `<div><strong>Type:</strong> ${Utils.capitalize(pass.pass_type)}</div>`;
    html += `<div><strong>Status:</strong> ${Utils.capitalize(pass.status)}</div>`;
    html += `<div><strong>Purpose:</strong> ${pass.purpose}</div>`;
    html += `<div><strong>Exit Time:</strong> ${pass.exit_time ? Utils.formatDateTime(pass.exit_time) : '—'}</div>`;
    
    if (pass.pass_type === 'visitor') {
      html += `<div><strong>Visitor Name:</strong> ${pass.visitor_name}</div>`;
      html += `<div><strong>Visitor Contact:</strong> ${pass.visitor_contact || '—'}</div>`;
    } else if (pass.pass_type === 'material') {
      html += `<div><strong>Material Desc:</strong> ${pass.material_description || '—'}</div>`;
      html += `<div><strong>Direction:</strong> ${pass.movement_direction || '—'}</div>`;
      html += `<div><strong>Quantity:</strong> ${pass.quantity || '—'}</div>`;
      if (pass.vehicle_number) {
        html += `<div><strong>Vehicle:</strong> ${pass.vehicle_number}</div>`;
      }
    } else {
      html += `<div><strong>Return Time:</strong> ${pass.return_time ? Utils.formatDateTime(pass.return_time) : '—'}</div>`;
    }
    
    if (pass.approved_by) {
        const actionLabel = pass.status === 'rejected' ? 'Rejected By' : 'Approved By';
        html += `<div><strong>${actionLabel}:</strong> ${pass.approved_by}</div>`;
    }

    html += `</div>`;
    
    document.getElementById('detailModalBody').innerHTML = html;
    document.getElementById('detailModal').classList.add('show');
  },


};


/* ──────────────────────────────────────────────────────────────
   6. GATE PASS SUBMISSION MODULE
   ────────────────────────────────────────────────────────────── */
window.GatePassModule = {
  
  modal: null,
  btnOpen: null,
  btnClose: null,
  btnCancel: null,
  form: null,
  alertBox: null,
  
  exitInput: null,
  returnInput: null,
  reasonInput: null,
  reasonCounter: null,

  init() {
    this.modal = document.getElementById('gatePassModal');
    if (!this.modal) return;
    
    this.btnOpen = document.getElementById('btnOpenGatePassModal');
    this.btnClose = document.getElementById('btnCloseGatePassModal');
    this.btnCancel = document.getElementById('btnCancelGatePass');
    this.form = document.getElementById('gatePassForm');
    this.alertBox = document.getElementById('gatePassAlert');
    
    this.exitInput = document.getElementById('passExitTime');
    this.returnInput = document.getElementById('passReturnTime');
    this.reasonInput = document.getElementById('passReason');
    this.reasonCounter = document.getElementById('reasonCounter');

    this.bindEvents();
  },

  /** Get local datetime formatted for datetime-local min attribute */
  getCurrentLocalISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  },

  bindEvents() {
    // Open modal
    if (this.btnOpen) {
      this.btnOpen.addEventListener('click', () => this.openModal());
    }

    // Close modal
    const closeHandler = () => this.closeModal();
    if (this.btnClose) this.btnClose.addEventListener('click', closeHandler);
    if (this.btnCancel) this.btnCancel.addEventListener('click', closeHandler);
    
    // Backdrop click to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('show')) {
        this.closeModal();
      }
    });

    // Char counter
    if (this.reasonInput && this.reasonCounter) {
      this.reasonInput.addEventListener('input', () => {
        const len = this.reasonInput.value.length;
        this.reasonCounter.textContent = `${len} / 300`;
      });
    }

    // Min time constraints
    if (this.exitInput && this.returnInput) {
      this.exitInput.addEventListener('change', () => {
        if (this.exitInput.value) {
          this.returnInput.min = this.exitInput.value;
          if (this.returnInput.value && this.returnInput.value <= this.exitInput.value) {
            this.returnInput.value = '';
          }
        }
      });
    }

    // Form submit
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  },

  openModal() {
    if (!this.modal) {
      window.location.href = 'requests.html?action=new_gate_pass';
      return;
    }
    this.form.reset();
    this.hideAlert();
    if (this.reasonCounter) this.reasonCounter.textContent = '0 / 300';
    
    // Set min constraints on open
    const nowISO = this.getCurrentLocalISO();
    if (this.exitInput) this.exitInput.min = nowISO;
    if (this.returnInput) this.returnInput.min = nowISO;

    this.modal.classList.add('show');
  },

  closeModal() {
    this.modal.classList.remove('show');
  },

  showAlert(message, type = 'error') {
    this.alertBox.className = `inline-alert ${type}`;
    this.alertBox.textContent = message;
  },

  hideAlert() {
    this.alertBox.className = 'inline-alert';
    this.alertBox.style.display = 'none';
  },

  async handleSubmit(e) {
    e.preventDefault();
    this.hideAlert();
    
    const reason = this.reasonInput.value.trim();
    const exitTime = this.exitInput.value;
    const returnTime = this.returnInput.value;
    
    // Client-side validation matching backend
    if (!reason || !exitTime || !returnTime) {
      return this.showAlert('All fields are required.', 'error');
    }
    
    if (new Date(exitTime) < new Date()) {
      return this.showAlert('Exit time cannot be in the past.', 'error');
    }
    
    if (new Date(returnTime) <= new Date(exitTime)) {
      return this.showAlert('Return time must be after exit time.', 'error');
    }

    const btnSubmit = document.getElementById('btnSubmitGatePass');
    const originalText = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';

    try {
      // Using existing API.request helper, which automatically adds ngrok-skip-browser-warning 
      // if we configure it, or we can just pass options to it.
      // Wait, API.request doesn't add ngrok-skip-browser-warning by default in this file?
      // I will add it in the headers.
      const res = await API.request('/passes', {
        method: 'POST',
        body: JSON.stringify({ reason, exit_time: exitTime, return_time: returnTime })
      });
      
      this.showAlert('Gate pass requested successfully!', 'success');
      Utils.showToast('Gate pass submitted successfully', 'success');
      
      setTimeout(() => {
        this.closeModal();
        // Refresh table if on dashboard
        if (typeof DashboardPage !== 'undefined' && DashboardPage.loadData) {
          DashboardPage.loadData();
        }
      }, 1500);
      
    } catch (error) {
      this.showAlert(error.message || 'Failed to submit request.', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalText;
    }
  }
};

window.VisitorPassModule = {
  modal: null,
  btnOpen: null,
  btnClose: null,
  btnCancel: null,
  form: null,
  alertBox: null,
  
  nameInput: null,
  contactInput: null,
  orgInput: null,
  purposeInput: null,
  purposeCounter: null,
  entryInput: null,
  exitInput: null,

  init() {
    this.modal = document.getElementById('visitorPassModal');
    this.btnOpen = document.getElementById('btnVisitorPass');
    this.btnClose = document.getElementById('btnCloseVisitorPassModal');
    this.btnCancel = document.getElementById('btnCancelVisitorPass');
    this.form = document.getElementById('visitorPassForm');
    this.alertBox = document.getElementById('visitorPassAlert');
    
    this.nameInput = document.getElementById('visitorName');
    this.contactInput = document.getElementById('visitorContact');
    this.orgInput = document.getElementById('visitorOrg');
    this.purposeInput = document.getElementById('visitorPurpose');
    this.purposeCounter = document.getElementById('visitorPurposeCounter');
    this.entryInput = document.getElementById('visitorEntryTime');
    this.exitInput = document.getElementById('visitorExitTime');

    this.bindEvents();
  },

  getCurrentLocalISO() {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzOffset).toISOString().slice(0, 16);
  },

  bindEvents() {
    if (this.btnOpen) {
      this.btnOpen.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal();
      });
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.closeModal());
    }

    if (this.btnCancel) {
      this.btnCancel.addEventListener('click', () => this.closeModal());
    }

    window.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('show')) {
        this.closeModal();
      }
    });

    if (this.purposeInput && this.purposeCounter) {
      this.purposeInput.addEventListener('input', () => {
        const len = this.purposeInput.value.length;
        this.purposeCounter.textContent = `${len} / 300`;
      });
    }

    if (this.entryInput && this.exitInput) {
      this.entryInput.addEventListener('change', () => {
        if (this.entryInput.value) {
          this.exitInput.min = this.entryInput.value;
          if (this.exitInput.value && this.exitInput.value <= this.entryInput.value) {
            this.exitInput.value = '';
          }
        }
      });
    }

    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  },

  openModal() {
    if (!this.modal) {
      window.location.href = 'requests.html?action=new_visitor_pass';
      return;
    }
    this.form.reset();
    this.hideAlert();
    if (this.purposeCounter) this.purposeCounter.textContent = '0 / 300';
    
    const nowISO = this.getCurrentLocalISO();
    if (this.entryInput) this.entryInput.min = nowISO;
    if (this.exitInput) this.exitInput.min = nowISO;

    this.modal.classList.add('show');
  },

  closeModal() {
    this.modal.classList.remove('show');
  },

  showAlert(message, type = 'error') {
    this.alertBox.className = `inline-alert ${type}`;
    this.alertBox.style.display = 'block';
    this.alertBox.textContent = message;
  },

  hideAlert() {
    this.alertBox.className = 'inline-alert';
    this.alertBox.style.display = 'none';
  },

  async handleSubmit(e) {
    e.preventDefault();
    this.hideAlert();
    
    const name = this.nameInput.value.trim();
    const contact = this.contactInput.value.trim();
    const org = this.orgInput.value.trim();
    const purpose = this.purposeInput.value.trim();
    const entryTime = this.entryInput.value;
    const exitTime = this.exitInput.value;
    
    if (!name || !contact || !purpose || !entryTime || !exitTime) {
      return this.showAlert('All required fields must be filled.', 'error');
    }
    
    if (!/^\d{10}$/.test(contact)) {
      return this.showAlert('Contact must be exactly 10 digits.', 'error');
    }

    if (new Date(entryTime) < new Date()) {
      return this.showAlert('Entry time cannot be in the past.', 'error');
    }
    
    if (new Date(exitTime) <= new Date(entryTime)) {
      return this.showAlert('Exit time must be after entry time.', 'error');
    }

    const btnSubmit = document.getElementById('btnSubmitVisitorPass');
    const originalText = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';

    try {
      const payload = {
        visitor_name: name,
        visitor_contact: contact,
        purpose: purpose,
        expected_entry_time: entryTime,
        expected_exit_time: exitTime
      };
      
      if (org) {
        payload.visitor_organization = org;
      }
      
      const res = await API.request('/visitor-passes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      this.showAlert('Visitor pass requested successfully!', 'success');
      Utils.showToast('Visitor pass submitted successfully', 'success');
      
      setTimeout(() => {
        this.closeModal();
        if (typeof DashboardPage !== 'undefined' && DashboardPage.loadData) {
          DashboardPage.loadData();
        }
      }, 1500);

    } catch (error) {
      this.showAlert(error.message || 'Failed to submit request.', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalText;
    }
  }
};

window.MaterialPassModule = {
  init() {
    this.modal = document.getElementById('materialPassModal');
    this.form = document.getElementById('materialPassForm');
    this.btnClose = document.getElementById('btnCloseMaterialPassModal');
    this.btnCancel = document.getElementById('btnCancelMaterialPass');
    this.alertBox = document.getElementById('materialPassAlert');
    
    this.descInput = document.getElementById('materialDesc');
    this.descCounter = document.getElementById('materialDescCounter');
    
    this.vehicleToggle = document.getElementById('materialVehicleInvolved');
    this.vehicleGroup = document.getElementById('vehicleNumberGroup');
    this.vehicleInput = document.getElementById('materialVehicleNumber');
    
    if (this.btnClose) this.btnClose.addEventListener('click', () => this.closeModal());
    if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.closeModal());
    
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    if (this.descInput && this.descCounter) {
      this.descInput.addEventListener('input', () => {
        const len = this.descInput.value.length;
        this.descCounter.textContent = `${len} / 500`;
      });
    }

    if (this.vehicleToggle) {
      this.vehicleToggle.addEventListener('change', () => {
        if (this.vehicleToggle.checked) {
          this.vehicleGroup.style.display = 'block';
          this.vehicleInput.setAttribute('required', 'required');
        } else {
          this.vehicleGroup.style.display = 'none';
          this.vehicleInput.removeAttribute('required');
          this.vehicleInput.value = '';
        }
      });
    }

    // Close on backdrop click
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });
    }
  },

  openModal() {
    if (!this.modal) {
      window.location.href = 'requests.html?action=new_material_pass';
      return;
    }
    this.resetForm();
    this.hideAlert();
    
    const timeInput = document.getElementById('materialExpectedTime');
    if (timeInput) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      timeInput.min = now.toISOString().slice(0, 16);
    }
    
    this.modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.remove('show');
    document.body.style.overflow = '';
  },

  resetForm() {
    if (this.form) this.form.reset();
    if (this.descCounter) this.descCounter.textContent = '0 / 500';
    if (this.vehicleGroup) this.vehicleGroup.style.display = 'none';
    if (this.vehicleInput) this.vehicleInput.removeAttribute('required');
  },

  showAlert(message, type = 'error') {
    if (!this.alertBox) return;
    this.alertBox.textContent = message;
    this.alertBox.className = `inline-alert alert-${type}`;
    this.alertBox.style.display = 'block';
  },

  hideAlert() {
    if (!this.alertBox) return;
    this.alertBox.style.display = 'none';
    this.alertBox.textContent = '';
  },

  async handleSubmit(e) {
    e.preventDefault();
    this.hideAlert();

    const desc = this.form.material_description.value.trim();
    const qty = this.form.quantity.value.trim();
    const direction = this.form.movement_direction.value;
    const vehicleInvolved = this.form.vehicle_involved.checked;
    const vehicleNumber = this.form.vehicle_number.value.trim();
    const purpose = this.form.purpose.value.trim();
    const expectedTime = this.form.expected_movement_time.value;

    if (!desc || !qty || !direction || !purpose || !expectedTime) {
      this.showAlert('Please fill all required fields.', 'error');
      return;
    }
    
    if (vehicleInvolved && !vehicleNumber) {
      this.showAlert('Vehicle number is required when a vehicle is involved.', 'error');
      return;
    }
    
    const expectedTimeObj = new Date(expectedTime);
    if (expectedTimeObj < new Date()) {
      this.showAlert('Expected movement time cannot be in the past.', 'error');
      return;
    }

    const payload = {
      material_description: desc,
      quantity: qty,
      movement_direction: direction,
      vehicle_involved: vehicleInvolved,
      vehicle_number: vehicleNumber,
      purpose: purpose,
      expected_movement_time: expectedTime
    };

    const btnSubmit = document.getElementById('btnSubmitMaterialPass');
    const originalText = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';

    try {
      await API.request('/material-passes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      Utils.showToast('Material pass requested successfully.', 'success');
      this.closeModal();
      
      setTimeout(() => {
        if (typeof DashboardPage !== 'undefined' && DashboardPage.loadData) {
          DashboardPage.loadData();
        }
      }, 1500);

    } catch (error) {
      this.showAlert(error.message || 'Failed to submit request.', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalText;
    }
  }
};

/* ──────────────────────────────────────────────────────────────
   7. GLOBAL INIT — detect current page and initialize
   ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Determine which page we're on by presence of key elements
  const isLoginPage     = !!document.getElementById('loginForm');
  const isDashboardPage = !!document.getElementById('metricsGrid');

  if (isLoginPage)     LoginPage.init();
  if (isDashboardPage) DashboardPage.init();

  const isGatePassModal = !!document.getElementById('gatePassModal');
  if (isGatePassModal) GatePassModule.init();

  const isVisitorPassModal = !!document.getElementById('visitorPassModal');
  if (isVisitorPassModal) VisitorPassModule.init();

  const isMaterialPassModal = !!document.getElementById('materialPassModal');
  if (isMaterialPassModal) MaterialPassModule.init();

  const isProfilePage = !!document.getElementById('profileForm');
  if (isProfilePage) {
    DashboardPage.startDateClock();
    DashboardPage.bindSidebarMobile();
    DashboardPage.bindLogout();
    DashboardPage.bindDismissNotice();
  }

  // Universally apply user info to topbar and sidebar if logged in (except on login page)
  if (!isLoginPage && Utils.getStoredUser()) {
    Utils.updateUserInfo();
  }

  /*
   * FUTURE: Add route guards here
   * if (isDashboardPage && !sessionStorage.getItem(CONFIG.TOKEN_KEY)) {
   *   window.location.href = 'login.html';
   * }
   */
});
