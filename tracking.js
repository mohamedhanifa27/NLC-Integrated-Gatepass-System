console.log('tracking.js loaded');

const TrackingPage = (function() {
  let _allPasses = [];
  let _filteredPasses = [];
  let _currentPage = 1;
  const _itemsPerPage = 10;
  let _userRole = 'employee';
  let _currentTypeFilter = 'all';

  function decodeJWT(token) {
      if (!token) return null;
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

  function animateCount(el, target, duration = 600) {
      if (!el) return;
      target = parseInt(target) || 0;
      const start = parseInt(el.textContent) || 0;
      const range = target - start;
      if (range === 0) {
        el.textContent = target;
        return;
      }
      
      let startTime = null;
      const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(start + (range * easeOut));
        el.textContent = current;
        
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          el.textContent = target;
        }
      };
      window.requestAnimationFrame(step);
  }

  function init() {
    // Redirect if no token or decode fails
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (!token) {
      window.location.href = 'login.html';
      return;
    }
    
    // Inject animation styles for timeline
    if (!document.getElementById('timeline-styles')) {
      const style = document.createElement('style');
      style.id = 'timeline-styles';
      style.innerHTML = `
        @keyframes timelineFadeIn {
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
    try {
      const payload = decodeJWT(token);
      
      if (!payload || payload.role !== 'employee') {
        window.location.href = payload && payload.role === 'manager' ? 'manager.html' : 
                               payload && payload.role === 'admin' ? 'admin.html' : 
                               payload && payload.role === 'security' ? 'security.html' : '/';
        return;
      }

      _userRole = payload.role;

    } catch (e) {
      console.error('Auth guard failed:', e);
      window.location.href = '/';
      return;
    }

    // Auto-open modal if ?pass_id= is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetPassId = urlParams.get('pass_id');

    loadData().then(() => {
      if (targetPassId) {
        openTimelineModal(targetPassId);
      }
    });

    // Bind event listeners
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-ghost');
        });
        e.target.classList.remove('btn-ghost');
        e.target.classList.add('btn-primary');
        _currentTypeFilter = e.target.dataset.type;
        applyFilters();
      });
    });

    const closeBtn = document.getElementById('closeTimelineBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeTimelineModal);

    const modalOverlay = document.getElementById('timelineModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeTimelineModal();
      });
    }
  }

  async function loadData() {
    try {
      // 1. Fetch metrics
      const stats = await API.request('/dashboard/stats');
      renderMetrics(stats);

      // 2. Fetch passes (pending and history to get all)
      const [pendingRes, historyRes] = await Promise.all([
        API.request('/passes?status=pending&limit=1000'),
        API.request('/passes?status=history&limit=1000')
      ]);

      // Properly extract the array from the response object
      const pending = Array.isArray(pendingRes) ? pendingRes : (pendingRes.passes || pendingRes.data || []);
      const history = Array.isArray(historyRes) ? historyRes : (historyRes.passes || historyRes.data || []);

      // Merge and deduplicate
      const map = new Map();
      [...pending, ...history].forEach(p => map.set(p.pass_id, p));
      let allPasses = Array.from(map.values());

      // Sort descending by request date (or exit time if no request date)
      allPasses.sort((a, b) => {
        const d1 = new Date(a.request_date || a.exit_time || 0);
        const d2 = new Date(b.request_date || b.exit_time || 0);
        return d2 - d1;
      });

      _allPasses = allPasses;
      applyFilters();

    } catch (err) {
      console.error('Tracking page load error:', err);
      Utils.showToast('Failed to load tracking data.', 'error');
    }
  }

  function applyFilters() {
    let filtered = _allPasses;
    const searchVal = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('statusFilter')?.value || '';

    if (searchVal) {
      filtered = filtered.filter(p => 
        p.pass_id.toLowerCase().includes(searchVal) || 
        (p.purpose && p.purpose.toLowerCase().includes(searchVal))
      );
    }

    if (statusVal) {
      filtered = filtered.filter(p => p.status === statusVal);
    }
    
    if (_currentTypeFilter !== 'all') {
      if (_currentTypeFilter === 'gate') {
        filtered = filtered.filter(p => p.pass_type !== 'visitor' && p.pass_type !== 'material');
      } else {
        filtered = filtered.filter(p => p.pass_type === _currentTypeFilter);
      }
    }

    _filteredPasses = filtered;
    _currentPage = 1;
    renderCards();
  }

  function renderMetrics(metrics) {
    const elTotal = document.getElementById('metric-total');
    const elPending = document.getElementById('metric-pending');
    const elApproved = document.getElementById('metric-approved');
    const elRejected = document.getElementById('metric-rejected');
    
    if (elTotal) animateCount(elTotal, metrics.total || 0);
    if (elPending) animateCount(elPending, metrics.pending || 0);
    if (elApproved) animateCount(elApproved, metrics.approved || 0);
    if (elRejected) animateCount(elRejected, metrics.rejected || 0);
  }

  function renderCards() {
    const grid = document.getElementById('trackingCardsGrid');
    if (!grid) return;

    if (_filteredPasses.length === 0) {
      grid.style.display = 'block';
      grid.innerHTML = `
        <div style="text-align: center; padding: 4rem 1rem; background: var(--clr-surface); border-radius: var(--radius-lg); border: 1px solid var(--clr-border);">
          <div style="color: var(--clr-neutral-400); margin-bottom: 1rem;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </div>
          <h3 style="font-size: 1.125rem; font-weight: 600; color: var(--clr-neutral-900);">No passes found</h3>
          <p style="color: var(--clr-neutral-500); margin-top: 0.5rem;">Debug: allPasses=${_allPasses.length}, filtered=${_filteredPasses.length}</p>
        </div>
      `;
      renderPagination(0);
      return;
    }
    
    grid.style.display = 'grid';

    const startIndex = (_currentPage - 1) * _itemsPerPage;
    const paginated = _filteredPasses.slice(startIndex, startIndex + _itemsPerPage);

    grid.innerHTML = paginated.map(p => {
      let statusClass = 'badge-gray';
      let accentColor = 'var(--clr-neutral-300)';
      let gradientStyle = 'background: var(--clr-surface);';
      
      if (p.status === 'approved') {
        statusClass = 'badge-green';
        accentColor = 'var(--clr-success)';
        gradientStyle = 'background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.15) 100%);';
      }
      if (p.status === 'pending') {
        statusClass = 'badge-amber';
        accentColor = 'var(--clr-warning)';
        gradientStyle = 'background: linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(245, 158, 11, 0.15) 100%);';
      }
      if (p.status === 'rejected') {
        statusClass = 'badge-red';
        accentColor = 'var(--clr-danger)';
        gradientStyle = 'background: linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(239, 68, 68, 0.15) 100%);';
      }
      if (p.status === 'used') {
        statusClass = 'badge-blue';
        accentColor = 'var(--clr-primary-500)';
        gradientStyle = 'background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(59, 130, 246, 0.15) 100%);';
      }

      let dateStr = p.request_date ? new Date(p.request_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      
      return `
      <div style="${gradientStyle} border-radius: var(--radius-lg); border: 1px solid var(--clr-border); overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-sm); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm)';">
        <div style="height: 4px; background-color: ${accentColor}; width: 100%;"></div>
        
        <div style="padding: 1.25rem; flex: 1; display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-weight: 600; font-size: 1.125rem; color: var(--clr-neutral-900);">${p.pass_id}</div>
              <div style="font-size: 0.875rem; color: var(--clr-neutral-500); margin-top: 0.25rem;">Requested: ${dateStr}</div>
            </div>
            <span class="badge ${p.pass_type === 'visitor' ? 'badge-blue' : 'badge-gray'}">${Utils.capitalize(p.pass_type)}</span>
          </div>
          
          <div>
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; color: var(--clr-neutral-400); margin-bottom: 0.25rem;">Purpose</div>
            <div style="color: var(--clr-neutral-800); font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${p.purpose}">${p.purpose}</div>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 1rem; border-top: 1px solid var(--clr-neutral-100);">
            <span class="badge ${statusClass}">${Utils.capitalize(p.status)}</span>
            <button class="btn btn-sm btn-ghost" style="color:var(--clr-primary-600);" onclick="TrackingPage.openTimelineModal('${p.pass_id}')">
              View Timeline
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      </div>
    `}).join('');
    
    renderPagination(_filteredPasses.length);
  }

  function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / _itemsPerPage);
    const paginationContainer = document.getElementById('paginationControls');
    const showingText = document.getElementById('showingItemsText');
    
    if (showingText) {
        if (totalItems === 0) {
            showingText.innerHTML = 'Showing 0 items';
        } else {
            const start = (_currentPage - 1) * _itemsPerPage + 1;
            const end = Math.min(_currentPage * _itemsPerPage, totalItems);
            showingText.innerHTML = `Showing ${start} - ${end} of ${totalItems} items`;
        }
    }
    
    if (!paginationContainer) return;

    let html = '';
    
    html += `<button class="btn btn-ghost btn-icon" ${(_currentPage === 1 || totalItems === 0) ? 'disabled' : ''} onclick="TrackingPage.changePage(${_currentPage - 1})">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>`;
    
    if (totalPages > 0) {
      html += `<div class="pagination-pages" style="display: flex; gap: 4px;">`;
      for (let i = 1; i <= totalPages; i++) {
          if (i === 1 || i === totalPages || (i >= _currentPage - 1 && i <= _currentPage + 1)) {
              html += `<button class="btn ${i === _currentPage ? 'btn-primary' : 'btn-ghost'}" style="min-width: 32px; height: 32px; padding: 0;" onclick="TrackingPage.changePage(${i})">${i}</button>`;
          } else if (i === _currentPage - 2 || i === _currentPage + 2) {
              html += `<span style="padding: 0 4px; color: var(--clr-neutral-500); display: flex; align-items: center;">...</span>`;
          }
      }
      html += `</div>`;
    }

    html += `<button class="btn btn-ghost btn-icon" ${(_currentPage === totalPages || totalItems === 0) ? 'disabled' : ''} onclick="TrackingPage.changePage(${_currentPage + 1})">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`;
    
    paginationContainer.innerHTML = html;
  }

  function changePage(page) {
    _currentPage = page;
    renderCards();
  }

  async function openTimelineModal(passId) {
    const pass = _allPasses.find(p => p.pass_id === passId);
    if (!pass) return;

    document.getElementById('timelineTitle').textContent = `Pass Timeline: ${passId}`;
    document.getElementById('timelineSubtitle').textContent = Utils.capitalize(pass.pass_type) + ' Pass';

    const container = document.getElementById('timelineContainer');
    container.innerHTML = '<div class="text-center text-muted" style="padding: 2rem;">Loading timeline...</div>';

    document.getElementById('timelineModal').classList.add('active');

    let gateActivity = null;
    try {
      if (pass.pass_type === 'gate') {
        const response = await fetch(CONFIG.API_BASE + '/gate-activity/' + passId, {
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            'Authorization': `Bearer ${localStorage.getItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token')}`
          }
        });
        if (response.ok) {
          gateActivity = await response.json();
        }
      }
    } catch (e) {
      console.warn("Gate activity fetch failed", e);
    }

    renderTimeline(pass, gateActivity);
  }

  function renderTimeline(pass, gateActivity) {
    const container = document.getElementById('timelineContainer');
    let html = '';
    let nodeIndex = 0;

    const reqDate = pass.request_date ? new Date(pass.request_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown date';
    
    html += buildTimelineNode('Submitted', `Submitted by ${pass.employee_name || 'employee'} on ${reqDate}`, 'completed', true, false, nodeIndex++);

    let reviewStatus = pass.status === 'pending' ? 'in-progress' : 'completed';
    html += buildTimelineNode('Under Review', 'Awaiting manager approval', reviewStatus, true, false, nodeIndex++);

    let decisionStatus = 'grey';
    let decisionDesc = 'Pending decision';
    let isRejected = false;
    
    if (pass.status === 'approved' || pass.status === 'used') {
      decisionStatus = 'completed';
      decisionDesc = `Approved by ${pass.approved_by || 'Manager'}`;
    } else if (pass.status === 'rejected') {
      decisionStatus = 'failed';
      decisionDesc = `Rejected by ${pass.approved_by || 'Manager'}`;
      isRejected = true;
    } else if (pass.status === 'pending') {
      decisionStatus = 'in-progress';
    }
    
    html += buildTimelineNode('Decision', decisionDesc, decisionStatus, pass.pass_type === 'gate', isRejected, nodeIndex++);

    if (pass.pass_type === 'gate') {
      let gateStatus = 'grey';
      let gateDesc = 'Not yet recorded';
      
      if (gateActivity && (gateActivity.exit_time || gateActivity.return_time)) {
        gateStatus = 'completed';
        gateDesc = `Exit: ${gateActivity.exit_time || '-'}, Return: ${gateActivity.return_time || '-'}`;
      } else if (pass.status === 'used') {
        gateStatus = 'completed';
        gateDesc = `Pass utilized`;
      }
      
      if (isRejected) gateStatus = 'grey';
      
      html += buildTimelineNode('Gate Activity', gateDesc, gateStatus, false, false, nodeIndex++);
    }

    container.innerHTML = html;
  }

  function buildTimelineNode(title, desc, state, hasLine = true, isRejected = false, index = 0) {
    let color = 'var(--clr-neutral-300)';
    let iconSvg = '';
    
    if (state === 'completed') {
      color = 'var(--clr-success)';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (state === 'in-progress') {
      color = 'var(--clr-warning)';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    } else if (state === 'failed') {
      color = 'var(--clr-danger)';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    } else {
      iconSvg = '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--clr-neutral-300);"></div>';
    }

    const animationDelay = index * 0.15;

    return `
      <div style="display: flex; gap: 1rem; margin-bottom: 0; min-height: 80px; opacity: 0; transform: translateY(10px); animation: timelineFadeIn 0.4s ease forwards ${animationDelay}s;">
        <div style="display: flex; flex-direction: column; align-items: center; min-width: 28px;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${state === 'completed' || state === 'failed' || state === 'in-progress' ? color : 'white'}; border: 2px solid ${color}; z-index: 2; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 0 0 4px white;">
            ${iconSvg}
          </div>
          ${hasLine ? `<div style="width: 2px; flex: 1; background-color: ${state === 'completed' ? color : 'var(--clr-neutral-200)'}; margin-top: 4px; margin-bottom: 4px;"></div>` : ''}
        </div>
        <div style="padding-bottom: ${hasLine ? '1.5rem' : '0'}; flex: 1; padding-top: 2px;">
          <div style="font-weight: 600; font-size: 1.05rem; color: ${isRejected ? 'var(--clr-danger-600)' : 'var(--clr-neutral-900)'};">${title}</div>
          <div class="text-sm text-muted" style="margin-top: 4px; ${isRejected ? 'color: var(--clr-danger-500);' : ''}">${desc}</div>
        </div>
      </div>
    `;
  }

  function closeTimelineModal() {
    const modal = document.getElementById('timelineModal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  function showTimelineModal() {
    const modal = document.getElementById('timelineModal');
    if (modal) {
      modal.classList.add('show');
    }
  }

  // Override openTimelineModal to use the new show method
  const originalOpenTimelineModal = openTimelineModal;
  openTimelineModal = async function(passId) {
    showTimelineModal();
    return originalOpenTimelineModal(passId);
  }

  return {
    init,
    loadData,
    changePage,
    openTimelineModal
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Utils !== 'undefined') {
    TrackingPage.init();
  } else {
    // Fallback if Utils is somehow loaded after
    setTimeout(TrackingPage.init, 100);
  }
});
