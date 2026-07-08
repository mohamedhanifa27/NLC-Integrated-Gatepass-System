/**
 * requests.js
 * Logic for the "My Requests" page
 */

const RequestsPage = (function() {
  let allPasses = [];
  let currentTab = 'all';
  let currentStatus = 'all';
  let searchQuery = '';
  let currentPage = 1;
  const ITEMS_PER_PAGE = 10;
  
  function init() {
    setupAuthUI();
    bindEvents();
    loadData();
    setInterval(updateSessionTimer, 60000);
    updateSessionTimer();

    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    if (action === 'new_gate_pass' && window.GatePassModule) {
      setTimeout(() => GatePassModule.openModal(), 100);
    } else if (action === 'new_visitor_pass' && window.VisitorPassModule) {
      setTimeout(() => VisitorPassModule.openModal(), 100);
    } else if (action === 'new_material_pass' && window.MaterialPassModule) {
      setTimeout(() => MaterialPassModule.openModal(), 100);
    }
  }

  function decodeJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      console.log('Decoded JWT:', jsonPayload);
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
    
    const user = Utils.getStoredUser();
    let name = 'User';
    let department = '';
    let role = 'employee';

    if (user) {
        name = user.name || 'User';
        department = user.department || '';
        role = user.role || 'employee';
    } else {
        const payload = decodeJWT(token);
        if (payload) {
            name = payload.name || payload.user_claims?.name || 'User';
            department = payload.department || payload.user_claims?.department || '';
            role = payload.role || payload.user_claims?.role || 'employee';
        }
    }
    
    // script.js Utils.updateUserInfo() handles UI population
  }

  function bindEvents() {
    const tabBtns = document.querySelectorAll('#passTypeTabs button');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        tabBtns.forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-ghost');
        });
        e.target.classList.remove('btn-ghost');
        e.target.classList.add('btn-primary');
        currentTab = e.target.dataset.type;
        currentPage = 1;
        renderTable();
      });
    });

    document.getElementById('statusFilter').addEventListener('change', (e) => {
      currentStatus = e.target.value;
      currentPage = 1;
      renderTable();
    });

    document.getElementById('searchInput').addEventListener('input', Utils.debounce((e) => {
      searchQuery = e.target.value.toLowerCase();
      currentPage = 1;
      renderTable();
    }, 250));

    document.getElementById('btnPrevPage').addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });

    document.getElementById('btnNextPage').addEventListener('click', () => {
      currentPage++;
      renderTable();
    });

    // Logout
    const logoutBtn = document.getElementById('logoutLink');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await API.request('/auth/logout', { method: 'POST' });
        } catch (e) {} // ignore errors on logout
        Utils.clearSession();
        window.location.href = 'login.html';
      });
    }

    // Live clock
    setInterval(() => {
      const liveDate = document.getElementById('liveDateDisplay');
      if (liveDate && Utils.formatDateLong) {
        liveDate.textContent = Utils.formatDateLong(new Date().toISOString());
      }
    }, 1000);
  }

  async function loadData() {
    try {
      const [stats, passes1, passes2] = await Promise.all([
        API.request('/dashboard/stats'),
        API.request('/passes?status=pending&limit=200'),
        API.request('/passes?status=history&limit=200')
      ]);

      renderStats(stats);
      
      const p1 = Array.isArray(passes1) ? passes1 : (passes1.passes || passes1.data || []);
      const p2 = Array.isArray(passes2) ? passes2 : (passes2.passes || passes2.data || []);

      const map = new Map();
      [...p1, ...p2].forEach(p => map.set(p.pass_id, p));
      
      allPasses = Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      renderTable();
    } catch (err) {
      console.error(err);
      Utils.showToast('Failed to load data', 'error');
    }
  }

  function animateCount(element, target, duration = 600) {
    const start = performance.now();
    const step = (timestamp) => {
      const progress = Math.min((timestamp - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      element.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderStats(stats) {
    const fields = {
      'metric-total': stats.total || stats.total_requests || 0,
      'metric-approved': stats.approved || stats.approved_requests || 0,
      'metric-pending': stats.pending || stats.pending_requests || 0,
      'metric-rejected': stats.rejected || stats.rejected_requests || 0
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) animateCount(el, val);
    });
  }

  function getFilteredData() {
    return allPasses.filter(p => {
      let mType = (currentTab === 'all' || p.pass_type === currentTab);
      let mStatus = (currentStatus === 'all' || p.status === currentStatus);
      let mSearch = true;
      if (searchQuery) {
        mSearch = p.pass_id.toLowerCase().includes(searchQuery) ||
                  (p.purpose && p.purpose.toLowerCase().includes(searchQuery));
      }
      return mType && mStatus && mSearch;
    });
  }

  function renderTable() {
    const data = getFilteredData();
    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = data.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    const tbody = document.getElementById('requestsTableBody');
    const emptyState = document.getElementById('tableEmptyState');
    const pageInfo = document.getElementById('pageInfo');
    const table = document.getElementById('requestsTable');

    if (totalItems === 0) {
      tbody.innerHTML = '';
      table.style.display = 'none';
      emptyState.style.display = 'flex';
      pageInfo.textContent = 'Showing 0 of 0 items';
      document.getElementById('btnPrevPage').disabled = true;
      document.getElementById('btnNextPage').disabled = true;
      return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';

    tbody.innerHTML = paginated.map(p => {
      let statusClass = 'badge-pending';
      if (p.status === 'approved') statusClass = 'badge-approved';
      if (p.status === 'rejected') statusClass = 'badge-rejected';
      if (p.status === 'used') statusClass = 'badge-used';
      
      const actions = [];
      actions.push(`
        <button class="btn btn-sm btn-ghost" title="View details" onclick="RequestsPage.viewPass('${p.pass_id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>`);
      if (p.status === 'pending') {
        actions.push(`
        <button class="btn btn-sm btn-ghost" title="Cancel request" style="color:var(--clr-danger-500);" onclick="RequestsPage.cancelPass('${p.pass_id}', '${p.pass_type}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>`);
      }

      let dateStr = p.request_date ? new Date(p.request_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

      return `
        <tr>
          <td class="font-medium">${p.pass_id}</td>
          <td>
            ${Utils.buildPassTypeTag ? Utils.buildPassTypeTag(p.pass_type) : `<span class="badge ${p.pass_type === 'visitor' ? 'badge-blue' : 'badge-gray'}">${Utils.capitalize(p.pass_type)}</span>`}
          </td>
          <td><div class="truncate-text" style="max-width: 150px;" title="${p.purpose}">${p.purpose}</div></td>
          <td>${dateStr}</td>
          <td>
            <div style="white-space: nowrap;">${formatDatePart(p.exit_time)}</div>
            <div class="text-xs text-muted">${formatDatePart(p.return_time)}</div>
          </td>
          <td><span class="badge ${statusClass}">${Utils.capitalize(p.status)}</span></td>
          <td class="text-sm text-muted">${p.approved_by || '—'}</td>
          <td>
            <div class="table-actions" style="display:flex; gap: 4px;">
              ${actions.join('')}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
    pageInfo.textContent = `Showing ${startIdx + 1} - ${endIdx} of ${totalItems} items`;
    
    document.getElementById('btnPrevPage').disabled = (currentPage === 1);
    document.getElementById('btnNextPage').disabled = (currentPage === totalPages);
  }

  function formatDatePart(dateStr) {
      if (!dateStr) return '—';
      return Utils.formatDateTime(dateStr);
  }

  function viewPass(passId) {
    const pass = allPasses.find(p => p.pass_id === passId);
    if (!pass) return;

    let html = `<div style="display:grid; gap: var(--sp-3);">`;
    html += `<div><strong>Pass ID:</strong> ${pass.pass_id}</div>`;
    html += `<div><strong>Type:</strong> ${Utils.capitalize(pass.pass_type)}</div>`;
    html += `<div><strong>Status:</strong> ${Utils.capitalize(pass.status)}</div>`;
    html += `<div><strong>Purpose:</strong> ${pass.purpose}</div>`;
    html += `<div><strong>Exit Time:</strong> ${formatDatePart(pass.exit_time)}</div>`;
    
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
      html += `<div><strong>Return Time:</strong> ${formatDatePart(pass.return_time)}</div>`;
    }
    
    if (pass.approved_by) {
        const actionLabel = pass.status === 'rejected' ? 'Rejected By' : 'Approved By';
        html += `<div><strong>${actionLabel}:</strong> ${pass.approved_by}</div>`;
    }

    html += `</div>`;
    
    document.getElementById('detailModalBody').innerHTML = html;
    document.getElementById('detailModal').classList.add('show');
  }

  async function cancelPass(passId, passType) {
    if (!confirm('Are you sure you want to cancel this request?')) return;
    try {
      let endpoint = '/passes/' + passId;
      if (passType === 'visitor') {
        endpoint = '/visitor-passes/' + passId;
      } else if (passType === 'material') {
        endpoint = '/material-passes/' + passId;
      }
        
      await API.request(endpoint, {
        method: 'DELETE'
      });
      Utils.showToast('Pass cancelled successfully.', 'success');
      loadData();
    } catch (err) {
      console.error(err);
      Utils.showToast(err.message || 'Failed to cancel pass', 'error');
    }
  }

  function updateSessionTimer() {
    const timer = document.getElementById('sessionTimer');
    if (timer) {
      const expiry = localStorage.getItem('session_expiry'); // Not maintained fully client-side but we can just show static or arbitrary time
      timer.textContent = 'Session: Active';
    }
  }

  return {
    init,
    loadData,
    viewPass,
    cancelPass
  };
})();

document.addEventListener('DOMContentLoaded', RequestsPage.init);
