const ManagerPage = (function() {
  let _pendingPasses = [];
  let _historyPasses = [];

  function decodeJWT(token) {
      try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
          const jsonPayload = decodeURIComponent(
              atob(padded).split('').map(c =>
                  '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
              ).join('')
          );
          return JSON.parse(jsonPayload);
      } catch(e) {
          console.error('JWT decode failed:', e);
          return null;
      }
  }

  function init() {
    const token = localStorage.getItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token');
    const payload = token ? decodeJWT(token) : null;
    if (!payload || !['manager', 'admin'].includes(payload.role)) {
      window.location.href = '/';
      return;
    }



    if (document.getElementById('pendingTableBody')) {
      loadData();
      setInterval(loadData, 60000); // refresh every minute

      // Bind search
      const pendingSearch = document.getElementById('pendingSearch');
      if (pendingSearch) {
        pendingSearch.addEventListener('input', (e) => renderPendingTable(e.target.value));
      }
      const historySearch = document.getElementById('historySearch');
      if (historySearch) {
        historySearch.addEventListener('input', (e) => renderHistoryTable(e.target.value));
      }
    }
  }

  async function loadData() {
    try {
      const [metrics, pending, history] = await Promise.all([
        API.request('/dashboard/stats'),
        API.request('/passes?status=pending&limit=100'),
        API.request('/passes?status=history&limit=100')
      ]);
      
      renderMetrics(metrics);
      _pendingPasses = pending;
      _historyPasses = history;
      
      renderPendingTable();
      renderHistoryTable();
    } catch (err) {
      console.error('Manager dashboard load error:', err);
      Utils.showToast('Error: ' + err.message, 'error');
    }
  }

  function animateValue(element, target, duration = 600) {
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

  function renderMetrics(metrics) {
    const elTotal = document.getElementById('metric-total');
    const elPending = document.getElementById('metric-pending');
    const elApproved = document.getElementById('metric-approved-today');
    const elRejected = document.getElementById('metric-rejected-today');
    
    animateValue(elTotal, metrics.total || 0, 1000);
    animateValue(elPending, metrics.pending || 0, 1000);
    animateValue(elApproved, metrics.approved || 0, 1000);
    animateValue(elRejected, metrics.rejected || 0, 1000);
  }

  function renderPendingTable(filter = '') {
    const tbody = document.getElementById('pendingTableBody');
    if (!tbody) return;

    let pending = _pendingPasses;
    if (filter) {
      const f = filter.toLowerCase();
      pending = pending.filter(p => 
        p.pass_id.toLowerCase().includes(f) || 
        p.purpose.toLowerCase().includes(f) ||
        (p.employee_name && p.employee_name.toLowerCase().includes(f))
      );
    }

    if (pending.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: var(--sp-8); vertical-align: middle;">No pending requests found.</td></tr>';
      return;
    }

    tbody.innerHTML = pending.map(p => {
      let dateStr = p.request_date ? new Date(p.request_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      return `
      <tr>
        <td class="font-medium" style="vertical-align: middle;">${p.pass_id}</td>
        <td style="vertical-align: middle;">
          <div style="font-weight: 500;">${p.employee_name || 'Employee'}</div>
          ${p.pass_type === 'visitor' ? `<div class="text-sm text-muted">Visitor: ${p.visitor_name}</div>` : ''}
          <div style="margin-top: 4px;">
            ${Utils.buildPassTypeTag ? Utils.buildPassTypeTag(p.pass_type) : `<span class="badge ${p.pass_type === 'visitor' ? 'badge-blue' : 'badge-gray'}">${Utils.capitalize(p.pass_type)}</span>`}
          </div>
        </td>
        <td style="vertical-align: middle;">
          <div class="truncate-text" style="max-width: 200px;" title="${p.purpose}">${p.purpose}</div>
        </td>
        <td style="vertical-align: middle;">
          <div style="white-space: nowrap;">${formatDatePart(p.exit_time)}</div>
          <div class="text-xs text-muted">${formatTimePart(p.exit_time)}</div>
        </td>
        <td style="vertical-align: middle;">
          <div style="white-space: nowrap;">${formatDatePart(p.return_time)}</div>
          <div class="text-xs text-muted">${formatTimePart(p.return_time)}</div>
        </td>
        <td style="vertical-align: middle;">${dateStr}</td>
        <td style="vertical-align: middle;">
          <div class="table-actions" style="display:flex; gap: 4px;">
            <button class="btn btn-sm btn-ghost" title="Approve" style="color:var(--clr-success-500);" onclick="ManagerPage.approvePass('${p.pass_id}', '${p.pass_type}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <button class="btn btn-sm btn-ghost" title="Reject" style="color:var(--clr-danger-500);" onclick="ManagerPage.rejectPass('${p.pass_id}', '${p.pass_type}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `}).join('');
  }

  function renderHistoryTable(filter = '') {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    let history = _historyPasses;

    if (filter) {
      const f = filter.toLowerCase();
      history = history.filter(p => 
        p.pass_id.toLowerCase().includes(f) || 
        p.purpose.toLowerCase().includes(f) ||
        (p.employee_name && p.employee_name.toLowerCase().includes(f))
      );
    }

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding: var(--sp-8); vertical-align: middle;">No history found.</td></tr>';
      return;
    }

    tbody.innerHTML = history.map(p => {
      let statusClass = 'badge-gray';
      if (p.status === 'approved') statusClass = 'badge-green';
      if (p.status === 'pending') statusClass = 'badge-amber';
      if (p.status === 'rejected') statusClass = 'badge-red';
      if (p.status === 'used') statusClass = 'badge-blue';

      return `
      <tr>
        <td class="font-medium" style="vertical-align: middle;">${p.pass_id}</td>
        <td style="vertical-align: middle;">
          <div style="font-weight: 500;">${p.employee_name || 'Employee'}</div>
          ${p.pass_type === 'visitor' ? `<div class="text-sm text-muted">Visitor: ${p.visitor_name}</div>` : ''}
          <div style="margin-top: 4px;">
            ${Utils.buildPassTypeTag ? Utils.buildPassTypeTag(p.pass_type) : `<span class="badge ${p.pass_type === 'visitor' ? 'badge-blue' : 'badge-gray'}">${Utils.capitalize(p.pass_type)}</span>`}
          </div>
        </td>
        <td style="vertical-align: middle;">
          <div class="truncate-text" style="max-width: 200px;" title="${p.purpose}">${p.purpose}</div>
        </td>
        <td style="vertical-align: middle;">
          <div style="white-space: nowrap;">${formatDatePart(p.exit_time)}</div>
          <div class="text-xs text-muted">${formatTimePart(p.exit_time)}</div>
        </td>
        <td style="vertical-align: middle;"><span class="badge ${statusClass}">${Utils.capitalize(p.status)}</span></td>
        <td style="vertical-align: middle;" class="text-sm text-muted">${p.approved_by || '—'}</td>
      </tr>
    `}).join('');
  }
  
  function formatDatePart(dateStr) {
      if (!dateStr) return '—';
      const parts = Utils.formatDateTime(dateStr).split(' ');
      if (parts.length > 2) {
          // E.g. "Jun 27, 2026, 12:00 PM"
          return parts.slice(0, 3).join(' ').replace(',', '');
      }
      return parts[0];
  }
  
  function formatTimePart(dateStr) {
      if (!dateStr) return '';
      const parts = Utils.formatDateTime(dateStr).split(' ');
      if (parts.length > 2) {
          return parts.slice(3).join(' ');
      }
      return parts[1] || '';
  }

  async function updateStatus(passId, status, passType) {
    try {
      let endpoint = '/passes/' + passId + '/status';
      if (passType === 'visitor') {
        endpoint = '/visitor-passes/' + passId + '/status';
      } else if (passType === 'material') {
        endpoint = '/material-passes/' + passId + '/status';
      }
        
      await API.request(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      Utils.showToast('Pass ' + status + ' successfully.', 'success');
      loadData(); // refresh the tables and metrics immediately
    } catch (err) {
      console.error(err);
      Utils.showToast(err.message || 'Failed to update pass', 'error');
    }
  }

  return {
    init,
    loadData,
    approvePass: (id, type) => updateStatus(id, 'approved', type),
    rejectPass: (id, type) => updateStatus(id, 'rejected', type)
  };
})();

document.addEventListener('DOMContentLoaded', ManagerPage.init);
