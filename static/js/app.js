const API_BASE = '/api';

let currentTab = 'projects';

let projectsPage = 1;
let tasksPage = 1;
let contributorsPage = 1;

// Cache list of all projects and contributors for selector lists
let allProjectsRaw = [];
let allContributorsRaw = [];

// Application Start
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Load statistics and datasets
    await Promise.all([
        fetchSidebarStats(),
        fetchProjects(),
        fetchContributorsListOnly() // For selector lists
    ]);
}

// Switch Active Tab
function switchTab(tabId) {
    currentTab = tabId;
    
    // Toggle visibility
    ['projects', 'tasks', 'contributors'].forEach(t => {
        const content = document.getElementById(`content-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        
        if (t === tabId) {
            content.classList.remove('hidden');
            btn.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
            btn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
        } else {
            content.classList.add('hidden');
            btn.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
            btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800/50');
        }
    });

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

// Fetch Stats Sidebar
async function fetchSidebarStats() {
    try {
        const projRes = await fetch(`${API_BASE}/projects/`);
        const projData = await projRes.json();
        document.getElementById('stat-projects').innerText = projData.count || 0;

        const taskRes = await fetch(`${API_BASE}/tasks/`);
        const taskData = await taskRes.json();
        document.getElementById('stat-tasks').innerText = taskData.count || 0;

        const overdueRes = await fetch(`${API_BASE}/tasks/?overdue=true`);
        const overdueData = await overdueRes.json();
        document.getElementById('stat-overdue').innerText = overdueData.count || 0;
    } catch (err) {
        console.error("Error loading stats:", err);
    }
}

// Fetch Selector lists without paging for dropdowns
async function fetchContributorsListOnly() {
    try {
        const res = await fetch(`${API_BASE}/contributors/?page_size=100`);
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
        const res = await fetch(`${API_BASE}/projects/?page_size=100`);
        const data = await res.json();
        allProjectsRaw = data.results || [];
    } catch (err) {
        console.error(err);
    }
}

function populateTaskFormDropdowns() {
    // Projects
    const projSelect = document.getElementById('task-project');
    if (projSelect) {
        projSelect.innerHTML = '<option value="">Select Project...</option>';
        allProjectsRaw.forEach(p => {
            projSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
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

// ------------------ PROJECTS CRUD ------------------
async function fetchProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    grid.innerHTML = getSkeletonHTML(4);
    
    const statusFilter = document.getElementById('filter-project-status').value;
    let url = `${API_BASE}/projects/?page=${projectsPage}`;
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

            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition-all duration-300 flex flex-col justify-between";
            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${badgeClass}">
                            ${proj.status}
                        </span>
                        <div class="flex items-center space-x-2">
                            <button onclick="editProject(${proj.id})" class="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button onclick="deleteProject(${proj.id})" class="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </div>
                    <h3 class="text-lg font-bold text-white mb-2 line-clamp-1">${proj.name}</h3>
                    <p class="text-sm text-slate-400 mb-6 line-clamp-2 h-10">${proj.description}</p>
                </div>
                
                <div class="space-y-4 pt-4 border-t border-slate-800/60">
                    <div class="flex items-center justify-between text-xs font-medium text-slate-400">
                        <span class="inline-flex items-center"><i class="fa-solid fa-location-dot mr-1.5 text-slate-500"></i>${proj.location}</span>
                        <span>${completed}/${total} Tasks (${percent}%)</span>
                    </div>
                    <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div class="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                    </div>
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
        status: document.getElementById('project-status').value
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
            showNotification(JSON.stringify(errData), "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
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

        document.getElementById('modal-project-title').innerText = "Edit Project";
        openModal('project');
    } catch (err) {
        showNotification("Could not fetch project details", "error");
    }
}

async function deleteProject(id) {
    if (!confirm("Are you sure you want to delete this project? All associated tasks will be removed.")) return;
    try {
        const res = await fetch(`${API_BASE}/projects/${id}/`, { method: 'DELETE' });
        if (res.ok) {
            showNotification("Project deleted successfully");
            initApp();
        } else {
            showNotification("Failed to delete project", "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
    }
}

// ------------------ TASKS CRUD ------------------
async function fetchTasks() {
    const tbody = document.getElementById('tasks-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-500">${getSpinner()}</td></tr>`;
    
    const assigneeFilter = document.getElementById('filter-task-contributor').value;
    const overdueFilter = document.getElementById('filter-task-overdue').value;

    let url = `${API_BASE}/tasks/?page=${tasksPage}`;
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

            const row = document.createElement('tr');
            row.className = "hover:bg-slate-900/30 transition-colors duration-150";
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick="toggleTaskCompletion(${task.id}, ${task.is_completed})" class="focus:outline-none transition-transform active:scale-90">
                        ${statusIcon}
                    </button>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-semibold text-white flex items-center">${task.title} ${overdueBadge}</div>
                    <div class="text-xs text-slate-400 mt-0.5 line-clamp-1">${task.description}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300 font-medium">
                    ${task.project_name}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    ${task.assigned_to_name ? `<span class="text-slate-300 font-medium"><i class="fa-regular fa-user mr-1.5 text-slate-500"></i>${task.assigned_to_name}</span>` : '<span class="italic text-slate-600">Unassigned</span>'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${task.is_overdue ? 'text-rose-400 font-bold' : 'text-slate-400'}">
                    <i class="fa-regular fa-calendar mr-1.5 text-slate-500"></i>${task.due_date}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium pr-6">
                    <div class="flex items-center justify-end space-x-1.5">
                        <button onclick="editTask(${task.id})" class="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button onclick="deleteTask(${task.id})" class="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-trash-can"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        renderPagination('tasks', data, tasksPage);
    } catch (err) {
        console.error(err);
        showNotification("Failed to load tasks", "error");
    }
}

async function saveTask(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const payload = {
        project: document.getElementById('task-project').value,
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        due_date: document.getElementById('task-due-date').value,
        assigned_to: document.getElementById('task-assignee').value || null,
        is_completed: document.getElementById('task-is-completed').checked
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_BASE}/tasks/${id}/` : `${API_BASE}/tasks/`;

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showNotification(id ? "Task updated successfully!" : "Task created successfully!");
            closeModal('task');
            initApp();
            if (currentTab === 'tasks') fetchTasks();
        } else {
            const errData = await res.json();
            showNotification(JSON.stringify(errData), "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
    }
}

async function editTask(id) {
    try {
        await Promise.all([fetchProjectsListOnly(), fetchContributorsListOnly()]);
        populateTaskFormDropdowns();

        const res = await fetch(`${API_BASE}/tasks/${id}/`);
        const task = await res.json();
        
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-project').value = task.project;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-description').value = task.description;
        document.getElementById('task-due-date').value = task.due_date;
        document.getElementById('task-assignee').value = task.assigned_to || '';
        document.getElementById('task-is-completed').checked = task.is_completed;

        document.getElementById('modal-task-title').innerText = "Edit Task";
        openModal('task');
    } catch (err) {
        showNotification("Could not fetch task details", "error");
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

async function deleteTask(id) {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
        const res = await fetch(`${API_BASE}/tasks/${id}/`, { method: 'DELETE' });
        if (res.ok) {
            showNotification("Task deleted");
            initApp();
            if (currentTab === 'tasks') fetchTasks();
        } else {
            showNotification("Failed to delete task", "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
    }
}

// ------------------ CONTRIBUTORS CRUD ------------------
async function fetchContributors() {
    const grid = document.getElementById('contributors-grid');
    if (!grid) return;
    grid.innerHTML = getSkeletonHTML(3);

    try {
        const res = await fetch(`${API_BASE}/contributors/?page=${contributorsPage}`);
        const data = await res.json();
        
        grid.innerHTML = '';
        if (!data.results || data.results.length === 0) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl"><i class="fa-solid fa-user-tag text-3xl mb-3 block"></i>No contributors registered yet.</div>`;
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
                            <button onclick="deleteContributor(${cont.id})" class="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-800 rounded-lg transition-all duration-150"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </div>
                    <h3 class="text-base font-bold text-white">${cont.name}</h3>
                    <p class="text-xs text-slate-400 mt-1">${cont.email}</p>
                    
                    <div class="mt-4">
                        <span class="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Expertise / Skills</span>
                        <div class="flex flex-wrap gap-1.5">${skillBadges}</div>
                    </div>
                </div>
                <div class="pt-4 border-t border-slate-800/60 mt-6 text-[10px] text-slate-500">
                    Joined on ${new Date(cont.joined_on).toLocaleDateString()}
                </div>
            `;
            grid.appendChild(card);
        });

        renderPagination('contributors', data, contributorsPage);
    } catch (err) {
        console.error(err);
        showNotification("Failed to load contributors", "error");
    }
}

async function saveContributor(e) {
    e.preventDefault();
    const id = document.getElementById('contributor-id').value;
    const payload = {
        name: document.getElementById('contributor-name').value,
        email: document.getElementById('contributor-email').value,
        skills: document.getElementById('contributor-skills').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_BASE}/contributors/${id}/` : `${API_BASE}/contributors/`;

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showNotification(id ? "Contributor updated successfully!" : "Contributor added successfully!");
            closeModal('contributor');
            initApp();
            if (currentTab === 'contributors') fetchContributors();
        } else {
            const errData = await res.json();
            showNotification(JSON.stringify(errData), "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
    }
}

async function editContributor(id) {
    try {
        const res = await fetch(`${API_BASE}/contributors/${id}/`);
        const cont = await res.json();
        
        document.getElementById('contributor-id').value = cont.id;
        document.getElementById('contributor-name').value = cont.name;
        document.getElementById('contributor-email').value = cont.email;
        document.getElementById('contributor-skills').value = cont.skills;

        document.getElementById('modal-contributor-title').innerText = "Edit Contributor";
        openModal('contributor');
    } catch (err) {
        showNotification("Could not fetch contributor details", "error");
    }
}

async function deleteContributor(id) {
    if (!confirm("Are you sure you want to remove this contributor? Tasks assigned to this contributor will be unassigned.")) return;
    try {
        const res = await fetch(`${API_BASE}/contributors/${id}/`, { method: 'DELETE' });
        if (res.ok) {
            showNotification("Contributor removed");
            initApp();
            if (currentTab === 'contributors') fetchContributors();
        } else {
            showNotification("Failed to remove contributor", "error");
        }
    } catch (err) {
        showNotification("Network error occurred", "error");
    }
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
async function openModal(type) {
    if (type === 'task') {
        await Promise.all([fetchProjectsListOnly(), fetchContributorsListOnly()]);
        populateTaskFormDropdowns();
    }
    
    const modal = document.getElementById(`modal-${type}`);
    if (modal) modal.classList.remove('hidden');
}

function closeModal(type) {
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
        if (title) title.innerText = "Add Contributor";
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
