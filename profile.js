document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // Parse JWT
  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  const payload = parseJwt(token);
  if (!payload) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
    return;
  }

  // Dynamic Sidebar based on role
  if (payload.role === 'admin') {
    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
      nav.innerHTML = `
        <div class="nav-group">
          <div class="nav-group-label">System Administration</div>
          <div class="nav-item">
            <a href="admin.html" class="nav-link">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </span>
              Admin Portal
            </a>
          </div>
        </div>
        <div class="nav-group">
          <div class="nav-group-label">Account</div>
          <div class="nav-item">
            <a href="profile.html" class="nav-link active">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              My Profile
            </a>
          </div>
          <div class="nav-item">
            <a href="#" class="nav-link" id="logoutLinkSidebar">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              Sign Out
            </a>
          </div>
        </div>
      `;
    }
  } else if (payload.role === 'security') {
    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
      nav.innerHTML = `
        <div class="nav-group">
          <div class="nav-group-label">Security Operations</div>
          <div class="nav-item">
            <a href="security.html" class="nav-link">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
              Gate Verification
            </a>
          </div>
        </div>
        <div class="nav-group">
          <div class="nav-group-label">Account</div>
          <div class="nav-item">
            <a href="profile.html" class="nav-link active">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              My Profile
            </a>
          </div>
          <div class="nav-item">
            <a href="#" class="nav-link" id="logoutLinkSidebar">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              Sign Out
            </a>
          </div>
        </div>
      `;
    }
  } else if (payload.role === 'manager') {
    const nav = document.querySelector('.sidebar-nav');
    if (nav) {
      nav.innerHTML = `
        <div class="nav-group">
          <div class="nav-group-label">Overview</div>
          <div class="nav-item">
            <a href="manager.html" class="nav-link">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </span>
              Dashboard
            </a>
          </div>
        </div>
        <div class="nav-group">
          <div class="nav-group-label">Account</div>
          <div class="nav-item">
            <a href="profile.html" class="nav-link active">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              My Profile
            </a>
          </div>
          <div class="nav-item">
            <a href="#" class="nav-link" id="logoutLinkSidebar">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              Sign Out
            </a>
          </div>
        </div>
      `;
    }
  }

  // Bind the newly inserted logout button if it exists
  const sidebarLogout = document.getElementById('logoutLinkSidebar');
  if (sidebarLogout) {
    sidebarLogout.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof Utils !== 'undefined' && Utils.clearSession) {
        Utils.clearSession();
      } else {
        localStorage.removeItem(typeof CONFIG !== 'undefined' ? CONFIG.TOKEN_KEY : 'gatepass_token');
        localStorage.removeItem('gatepass_user');
      }
      window.location.href = 'login.html';
    });
  }


  // Common UI Elements (Topbar/Sidebar)
  const nameEls = document.querySelectorAll('.user-card-name, .topbar-profile-name, #topbarName');
  if (payload.name) {
    nameEls.forEach(el => el.textContent = payload.name);
  }

  const roleEls = document.querySelectorAll('.user-card-role, .topbar-profile-dept, #topbarRole');
  if (payload.role) {
    const displayRole = payload.role.charAt(0).toUpperCase() + payload.role.slice(1);
    roleEls.forEach(el => el.textContent = displayRole);
  }

  const avatarEls = document.querySelectorAll('.user-avatar, .user-card-avatar, #topbarAvatar');
  if (payload.name) {
    const initials = payload.name[0].toUpperCase();
    avatarEls.forEach(el => el.textContent = initials);
  }

  if (payload.role && typeof getRoleColor !== 'undefined') {
    avatarEls.forEach(el => el.style.backgroundColor = getRoleColor(payload.role));
  }

  // Swap Sidebar for Manager
  if (payload.role === 'manager') {
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
      sidebarNav.innerHTML = `
        <div class="nav-group">
          <div class="nav-group-label">Overview</div>
          <div class="nav-item">
            <a href="manager.html" class="nav-link">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </span>
              Dashboard
            </a>
          </div>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Approvals</div>
          <div class="nav-item">
            <a href="manager.html#pending" class="nav-link">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
              Pending Approvals
            </a>
          </div>
          <div class="nav-item">
            <a href="manager.html#history" class="nav-link">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </span>
              Pass History
            </a>
          </div>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Account</div>
          <div class="nav-item">
            <a href="profile.html" class="nav-link active" aria-current="page">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              My Profile
            </a>
          </div>
          <div class="nav-item">
            <a href="#" class="nav-link" id="logoutLinkDynamic">
              <span class="nav-link-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              Sign Out
            </a>
          </div>
        </div>
      `;
      document.getElementById('logoutLinkDynamic').addEventListener('click', (e) => {
        e.preventDefault();
        Utils.clearSession();
        window.location.href = 'login.html';
      });
    }
  }

  // Profile Specific Elements
  const profileAvatar = document.getElementById('profileAvatar');
  const profileName = document.getElementById('profileName');
  const profileRoleBadge = document.getElementById('profileRoleBadge');
  const profileEmail = document.getElementById('profileEmail');
  const profileDeptDisplay = document.getElementById('profileDeptDisplay');
  const editName = document.getElementById('editName');
  const editDepartment = document.getElementById('editDepartment');
  const profileAlert = document.getElementById('profileAlert');

  // Helper function to populate from an object (either API response or JWT payload)
  function populateProfileUI(data) {
    // Populate display card
    profileName.textContent = data.name || '—';
    profileEmail.textContent = data.email || '—';
    profileDeptDisplay.textContent = data.department || '—';
    
    // Set initials
    if (data.name) {
      profileAvatar.textContent = data.name[0].toUpperCase();
    }
    
    // Role badge
    if (data.role) {
      profileRoleBadge.textContent = data.role.charAt(0).toUpperCase() + data.role.slice(1);
      if (typeof getRoleColor !== 'undefined') {
        profileAvatar.style.backgroundColor = getRoleColor(data.role);
      }
      
      let badgeColor = '';
      let badgeBg = '';
      switch(data.role) {
        case 'admin': badgeColor = 'var(--clr-danger)'; badgeBg = 'var(--clr-danger-light)'; break;
        case 'manager': badgeColor = 'var(--clr-accent)'; badgeBg = 'var(--clr-accent-light)'; break;
        case 'security': badgeColor = 'var(--clr-warning)'; badgeBg = 'var(--clr-warning-light)'; break;
        default: badgeColor = 'var(--clr-primary-600)'; badgeBg = 'var(--clr-primary-050)'; break;
      }
      profileRoleBadge.style.color = badgeColor;
      profileRoleBadge.style.backgroundColor = badgeBg;
      profileRoleBadge.style.border = 'none';
    }

    // Populate form
    editName.value = data.name || '';
    editDepartment.value = data.department || '';
  }

  // Fetch full profile data
  async function fetchProfile() {
    try {
      const res = await fetch(CONFIG.API_BASE + '/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        console.log('Raw API Response from /api/profile:', json);
        const data = json.user || json;
        
        // Merge JWT payload with API response to ensure no missing fields
        const mergedData = {
          ...payload,
          ...data
        };
        populateProfileUI(mergedData);
      } else {
        if (res.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        } else {
            console.error('API Error:', res.status);
            populateProfileUI(payload); // Fallback to JWT payload
        }
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
      populateProfileUI(payload); // Fallback to JWT payload
    }
  }

  fetchProfile();

  // Password section toggle
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const passwordSection = document.getElementById('passwordSection');
  const currentPassword = document.getElementById('currentPassword');
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');

  togglePasswordBtn.addEventListener('click', () => {
    if (passwordSection.style.display === 'none') {
      passwordSection.style.display = 'block';
    } else {
      passwordSection.style.display = 'none';
      currentPassword.value = '';
      newPassword.value = '';
      confirmPassword.value = '';
    }
  });

  // Password visibility toggle logic
  document.querySelectorAll('.toggle-password-visibility').forEach(btn => {
    btn.addEventListener('click', function() {
      const targetId = this.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const eyeIcon = this.querySelector('.eye-icon');
      const eyeOffIcon = this.querySelector('.eye-off-icon');
      
      if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.style.display = 'none';
        eyeOffIcon.style.display = 'block';
      } else {
        input.type = 'password';
        eyeIcon.style.display = 'block';
        eyeOffIcon.style.display = 'none';
      }
    });
  });

  // Cancel button
  document.getElementById('btnCancelEdit').addEventListener('click', () => {
    fetchProfile(); // Reset fields to fetched data
    passwordSection.style.display = 'none';
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    profileAlert.style.display = 'none';
  });

  // Helper for alert
  function showAlert(msg, isSuccess) {
    profileAlert.textContent = msg;
    profileAlert.style.display = 'block';
    profileAlert.style.backgroundColor = isSuccess ? 'var(--clr-success-light)' : 'var(--clr-danger-light)';
    profileAlert.style.color = isSuccess ? 'var(--clr-success-dark)' : 'var(--clr-danger-dark)';
    profileAlert.style.border = `1px solid ${isSuccess ? 'var(--clr-success)' : 'var(--clr-danger)'}`;
    profileAlert.style.padding = 'var(--sp-3) var(--sp-4)';
    profileAlert.style.borderRadius = 'var(--radius-md)';
  }

  // Handle form submission
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const bodyData = {
      name: editName.value.trim(),
      department: editDepartment.value.trim()
    };

    if (passwordSection.style.display === 'block') {
      const curr = currentPassword.value;
      const newP = newPassword.value;
      const conf = confirmPassword.value;
      
      if (!curr || !newP || !conf) {
        showAlert('Please fill in all password fields to change password.', false);
        return;
      }
      
      if (newP !== conf) {
        showAlert('New password and confirm password do not match.', false);
        return;
      }
      
      bodyData.current_password = curr;
      bodyData.password = newP;
    }

    try {
      const res = await fetch(CONFIG.API_BASE + '/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bodyData)
      });
      
      const data = await res.json();
      
      if (res.ok) {
        if (data.token) {
          localStorage.setItem(CONFIG.TOKEN_KEY || 'gatepass_token', data.token);
        }
        try {
          const storedUser = localStorage.getItem(CONFIG.USER_KEY || 'gatepass_user');
          if (storedUser) {
            const userObj = JSON.parse(storedUser);
            userObj.name = data.name || userObj.name;
            userObj.department = data.department || userObj.department;
            localStorage.setItem(CONFIG.USER_KEY || 'gatepass_user', JSON.stringify(userObj));
          }
        } catch (err) {
          console.error('Failed to update stored user info', err);
        }
        
        // Update local display immediately and sync across shell
        profileName.textContent = data.name || data.user?.name || '—';
        profileDeptDisplay.textContent = data.department || data.user?.department || '—';
        if (data.name || data.user?.name) {
          const name = data.name || data.user.name;
          const initials = name[0].toUpperCase();
          profileAvatar.textContent = initials;
        }
        
        // Let script.js Utils update the rest of the shell
        if (typeof Utils !== 'undefined' && Utils.updateUserInfo) {
          Utils.updateUserInfo();
        }
        
        showAlert('Profile updated successfully.', true);
        // Reset password fields
        passwordSection.style.display = 'none';
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
      } else {
        showAlert(data.message || data.error || 'Failed to update profile.', false);
      }
    } catch (e) {
      console.error(e);
      showAlert('A network error occurred. Please try again.', false);
    }
  });
});
