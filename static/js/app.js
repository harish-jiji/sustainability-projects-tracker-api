const API_BASE = '/api';

// Intercept fetch calls to always include session cookies + CSRF token on modifying requests
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    // Always send session cookies so Django can authenticate the request
    options.credentials = options.credentials || 'same-origin';
    if (options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method.toUpperCase())) {
        options.headers = options.headers || {};
        const csrfToken = getCSRFToken();
        if (csrfToken) {
            options.headers['X-CSRFToken'] = csrfToken;
        }
    }
    return originalFetch(url, options);
};

function getCSRFToken() {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, 10) === 'csrftoken=') {
                cookieValue = decodeURIComponent(cookie.substring(10));
                break;
            }
        }
    }
    return cookieValue;
}

let currentUser = null;
let currentLoginType = 'admin';

let currentTab = 'projects';

let projectsPage = 1;
let tasksPage = 1;
let contributorsPage = 1;

// Cache list of all projects and contributors for selector lists
let allProjectsRaw = [];
let allContributorsRaw = [];

// Delete Confirmation Modal State
let deleteTargetType = null;
let deleteTargetId = null;
let currentDeleteCaptcha = '';

// Application Start
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

let projectDatePicker;
let taskDatePicker;
let contributorDatePicker;

async function initApp() {
    // Initialize Flatpickr calendars
    if (typeof flatpickr !== 'undefined') {
        projectDatePicker = flatpickr('#project-due-date', {
            theme: 'dark',
            dateFormat: 'Y-m-d',
            allowInput: true
        });
        taskDatePicker = flatpickr('#task-due-date', {
            theme: 'dark',
            dateFormat: 'Y-m-d',
            allowInput: true
        });
        contributorDatePicker = flatpickr('#contributor-joined-date', {
            theme: 'dark',
            dateFormat: 'Y-m-d',
            allowInput: true,
            defaultDate: new Date()
        });
    }

    // Setup Settings change requirements checker
    const settingsUsernameInput = document.getElementById('settings-username');
    if (settingsUsernameInput) {
        settingsUsernameInput.addEventListener('input', checkSettingsRequirements);
    }
    const settingsPasswordInput = document.getElementById('settings-password');
    if (settingsPasswordInput) {
        settingsPasswordInput.addEventListener('input', checkSettingsRequirements);
    }

    // Check authentication
    await checkAuth();
}

async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/auth/me/`);
        if (res.ok) {
            currentUser = await res.json();
            if (currentUser.is_temp_password) {
                showFirstLoginScreen();
                return;
            }
            showAppScreen();
            configureUIRoles();
            
            // Load stats and list items
            await Promise.all([
                fetchSidebarStats(),
                fetchProjects(),
                fetchContributorsListOnly()
            ]);
            
            if (currentUser.user_type === 'staff') {
                switchTab('tasks');
            } else {
                switchTab('projects');
            }
        } else {
            showLoginScreen();
        }
    } catch (err) {
        showLoginScreen();
    }
}

function showLoginScreen() {
    currentUser = null;
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('first-login-container').classList.add('hidden');
    document.getElementById('app-container').classList.add('hidden');
    setLoginType(currentLoginType);
}

function showFirstLoginScreen() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('first-login-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
}

function showAppScreen() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('first-login-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
}

function setLoginType(type) {
    currentLoginType = type;
    const btnAdmin = document.getElementById('btn-login-admin');
    const btnStaff = document.getElementById('btn-login-staff');
    const identityContainer = document.getElementById('login-field-identity');
    const forgotIdentityContainer = document.getElementById('forgot-field-identity');
    
    if (type === 'admin') {
        btnAdmin.className = "w-1/2 py-2 px-3 text-xs font-bold rounded-lg transition-all duration-200 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer";
        btnStaff.className = "w-1/2 py-2 px-3 text-xs font-bold rounded-lg transition-all duration-200 text-slate-400 hover:text-white cursor-pointer";
        
        if (identityContainer) {
            identityContainer.innerHTML = `
                <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Username</label>
                <input type="text" id="login-username" required placeholder="Enter username..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            `;
        }
        if (forgotIdentityContainer) {
            forgotIdentityContainer.innerHTML = `
                <label class="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Admin Username</label>
                <input type="text" id="forgot-username" required placeholder="Enter username..." class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500">
            `;
        }
    } else {
        btnStaff.className = "w-1/2 py-2 px-3 text-xs font-bold rounded-lg transition-all duration-200 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer";
        btnAdmin.className = "w-1/2 py-2 px-3 text-xs font-bold rounded-lg transition-all duration-200 text-slate-400 hover:text-white cursor-pointer";
        
        if (identityContainer) {
            identityContainer.innerHTML = `
                <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                <input type="email" id="login-email" required placeholder="e.g. harish@example.com" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            `;
        }
        if (forgotIdentityContainer) {
            forgotIdentityContainer.innerHTML = `
                <label class="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Staff Email Address</label>
                <input type="email" id="forgot-email" required placeholder="e.g. harish@example.com" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500">
            `;
        }
    }
}

function validatePassword(password) {
    if (password.length < 8) {
        return "Password must be at least 8 characters long.";
    }
    const letterCount = (password.match(/[a-zA-Z]/g) || []).length;
    if (letterCount < 2) {
        return "Password must contain at least 2 letters.";
    }
    if (!/[0-9]/.test(password)) {
        return "Password must contain at least 1 number.";
    }
    if (!/[A-Z]/.test(password)) {
        return "Password must contain at least 1 uppercase letter.";
    }
    if (!/[a-z]/.test(password)) {
        return "Password must contain at least 1 lowercase letter.";
    }
    return null;
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const password = document.getElementById('login-password').value;
    const payload = {
        user_type: currentLoginType,
        password: password
    };
    
    if (currentLoginType === 'admin') {
        payload.username = document.getElementById('login-username').value;
    } else {
        payload.email = document.getElementById('login-email').value;
    }
    
    try {
        const res = await fetch(`${API_BASE}/auth/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showNotification("Logged in successfully!");
            await checkAuth();
        } else {
            const err = await res.json();
            showNotification(err.detail || "Invalid login credentials.", "error");
        }
    } catch (err) {
        showNotification("Network error occurred.", "error");
    }
}

function showForgotPasswordForm() {
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-forgot-password').classList.remove('hidden');
}

function hideForgotPasswordForm() {
    document.getElementById('form-login').classList.remove('hidden');
    document.getElementById('form-forgot-password').classList.add('hidden');
}

async function handleForgotPasswordSubmit(e) {
    e.preventDefault();
    const newPassword = document.getElementById('forgot-new-password').value;
    const rePassword = document.getElementById('forgot-re-password').value;
    
    if (newPassword !== rePassword) {
        showNotification("Passwords do not match.", "error");
        return;
    }
    
    const pwError = validatePassword(newPassword);
    if (pwError) {
        showNotification(pwError, "error");
        return;
    }
    
    const payload = {
        user_type: currentLoginType,
        security_answer_1: document.getElementById('forgot-ans-1').value,
        security_answer_2: document.getElementById('forgot-ans-2').value,
        security_answer_3: document.getElementById('forgot-ans-3').value,
        new_password: newPassword,
        re_password: rePassword
    };
    
    if (currentLoginType === 'admin') {
        payload.identity = document.getElementById('forgot-username').value;
    } else {
        payload.identity = document.getElementById('forgot-email').value;
    }
    
    try {
        const res = await fetch(`${API_BASE}/auth/forgot-password/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showNotification("Password reset successful!");
            document.getElementById('form-forgot-password').reset();
            hideForgotPasswordForm();
            await checkAuth();
        } else {
            const err = await res.json();
            showNotification(err.detail || "Reset failed. Verify answers.", "error");
        }
    } catch (err) {
        showNotification("Network error occurred.", "error");
    }
}

async function handleFirstLoginSubmit(e) {
    e.preventDefault();
    const newPassword = document.getElementById('first-new-password').value;
    const rePassword = document.getElementById('first-re-password').value;
    
    if (newPassword !== rePassword) {
        showNotification("Passwords do not match.", "error");
        return;
    }
    
    const pwError = validatePassword(newPassword);
    if (pwError) {
        showNotification(pwError, "error");
        return;
    }
    
    const payload = {
        new_password: newPassword,
        re_password: rePassword,
        security_answer_1: document.getElementById('first-ans-1').value,
        security_answer_2: document.getElementById('first-ans-2').value,
        security_answer_3: document.getElementById('first-ans-3').value
    };
    
    try {
        const res = await fetch(`${API_BASE}/auth/change-temp-password/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showNotification("Security profile set successfully!");
            await checkAuth();
        } else {
            const err = await res.json();
            showNotification(err.detail || "Setup failed.", "error");
        }
    } catch (err) {
        showNotification("Network error occurred.", "error");
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE}/auth/logout/`, { method: 'POST' });
        showNotification("Logged out successfully.");
        showLoginScreen();
    } catch (err) {
        showLoginScreen();
    }
}

function configureUIRoles() {
    const isStaff = currentUser.user_type === 'staff';
    
    const tabProj = document.getElementById('tab-projects');
    const tabStaff = document.getElementById('tab-contributors');
    const tabTasks = document.getElementById('tab-tasks');
    const tabSettings = document.getElementById('tab-settings');
    
    if (isStaff) {
        if (tabProj) tabProj.classList.add('hidden');
        if (tabStaff) tabStaff.classList.add('hidden');
        
        // Hide Admin Quick Stats
        const statsSidebar = document.querySelector('aside div.space-y-4');
        if (statsSidebar) statsSidebar.classList.add('hidden');
        
        // Hide "New Task" button
        const newTaskBtn = document.querySelector('[onclick="openModal(\'task\')"]');
        if (newTaskBtn) newTaskBtn.classList.add('hidden');

        // Hide contributor filter (staff see only their own tasks - no filter needed)
        const contFilter = document.getElementById('filter-task-contributor');
        if (contFilter) contFilter.closest('div') ? contFilter.parentElement.classList.add('hidden') : contFilter.classList.add('hidden');
    } else {
        if (tabProj) tabProj.classList.remove('hidden');
        if (tabStaff) tabStaff.classList.remove('hidden');
        
        const statsSidebar = document.querySelector('aside div.space-y-4');
        if (statsSidebar) statsSidebar.classList.remove('hidden');
        
        const newTaskBtn = document.querySelector('[onclick="openModal(\'task\')"]');
        if (newTaskBtn) newTaskBtn.classList.remove('hidden');

        // Show contributor filter for admin
        const contFilter = document.getElementById('filter-task-contributor');
        if (contFilter) contFilter.parentElement.classList.remove('hidden');
    }
    
    const headerName = document.getElementById('header-user-name');
    const headerRole = document.getElementById('header-user-role');
    if (headerName) headerName.innerText = currentUser.name;
    if (headerRole) headerRole.innerText = currentUser.user_type === 'admin' ? 'Administrator' : 'Staff Member';
}

function loadSettingsTab() {
    const isStaff = currentUser.user_type === 'staff';
    
    document.getElementById('settings-name').value = currentUser.name || '';
    document.getElementById('settings-email').value = currentUser.email || '';
    
    document.getElementById('settings-password').value = '';
    document.getElementById('settings-re-password').value = '';
    
    const settingsCurrentPwd = document.getElementById('settings-current-password');
    if (settingsCurrentPwd) settingsCurrentPwd.value = '';
    
    const star = document.getElementById('current-pwd-req-star');
    if (star) star.classList.add('hidden');
    
    document.getElementById('settings-ans-1').value = '';
    document.getElementById('settings-ans-2').value = '';
    document.getElementById('settings-ans-3').value = '';
    
    const adminManagementCard = document.getElementById('admin-management-card');
    if (isStaff) {
        document.getElementById('settings-username-container').classList.add('hidden');
        document.getElementById('settings-skills-container').classList.remove('hidden');
        document.getElementById('settings-skills').value = currentUser.skills || '';
        if (adminManagementCard) adminManagementCard.classList.add('hidden');
    } else {
        document.getElementById('settings-username-container').classList.remove('hidden');
        document.getElementById('settings-username').value = currentUser.username || '';
        document.getElementById('settings-skills-container').classList.add('hidden');
        if (adminManagementCard) {
            adminManagementCard.classList.remove('hidden');
            fetchAdmins();
        }
    }
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('settings-current-password').value;
    const password = document.getElementById('settings-password').value;
    const rePassword = document.getElementById('settings-re-password').value;
    
    let isUsernameChanged = false;
    if (currentUser.user_type === 'admin') {
        const newUsername = document.getElementById('settings-username').value;
        if (newUsername !== currentUser.username) {
            isUsernameChanged = true;
        }
    }
    
    if (password) {
        if (password !== rePassword) {
            showNotification("Passwords do not match.", "error");
            return;
        }
        const pwError = validatePassword(password);
        if (pwError) {
            showNotification(pwError, "error");
            return;
        }
    }
    
    if ((password || isUsernameChanged) && !currentPassword) {
        showNotification("Current password is required to change username or password.", "error");
        return;
    }
    
    const payload = {
        name: document.getElementById('settings-name').value,
        email: document.getElementById('settings-email').value,
        current_password: currentPassword || undefined,
        password: password || undefined,
        security_answer_1: document.getElementById('settings-ans-1').value || undefined,
        security_answer_2: document.getElementById('settings-ans-2').value || undefined,
        security_answer_3: document.getElementById('settings-ans-3').value || undefined
    };
    
    if (currentUser.user_type === 'admin') {
        payload.username = document.getElementById('settings-username').value;
    } else {
        payload.skills = document.getElementById('settings-skills').value;
    }
    
    try {
        const res = await fetch(`${API_BASE}/auth/settings/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            // Determine what changed for a descriptive notification
            const changedPassword = !!password;
            const changedUsername = currentUser.user_type === 'admin' &&
                document.getElementById('settings-username').value !== currentUser.username;
            let msg = 'Settings saved successfully!';
            if (changedPassword && changedUsername) msg = 'Username and password updated successfully!';
            else if (changedPassword) msg = 'Password changed successfully!';
            else if (changedUsername) msg = 'Username changed successfully!';
            showNotification(msg);

            // Clear all sensitive fields after a successful save
            const clearIds = ['settings-password', 'settings-re-password', 'settings-current-password'];
            clearIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            // Hide the current-password requirement indicator if present
            const reqStar = document.getElementById('current-pwd-req-star');
            if (reqStar) reqStar.style.display = 'none';

            const meRes = await fetch(`${API_BASE}/auth/me/`);
            if (meRes.ok) {
                currentUser = await meRes.json();
                configureUIRoles();
                loadSettingsTab();
            }
        } else {
            const err = await res.json();
            showNotification(err.detail || "Failed to update settings.", "error");
        }
    } catch (err) {
        showNotification("Network error occurred.", "error");
    }
}

// Switch Active Tab
function switchTab(tabId) {
    currentTab = tabId;
    
    // Toggle visibility
    ['projects', 'tasks', 'contributors'].forEach(t => {
        const content = document.getElementById(`content-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        
        if (t === tabId) {
            if (content) content.classList.remove('hidden');
            if (btn) {
                btn.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
                btn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
            }
        } else {
            if (content) content.classList.add('hidden');
            if (btn) {
                btn.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
                btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
            }
        }
    });

    const settingsContent = document.getElementById('content-settings');
    const settingsBtn = document.getElementById('tab-settings');
    if (tabId === 'settings') {
        if (settingsContent) settingsContent.classList.remove('hidden');
        if (settingsBtn) {
            settingsBtn.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
            settingsBtn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
        }
        loadSettingsTab();
    } else {
        if (settingsContent) settingsContent.classList.add('hidden');
        if (settingsBtn) {
            settingsBtn.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
            settingsBtn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
        }
    }

    // Trigger specific tab fetches
    if (tabId === 'projects') fetchProjects();
    if (tabId === 'tasks') {
        populateTaskFormDropdowns();
        fetchTasks();
    }
    if (tabId === 'contributors') fetchContributors();
}

// Toast notifications
function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const bgClass = type === 'success' ? 'border-emerald-500/40 bg-slate-900/90 text-emerald-400' : 'border-rose-500/40 bg-slate-900/90 text-rose-400';
    const icon = type === 'success' ? 'fa-circle-check text-emerald-400' : 'fa-circle-xmark text-rose-400';
    
    toast.className = `flex items-center space-x-3 px-4 py-3 border rounded-xl shadow-lg transition-all duration-300 transform translate-x-full ${bgClass}`;
    toast.innerHTML = `
        <i class="fa-solid ${icon} text-lg"></i>
        <span class="text-sm font-semibold text-slate-200">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Animate In
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 50);

    // Animate Out & Remove
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Dynamic Error Modal Popup
function showErrorModal(title, errorData) {
    let errorHTML = '';
    if (typeof errorData === 'string') {
        errorHTML = `<p class="text-sm text-slate-300">${errorData}</p>`;
    } else if (typeof errorData === 'object' && errorData !== null) {
        errorHTML = '<ul class="space-y-2 text-sm text-slate-300 list-disc pl-5">';
        for (const [key, value] of Object.entries(errorData)) {
            const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
            const messages = Array.isArray(value) ? value.join(', ') : value;
            errorHTML += `<li><strong class="text-rose-400">${fieldName}:</strong> ${messages}</li>`;
        }
        errorHTML += '</ul>';
    } else {
        errorHTML = `<p class="text-sm text-slate-300">An unexpected error occurred.</p>`;
    }

    // Remove existing modal if any
    const existing = document.getElementById('dynamic-error-modal');
    if (existing) existing.remove();

    // Create the modal container
    const modalDiv = document.createElement('div');
    modalDiv.id = 'dynamic-error-modal';
    modalDiv.className = 'fixed inset-0 z-[100] flex items-center justify-center';
    modalDiv.innerHTML = `
        <div class="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"></div>
        <div class="relative bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl z-10 mx-4 transition-all duration-300 transform scale-95 opacity-0">
            <div class="flex items-center space-x-3 pb-3 border-b border-slate-800 text-rose-500">
                <i class="fa-solid fa-triangle-exclamation text-2xl animate-pulse"></i>
                <h3 class="text-lg font-bold text-white">${title}</h3>
            </div>
            <div class="py-4">
                ${errorHTML}
            </div>
            <div class="flex justify-end pt-3 border-t border-slate-800">
                <button onclick="document.getElementById('dynamic-error-modal').remove()" class="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/20 transition-all duration-200">
                    Dismiss
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modalDiv);

    // Animate scale/opacity in
    setTimeout(() => {
        const content = modalDiv.querySelector('.relative');
        if (content) {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }
    }, 50);
}

// Fetch Stats Sidebar
async function fetchSidebarStats() {
    try {
        const t = new Date().getTime();
        const projRes = await fetch(`${API_BASE}/projects/?_=${t}`);
        const projData = await projRes.json();
        document.getElementById('stat-projects').innerText = projData.count || 0;

        const taskRes = await fetch(`${API_BASE}/tasks/?_=${t}`);
        const taskData = await taskRes.json();
        document.getElementById('stat-tasks').innerText = taskData.count || 0;

        const overdueRes = await fetch(`${API_BASE}/tasks/?overdue=true&_=${t}`);
        const overdueData = await overdueRes.json();
        document.getElementById('stat-overdue').innerText = overdueData.count || 0;
    } catch (err) {
        console.error("Error loading stats:", err);
    }
}

async function fetchContributorsListOnly() {
    try {
        const res = await fetch(`${API_BASE}/contributors/?page_size=100&_=${new Date().getTime()}`);
        const data = await res.json();
        allContributorsRaw = data.results || [];
        
        // Populate filters
        const filterSelect = document.getElementById('filter-task-contributor');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">All Contributors</option>';
            allContributorsRaw.forEach(c => {
                filterSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
            });
        }
    } catch (err) {
        console.error(err);
    }
}

async function fetchProjectsListOnly() {
    try {
        const res = await fetch(`${API_BASE}/projects/?page_size=100&_=${new Date().getTime()}`);
        const data = await res.json();
        allProjectsRaw = data.results || [];
        console.log("fetchProjectsListOnly raw results fetched:", allProjectsRaw);
    } catch (err) {
        console.error("Error in fetchProjectsListOnly:", err);
    }
}

function populateTaskFormDropdowns(includeCompletedProjectId = null) {
    console.log("populateTaskFormDropdowns called. allProjectsRaw:", allProjectsRaw, "includeCompletedProjectId:", includeCompletedProjectId);
    
    // Projects (rendered as select option dropdown)
    const projSelect = document.getElementById('task-project-select');
    if (projSelect) {
        projSelect.innerHTML = '<option value="">No Project</option>';
        const projectsList = Array.isArray(allProjectsRaw) ? allProjectsRaw : [];
        projectsList.forEach(p => {
            if (p.status !== 'Completed' || p.id === includeCompletedProjectId) {
                projSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
            }
        });
        console.log("projSelect innerHTML populated:", projSelect.innerHTML);
    }

    // Contributors
    const contSelect = document.getElementById('task-assignee');
    if (contSelect) {
        contSelect.innerHTML = '<option value="">Unassigned</option>';
        allContributorsRaw.forEach(c => {
            contSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
    }
}

function getMatchingSkills(contributor, project) {
    if (!project || !contributor.skills) return [];
    
    // Split contributor skills by comma, trim, and filter empty strings
    const skills = contributor.skills.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
        
    const searchTarget = ((project.name || "") + " " + (project.description || "")).toLowerCase();
    
    // Find all skills that are present in target
    return skills.filter(skill => {
        const skillLower = skill.toLowerCase();
        if (skillLower.length < 2) return false; // Skip too short terms
        return searchTarget.includes(skillLower);
    });
}

function updateAssigneeRecommendations(projectId, selectedAssigneeId = null) {
    const contSelect = document.getElementById('task-assignee');
    const recContainer = document.getElementById('task-assignee-recommendations');
    if (!contSelect) return;

    const currentVal = selectedAssigneeId !== null ? selectedAssigneeId : contSelect.value;
    const project = allProjectsRaw.find(p => p.id === projectId);
    
    contSelect.innerHTML = '<option value="">Unassigned</option>';
    const recommendedList = [];

    allContributorsRaw.forEach(c => {
        let matchingSkills = [];
        if (project) {
            matchingSkills = getMatchingSkills(c, project);
        }

        const isRecommended = matchingSkills.length > 0;
        let displayName = c.name;
        if (isRecommended) {
            displayName = `⭐ ${c.name} (Recommended: ${matchingSkills.join(', ')})`;
            recommendedList.push({
                id: c.id,
                name: c.name,
                skills: matchingSkills
            });
        }
        
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = displayName;
        contSelect.appendChild(opt);
    });

    contSelect.value = currentVal || '';

    if (recContainer) {
        if (recommendedList.length > 0) {
            recContainer.classList.remove('hidden');
            recContainer.className = "mt-2 p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-[11px] text-slate-350 space-y-1.5";
            recContainer.innerHTML = `
                <div class="flex items-center text-emerald-400 font-semibold uppercase tracking-wider text-[10px] gap-1">
                    <i class="fa-solid fa-wand-magic-sparkles text-emerald-400/80"></i> Recommended Assignees:
                </div>
                <div class="flex flex-wrap gap-1.5 pt-0.5">
                    ${recommendedList.map(rec => `
                        <button type="button" onclick="selectRecommendedAssignee(${rec.id})" 
                                class="inline-flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg border border-emerald-500/20 hover:border-emerald-500/40 font-medium transition-all duration-150 shadow-sm cursor-pointer"
                                title="Click to assign to ${rec.name}">
                            ${rec.name} <span class="text-[9px] opacity-75">(${rec.skills.slice(0, 2).join(', ')})</span>
                        </button>
                    `).join('')}
                </div>
            `;
        } else {
            recContainer.classList.add('hidden');
            recContainer.innerHTML = '';
        }
    }
}

function selectRecommendedAssignee(id) {
    const contSelect = document.getElementById('task-assignee');
    if (contSelect) {
        contSelect.value = id;
        showNotification("Recommended assignee selected");
    }
}

// Automatically autofills description and due date when a project is selected
function onProjectSelectChange(select) {
    const projectId = parseInt(select.value);
    if (projectId) {
        const project = allProjectsRaw.find(p => p.id === projectId);
        if (project) {
            if (project.name) {
                const titleField = document.getElementById('task-title');
                if (titleField) titleField.value = project.name;
            }
            if (project.description) {
                const descField = document.getElementById('task-description');
                if (descField) descField.value = project.description;
            }
            if (project.due_date) {
                const dueDateField = document.getElementById('task-due-date');
                if (dueDateField) {
                    if (taskDatePicker) {
                        taskDatePicker.setDate(project.due_date);
                    } else {
                        dueDateField.value = project.due_date;
                    }
                }
            }
            if (project.status) {
                const statusField = document.getElementById('task-status');
                if (statusField) {
                    statusField.value = project.status;
                    onTaskStatusChange();
                }
            }
        }
        updateAssigneeRecommendations(projectId);
    } else {
        updateAssigneeRecommendations(null);
    }
}

// Two-way synchronization between completion checkbox and status dropdown
function onTaskStatusChange() {
    const statusField = document.getElementById('task-status');
    const compCheckbox = document.getElementById('task-is-completed');
    if (statusField && compCheckbox) {
        if (statusField.value === 'Completed') {
            compCheckbox.checked = true;
        } else {
            compCheckbox.checked = false;
        }
    }
}

function onTaskCompletedCheckboxChange() {
    const compCheckbox = document.getElementById('task-is-completed');
    const statusField = document.getElementById('task-status');
    if (compCheckbox && statusField) {
        if (compCheckbox.checked) {
            statusField.value = 'Completed';
        } else {
            if (statusField.value === 'Completed') {
                statusField.value = 'Active';
            }
        }
    }
}

// ------------------ PROJECTS CRUD ------------------
async function fetchProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    grid.innerHTML = getSkeletonHTML(4);
    
    const statusFilter = document.getElementById('filter-project-status').value;
    let url = `${API_BASE}/projects/?page=${projectsPage}&_=${new Date().getTime()}`;
    if (statusFilter) url += `&status=${statusFilter}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        
        grid.innerHTML = '';
        if (!data.results || data.results.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl"><i class="fa-solid fa-folder-open text-4xl mb-3 block"></i>No projects found. Create one to get started!</div>`;
            document.getElementById('projects-pagination').innerHTML = '';
            return;
        }

        // Cache projects for tasks dropdown
        allProjectsRaw = data.results;

        data.results.forEach(proj => {
            let badgeClass = '';
            if (proj.status === 'Active') badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            else if (proj.status === 'Completed') badgeClass = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
            else badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

            const total = proj.task_count || 0;
            const completed = proj.completed_task_count || 0;
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

            // Render tasks details (connections)
            let tasksListHtml = '';
            if (proj.tasks_details && proj.tasks_details.length > 0) {
                tasksListHtml = `
                    <div class="mt-4 pt-4 border-t border-slate-800/60">
                        <span class="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Connected Tasks</span>
                        <ul class="space-y-1.5">
                            ${proj.tasks_details.slice(0, 3).map(t => `
                                <li class="flex items-center space-x-2 text-xs text-slate-300">
                                    ${t.is_completed 
                                        ? '<i class="fa-solid fa-circle-check text-emerald-500"></i>' 
                                        : '<i class="fa-regular fa-circle text-slate-600"></i>'}
                                    <span class="${t.is_completed ? 'line-through text-slate-500' : ''} line-clamp-1">${t.title}</span>
                                </li>
                            `).join('')}
                            ${proj.tasks_details.length > 3 ? `<li class="text-[10px] text-slate-500 font-medium pl-5">+ ${proj.tasks_details.length - 3} more task(s)</li>` : ''}
                        </ul>
                    </div>
                `;
            } else {
                tasksListHtml = `
                    <div class="mt-4 pt-4 border-t border-slate-800/60 text-xs text-slate-500 italic">
                        No connected tasks
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition-all duration-300 flex flex-col justify-between";
            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badgeClass}">
                            ${proj.status}
                        </span>
                        <div class="flex items-center space-x-2">
                            ${currentUser.user_type === 'admin' ? `
                                <button onclick="editProject(${proj.id})" class="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-pen-to-square"></i></button>
                                <button onclick="deleteProject(${proj.id})" class="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-850 rounded-lg transition-all duration-150"><i class="fa-regular fa-trash-can"></i></button>
                            ` : ''}
                        </div>
                    </div>
                    <h3 class="text-lg font-bold text-white mb-2 line-clamp-1">${proj.name}</h3>
                    
                    <!-- Collapsible details section -->
                    <div id="project-details-${proj.id}" class="hidden space-y-4 pt-4 mt-4 border-t border-slate-800/60 transition-all duration-300">
                        <p class="text-sm text-slate-400 h-auto whitespace-pre-wrap">${proj.description}</p>
                        
                        <div class="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
                            <div class="flex items-center">
                                <span class="inline-flex items-center"><i class="fa-solid fa-location-dot mr-1.5 text-slate-500"></i>${proj.location}</span>
                            </div>
                            <div class="flex items-center text-slate-500">
                                <i class="fa-regular fa-calendar mr-1.5 text-slate-500"></i>
                                <span>Due: ${proj.due_date ? new Date(proj.due_date).toLocaleDateString() : 'No deadline'}</span>
                            </div>
                        </div>

                        ${tasksListHtml}
                    </div>
                </div>
                
                <div class="space-y-4 pt-4 border-t border-slate-800/60 mt-4">
                    <div class="flex items-center justify-between text-xs font-medium text-slate-400">
                        <span>Progress</span>
                        <span>${completed}/${total} Tasks (${percent}%)</span>
                    </div>
                    <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div class="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                    </div>
                    
                    <button onclick="toggleProjectDetails(${proj.id}, this)" class="w-full py-2 px-3 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all duration-150 flex items-center justify-center space-x-1.5">
                        <i class="fa-solid fa-chevron-down text-[10px]"></i>
                        <span>View Details</span>
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });

        renderPagination('projects', data, projectsPage);
    } catch (err) {
        console.error(err);
        showNotification("Failed to load projects", "error");
    }
}

async function saveProject(e) {
    e.preventDefault();
    const id = document.getElementById('project-id').value;
    const payload = {
        name: document.getElementById('project-name').value,
        description: document.getElementById('project-description').value,
        location: document.getElementById('project-location').value,
        status: document.getElementById('project-status').value,
        due_date: document.getElementById('project-due-date').value || null
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_BASE}/projects/${id}/` : `${API_BASE}/projects/`;

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showNotification(id ? "Project updated successfully!" : "Project created successfully!");
            closeModal('project');
            initApp();
        } else {
            const errData = await res.json();
            showErrorModal("Failed to Save Project", errData);
        }
    } catch (err) {
        showErrorModal("Network Error", "A network error occurred while communicating with the server.");
    }
}

async function editProject(id) {
    try {
        const res = await fetch(`${API_BASE}/projects/${id}/`);
        const proj = await res.json();
        
        document.getElementById('project-id').value = proj.id;
        document.getElementById('project-name').value = proj.name;
        document.getElementById('project-description').value = proj.description;
        document.getElementById('project-location').value = proj.location;
        document.getElementById('project-status').value = proj.status;
        if (projectDatePicker) {
            projectDatePicker.setDate(proj.due_date || '');
        } else {
            document.getElementById('project-due-date').value = proj.due_date || '';
        }

        document.getElementById('modal-project-title').innerText = "Edit Project";
        openModal('project');
    } catch (err) {
        showNotification("Could not fetch project details", "error");
    }
}

function deleteProject(id) {
    openDeleteModal('project', id);
}

// ------------------ TASKS CRUD ------------------
async function fetchTasks() {
    const tbody = document.getElementById('tasks-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-500">${getSpinner()}</td></tr>`;
    
    const assigneeFilter = document.getElementById('filter-task-contributor').value;
    const overdueFilter = document.getElementById('filter-task-overdue').value;

    let url = `${API_BASE}/tasks/?page=${tasksPage}&_=${new Date().getTime()}`;
    if (assigneeFilter) url += `&contributor=${assigneeFilter}`;
    if (overdueFilter) url += `&overdue=${overdueFilter}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        
        tbody.innerHTML = '';
        if (!data.results || data.results.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-500"><i class="fa-solid fa-clipboard-list text-3xl mb-3 block"></i>No tasks found. Click "New Task" to create one!</td></tr>`;
            document.getElementById('tasks-pagination').innerHTML = '';
            return;
        }

        data.results.forEach(task => {
            const statusIcon = task.is_completed 
                ? '<i class="fa-solid fa-circle-check text-emerald-500 text-lg"></i>' 
                : '<i class="fa-regular fa-circle text-slate-600 text-lg"></i>';
            
            const overdueBadge = task.is_overdue
                ? '<span class="ml-2 inline-flex items-center rounded bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400 border border-rose-500/20">Overdue</span>'
                : '';

            // Render project connections as badges
            let projectsBadgesHtml = '';
            if (task.projects_details && task.projects_details.length > 0) {
                projectsBadgesHtml = task.projects_details.map(p => `
                    <span class="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20 mr-1 mb-1 shadow-sm shadow-emerald-500/5">
                        ${p.name}
                    </span>
                `).join('');
            } else {
                projectsBadgesHtml = '<span class="italic text-slate-600">No project</span>';
            }

            // Render status badge
            let statusBadgeHtml = '';
            if (task.status === 'Active') {
                statusBadgeHtml = '<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>';
            } else if (task.status === 'Completed') {
                statusBadgeHtml = '<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">Completed</span>';
            } else {
                statusBadgeHtml = '<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border-amber-500/20">On Hold</span>';
            }

             const row = document.createElement('tr');
            row.className = "hover:bg-slate-900/30 transition-colors duration-150 border-b border-slate-800/40";
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick="toggleTaskCompletion(${task.id}, ${task.is_completed})" class="focus:outline-none transition-transform active:scale-90">
                        ${statusIcon}
                    </button>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-semibold text-white flex items-center">${task.title} ${overdueBadge}</div>
                </td>
                <td class="px-6 py-4 whitespace-normal text-sm font-medium">
                    <div class="flex flex-wrap max-w-[200px]">
                        ${projectsBadgesHtml}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    ${task.assigned_to_name ? `<span class="text-slate-300 font-medium"><i class="fa-regular fa-user mr-1.5 text-slate-500"></i>${task.assigned_to_name}</span>` : '<span class="italic text-slate-600">Unassigned</span>'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${task.is_overdue ? 'text-rose-400 font-bold' : 'text-slate-400'}">
                    <i class="fa-regular fa-calendar mr-1.5 text-slate-500"></i>${task.due_date}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    ${statusBadgeHtml}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium pr-6">
                    <div class="flex items-center justify-end space-x-1.5">
                        <button onclick="toggleTaskDetails(${task.id}, this)" class="text-slate-400 hover:text-emerald-400 p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150" title="View Details"><i class="fa-regular fa-eye"></i></button>
                        <button onclick="editTask(${task.id})" class="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150" title="Edit Task"><i class="fa-regular fa-pen-to-square"></i></button>
                        ${currentUser.user_type === 'admin' ? `<button onclick="deleteTask(${task.id})" class="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-trash-can"></i></button>` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(row);

            const detailsRow = document.createElement('tr');
            detailsRow.id = `task-details-row-${task.id}`;
            detailsRow.className = "hidden bg-slate-950/40";
            detailsRow.innerHTML = `
                <td colspan="7" class="px-8 py-4 border-b border-slate-800/60">
                    <div class="space-y-3 text-sm text-slate-300">
                        <div>
                            <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Task Description</span>
                            <p class="text-slate-200 font-medium whitespace-pre-wrap">${task.description || 'No checklist or description provided.'}</p>
                        </div>
                        <div class="grid grid-cols-2 gap-4 pt-3 border-t border-slate-800/40">
                            <div>
                                <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Connected Projects</span>
                                <div class="flex flex-wrap gap-1 mt-1">
                                    ${projectsBadgesHtml}
                                </div>
                            </div>
                            <div>
                                <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Assignee Details</span>
                                ${task.assigned_to_name 
                                    ? `<p class="text-slate-200 font-medium"><i class="fa-regular fa-user mr-1.5 text-slate-500"></i>${task.assigned_to_name} (${task.assigned_to_email})</p>` 
                                    : '<p class="italic text-slate-550">Unassigned</p>'}
                            </div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(detailsRow);
        });

        renderPagination('tasks', data, tasksPage);
    } catch (err) {
        console.error(err);
        showNotification("Failed to load tasks", "error");
    }
}

async function saveTask(e) {
    e.preventDefault();

    const select = document.getElementById('task-project-select');
    const selectedProjects = select && select.value ? [parseInt(select.value)] : [];

    const id = document.getElementById('task-id').value;
    const isStaff = currentUser.user_type === 'staff';
    
    let payload = {};
    if (isStaff) {
        payload = {
            is_completed: document.getElementById('task-is-completed').checked,
            status: document.getElementById('task-status').value
        };
    } else {
        payload = {
            projects: selectedProjects,
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-description').value,
            due_date: document.getElementById('task-due-date').value,
            assigned_to: document.getElementById('task-assignee').value || null,
            is_completed: document.getElementById('task-is-completed').checked,
            status: document.getElementById('task-status').value
        };
    }

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_BASE}/tasks/${id}/` : `${API_BASE}/tasks/`;

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            // If staff, also update project status if applicable
            if (isStaff && id) {
                const taskRes = await fetch(`${API_BASE}/tasks/${id}/`);
                const taskData = await taskRes.json();
                if (taskData.projects && taskData.projects.length > 0) {
                    const connectedProjId = taskData.projects[0];
                    const projStatus = document.getElementById('task-project-status').value;
                    
                    await fetch(`${API_BASE}/projects/${connectedProjId}/`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: projStatus })
                    });
                }
            }
            showNotification(id ? "Task updated successfully!" : "Task created successfully!");
            closeModal('task');
            initApp();
            if (currentTab === 'tasks') fetchTasks();
        } else {
            const errData = await res.json();
            showErrorModal("Failed to Save Task", errData);
        }
    } catch (err) {
        showErrorModal("Network Error", "A network error occurred while communicating with the server.");
    }
}

async function editTask(id) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${id}/`);
        const task = await res.json();
        const isStaff = currentUser.user_type === 'staff';

        if (isStaff) {
            // Staff: open the compact quick-update modal (status + completion only)
            document.getElementById('staff-task-id').value = task.id;
            document.getElementById('staff-task-title-display').innerText = task.title;
            document.getElementById('staff-task-status').value = task.status || 'Active';
            document.getElementById('staff-task-completed').checked = task.is_completed;
            openModal('staff-task');
            return;
        }

        // Admin: open the full edit modal
        await Promise.all([fetchProjectsListOnly(), fetchContributorsListOnly()]);
        const currentProjectId = task.projects.length > 0 ? task.projects[0] : null;
        populateTaskFormDropdowns(currentProjectId);

        document.getElementById('task-id').value = task.id;
        
        const projSelect = document.getElementById('task-project-select');
        if (projSelect) {
            projSelect.value = task.projects.length > 0 ? task.projects[0] : '';
            projSelect.disabled = false;
        }

        document.getElementById('task-title').value = task.title;
        document.getElementById('task-title').disabled = false;
        document.getElementById('task-description').value = task.description;
        document.getElementById('task-description').disabled = false;
        if (taskDatePicker) {
            taskDatePicker.setDate(task.due_date || '');
        } else {
            document.getElementById('task-due-date').value = task.due_date;
        }
        document.getElementById('task-due-date').disabled = false;
        document.getElementById('task-assignee').disabled = false;
        updateAssigneeRecommendations(currentProjectId, task.assigned_to);
        document.getElementById('task-is-completed').checked = task.is_completed;
        document.getElementById('task-status').value = task.status || 'Active';

        // Always hide project status section for admin (admin edits tasks directly)
        const projectStatusSection = document.getElementById('task-project-status-section');
        if (projectStatusSection) projectStatusSection.classList.add('hidden');

        document.getElementById('modal-task-title').innerText = 'Edit Task';
        openModal('task', true);
    } catch (err) {
        showNotification('Could not fetch task details', 'error');
    }
}

// Staff quick task update handlers
function onStaffTaskStatusChange() {
    const status = document.getElementById('staff-task-status').value;
    const checkbox = document.getElementById('staff-task-completed');
    if (checkbox) checkbox.checked = (status === 'Completed');
}

function onStaffTaskCompletedChange() {
    const checkbox = document.getElementById('staff-task-completed');
    const statusSelect = document.getElementById('staff-task-status');
    if (checkbox && statusSelect) {
        if (checkbox.checked) {
            statusSelect.value = 'Completed';
        } else {
            if (statusSelect.value === 'Completed') statusSelect.value = 'Active';
        }
    }
}

async function saveStaffTask(e) {
    e.preventDefault();
    const id = document.getElementById('staff-task-id').value;
    const status = document.getElementById('staff-task-status').value;
    const isCompleted = document.getElementById('staff-task-completed').checked;

    try {
        const res = await fetch(`${API_BASE}/tasks/${id}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, is_completed: isCompleted })
        });
        if (res.ok) {
            showNotification('Task updated successfully!');
            closeModal('staff-task');
            initApp();
            if (currentTab === 'tasks') fetchTasks();
        } else {
            const errData = await res.json();
            showNotification(errData.detail || 'Failed to update task.', 'error');
        }
    } catch (err) {
        showNotification('Network error occurred.', 'error');
    }
}

async function toggleTaskCompletion(id, currentStatus) {
    try {
        const res = await fetch(`${API_BASE}/tasks/${id}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_completed: !currentStatus })
        });
        if (res.ok) {
            showNotification("Task status updated");
            initApp();
            if (currentTab === 'tasks') fetchTasks();
        } else {
            showNotification("Failed to update status", "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
    }
}

function deleteTask(id) {
    openDeleteModal('task', id);
}

// ------------------ CONTRIBUTORS CRUD ------------------
async function fetchContributors() {
    const grid = document.getElementById('contributors-grid');
    if (!grid) return;
    grid.innerHTML = getSkeletonHTML(3);

    try {
        const res = await fetch(`${API_BASE}/contributors/?page=${contributorsPage}&_=${new Date().getTime()}`);
        const data = await res.json();
        
        grid.innerHTML = '';
        if (!data.results || data.results.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl"><i class="fa-solid fa-user-tag text-3xl mb-3 block"></i>No staff registered yet.</div>`;
            document.getElementById('contributors-pagination').innerHTML = '';
            return;
        }

        allContributorsRaw = data.results;

        data.results.forEach(cont => {
            const skills = cont.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
            let skillBadges = skills.map(s => `<span class="inline-flex items-center rounded-md bg-slate-950 px-2 py-1 text-xs font-semibold text-slate-400 border border-slate-800">${s}</span>`).join(' ');
            if (skills.length === 0) skillBadges = '<span class="text-xs italic text-slate-600">No skills set</span>';

            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition-all duration-300 flex flex-col justify-between";
            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <div class="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400">
                            ${cont.name.charAt(0).toUpperCase()}
                        </div>
                        <div class="flex items-center space-x-1.5">
                            <button onclick="editContributor(${cont.id})" class="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button onclick="deleteContributor(${cont.id})" class="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-850 rounded-lg transition-all duration-150"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </div>
                    <h3 class="text-base font-bold text-white">${cont.name}</h3>
                    <p class="text-xs text-slate-400 mt-1">${cont.email}</p>
                    
                    <!-- Collapsible details section -->
                    <div id="contributor-details-${cont.id}" class="hidden space-y-4 mt-4 pt-4 border-t border-slate-800/60 transition-all duration-300">
                        <div>
                            <span class="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Expertise / Skills</span>
                            <div class="flex flex-wrap gap-1.5">${skillBadges}</div>
                        </div>
                        <div class="text-[10px] text-slate-500">
                            Joined on ${new Date(cont.joined_on).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                
                <div class="mt-4 pt-4 border-t border-slate-800/60">
                    <button onclick="toggleContributorDetails(${cont.id}, this)" class="w-full py-2 px-3 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all duration-150 flex items-center justify-center space-x-1.5">
                        <i class="fa-solid fa-chevron-down text-[10px]"></i>
                        <span>View Skills</span>
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });

        renderPagination('contributors', data, contributorsPage);
    } catch (err) {
        console.error(err);
        showNotification("Failed to load staff", "error");
    }
}

async function saveContributor(e) {
    e.preventDefault();
    const id = document.getElementById('contributor-id').value;
    const payload = {
        name: document.getElementById('contributor-name').value,
        email: document.getElementById('contributor-email').value,
        skills: document.getElementById('contributor-skills').value,
        joined_date: document.getElementById('contributor-joined-date').value
    };
    
    if (!id) {
        const passwordInput = document.getElementById('contributor-password').value;
        if (passwordInput) {
            payload.password = passwordInput;
        }
    }

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_BASE}/contributors/${id}/` : `${API_BASE}/contributors/`;

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showNotification(id ? "Staff updated successfully!" : "Staff created successfully!");
            closeModal('contributor');
            initApp();
            if (currentTab === 'contributors') fetchContributors();
        } else {
            const errData = await res.json();
            showErrorModal("Failed to Save Staff", errData);
        }
    } catch (err) {
        showErrorModal("Network Error", "A network error occurred while communicating with the server.");
    }
}

async function editContributor(id) {
    try {
        const res = await fetch(`${API_BASE}/contributors/${id}/`);
        const cont = await res.json();
        
        document.getElementById('contributor-id').value = cont.id;
        document.getElementById('contributor-name').value = cont.name;
        document.getElementById('contributor-email').value = cont.email;
        document.getElementById('contributor-skills').value = cont.skills || '';
        
        if (contributorDatePicker) {
            contributorDatePicker.setDate(cont.joined_date || '');
        } else {
            document.getElementById('contributor-joined-date').value = cont.joined_date || '';
        }
        
        const pwField = document.getElementById('contributor-password');
        if (pwField) {
            pwField.placeholder = "Password already set";
            pwField.disabled = true;
        }

        document.getElementById('modal-contributor-title').innerText = "Edit Staff Details";
        openModal('contributor');
    } catch (err) {
        showNotification("Could not fetch staff details", "error");
    }
}

function deleteContributor(id) {
    openDeleteModal('contributor', id);
}

// ------------------ PAGINATION RENDER ------------------
function renderPagination(prefix, data, currentPage) {
    const paginationContainer = document.getElementById(`${prefix}-pagination`);
    if (!paginationContainer) return;
    if (!data.results || data.results.length === 0) {
        paginationContainer.innerHTML = '';
        return;
    }

    const hasPrev = data.previous !== null;
    const hasNext = data.next !== null;
    const totalCount = data.count || 0;
    const totalPages = Math.ceil(totalCount / 10);

    paginationContainer.innerHTML = `
        <span class="text-xs font-semibold text-slate-500">Showing page ${currentPage} of ${totalPages || 1} (${totalCount} total items)</span>
        <div class="flex items-center space-x-2">
            <button onclick="changePage('${prefix}', ${currentPage - 1})" ${!hasPrev ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:text-white disabled:opacity-40 disabled:hover:text-slate-400 transition-colors duration-150">
                <i class="fa-solid fa-angle-left mr-1"></i>Previous
            </button>
            <button onclick="changePage('${prefix}', ${currentPage + 1})" ${!hasNext ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:text-white disabled:opacity-40 disabled:hover:text-slate-400 transition-colors duration-150">
                Next<i class="fa-solid fa-angle-right ml-1"></i>
            </button>
        </div>
    `;
}

function changePage(prefix, page) {
    if (prefix === 'projects') {
        projectsPage = page;
        fetchProjects();
    } else if (prefix === 'tasks') {
        tasksPage = page;
        fetchTasks();
    } else if (prefix === 'contributors') {
        contributorsPage = page;
        fetchContributors();
    }
}

// ------------------ MODAL ACTIONS ------------------
async function openModal(type, isEdit = false) {
    if (type === 'task' && !isEdit) {
        await Promise.all([fetchProjectsListOnly(), fetchContributorsListOnly()]);
        populateTaskFormDropdowns();
        updateAssigneeRecommendations(null);
    }
    
    const modal = document.getElementById(`modal-${type}`);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(type) {
    if (type === 'project' && projectDatePicker) projectDatePicker.clear();
    if (type === 'task' && taskDatePicker) taskDatePicker.clear();

    if (type === 'task') {
        const select = document.getElementById('task-project-select');
        if (select) {
            select.value = '';
            select.disabled = false;
        }
        document.getElementById('task-title').disabled = false;
        document.getElementById('task-description').disabled = false;
        document.getElementById('task-due-date').disabled = false;
        document.getElementById('task-assignee').disabled = false;
        
        const projStatusSec = document.getElementById('task-project-status-section');
        if (projStatusSec) projStatusSec.classList.add('hidden');

        const recContainer = document.getElementById('task-assignee-recommendations');
        if (recContainer) {
            recContainer.classList.add('hidden');
            recContainer.innerHTML = '';
        }
    }
    if (type === 'contributor') {
        const pwField = document.getElementById('contributor-password');
        if (pwField) {
            pwField.placeholder = "Temp password...";
            pwField.disabled = false;
        }
        if (contributorDatePicker) {
            contributorDatePicker.setDate(new Date());
        }
    }

    if (type === 'admin-user') {
        const adminForm = document.getElementById('form-admin-user');
        if (adminForm) adminForm.reset();
    }

    const modal = document.getElementById(`modal-${type}`);
    if (modal) modal.classList.add('hidden');
    
    const form = document.getElementById(`form-${type}`);
    if (form) form.reset();
    
    const idField = document.getElementById(`${type}-id`);
    if (idField) idField.value = '';
    
    // Restore titles for creations
    if (type === 'project') {
        const title = document.getElementById('modal-project-title');
        if (title) title.innerText = "Add New Project";
    }
    if (type === 'task') {
        const title = document.getElementById('modal-task-title');
        if (title) title.innerText = "Add New Task";
    }
    if (type === 'contributor') {
        const title = document.getElementById('modal-contributor-title');
        if (title) title.innerText = "Add Staff";
    }
}

// ------------------ UTILS & SKELETONS ------------------
function getSpinner() {
    return `<div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-slate-800 border-t-emerald-500"></div>`;
}

function getSkeletonHTML(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 animate-pulse space-y-4">
                <div class="flex justify-between items-center">
                    <div class="h-5 bg-slate-800 rounded w-1/4"></div>
                    <div class="h-6 bg-slate-800 rounded-lg w-10"></div>
                </div>
                <div class="h-6 bg-slate-850 rounded w-3/4 mb-2"></div>
                <div class="space-y-2">
                    <div class="h-4 bg-slate-850 rounded w-full"></div>
                    <div class="h-4 bg-slate-850 rounded w-5/6"></div>
                </div>
                <div class="pt-4 border-t border-slate-800/60 mt-4 space-y-2">
                    <div class="h-3 bg-slate-800 rounded w-2/3"></div>
                    <div class="h-2 bg-slate-800 rounded w-full"></div>
                </div>
            </div>
        `;
    }
    return html;
}

// Toggle view functions for collapsible details
function toggleProjectDetails(id, btn) {
    const details = document.getElementById(`project-details-${id}`);
    if (details) {
        const isHidden = details.classList.contains('hidden');
        
        // Find and collapse all other open details
        document.querySelectorAll('[id^="project-details-"]').forEach(el => {
            if (el.id !== `project-details-${id}`) {
                el.classList.add('hidden');
            }
        });
        
        // Reset all other project toggle buttons to 'View Details'
        document.querySelectorAll('[onclick^="toggleProjectDetails"]').forEach(el => {
            if (el !== btn) {
                const span = el.querySelector('span');
                if (span) span.innerText = 'View Details';
                const icon = el.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-chevron-down text-[10px]';
            }
        });

        // Toggle the clicked one
        if (isHidden) {
            details.classList.remove('hidden');
            btn.querySelector('span').innerText = 'Hide Details';
            btn.querySelector('i').className = 'fa-solid fa-chevron-up text-[10px]';
        } else {
            details.classList.add('hidden');
            btn.querySelector('span').innerText = 'View Details';
            btn.querySelector('i').className = 'fa-solid fa-chevron-down text-[10px]';
        }
    }
}

function toggleTaskDetails(id, btn) {
    const detailsRow = document.getElementById(`task-details-row-${id}`);
    if (detailsRow) {
        const isHidden = detailsRow.classList.contains('hidden');
        
        // Find and collapse all other task detail rows
        document.querySelectorAll('[id^="task-details-row-"]').forEach(el => {
            if (el.id !== `task-details-row-${id}`) {
                el.classList.add('hidden');
            }
        });
        
        // Reset all other task toggle buttons
        document.querySelectorAll('[onclick^="toggleTaskDetails"]').forEach(el => {
            if (el !== btn) {
                el.innerHTML = '<i class="fa-regular fa-eye"></i>';
                el.classList.remove('text-emerald-400');
            }
        });

        // Toggle the clicked one
        if (isHidden) {
            detailsRow.classList.remove('hidden');
            btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
            btn.classList.add('text-emerald-400');
        } else {
            detailsRow.classList.add('hidden');
            btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
            btn.classList.remove('text-emerald-400');
        }
    }
}

function toggleContributorDetails(id, btn) {
    const details = document.getElementById(`contributor-details-${id}`);
    if (details) {
        const isHidden = details.classList.contains('hidden');
        
        // Find and collapse all other contributor details
        document.querySelectorAll('[id^="contributor-details-"]').forEach(el => {
            if (el.id !== `contributor-details-${id}`) {
                el.classList.add('hidden');
            }
        });
        
        // Reset all other contributor toggle buttons to 'View Skills'
        document.querySelectorAll('[onclick^="toggleContributorDetails"]').forEach(el => {
            if (el !== btn) {
                const span = el.querySelector('span');
                if (span) span.innerText = 'View Skills';
                const icon = el.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-chevron-down text-[10px]';
            }
        });

        // Toggle the clicked one
        if (isHidden) {
            details.classList.remove('hidden');
            btn.querySelector('span').innerText = 'Hide Skills';
            btn.querySelector('i').className = 'fa-solid fa-chevron-up text-[10px]';
        } else {
            details.classList.add('hidden');
            btn.querySelector('span').innerText = 'View Skills';
            btn.querySelector('i').className = 'fa-solid fa-chevron-down text-[10px]';
        }
    }
}

// Custom Delete Confirmation and Captcha Verification
function openDeleteModal(type, id) {
    deleteTargetType = type;
    deleteTargetId = id;
    
    const input = document.getElementById('delete-captcha-input');
    if (input) input.value = '';
    
    const btn = document.getElementById('btn-confirm-delete');
    if (btn) {
        btn.disabled = true;
        btn.className = "px-5 py-2.5 bg-rose-950/40 text-rose-500/50 font-bold text-sm rounded-xl cursor-not-allowed transition-all duration-200";
    }
    
    generateDeleteCaptcha();
    
    const modal = document.getElementById('modal-delete');
    if (modal) modal.classList.remove('hidden');
}

function closeDeleteModal() {
    deleteTargetType = null;
    deleteTargetId = null;
    currentDeleteCaptcha = '';
    
    const modal = document.getElementById('modal-delete');
    if (modal) modal.classList.add('hidden');
}

function generateDeleteCaptcha() {
    const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed ambiguous characters
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    currentDeleteCaptcha = code;
    
    const display = document.getElementById('delete-captcha-display');
    if (display) display.innerText = code;
}

function checkDeleteCaptcha() {
    const input = document.getElementById('delete-captcha-input');
    const btn = document.getElementById('btn-confirm-delete');
    if (input && btn) {
        if (input.value.trim() === currentDeleteCaptcha) {
            btn.disabled = false;
            btn.className = "px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/20 transition-all duration-200 cursor-pointer";
        } else {
            btn.disabled = true;
            btn.className = "px-5 py-2.5 bg-rose-955/40 text-rose-500/50 font-bold text-sm rounded-xl cursor-not-allowed transition-all duration-200";
        }
    }
}

async function executeDelete() {
    const type = deleteTargetType;
    const id = deleteTargetId;
    if (!type || !id) return;

    let url = '';
    let successMessage = '';
    let refreshCallback = null;

    if (type === 'project') {
        url = `${API_BASE}/projects/${id}/`;
        successMessage = "Project deleted successfully";
        refreshCallback = () => {
            initApp();
        };
    } else if (type === 'task') {
        url = `${API_BASE}/tasks/${id}/`;
        successMessage = "Task deleted";
        refreshCallback = () => {
            initApp();
            if (currentTab === 'tasks') fetchTasks();
        };
    } else if (type === 'contributor') {
        url = `${API_BASE}/contributors/${id}/`;
        successMessage = "Contributor removed";
        refreshCallback = () => {
            initApp();
            if (currentTab === 'contributors') fetchContributors();
        };
    } else if (type === 'admin') {
        url = `${API_BASE}/admins/${id}/`;
        successMessage = "Account deleted successfully";
        refreshCallback = () => {
            handleLogout();
        };
    }

    try {
        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
            showNotification(successMessage);
            closeDeleteModal();
            if (refreshCallback) refreshCallback();
        } else {
            showNotification(`Failed to delete ${type}`, "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
    }
}

// ------------------ ADMIN MANAGEMENT ------------------
async function fetchAdmins() {
    const tbody = document.getElementById('admins-list-tbody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE}/admins/`);
        if (!res.ok) return;
        const data = await res.json();
        
        tbody.innerHTML = '';
        data.forEach(admin => {
            const isSelf = admin.id === currentUser.id;
            const actionHtml = isSelf
                ? `<button onclick="deleteAdmin(${admin.id})" class="text-rose-500 hover:text-rose-400 font-bold transition-colors duration-150 flex items-center gap-1 ml-auto cursor-pointer"><i class="fa-regular fa-trash-can"></i>Delete Account</button>`
                : `<span class="text-slate-500 italic text-[10px] flex items-center gap-1 justify-end"><i class="fa-solid fa-lock text-[9px]"></i>Locked</span>`;

            const row = document.createElement('tr');
            row.className = "border-b border-slate-800/40 hover:bg-slate-900/10 transition-colors duration-150";
            row.innerHTML = `
                <td class="py-3 font-semibold text-slate-200">${admin.username} ${isSelf ? '<span class="ml-1.5 text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">You</span>' : ''}</td>
                <td class="py-3 text-slate-400">${admin.email}</td>
                <td class="py-3 text-right">${actionHtml}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) {
        console.error("Failed to fetch admins:", err);
    }
}

async function saveAdminUser(e) {
    e.preventDefault();
    const username = document.getElementById('admin-user-username').value;
    const email = document.getElementById('admin-user-email').value;
    const password = document.getElementById('admin-user-password').value;
    const rePassword = document.getElementById('admin-user-re-password').value;

    if (password !== rePassword) {
        showNotification("Passwords do not match.", "error");
        return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
        showNotification(pwError, "error");
        return;
    }

    const payload = { username, email, password, re_password: rePassword };

    try {
        const res = await fetch(`${API_BASE}/admins/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showNotification("Administrator account created successfully!");
            closeModal('admin-user');
            fetchAdmins();
        } else {
            const err = await res.json();
            showNotification(err.detail || "Failed to create administrator account.", "error");
        }
    } catch (err) {
        showNotification("Network error occurred.", "error");
    }
}

function deleteAdmin(id) {
    openDeleteModal('admin', id);
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

function checkSettingsRequirements() {
    const password = document.getElementById('settings-password').value;
    const isStaff = currentUser.user_type === 'staff';
    let isUsernameChanged = false;
    
    if (!isStaff) {
        const currentUsername = currentUser.username || '';
        const newUsername = document.getElementById('settings-username').value;
        if (newUsername !== currentUsername) {
            isUsernameChanged = true;
        }
    }
    
    const star = document.getElementById('current-pwd-req-star');
    if (star) {
        if (password || isUsernameChanged) {
            star.classList.remove('hidden');
        } else {
            star.classList.add('hidden');
        }
    }
}
