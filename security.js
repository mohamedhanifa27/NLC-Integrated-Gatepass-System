/**
 * security.js
 * Logic for the Security Verification portal
 */

const SecurityPage = (function() {
  let currentPass = null;

  function init() {
    setupAuthUI();
    startDateClock();
    loadActivity();
  }

  /** Live clock in top bar — mirrors DashboardPage.startDateClock() */
  function startDateClock() {
    const el = document.getElementById('liveDateDisplay');
    console.log('[SecurityPage] startDateClock called, element found:', !!el);
    if (!el) return;
    const update = () => { el.textContent = Utils.formatDateLong(); };
    update();
    setInterval(update, 30000);
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
    
    let name = 'Security Guard';
    let role = 'security';
    
    const decoded = decodeJWT(token);
    if (decoded) {
      name = decoded.name || name;
      role = decoded.role || role;
    }

    if (role !== 'security' && role !== 'admin') {
      window.location.href = '/';
      return;
    }
    
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const userAvatarEl = document.getElementById('userAvatar');
    
    if (userNameEl) userNameEl.textContent = name;
    if (userRoleEl) userRoleEl.textContent = Utils.capitalize(role);
    if (userAvatarEl) userAvatarEl.textContent = name.charAt(0).toUpperCase();

    // Populate sidebar user card
    document.querySelectorAll('.user-card-name').forEach(el => el.textContent = name);
    document.querySelectorAll('.user-card-role').forEach(el => el.textContent = Utils.capitalize(role));
    document.querySelectorAll('.user-avatar').forEach(el => el.textContent = name.charAt(0).toUpperCase());

    // Bind sidebar logout link
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        Utils.clearSession();
        window.location.href = 'login.html';
      });
    }
  }

  async function lookupPass(event) {
    if (event) event.preventDefault();
    const inputEl = document.getElementById('lookupInput');
    if (!inputEl) return;
    const input = inputEl.value.trim().toUpperCase();
    const resultDiv = document.getElementById('lookupResult');
    const banner = document.getElementById('unapprovedBanner');
    
    if (!input) return;

    // Client-side validation: must start with GP-, VP-, or MP-
    const validPrefixPattern = /^(GP|VP|MP)-\d{4}-\d{1,6}$/;
    if (!validPrefixPattern.test(input)) {
      if (banner) banner.style.display = 'none';
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<div style="text-align:center; padding: 2rem;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--clr-warning-500, #f59e0b)" stroke-width="2" style="margin-bottom:1rem;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style="color:var(--text-light);">Invalid Pass ID format. Expected format: <strong>GP-2025-0001</strong>, <strong>VP-2025-0001</strong>, or <strong>MP-2025-0001</strong></div>
        </div>`;
      }
      return;
    }

    try {
      const token = localStorage.getItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token');
      const response = await fetch(CONFIG.API_BASE + '/passes/lookup/' + encodeURIComponent(input), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 404) {
        if (banner) banner.style.display = 'none';
        if (resultDiv) {
          resultDiv.style.display = 'block';
          resultDiv.innerHTML = `<div style="text-align:center; padding: 2rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--clr-neutral-400)" stroke-width="2" style="margin-bottom:1rem;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <div style="color:var(--text-light);">Pass not found. Please check the ID.</div>
          </div>`;
        }
        return;
      }

      if (response.status === 400) {
        const errData = await response.json();
        if (banner) banner.style.display = 'none';
        if (resultDiv) {
          resultDiv.style.display = 'block';
          resultDiv.innerHTML = `<div style="text-align:center; padding: 2rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--clr-warning-500, #f59e0b)" stroke-width="2" style="margin-bottom:1rem;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div style="color:var(--text-light);">${Utils.escapeHtml(errData.message || 'Invalid request')}</div>
          </div>`;
        }
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to lookup pass');
      }
      
      currentPass = await response.json();
      renderPassDetails(currentPass);
    } catch (e) {
      console.error(e);
      Utils.showToast('Error looking up pass: ' + e.message, 'error');
    }
  }

  function renderPassDetails(pass) {
    if (!pass) return;
    const resultDiv = document.getElementById('lookupResult');
    const banner = document.getElementById('unapprovedBanner');
    
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    
    const status = (pass.status || '').toLowerCase();
    const isApproved = status === 'approved';
    const isRejected = status === 'rejected';
    const isUsed = status === 'used';
    
    // Configure banner based on status
    if (banner) {
      if (isApproved) {
        banner.style.display = 'none';
      } else if (isRejected) {
        banner.style.display = 'block';
        banner.style.background = '#fee2e2';
        banner.style.color = '#991b1b';
        banner.innerHTML = '⛔ This pass has been <strong>rejected</strong>.' + 
          (pass.rejection_reason ? ' Reason: ' + Utils.escapeHtml(pass.rejection_reason) : '') +
          ' No actions can be performed.';
      } else if (isUsed) {
        banner.style.display = 'block';
        banner.style.background = '#dcfce7';
        banner.style.color = '#166534';
        banner.innerHTML = '✅ This pass is <strong>fully completed</strong>. Both exit and return have been logged.';
      } else {
        // pending or any other non-approved status
        banner.style.display = 'block';
        banner.style.background = '#fee2e2';
        banner.style.color = '#991b1b';
        banner.innerHTML = '⚠️ This pass is not approved (status: <strong>' + Utils.escapeHtml(status) + '</strong>). Entry/Exit cannot be logged.';
      }
    }
    
    const displayId = pass.pass_id || pass.visitor_pass_id || pass.material_pass_id || 'Unknown ID';
    const typeTag = Utils.buildPassTypeTag ? Utils.buildPassTypeTag(pass.pass_type || 'Unknown') : `<span class="pass-type-tag">${pass.pass_type || 'Unknown'}</span>`;
    const statusBadge = Utils.buildStatusBadge ? Utils.buildStatusBadge(pass.status) : `<span>${pass.status}</span>`;
    
    let html = `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
      <div>
        <h3 style="margin-bottom: 0.25rem;">${Utils.escapeHtml(displayId)}</h3>
        ${typeTag}
      </div>
      <div>
        ${statusBadge}
      </div>
    </div>`;

    html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; font-size: var(--text-sm);">`;
    
    const requesterName = Utils.escapeHtml(pass.employee_name || pass.host_name || pass.visitor_name || '—');
    html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Requester / Subject</span><strong>${requesterName}</strong></div>`;
    html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Purpose</span><strong>${Utils.escapeHtml(pass.purpose || '—')}</strong></div>`;
    
    if (pass.pass_type === 'visitor') {
      html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Expected Entry</span><strong>${Utils.formatDateTime(pass.expected_entry_time)}</strong></div>`;
      html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Expected Exit</span><strong>${Utils.formatDateTime(pass.expected_exit_time)}</strong></div>`;
    } else if (pass.pass_type === 'material') {
      html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Movement Time</span><strong>${Utils.formatDateTime(pass.expected_movement_time)}</strong></div>`;
      html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Direction</span><strong>${Utils.capitalize(pass.movement_direction || '—')}</strong></div>`;
    } else {
      html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Expected Exit</span><strong>${Utils.formatDateTime(pass.exit_time)}</strong></div>`;
      html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Expected Return</span><strong>${pass.return_time ? Utils.formatDateTime(pass.return_time) : 'One-way'}</strong></div>`;
    }
    
    html += `<div><span style="color:var(--text-light);display:block;font-size:0.75rem;">Approved By</span><strong>${Utils.escapeHtml(pass.approved_by || '—')}</strong></div>`;
    html += `</div>`;
    
    // Actions Section
    html += `<div style="border-top: 1px solid var(--clr-neutral-200); padding-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">`;
    
    if (isRejected) {
      html += `<button class="btn btn-outline" disabled style="opacity:0.6;">Pass Rejected — No Actions Available</button>`;
    } else if (isUsed) {
      // Fully completed pass — show logged timestamps, all disabled
      html += `<button class="btn btn-outline" disabled style="opacity:0.6;">Exit Logged: ${Utils.formatDateTime(pass.actual_exit_time)}</button>`;
      html += `<button class="btn btn-outline" disabled style="opacity:0.6;">Return Logged: ${Utils.formatDateTime(pass.actual_return_time)}</button>`;
    } else if (!isApproved) {
      // pending or any other non-approved status
      html += `<button class="btn btn-outline" disabled style="opacity:0.6;">Actions Disabled — Pass Not Approved</button>`;
    } else {
      // approved
      if (pass.pass_type === 'visitor' || pass.pass_type === 'material') {
         if (pass.is_verified) {
           html += `<button class="btn btn-outline" disabled style="opacity:0.6;">Verified: ${Utils.formatDateTime(pass.verification_time)}</button>`;
         } else {
           html += `<button class="btn btn-primary" onclick="SecurityPage.logVerify('${displayId}')">Acknowledge Verification</button>`;
         }
      } else {
         const hasExited = !!pass.actual_exit_time;
         const hasReturned = !!pass.actual_return_time;
         
         if (hasExited) {
           html += `<button class="btn btn-outline" disabled>Exit Logged: ${Utils.formatDateTime(pass.actual_exit_time)}</button>`;
         } else {
           html += `<button class="btn btn-primary" onclick="SecurityPage.logExit('${pass.pass_id}')">Log Exit</button>`;
         }
         
         if (pass.return_time) {
           if (hasReturned) {
             html += `<button class="btn btn-outline" disabled>Return Logged: ${Utils.formatDateTime(pass.actual_return_time)}</button>`;
           } else {
             html += `<button class="btn btn-primary" ${!hasExited ? 'disabled' : ''} onclick="SecurityPage.logReturn('${pass.pass_id}')">Log Return</button>`;
           }
         }
      }
    }
    
    html += `</div>`;
    resultDiv.innerHTML = html;
  }

  async function logAction(endpoint, passId) {
    try {
      const token = localStorage.getItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token');
      const response = await fetch(CONFIG.API_BASE + endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pass_id: passId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Action failed');
      
      Utils.showToast(data.message, 'success');
      
      // Re-trigger search to update DOM
      const input = document.getElementById('lookupInput');
      input.value = passId;
      document.getElementById('lookupBtn').click();
      
      // Update activity table
      loadActivity();
    } catch (e) {
      console.error(e);
      Utils.showToast(e.message, 'error');
    }
  }

  function logExit(passId) { logAction('/gate-activity/log-exit', passId); }
  function logReturn(passId) { logAction('/gate-activity/log-return', passId); }
  function logVerify(passId) { logAction('/gate-activity/verify', passId); }

  async function loadActivity() {
    try {
      const token = localStorage.getItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token');
      const response = await fetch(CONFIG.API_BASE + '/gate-activity?limit=20', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch activity');
      
      let data = await response.json();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        data = data.data || data.activities || [];
      }
      if (!Array.isArray(data)) data = [];
      
      renderActivityTable(data);
    } catch (e) {
      console.error('Activity load error:', e);
    }
  }

  function renderActivityTable(activities) {
    const tbody = document.getElementById('activityTableBody');
    if (!tbody) return;
    
    if (activities.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:2rem;">No recent gate activity found</td></tr>`;
      return;
    }
    
    tbody.innerHTML = activities.map(act => `
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

  return {
    init,
    lookupPass,
    logExit,
    logReturn,
    logVerify
  };
})();

document.addEventListener('DOMContentLoaded', SecurityPage.init);
