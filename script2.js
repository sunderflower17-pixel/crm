// ── STATE ──
const DB_KEY = 'nexaflow_v1';
const APP_LOGO = "favicon.png";

function sendTelegramNotification(message) {
  const { supaUrl, supaKey } = state.settings;
  fetch(`${supaUrl}/functions/v1/telegram-notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + supaKey
    },
    body: JSON.stringify({ message })
  }).catch(e => console.log('Telegram error:', e));
}


let state = {
  user: null,
  leads: [],
  tasks: [],
  calls: [],
  contacts: [],
  sales: [],
  settings: { supaUrl: 'https://fkawawrnhkmbztfnnils.supabase.co', supaKey: '', logo: '' }
};

// ── PERSIST ──
function save() {
  if (!Array.isArray(state.sales)) state.sales = [];
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}
function load() {
  const d = localStorage.getItem(DB_KEY);
  if (d) {
    try {
      const parsed = JSON.parse(d);
      state = { ...state, ...parsed };
    } catch(e) {}
  }
  if (!Array.isArray(state.sales)) state.sales = [];
  if (!Array.isArray(state.leads)) state.leads = [];
  if (!Array.isArray(state.contacts)) state.contacts = [];
  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (!Array.isArray(state.calls)) state.calls = [];
}

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
  load();
  applyTheme();
  if (APP_LOGO) {
    document.getElementById('login-logo-img').src = APP_LOGO;
    document.getElementById('login-logo-img').style.display = '';
    document.getElementById('login-logo-icon').style.display = 'none';
  }
  if (!state.user || !state.user.token) { showLogin(); return; }
  initApp();
  const lastPage = localStorage.getItem('nexaflow_page');
  if (lastPage) {
    const btn = document.querySelector(`.nav-item[onclick*="'${lastPage}'"]`);
    showPage(lastPage, btn);
  }
});

function showLogin() {
  document.getElementById('login-screen').classList.add('show');
  if (APP_LOGO) {
    document.getElementById('login-logo-img').src = APP_LOGO;
    document.getElementById('login-logo-img').style.display = '';
    document.getElementById('login-logo-icon').style.display = 'none';
  }
}

function initApp() {
  document.getElementById('login-screen').classList.remove('show');
  document.getElementById('app-loader').style.display = 'flex';
  state.settings.supaUrl = 'https://fkawawrnhkmbztfnnils.supabase.co';
  state.settings.supaKey = 'eyJhbG...';   // your key
  state.settings.logo = APP_LOGO;

  document.querySelector('link[rel="icon"]').href = APP_LOGO;
  updateDbStatus(true);
  save();

  document.getElementById('task-date').value = todayISO();
  document.getElementById('task-date').min = todayISO();
  document.querySelectorAll('input[name="lead-status"]').forEach(r => {
    r.addEventListener('change', onStatusChange);
    r.closest('label').addEventListener('click', () => {
      document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
      r.closest('label').classList.add('selected');
    });
  });

  applyLogo(true);
  updateSidebarUser();
  loadProfileUI();

  document.getElementById('lead-phone').addEventListener('blur', async function() {
    const editId = document.getElementById('lead-edit-id').value;
    const match = await checkDuplicatePhone(this.value, editId || null);
    if (match) showDuplicateWarning(match);
    else { const w = document.getElementById('duplicate-warning'); if(w) w.remove(); }
  });
  document.getElementById('lead-phone').addEventListener('input', function() {
    const w = document.getElementById('duplicate-warning'); if(w) w.remove();
  });

  // ✅ FIX: fetch first, then start realtime — no more race
  fetchAllFromSupabase().then(() => {
    renderHome();
    renderLeads();
    renderLeadsStats();
    renderSuspended();
    renderContacts();
    renderSales();
    loadProfileUI();
    updateSidebarUser();

    const lastPage = localStorage.getItem('nexaflow_page');
    if (lastPage) {
      const btn = document.querySelector(`.nav-item[onclick*="'${lastPage}'"]`);
      showPage(lastPage, btn);
    }

    document.getElementById('app-loader').style.display = 'none';

    // ✅ startAutoRefresh AFTER data is loaded and loader is hidden
    startAutoRefresh();
  });
}

function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const err = document.getElementById('login-err');
  const btn = document.getElementById('login-btn');
  err.textContent = '';
  if (!email || !pass) { err.textContent = 'Please fill all fields.'; return; }

  const supaUrl = 'https://fkawawrnhkmbztfnnils.supabase.co';
  const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrYXdhd3JuaGttYnp0Zm5uaWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczODA4MjEsImV4cCI6MjA5Mjk1NjgyMX0.FGhl-zknybhdfObsQaBmqiwrDRlFdDL4q-tOiuBOOeo';

  btn.classList.add('loading');
  btn.querySelector('span').innerHTML = '<span style="display:inline-flex;gap:5px;align-items:center"><span style="width:6px;height:6px;background:#fff;border-radius:50%;display:inline-block;animation:dotBounce .6s ease infinite"></span><span style="width:6px;height:6px;background:#fff;border-radius:50%;display:inline-block;animation:dotBounce .6s ease .15s infinite"></span><span style="width:6px;height:6px;background:#fff;border-radius:50%;display:inline-block;animation:dotBounce .6s ease .3s infinite"></span></span>';

  fetch(`${supaUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': supaKey },
    body: JSON.stringify({ email, password: pass })
  })
  .then(r => r.json())
  .then(async data => {
    if (data.error || !data.access_token) {
      btn.classList.remove('loading');
      btn.querySelector('span').innerHTML = 'Sign In';
      err.textContent = 'Invalid email or password.';
      return;
    }
    state.user = { email, name: email.split('@')[0], token: data.access_token, refresh_token: data.refresh_token };
    save();
    try {
      const profileRes = await fetch(`${supaUrl}/rest/v1/profiles?user_email=eq.${encodeURIComponent(email)}&limit=1`, {
        headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + data.access_token }
      });
      const rows = await profileRes.json();
      if (Array.isArray(rows) && rows.length > 0) {
        if (rows[0].display_name) state.user.name = rows[0].display_name;
        if (rows[0].profile_img) state.user.profileImg = rows[0].profile_img;
        save();
      }
    } catch(e) { console.log('Profile fetch error:', e); }
    btn.classList.remove('loading');
    btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
    btn.querySelector('span').textContent = '✓ Welcome back!';
    setTimeout(() => initApp(), 800);
  })
  .catch(() => {
    btn.classList.remove('loading');
    err.textContent = 'Connection error. Try again.';
  });
}

function doLogout() {
  state.user = null;
  state.leads = [];
  state.tasks = [];
  state.calls = [];
  state.contacts = [];
  state.sales = [];
  save();
  location.reload();
}

function updateSidebarUser() {
  if (!state.user) return;
  document.getElementById('sidebar-uname').textContent = state.user.name || 'User';
  const img = state.user.profileImg || '';
  updateSidebarAvatar(img);
  document.getElementById('settings-email').textContent = state.user.email || '';
}

// ── NAVIGATION ──
function showPage(id, btn) {
  localStorage.setItem('nexaflow_page', id);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const titles = { home:'Home', leads:'Leads', suspended:'Suspended Leads', dashboard:'Dashboard', contacts:'Contacts', settings:'Settings', action:'Action Required ⚡', funnel:'Conversion Funnel' };
  document.getElementById('page-title').textContent = titles[id] || id;
  if (id === 'home') renderHome();
  if (id === 'dashboard') {
    window.open('https://dashboard.nexaflow.bar/', 'nexaflow_dashboard');
    const lastPage = localStorage.getItem('nexaflow_page') || 'home';
    const prevPage = lastPage === 'dashboard' ? 'home' : lastPage;
    const btn = document.querySelector(`.nav-item[onclick*="'${prevPage}'"]`);
    showPage(prevPage, btn);
    return;
  } else {
    const inner = document.getElementById('dashboard-inner');
    if (inner) inner.style.display = 'none';
  }
  if (id === 'leads') { renderLeads(); renderLeadsStats(); }
  if (id === 'suspended') renderSuspended();
  if (id === 'action') renderActionPage();
  if (id === 'funnel') renderFunnelPage();
  if (id === 'contacts') renderContacts();
  if (id === 'sales') renderSales();
  if (id === 'settings') loadProfileUI();
  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen = sidebar.classList.toggle('open');
  if (isOpen) {
    overlay.style.display = 'block';
    setTimeout(() => overlay.classList.add('show'), 10);
  } else {
    overlay.classList.remove('show');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  const overlay = document.getElementById('sidebar-overlay');
  overlay.classList.remove('show');
  overlay.style.display = 'none';
}

// ── SUPABASE SYNC ──
async function fetchAllFromSupabase() {
  const { supaUrl, supaKey } = state.settings;
  if (!supaKey) return;

  const headers = {
    'apikey': supaKey,
    'Authorization': 'Bearer ' + supaKey
  };

  try {
    const leadsRes = await fetch(`${supaUrl}/rest/v1/leads?order=created_at.desc`, { headers });
    if (leadsRes.ok) {
      const rows = await leadsRes.json();
      state.leads = rows.map(r => ({
        id: r.id, name: r.name, city: r.city, phone: r.phone, wapp: r.wapp,
        website: r.website, report: r.report, gbpRank: r.gbp_rank, gbpUrl: r.gbp_url,
        reviews: r.reviews, note: r.note, status: r.status, saleAmount: r.sale_amount,
        convertedAt: r.converted_at, followupDate: r.followup_date || '',
        timing: r.timing || '',
       followupNote: r.followup_note || '', followupTime: r.followup_time || '',
      followupType: r.followup_type || '', followupAmount: r.followup_amount || 0,
      createdAt: r.created_at, statusChangedAt: r.status_changed_at || r.created_at,
        userEmail: r.user_email, timing: r.timing || ''
      }));
    }

    const salesRes = await fetch(`${supaUrl}/rest/v1/sales?order=created_at.desc&limit=1000`, { headers });
    if (salesRes.ok) {
      const salesRows = await salesRes.json();
      if (Array.isArray(salesRows) && salesRows.length > 0) {
        state.sales = salesRows.map(r => ({
          id: r.id, lead_id: r.lead_id, lead_name: r.lead_name,
          amount: Number(r.amount) || 0, transaction_id: r.transaction_id || '',
          date: r.date, note: r.note || '', created_at: r.created_at, user_email: r.user_email
        }));
      } else {
        state.sales = [];
      }
    } else {
      console.error('Sales fetch failed:', salesRes.status, await salesRes.text());
    }

    const contactsRes = await fetch(`${supaUrl}/rest/v1/contacts?order=created_at.desc`, { headers });
    if (contactsRes.ok) {
      const contactRows = await contactsRes.json();
      if (Array.isArray(contactRows)) {
        state.contacts = contactRows.map(r => ({
          id: r.id, name: r.name, phone: r.phone || '', city: r.city || '',
          wapp: r.wapp || '', note: r.note || '', createdAt: r.created_at, userEmail: r.user_email
        }));
      }
    }

    const tasksRes = await fetch(`${supaUrl}/rest/v1/tasks?order=created_at.asc`, { headers });
    if (tasksRes.ok) {
      const taskRows = await tasksRes.json();
      if (Array.isArray(taskRows)) {
        state.tasks = taskRows.map(r => ({
          id: r.id, title: r.title, date: r.date, priority: r.priority || 'normal',
          note: r.note || '', done: r.done || false, createdAt: r.created_at
        }));
      }
    }

    const callsRes = await fetch(`${supaUrl}/rest/v1/calls?order=date.asc`, { headers });
    if (callsRes.ok) {
      const callRows = await callsRes.json();
      if (Array.isArray(callRows)) {
        state.calls = callRows.map(r => ({
          id: r.id, name: r.name, phone: r.phone || '', time: r.time || '',
          note: r.note || '', date: r.date, done: r.done || false,
          createdAt: r.created_at, reminder_mins: r.reminder_mins || null
        }));
      }
    }

    const profileRes = await fetch(`${supaUrl}/rest/v1/profiles?user_email=eq.${encodeURIComponent(state.user?.email || '')}&limit=1`, { headers });
    if (profileRes.ok) {
      const profileRows = await profileRes.json();
      if (Array.isArray(profileRows) && profileRows.length > 0) {
        const p = profileRows[0];
        if (state.user) {
          if (p.display_name) state.user.name = p.display_name;
          if (p.profile_img) state.user.profileImg = p.profile_img;
          save();
        }
      }
    }

    save();
    updateActionBadge(state.leads.filter(l => l.status !== 'suspended' && l.status !== 'converted' && getAgingDays(l) >= 5).length);
    updateDbStatus(true);
  } catch(e) {
    console.error('Supabase fetch error:', e);
    updateDbStatus(false);
  }
}

// ── HOME ──
let homeViewDate = todayISO();
let callsViewDate = todayISO();

function changeHomeDate(dir) {
  const parts = homeViewDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + dir);
  homeViewDate = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const today = todayISO();
  const label = homeViewDate === today ? 'Today' : d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  document.getElementById('home-date-label').textContent = label;
  renderHome();
}

function changeCallsDate(dir) {
  const parts = callsViewDate.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + dir);
  callsViewDate = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const today = todayISO();
  const label = callsViewDate === today ? 'Today' : d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  document.getElementById('calls-date-label').textContent = label;
  renderHome();
}

function renderHome() {
  const activeLeads = state.leads.filter(l => l.status !== 'suspended');
  const now = new Date();
  const allSales = Array.isArray(state.sales) ? state.sales : [];

  const monthSales = allSales.filter(x => {
    const d = new Date(x.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthTotal = monthSales.reduce((s, x) => s + (x.amount || 0), 0);

  const qLabels = { 1:'Q1 (Jan–Mar)', 2:'Q2 (Apr–Jun)', 3:'Q3 (Jul–Sep)', 4:'Q4 (Oct–Dec)' };
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const qSales = allSales.filter(x => {
    const m = new Date(x.date).getMonth();
    const q = Math.ceil((m + 1) / 3);
    return q === currentQ && new Date(x.date).getFullYear() === now.getFullYear();
  });
  const qTotal = qSales.reduce((s, x) => s + (x.amount || 0), 0);

  document.getElementById('stat-total').textContent = '₹' + fmtNum(qTotal);
  document.getElementById('stat-quarter-label').textContent = qLabels[currentQ] + ' Sales';
  document.getElementById('stat-quarter-sub').textContent = qSales.length + ' deal' + (qSales.length !== 1 ? 's' : '') + ' this quarter';
  document.getElementById('stat-month').textContent = '₹' + fmtNum(monthTotal);
  document.getElementById('stat-month-sub').textContent = monthSales.length + ' deal' + (monthSales.length !== 1 ? 's' : '');
  document.getElementById('stat-leads').textContent = activeLeads.length;

  const today = homeViewDate;
  const todayTasks = state.tasks.filter(t => !t.date || t.date === today);
  const tb = document.getElementById('today-tasks');
  if (!todayTasks.length) {
    tb.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg><p>No tasks for today</p></div>`;
  } else {
    tb.innerHTML = todayTasks.map(t => `
      <div class="task-card ${t.done ? 'done' : ''}">
        <div class="task-card-top">
          <div class="task-title">${esc(t.title)}</div>
          <button class="check-btn ${t.done ? 'checked' : ''}" onclick="toggleTask('${t.id}')">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg>
          </button>
        </div>
        ${t.note ? `<div class="task-meta">${esc(t.note)}</div>` : ''}
        <div class="task-meta" style="margin-top:6px;display:flex;align-items:center;justify-content:space-between">
          <span class="badge badge-${t.priority === 'high' ? 'red' : t.priority === 'low' ? 'gray' : 'blue'}">${t.priority || 'normal'}</span>
          <button onclick="deleteTask('${t.id}')" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:0;display:flex;align-items:center" title="Delete task">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px;height:12px;stroke-width:2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>`).join('');
  }

  const todayCalls = state.calls.filter(c => c.date === callsViewDate).sort((a, b) => a.time > b.time ? 1 : -1);
  const cl = document.getElementById('calls-list');
  if (!todayCalls.length) {
    cl.innerHTML = `<div class="empty-state"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6z"/></svg><p>No calls scheduled today</p></div>`;
  } else {
    cl.innerHTML = todayCalls.map(c => `
      <div class="call-item" style="${c.done ? 'opacity:0.5' : ''}">
        <button class="check-btn ${c.done ? 'checked' : ''}" onclick="toggleCall('${c.id}')" style="flex-shrink:0">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg>
        </button>
        <div class="call-time" style="${c.done ? 'text-decoration:line-through' : ''}">${c.time || '—'}</div>
        <div class="call-info">
          <div class="call-name" style="${c.done ? 'text-decoration:line-through' : ''}">${esc(c.name)}</div>
          <div class="call-note">${c.phone ? esc(c.phone) : ''}${c.note ? ' · ' + esc(c.note) : ''}</div>
        </div>
        <button class="icon-btn" onclick="deleteCall('${c.id}')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>`).join('');
  }

  renderLeadsPie();
  updateFollowupBell();
  renderFollowupHomeSection();
}

// ── LEADS ──
let leadsFilter = 'all';
let leadsPage = 1;
const LEADS_PER_PAGE = 10;

function renderLeads() {
  renderLeadsStats();
  const statuses = ['all','not_escalated','outreach_wapp','outreach_call','prospecting','payment','followup','converted'];
  const statusLabels = { all:'All', not_escalated:'Not Escalated', outreach_wapp:'Wapp', outreach_call:'Call', prospecting:'Unresponsive', payment:'Payment', followup:'Follow-up', converted:'Converted' };
  const filterEl = document.getElementById('leads-filter');
  filterEl.innerHTML = statuses.map(s => `<button class="filter-btn ${leadsFilter === s ? 'active' : ''}" onclick="setLeadsFilter('${s}')">${statusLabels[s]}</button>`).join('');

  const filtered = state.leads.filter(l => l.status !== 'suspended' && (leadsFilter === 'all' || l.status === leadsFilter));
  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PER_PAGE));
  if (leadsPage > totalPages) leadsPage = totalPages;

  const start = (leadsPage - 1) * LEADS_PER_PAGE;
  const paginated = filtered.slice(start, start + LEADS_PER_PAGE);
  const tb = document.getElementById('leads-tbody');

  if (!filtered.length) {
    tb.innerHTML = `<tr><td colspan="9"><div class="empty-state"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg><p>No leads found</p></div></td></tr>`;
    renderLeadsPagination(0, 1);
    return;
  }

  const webIcons = { yes: '✅', no: '❌', not_working: '⚠️' };

  tb.innerHTML = paginated.map(l => `
    <tr oncontextmenu="openStatusMenu(event,'${l.id}')" style="cursor:context-menu;${getAgingDays(l) >= 5 && l.status !== 'converted' ? 'background:rgba(245,158,11,0.06);outline:1px solid rgba(245,158,11,0.25);' : ''}">
      <td class="td-name">
<div>
          ${getAgingDays(l) >= 5 && l.status !== 'converted' ? `<span title="${getAgingDays(l)} days in this status" style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:rgba(245,158,11,0.12);color:#f59e0b;white-space:nowrap;flex-shrink:0">⏳ ${getAgingDays(l)}d</span>` : ''}
          ${l.note ? `<span style="position:relative;display:inline-flex;align-items:center;gap:6px">
            <span class="note-icon-wrap" style="position:relative;display:inline-flex">
              <svg fill="none" stroke="var(--accent)" viewBox="0 0 24 24" style="width:13px;height:13px;flex-shrink:0;cursor:pointer" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text2);white-space:pre-wrap;max-width:220px;min-width:120px;box-shadow:var(--shadow);z-index:999;line-height:1.5;font-weight:400" class="note-tooltip">${esc(l.note)}</span>
            </span>
            ${esc(l.name)}
          </span>` : esc(l.name)}
          ${l.timing ? `<span style="font-size:11px;color:var(--accent);font-weight:7
            00;padding:2px 8px;border-radius:20px">⏱ ${esc(l.timing)}</span>` : ''}
        </div>
        </div>
      </td>
      <td>
     <span class="status-pill ${statusClass(l.status)}">
  ${l.status === 'followup' ? 
    (l.followupType === 'pitching' ? '🎯 Pitching Call' :
l.followupType === 'prospect' ? '🔍 Prospect Call' :
l.followupType === 'gbp' ? '📍 GBP Report' :
l.followupType === 'nudge' ? '🔔 Nudge' :
'📅 Follow-up') 
    : statusLabel(l.status)}
</span>
        ${l.status === 'followup' && l.followupNote ? `
          <span style="position:relative;display:inline-flex;align-items:center;margin-left:5px;vertical-align:middle" class="note-icon-wrap">
            <svg fill="none" stroke="var(--accent)" viewBox="0 0 24 24" style="width:13px;height:13px;cursor:pointer;flex-shrink:0" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text2);white-space:pre-wrap;max-width:220px;min-width:120px;box-shadow:var(--shadow);z-index:999;line-height:1.5" class="note-tooltip">${esc(l.followupNote)}</span>
          </span>` : ''}
      </td>
      <td>${l.phone ? `<a href="tel:${esc(l.phone)}" style="color:var(--text2);text-decoration:none">${esc(l.phone)}</a>` : '—'}</td>
      <td>${l.city ? esc(l.city) : '—'}</td>
      <td>${webIcons[l.website] || '—'}</td>
      <td>${l.gbpRank ? esc(l.gbpRank) : '—'}</td>
      <td>${l.report === 'yes' ? '✅' : '❌'}</td>
      <td>
        <div class="row-actions">
          ${l.wapp ? `<a href="https://wa.me/${l.wapp.replace(/\D/g,'')}" target="_blank" class="icon-link wapp">${wappSVG()}</a>` : ''}
          ${l.gbpUrl ? `<a href="${l.gbpUrl}" target="_blank" rel="noopener noreferrer" class="icon-link gbp">${googleSVG()}</a>` : ''}
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" onclick="editLead('${l.id}')" title="Edit">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn" onclick="deleteLead('${l.id}')" title="Delete" style="color:var(--red)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');

  renderLeadsPagination(filtered.length, totalPages);
}

function renderLeadsPagination(total, totalPages) {
  const existing = document.getElementById('leads-pagination');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'leads-pagination';
  container.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)';

  const start = total === 0 ? 0 : (leadsPage - 1) * LEADS_PER_PAGE + 1;
  const end = Math.min(leadsPage * LEADS_PER_PAGE, total);

  container.innerHTML = `
    <div style="font-size:12px;color:var(--text3)">
      Showing <span style="color:var(--text);font-weight:600">${start}–${end}</span> of <span style="color:var(--text);font-weight:600">${total}</span> leads
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <button class="icon-btn" onclick="goLeadsPage(${leadsPage - 1})" ${leadsPage <= 1 ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span style="font-size:12px;font-weight:600;color:var(--text2)">${leadsPage} / ${totalPages}</span>
      <button class="icon-btn" onclick="goLeadsPage(${leadsPage + 1})" ${leadsPage >= totalPages ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg>
      </button>
    </div>`;

  document.querySelector('#page-leads .section').appendChild(container);
}

function goLeadsPage(page) {
  const filtered = state.leads.filter(l => l.status !== 'suspended' && (leadsFilter === 'all' || l.status === leadsFilter));
  const totalPages = Math.max(1, Math.ceil(filtered.length / LEADS_PER_PAGE));
  if (page < 1 || page > totalPages) return;
  leadsPage = page;
  renderLeads();
  document.querySelector('#page-leads').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setLeadsFilter(f) { leadsFilter = f; leadsPage = 1; renderLeads(); }

let suspendedPage = 1;
const SUSPENDED_PER_PAGE = 10;

function renderSuspended() {
  const suspended = state.leads.filter(l => l.status === 'suspended');
  const tb = document.getElementById('suspended-tbody');

  if (!suspended.length) {
    tb.innerHTML = `<tr><td colspan="5"><div class="empty-state"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg><p>No suspended leads</p></div></td></tr>`;
    renderSuspendedPagination(0, 1);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(suspended.length / SUSPENDED_PER_PAGE));
  if (suspendedPage > totalPages) suspendedPage = totalPages;

  const start = (suspendedPage - 1) * SUSPENDED_PER_PAGE;
  const paginated = suspended.slice(start, start + SUSPENDED_PER_PAGE);

 tb.innerHTML = paginated.map(l => `
    <tr style="background:rgba(239,68,68,0.04);outline:1px solid rgba(239,68,68,0.15);">
      <td class="td-name" style="color:var(--red)">${esc(l.name)}</td>
      <td>${l.phone || '—'}</td>
      <td>${l.city || '—'}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.note || '—'}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:11.5px" onclick="restoreLead('${l.id}')">Restore</button>
          <button class="icon-btn" onclick="deleteLead('${l.id}')" style="color:var(--red)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');

  renderSuspendedPagination(suspended.length, totalPages);
}

function renderSuspendedPagination(total, totalPages) {
  const existing = document.getElementById('suspended-pagination');
  if (existing) existing.remove();
  if (totalPages <= 1) return;

  const container = document.createElement('div');
  container.id = 'suspended-pagination';
  container.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)';

  const start = total === 0 ? 0 : (suspendedPage - 1) * SUSPENDED_PER_PAGE + 1;
  const end = Math.min(suspendedPage * SUSPENDED_PER_PAGE, total);

  container.innerHTML = `
    <div style="font-size:12px;color:var(--text3)">
      Showing <span style="color:var(--text);font-weight:600">${start}–${end}</span> of <span style="color:var(--text);font-weight:600">${total}</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <button class="icon-btn" onclick="goSuspendedPage(${suspendedPage - 1})" ${suspendedPage <= 1 ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <button class="icon-btn" onclick="goSuspendedPage(${suspendedPage + 1})" ${suspendedPage >= totalPages ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg>
      </button>
    </div>`;

  document.querySelector('#page-suspended .section').appendChild(container);
}

function goSuspendedPage(page) {
  const suspended = state.leads.filter(l => l.status === 'suspended');
  const totalPages = Math.max(1, Math.ceil(suspended.length / SUSPENDED_PER_PAGE));
  if (page < 1 || page > totalPages) return;
  suspendedPage = page;
  renderSuspended();
}

function statusClass(s) {
  const m = { not_escalated:'s-default', outreach_wapp:'s-wapp', outreach_call:'s-call', prospecting:'s-prospecting', payment:'s-payment', followup:'s-followup', converted:'s-converted', suspended:'s-suspended' };
  return m[s] || 's-default';
}

function statusLabel(s) {
  const m = { not_escalated:'Not Escalated', outreach_wapp:'Outreach (Wapp)', outreach_call:'Outreach (Call)', prospecting:'Unresponsive', payment:'Payment', followup:'Follow-up', converted:'Converted', suspended:'Suspended' };
  return m[s] || s;
}

// ── DUPLICATE PHONE CHECK ──
async function checkDuplicatePhone(phone, excludeId = null) {
  if (!phone || phone === '+91' || phone.replace(/\D/g,'').length < 7) return null;
  const normalized = phone.replace(/\D/g,'');
  const localMatch = state.leads.find(l => l.id !== excludeId && l.phone && l.phone.replace(/\D/g,'') === normalized);
  if (localMatch) return localMatch;
  const { supaUrl, supaKey } = state.settings;
  if (!supaKey) return null;
  try {
    const res = await fetch(`${supaUrl}/rest/v1/leads?phone=eq.${encodeURIComponent(phone)}&limit=5`, { headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey } });
    if (!res.ok) return null;
    const rows = await res.json();
    const remote = rows.find(r => r.id !== excludeId && r.phone?.replace(/\D/g,'') === normalized);
    if (remote) return { id: remote.id, name: remote.name, status: remote.status, phone: remote.phone };
  } catch(e) { console.error('Duplicate check error:', e); }
  return null;
}

function showDuplicateWarning(lead) {
  const existing = document.getElementById('duplicate-warning');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'duplicate-warning';
  div.style.cssText = `display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin:12px 0 0;background:#f59e0b14;border:1px solid #f59e0b55;border-radius:10px;animation:fadeIn .2s ease;`;
  div.innerHTML = `
    <svg fill="none" stroke="#f59e0b" viewBox="0 0 24 24" style="width:18px;height:18px;flex-shrink:0;margin-top:1px;stroke-width:2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:#f59e0b;margin-bottom:3px">Duplicate phone number!</div>
      <div style="font-size:12px;color:var(--text2)">
        This number already belongs to
        <strong style="color:var(--text)">${esc(lead.name)}</strong>
        <span class="status-pill ${statusClass(lead.status)}" style="font-size:10.5px;padding:1px 7px;margin-left:4px">${statusLabel(lead.status)}</span>
      </div>
      <button onclick="closeModal('modal-lead');editLead('${lead.id}')" style="margin-top:8px;font-size:11.5px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline">Open existing lead →</button>
    </div>
    <button onclick="document.getElementById('duplicate-warning').remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:18px;line-height:1;padding:0;flex-shrink:0">×</button>
  `;
  const phoneRow = document.getElementById('lead-phone').closest('.form-row');
  phoneRow.after(div);
}

// ── LEAD CRUD ──
function openQuickModal(type) {
  if (type === 'lead') openLeadModal();
  if (type === 'task') openTaskModal();
  if (type === 'call') openCallModal();
}

function openLeadModal(id) {
  document.getElementById('lead-modal-title').textContent = id ? 'Edit Lead' : 'Create Lead';
  document.getElementById('lead-edit-id').value = id || '';
  document.getElementById('sale-amount-row').style.display = 'none';

  if (id) {
    const l = state.leads.find(x => x.id === id);
    if (!l) return;
    document.getElementById('lead-name').value = l.name || '';
    document.getElementById('lead-city').value = l.city || '';
    document.getElementById('lead-phone').value = l.phone || '';
    document.getElementById('lead-wapp').value = l.wapp || '';
    document.getElementById('lead-website').value = l.website || 'yes';
    document.getElementById('lead-report').value = l.report || 'no';
    document.getElementById('lead-gbp-rank').value = l.gbpRank || '';
    document.getElementById('lead-reviews').value = l.reviews || '';
    document.getElementById('lead-gbp-url').value = l.gbpUrl || '';
    document.getElementById('lead-note').value = l.note || '';
    document.getElementById('lead-timing').value = l.timing || '';
    document.getElementById('lead-sale').value = l.saleAmount || '';
    setLeadStatus(l.status || 'not_escalated');
    if (l.status === 'converted') document.getElementById('sale-amount-row').style.display = '';
    if (l.status === 'followup') {
      document.getElementById('followup-date-row').style.display = '';
      document.getElementById('lead-followup-date').value = l.followupDate || '';
    }
  } else {
    document.getElementById('modal-lead').querySelectorAll('input,select,textarea').forEach(el => { if (el.id !== 'lead-website' && el.id !== 'lead-report') el.value = ''; });
    document.getElementById('lead-phone').value = '+91';
    document.getElementById('lead-wapp').value = '+91';
    document.getElementById('lead-report').value = 'no';
    document.getElementById('lead-timing').value = '';
    setLeadStatus('not_escalated');
    document.getElementById('followup-date-row').style.display = 'none';
    document.getElementById('lead-followup-date').value = '';
  }
  openModal('modal-lead');
}

function setLeadStatus(val) {
  document.querySelectorAll('input[name="lead-status"]').forEach(r => {
    r.checked = r.value === val;
    const opt = r.closest('label');
    if (opt) opt.classList.toggle('selected', r.value === val);
  });
}

function onStatusChange(e) {
  const val = e.target.value;
  document.getElementById('sale-amount-row').style.display = val === 'converted' ? '' : 'none';
  document.getElementById('followup-date-row').style.display = 'none';
  if (val === 'followup') {
    const editId = document.getElementById('lead-edit-id').value;
    if (editId) {
      openFollowupQuick(editId);
    } else {
      // For new leads, just show the simple date row since lead doesn't exist yet
      document.getElementById('followup-date-row').style.display = '';
    }
  }
}

async function saveLead(createAnother = false) {
  const name = document.getElementById('lead-name').value.trim();
  if (!name) { toast('Lead name is required'); return; }
  const editId = document.getElementById('lead-edit-id').value;

  const phoneVal = document.getElementById('lead-phone').value.trim();
  const dupLead = await checkDuplicatePhone(phoneVal, editId || null);
  if (dupLead) {
    showDuplicateWarning(dupLead);
    if (!confirm(`⚠️ "${dupLead.name}" already has this phone number.\n\nSave anyway?`)) return;
  }

  const status = document.querySelector('input[name="lead-status"]:checked')?.value || 'not_escalated';
  const existingLead = state.leads.find(l => l.id === editId);
  const statusActuallyChanged = !existingLead || existingLead.status !== status;

  const lead = {
    id: editId || uid(),
    name,
    city: document.getElementById('lead-city').value.trim(),
    phone: document.getElementById('lead-phone').value.trim(),
    wapp: document.getElementById('lead-wapp').value.trim(),
    website: document.getElementById('lead-website').value,
    report: document.getElementById('lead-report').value,
    gbp_rank: document.getElementById('lead-gbp-rank').value.trim(),
    reviews: document.getElementById('lead-reviews').value.trim(),
    gbp_url: document.getElementById('lead-gbp-url').value.trim(),
    note: document.getElementById('lead-note').value.trim(),
    timing: document.getElementById('lead-timing').value.trim(),
    status,
    sale_amount: status === 'converted' ? parseFloat(document.getElementById('lead-sale').value) || 0 : 0,
    converted_at: status === 'converted' ? nowISOString() : null,
    status_changed_at: statusActuallyChanged ? nowISOString() : (existingLead?.statusChangedAt || nowISOString()),
    created_at: editId ? (state.leads.find(l=>l.id===editId)?.createdAt || nowISOString()) : nowISOString(),
    followup_date: status === 'followup' ? document.getElementById('lead-followup-date').value : null,
    followup_note: null,
    followup_time: null,
    timing: document.getElementById('lead-timing').value.trim(),
    user_email: state.user?.email || ''
  };

  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    const method = editId ? 'PATCH' : 'POST';
    const url = editId ? `${supaUrl}/rest/v1/leads?id=eq.${editId}` : `${supaUrl}/rest/v1/leads`;
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
      body: JSON.stringify(lead)
    });
  }

  const localLead = {
    id: lead.id, name: lead.name, city: lead.city, phone: lead.phone, wapp: lead.wapp,
    website: lead.website, report: lead.report, gbpRank: lead.gbp_rank, gbpUrl: lead.gbp_url,
    reviews: lead.reviews, timing: lead.timing || '', status: lead.status, saleAmount: lead.sale_amount,
    convertedAt: lead.converted_at, createdAt: lead.created_at,
    followupDate: lead.followup_date || '', followupNote: lead.followup_note || '',
    followupTime: lead.followup_time || '', userEmail: lead.user_email,
    timing: lead.timing || ''
  };

  if (editId) {
    const idx = state.leads.findIndex(l => l.id === editId);
    if (idx > -1) state.leads[idx] = localLead;
  } else {
    state.leads.push(localLead);
  }

  save();
  renderLeads();
  renderSuspended();
  renderHome();
  renderLeadsStats();

  if (createAnother) {
    document.getElementById('lead-edit-id').value = '';
    document.getElementById('lead-modal-title').textContent = 'Create Lead';
    document.getElementById('modal-lead').querySelectorAll('input,select,textarea').forEach(el => {
      if (el.id !== 'lead-website' && el.id !== 'lead-report') el.value = '';
    });
    document.getElementById('lead-website').value = 'yes';
    document.getElementById('lead-report').value = 'no';
    document.getElementById('sale-amount-row').style.display = 'none';
    document.getElementById('followup-date-row').style.display = 'none';
    document.getElementById('lead-phone').value = '+91';
    document.getElementById('lead-wapp').value = '+91';
    setLeadStatus('not_escalated');
    document.getElementById('lead-timing').value = '';
    toast('Lead saved! Form ready for next lead ✚');
    document.getElementById('lead-name').focus();
  } else {
    closeModal('modal-lead');
    toast(editId ? 'Lead updated' : 'Lead created');
  }
}

function editLead(id) { openLeadModal(id); }

async function deleteLead(id) {
  if (!confirm('Delete this lead?')) return;
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/leads?id=eq.${id}`, { method: 'DELETE', headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey } });
    } catch(e) { console.error('Lead delete error:', e); }
  }
  state.leads = state.leads.filter(l => l.id !== id);
  suspendedPage = 1;
  save(); renderLeads(); renderSuspended(); renderHome();
  toast('Lead deleted');
}

async function restoreLead(id) {
  const l = state.leads.find(x => x.id === id);
  if (!l) return;

  l.status = 'not_escalated';
  l.statusChangedAt = nowISOString();

  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/leads?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supaKey,
          'Authorization': 'Bearer ' + supaKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          status: 'not_escalated',
          status_changed_at: l.statusChangedAt
        })
      });
    } catch(e) { console.error('Restore error:', e); toast('Failed to restore lead'); return; }
  }

  suspendedPage = 1;
  save();
  renderSuspended();
  renderLeads();
  toast('Lead restored');
}

// ── TASKS ──
function openTaskModal() {
  document.getElementById('task-title').value = '';
  document.getElementById('task-date').value = todayISO();
  document.getElementById('task-priority').value = 'normal';
  document.getElementById('task-note').value = '';
  openModal('modal-task');
}

async function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { toast('Task title required'); return; }
  const task = {
    id: uid(), title,
    date: document.getElementById('task-date').value || todayISO(),
    priority: document.getElementById('task-priority').value,
    note: document.getElementById('task-note').value.trim(),
    done: false, createdAt: nowISOString()
  };
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      const taskRes = await fetch(`${supaUrl}/rest/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: task.id, title: task.title, date: task.date, priority: task.priority, note: task.note, done: false, created_at: task.createdAt, user_email: state.user?.email || '' })
      });
      if (!taskRes.ok) { const errText = await taskRes.text(); toast('Task not saved: ' + errText.slice(0, 60)); }
    } catch(e) { toast('Task save failed: ' + e.message); }
  }
  state.tasks.push(task);
  save();
  closeModal('modal-task');
  renderHome();
  toast('Task created');
}

async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  save(); renderHome();
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/tasks?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' }, body: JSON.stringify({ done: t.done }) });
    } catch(e) { console.error('Task toggle error:', e); }
  }
}

async function toggleCall(id) {
  const c = state.calls.find(x => x.id === id);
  if (!c) return;
  c.done = !c.done;
  save(); renderHome();
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/calls?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' }, body: JSON.stringify({ done: c.done }) });
    } catch(e) { console.error('Call toggle error:', e); }
  }
}

async function deleteTask(id) {
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/tasks?id=eq.${id}`, { method: 'DELETE', headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey } });
    } catch(e) { console.error('Task delete error:', e); }
  }
  state.tasks = state.tasks.filter(t => t.id !== id);
  save(); renderHome();
}

// ── CALLS ──
let calState = { year: 0, month: 0, selected: '' };

function openCallModal() {
  document.getElementById('call-name').value = '';
  document.getElementById('call-phone').value = '';

  const nameInput = document.getElementById('call-name');
  const existingDropdown = document.getElementById('call-name-dropdown');
  if (existingDropdown) existingDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.id = 'call-name-dropdown';
  dropdown.style.cssText = 'display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border2);border-radius:10px;box-shadow:0 8px 24px #00000080;z-index:9999;max-height:200px;overflow-y:auto;margin-top:4px';

let nameWrap = nameInput.parentNode;
  if (!nameWrap.id || nameWrap.id !== 'call-name-wrap') {
    const newWrap = document.createElement('div');
    newWrap.id = 'call-name-wrap';
    newWrap.style.cssText = 'position:relative';
    nameInput.parentNode.insertBefore(newWrap, nameInput);
    newWrap.appendChild(nameInput);
    nameWrap = newWrap;
  }
  nameWrap.appendChild(dropdown);

  nameInput.addEventListener('input', function() {
    const q = this.value.toLowerCase().trim();
    if (!q) { dropdown.style.display = 'none'; return; }
    const matches = state.leads.filter(l => l.status !== 'suspended' && (l.name?.toLowerCase().includes(q) || l.phone?.includes(q))).slice(0, 6);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map(l => `
      <div onclick="fillCallFromLead('${l.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(l.name)}</div>
        <div style="font-size:11.5px;color:var(--text3)">${l.phone || '—'}${l.city ? ' · ' + l.city : ''}</div>
      </div>`).join('');
    dropdown.style.display = '';
  });

  document.addEventListener('click', function closeDD(e) {
    if (!nameWrap.contains(e.target)) { dropdown.style.display = 'none'; document.removeEventListener('click', closeDD); }
  });

  document.getElementById('call-time').value = '';
  document.getElementById('call-note').value = '';
  document.getElementById('reminder-toggle').classList.remove('on');
  document.getElementById('reminder-options').style.display = 'none';
  document.getElementById('call-reminder-mins').value = '';
  document.querySelectorAll('.reminder-chip').forEach(c => c.classList.remove('selected'));

  const now = new Date();
  calState.year = now.getFullYear();
  calState.month = now.getMonth();
  calState.selected = todayISO();
  document.getElementById('call-date').value = calState.selected;
  renderCal();
  openModal('modal-call');
}

function fillCallFromLead(id) {
  const l = state.leads.find(x => x.id === id);
  if (!l) return;
  document.getElementById('call-name').value = l.name || '';
  document.getElementById('call-phone').value = l.phone || l.wapp || '';
  const dropdown = document.getElementById('call-name-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

function renderCal() {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const { year, month, selected } = calState;
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const today = todayISO();

  let cells = '';
  for (let i = 0; i < first; i++) cells += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isPast = iso < today;
    const cls = (iso === selected ? 'selected' : '') + (iso === today && iso !== selected ? ' today' : '') + (isPast ? ' past' : '');
    cells += `<div class="cal-day ${cls}" ${!isPast ? `onclick="selectDay('${iso}')"` : ''}>${d}</div>`;
  }

  document.getElementById('call-cal').innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" onclick="calNav(-1)"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
      <span class="cal-month">${months[month]} ${year}</span>
      <button class="cal-nav" onclick="calNav(1)"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></button>
    </div>
    <div class="cal-grid">
      <div class="cal-dow">Su</div><div class="cal-dow">Mo</div><div class="cal-dow">Tu</div><div class="cal-dow">We</div><div class="cal-dow">Th</div><div class="cal-dow">Fr</div><div class="cal-dow">Sa</div>
      ${cells}
    </div>`;
}

function calNav(dir) {
  calState.month += dir;
  if (calState.month < 0) { calState.month = 11; calState.year--; }
  if (calState.month > 11) { calState.month = 0; calState.year++; }
  renderCal();
}

function selectDay(iso) {
  calState.selected = iso;
  document.getElementById('call-date').value = iso;
  renderCal();
}

async function saveCall() {
  const name = document.getElementById('call-name').value.trim();
  if (!name) { toast('Contact name required'); return; }
  const date = document.getElementById('call-date').value;
  if (!date) { toast('Please select a date'); return; }

  const reminderMins = document.getElementById('call-reminder-mins').value;
  const call = {
    id: uid(), name,
    phone: document.getElementById('call-phone').value.trim(),
    time: document.getElementById('call-time').value,
    note: document.getElementById('call-note').value.trim(),
    date, reminder_mins: reminderMins ? parseInt(reminderMins) : null,
    done: false, createdAt: nowISOString()
  };

  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      const res = await fetch(`${supaUrl}/rest/v1/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=representation' },
        body: JSON.stringify({ id: call.id, name: call.name, phone: call.phone, time: call.time, note: call.note, date: call.date, done: false, created_at: call.createdAt, reminder_mins: call.reminder_mins || null, user_email: state.user?.email || '' })
      });
      if (!res.ok) { const errText = await res.text(); toast('Call save failed: ' + errText.slice(0, 60)); return; }
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        state.calls.push({ id: rows[0].id, name: rows[0].name, phone: rows[0].phone || '', time: rows[0].time || '', note: rows[0].note || '', date: rows[0].date, done: rows[0].done || false, createdAt: rows[0].created_at });
      } else {
        state.calls.push(call);
      }
    } catch(e) { toast('Network error saving call'); return; }
  } else {
    state.calls.push(call);
  }
  save();
  closeModal('modal-call');
  renderHome();
  toast('Call scheduled!');
}

async function deleteCall(id) {
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/calls?id=eq.${id}`, { method: 'DELETE', headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey } });
    } catch(e) { console.error('Call delete error:', e); }
  }
  state.calls = state.calls.filter(c => c.id !== id);
  save(); renderHome();
}

// ── CONTACTS ──
function openContactModal() {
  ['contact-name','contact-phone','contact-city','contact-wapp','contact-note'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-contact');
}

async function saveContact() {
  const name = document.getElementById('contact-name').value.trim();
  if (!name) { toast('Name required'); return; }
  const contact = {
    id: uid(), name,
    phone: document.getElementById('contact-phone').value.trim(),
    city: document.getElementById('contact-city').value.trim(),
    wapp: document.getElementById('contact-wapp').value.trim(),
    note: document.getElementById('contact-note').value.trim(),
    created_at: nowISOString(),
    user_email: state.user?.email || ''
  };
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      const res = await fetch(`${supaUrl}/rest/v1/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=representation' },
        body: JSON.stringify(contact)
      });
      if (!res.ok) { toast('Error saving: ' + res.status); return; }
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const saved = rows[0];
        state.contacts.push({ id: saved.id, name: saved.name, phone: saved.phone || '', city: saved.city || '', wapp: saved.wapp || '', note: saved.note || '', createdAt: saved.created_at, userEmail: saved.user_email });
        save(); closeModal('modal-contact'); renderContacts(); toast('Contact saved!');
      } else {
        toast('Save failed — check Supabase RLS policies');
      }
    } catch(e) { toast('Network error saving contact'); }
  } else {
    state.contacts.push({ id: uid(), ...contact, createdAt: contact.created_at });
    save(); closeModal('modal-contact'); renderContacts(); toast('Contact saved locally');
  }
}

function renderContacts() {
  const grid = document.getElementById('contacts-grid');
  if (!state.contacts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg><p>No contacts yet</p></div>`;
    return;
  }
  grid.innerHTML = state.contacts.map(c => `
    <div class="contact-card">
      <div class="contact-avatar">${c.name[0].toUpperCase()}</div>
      <div class="contact-name">${esc(c.name)}</div>
      ${c.phone ? `<div class="contact-phone">${esc(c.phone)}</div>` : ''}
      ${c.city ? `<div class="contact-city">📍 ${esc(c.city)}</div>` : ''}
      ${c.note ? `<div class="contact-city" style="margin-top:4px">${esc(c.note)}</div>` : ''}
      <div class="contact-actions">
        ${c.phone ? `<a href="tel:${esc(c.phone)}" class="icon-link gbp"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6z"/></svg></a>` : ''}
        <button onclick="scheduleCallFromContact('${c.id}')" class="icon-link gbp" title="Schedule Call">
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px" stroke-width="1.8">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6z"/>
    <line x1="18" y1="2" x2="18" y2="8"/><line x1="15" y1="5" x2="21" y2="5"/>
  </svg>
    </button>
        ${c.wapp ? `<a href="https://wa.me/${c.wapp.replace(/\D/g,'')}" target="_blank" class="icon-link wapp">${wappSVG()}</a>` : ''}
        <button class="icon-btn" onclick="deleteContact('${c.id}')" style="color:var(--red)">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>`).join('');
}

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/contacts?id=eq.${id}`, { method: 'DELETE', headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey } });
    } catch(e) { console.error('Contact delete error:', e); }
  }
  state.contacts = state.contacts.filter(c => c.id !== id);
  save(); renderContacts(); toast('Contact deleted');
}

// ── DASHBOARD ──
function goBackFromDashboard() {
  document.getElementById('dashboard-inner').style.display = 'none';
  document.getElementById('dash-frame').src = '';
  const btn = document.querySelector(`.nav-item[onclick*="'home'"]`);
  showPage('home', btn);
}

// ── SETTINGS ──
function applyLogo(init) {
  const val = init ? state.settings.logo : document.getElementById('logo-input').value.trim();
  if (!init) { state.settings.logo = val; save(); }
  const logos = document.querySelectorAll('#logo-img, #sidebar-logo-img, #login-logo-img');
  const icons = document.querySelectorAll('#sidebar-logo-icon, #login-logo-icon');
  if (val) {
const src =
  val.endsWith('favicon.png')
    ? val
    : 'data:image/png;base64,' + val;
    logos.forEach(el => { el.src = src; el.style.display = ''; });
    icons.forEach(el => { el.style.display = 'none'; });
  } else {
    logos.forEach(el => el.style.display = 'none');
    icons.forEach(el => { el.style.display = ''; });
  }
  if (!init) toast('Logo applied');
}

function updateDbStatus(connected) {
  document.getElementById('db-dot').className = 'db-dot' + (connected ? ' connected' : '');
  document.getElementById('db-label').textContent = connected ? 'Supabase' : 'Local';
}

// ── MODAL UTILS ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ── FAB ──
function toggleFab() {
  const items = document.getElementById('fab-items');
  const btn = document.getElementById('fab-btn');
  const hidden = items.classList.toggle('hidden');
  btn.style.transform = hidden ? '' : 'rotate(45deg)';
}

function closeFab() {
  document.getElementById('fab-items').classList.add('hidden');
  document.getElementById('fab-btn').style.transform = '';
}

// ── SALES ──
function openSaleModal() {
  document.getElementById('sale-amount').value = '';
  document.getElementById('sale-date').value = todayISO();
  document.getElementById('sale-txn').value = '';
  document.getElementById('sale-note').value = '';
  const sel = document.getElementById('sale-lead');
  sel.innerHTML = '<option value="">-- Select Lead --</option>';
  state.leads.filter(l => l.status !== 'suspended').forEach(l => {
    sel.innerHTML += `<option value="${l.id}">${l.name}</option>`;
  });
  openModal('modal-sale');
}

async function saveSale() {
  const leadId = document.getElementById('sale-lead').value;
  const amount = parseFloat(document.getElementById('sale-amount').value);
  const date = document.getElementById('sale-date').value;
  if (!leadId) { toast('Please select a lead'); return; }
  if (!amount || amount <= 0) { toast('Enter a valid amount'); return; }
  if (!date) { toast('Date is required'); return; }

  const lead = state.leads.find(l => l.id === leadId);
  const sale = {
    id: uid(), lead_id: leadId, lead_name: lead?.name || '', amount,
    transaction_id: document.getElementById('sale-txn').value.trim(),
    date, note: document.getElementById('sale-note').value.trim(),
    created_at: nowISOString(), user_email: state.user?.email || ''
  };

  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      const res = await fetch(`${supaUrl}/rest/v1/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=representation' },
        body: JSON.stringify(sale)
      });
      const saved = await res.json();
      if (Array.isArray(saved) && saved[0]) {
        state.sales = state.sales || [];
        state.sales.push(saved[0]);
        save(); closeModal('modal-sale'); renderSales(); renderHome();
        toast('Sale added!'); triggerCoinAnimation(); return;
      } else {
        toast('Error saving sale: ' + JSON.stringify(saved)); return;
      }
    } catch(e) { toast('Network error saving sale'); return; }
  }
  state.sales = state.sales || [];
  state.sales.push({ ...sale, id: uid() });
  save(); closeModal('modal-sale'); renderSales(); renderHome(); toast('Sale added!');
}

function renderSales() {
  const sales = state.sales || [];
  const now = new Date();
  const currentYear = now.getFullYear();

  function getQuarter(dateStr) {
    const m = new Date(dateStr).getMonth();
    if (m <= 2) return 1; if (m <= 5) return 2; if (m <= 8) return 3; return 4;
  }

  function quarterStats(q) {
    const qs = sales.filter(x => getQuarter(x.date) === q && new Date(x.date).getFullYear() === currentYear);
    return { total: qs.reduce((s, x) => s + (x.amount || 0), 0), count: qs.length };
  }

  const q1 = quarterStats(1); const q2 = quarterStats(2);
  const q3 = quarterStats(3); const q4 = quarterStats(4);

  document.getElementById('sales-q1').textContent = '₹' + fmtNum(q1.total);
  document.getElementById('sales-q1-sub').textContent = q1.count + ' deal' + (q1.count !== 1 ? 's' : '');
  document.getElementById('sales-q2').textContent = '₹' + fmtNum(q2.total);
  document.getElementById('sales-q2-sub').textContent = q2.count + ' deal' + (q2.count !== 1 ? 's' : '');
  document.getElementById('sales-q3').textContent = '₹' + fmtNum(q3.total);
  document.getElementById('sales-q3-sub').textContent = q3.count + ' deal' + (q3.count !== 1 ? 's' : '');
  document.getElementById('sales-q4').textContent = '₹' + fmtNum(q4.total);
  document.getElementById('sales-q4-sub').textContent = q4.count + ' deal' + (q4.count !== 1 ? 's' : '');

  const todaySales = sales.filter(x => x.date === todayISO());
  const todayTotal = todaySales.reduce((s, x) => s + (x.amount || 0), 0);
  const todayAmt = document.getElementById('sales-today-amt');
  const todayCount = document.getElementById('sales-today-count');
  if (todayAmt) todayAmt.textContent = '₹' + fmtNum(todayTotal);
  if (todayCount) todayCount.textContent = todaySales.length + ' deal' + (todaySales.length !== 1 ? 's' : '');

  const tb = document.getElementById('sales-tbody');
  if (!sales.length) { tb.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>No sales yet</p></div></td></tr>`; return; }

  tb.innerHTML = [...sales].reverse().map(s => `
    <tr>
      <td class="td-name">${esc(s.lead_name)}</td>
      <td style="color:var(--green);font-weight:600">₹${fmtNum(s.amount)}</td>
      <td>${s.transaction_id ? esc(s.transaction_id) : '—'}</td>
      <td>${s.date || '—'}</td>
      <td><span class="badge badge-blue">Q${getQuarter(s.date)}</span></td>
      <td>${s.note ? esc(s.note) : '—'}</td>
      <td>
        <button class="icon-btn" onclick="deleteSale('${s.id}')" style="color:var(--red)">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </td>
    </tr>`).join('');

  renderSalesChart();
}

async function deleteSale(id) {
  if (!confirm('Delete this sale?')) return;
  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    await fetch(`${supaUrl}/rest/v1/sales?id=eq.${id}`, { method: 'DELETE', headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey } });
  }
  state.sales = (state.sales || []).filter(s => s.id !== id);
  save(); renderSales(); renderHome(); toast('Sale deleted');
}

// ── LEADS PIE CHART ──
let pieChartInstance = null;

function renderLeadsPie() {
  const leads = state.leads || [];
  const total = leads.length;
  document.getElementById('pie-total').textContent = total;

  const stats = [
    { key: 'not_escalated', label: 'Not Escalated',   count: leads.filter(l => l.status === 'not_escalated').length,  color: '#94a3b8', bg: '#94a3b814' },
    { key: 'outreach_wapp', label: 'Outreach (Wapp)', count: leads.filter(l => l.status === 'outreach_wapp').length,   color: '#22c55e', bg: '#22c55e14' },
    { key: 'outreach_call', label: 'Outreach (Call)', count: leads.filter(l => l.status === 'outreach_call').length,   color: '#3b82f6', bg: '#3b82f614' },
    { key: 'prospecting',   label: 'Unresponsive',     count: leads.filter(l => l.status === 'unresponsive').length,     color: '#f59e0b', bg: '#f59e0b14' },
    { key: 'payment',       label: 'Payment',         count: leads.filter(l => l.status === 'payment').length,         color: '#8b5cf6', bg: '#8b5cf614' },
    { key: 'followup',      label: 'Follow-up',       count: leads.filter(l => l.status === 'followup').length,        color: '#06b6d4', bg: '#06b6d414' },
    { key: 'converted',     label: 'Converted',       count: leads.filter(l => l.status === 'converted').length,       color: '#4ade80', bg: '#4ade8014' },
    { key: 'suspended',     label: 'Suspended',       count: leads.filter(l => l.status === 'suspended').length,       color: '#ef4444', bg: '#ef444414' },
  ];

  document.getElementById('lead-chart-legend').innerHTML = stats.map(s =>
    `<span style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span>${s.label}</span>`
  ).join('');

  document.getElementById('pie-stats').innerHTML = stats.map(s => `
    <div onclick="goToLeadsFilter('${s.key}')"
      style="display:flex;align-items:center;gap:8px;padding:8px 11px;background:${s.bg};border-radius:10px;border:1px solid ${s.color}33;cursor:pointer;transition:all .18s ease;position:relative;overflow:visible;box-sizing:border-box"
      onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='${s.color}77';this.style.boxShadow='0 6px 20px ${s.color}28'"
      onmouseout="this.style.transform='translateY(0)';this.style.borderColor='${s.color}33';this.style.boxShadow='none'">
      <div style="width:9px;height:9px;border-radius:50%;background:${s.color};flex-shrink:0;margin-top:1px"></div>
      <div style="min-width:0;flex:1">
        <div style="font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--text);line-height:1.2;white-space:nowrap">
          ${s.count}
          <span style="font-size:11px;font-weight:500;color:${s.color};margin-left:3px">${total ? Math.round(s.count/total*100) : 0}%</span>
        </div>
        <div style="font-size:11.5px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.label}</div>
      </div>
      <div style="flex-shrink:0;color:${s.color};font-size:13px;opacity:0.5;margin-left:4px">→</div>
    </div>`).join('');

  const canvas = document.getElementById('leads-pie');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance = null; }

  if (!total) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.arc(100, 100, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1e29'; ctx.fill(); return;
  }

  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: stats.map(s => s.label),
      datasets: [{ data: stats.map(s => s.count || 0.001), backgroundColor: stats.map(s => s.color), borderColor: 'transparent', borderWidth: 0, hoverOffset: 10 }]
    },
    options: {
      responsive: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw === 0.001 ? 0 : ctx.raw} leads (${total ? Math.round((ctx.raw === 0.001 ? 0 : ctx.raw)/total*100) : 0}%)` } }
      },
      animation: { animateRotate: true, duration: 600 }
    }
  });
}

// ── HELPERS ──
function goToLeadsFilter(statusKey) {
  leadsFilter = statusKey; leadsPage = 1;
  const btn = document.querySelector(`.nav-item[onclick*="'leads'"]`);
  showPage('leads', btn);
}

function getAgingDays(lead) {
  const ref = lead.statusChangedAt || lead.createdAt;
  if (!ref) return 0;
  return Math.floor((Date.now() - new Date(ref)) / 86400000);
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function nowIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  return ist;
}

function todayISO() {
  const ist = nowIST();
  return ist.getUTCFullYear() + '-' +
    String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(ist.getUTCDate()).padStart(2, '0');
}

function nowISOString() {
  return nowIST().toISOString().replace(/\.\d{3}Z$/, '+05:30');
}
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtNum(n) { return n >= 1e7 ? (n/1e7).toFixed(2)+'Cr' : n >= 1e5 ? (n/1e5).toFixed(1)+'L' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n.toFixed(0); }


function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

function wappSVG() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;
}

function googleSVG() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;
}

// ── LOGIN PARTICLES ──
function initParticles() {
  const container = document.getElementById('login-particles');
  if (!container) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;bottom:-10px;width:${Math.random()*3+1}px;height:${Math.random()*3+1}px;animation-duration:${Math.random()*10+8}s;animation-delay:${Math.random()*8}s;opacity:${Math.random()*0.6+0.2};`;
    container.appendChild(p);
  }
}
initParticles();

// ── FOLLOW-UP REMINDERS ──
function getFollowupLeads() { return state.leads.filter(l => l.status === 'followup' && l.followupDate); }
function getOverdueFollowups() { const today = todayISO(); return getFollowupLeads().filter(l => l.followupDate <= today); }
function getTodayFollowups() { const today = todayISO(); return getFollowupLeads().filter(l => l.followupDate === today); }

function updateFollowupBell() {
  const overdue = getOverdueFollowups();
  const today = getTodayFollowups();
  const all = [...overdue, ...today.filter(l => !overdue.find(o => o.id === l.id))];
  const dot = document.getElementById('followup-bell-dot');
  const badge = document.getElementById('followup-badge-count');
  if (!dot) return;
  if (all.length > 0) {
    dot.style.display = 'block';
    if (badge) { badge.textContent = all.length; badge.style.display = ''; }
  } else {
    dot.style.display = 'none';
    if (badge) badge.style.display = 'none';
  }
}

function toggleFollowupPopup() {
  const popup = document.getElementById('followup-popup');
  if (!popup) return;
  if (popup.style.display === 'block') { popup.style.display = 'none'; } else { popup.style.display = 'block'; renderFollowupPopup(); }
}

function closeFollowupPopup() { document.getElementById('followup-popup').style.display = 'none'; }

//templates

function getFollowupTemplate(note) {
  const n = (note || '').toLowerCase();
  
  const templates = [
    {
      keywords: ['payment', 'pay', 'invoice', 'amount', 'fees'],
      msg: `Hi! Just following up regarding the payment. Kindly let us know if you need any assistance to proceed. 🙏`
    },
    {
      keywords: ['demo', 'presentation', 'show', 'meeting'],
      msg: `Hi! We had scheduled a demo/meeting follow-up. Are you available for a quick call to discuss further? 😊`
    },
    {
      keywords: ['proposal', 'quote', 'offer', 'price', 'pricing'],
      msg: `Hi! Just checking in on the proposal we shared. Do you have any questions or would you like to discuss? 🙏`
    },
    {
      keywords: ['call', 'talk', 'speak', 'discuss', 'connect'],
      msg: `Hi! We had a follow-up call scheduled. Are you available for a quick chat right now? 📞`
    },
    {
      keywords: ['website', 'site', 'design', 'development'],
      msg: `Hi! Following up regarding your website. Would you be available for a quick call to take this forward? 🚀`
    },
    {
      keywords: ['gbp', 'google', 'ranking', 'seo', 'maps'],
      msg: `Hi! Following up regarding your Google Business Profile / ranking. Are you available for a quick call? 📍`
    },
    {
      keywords: ['report', 'audit', 'analysis'],
      msg: `Hi! Your report/audit is ready. Would you like to go over it on a quick call? 📊`
    }
  ];

  for (const t of templates) {
    if (t.keywords.some(k => n.includes(k))) {
      return t.msg;
    }
  }

  // fallback
  return `Hi! ${note ? `We had a follow-up scheduled regarding "${note}". ` : ''}Are you available for a quick call? 🙏`;
}


function renderFollowupPopup() {
  const today = todayISO();
  const all = getFollowupLeads().sort((a, b) => a.followupDate > b.followupDate ? 1 : -1);
  const list = document.getElementById('followup-popup-list');
  if (!all.length) {
    list.innerHTML = `<div class="empty-state"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><p>No follow-ups scheduled</p></div>`;
    return;
  }
  list.innerHTML = all.map(l => {
    const isOverdue = l.followupDate < today;
    const isToday = l.followupDate === today;
    const borderColor = isOverdue ? 'var(--red)' : isToday ? 'var(--amber)' : 'var(--border2)';
    const bg = isOverdue ? 'var(--red-soft)' : isToday ? 'var(--amber-soft)' : 'var(--surface2)';
    const label = isOverdue ? '🔴 Overdue' : isToday ? '🟡 Today' : '🔵 Upcoming';
    const dateDisplay = new Date(l.followupDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    return `
      <div style="padding:12px;border-radius:10px;border:1px solid ${borderColor};background:${bg};margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(l.name)}</div>
          <span style="font-size:11px;font-weight:600">${label}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">📅 ${dateDisplay}${l.followupTime ? ' · ⏰ ' + l.followupTime : ''}${l.city ? ' · 📍 ' + esc(l.city) : ''}</div>
        ${l.followupNote ? `<div style="font-size:12px;color:var(--text2);margin-bottom:8px;padding:6px 8px;background:var(--surface3);border-radius:6px">📝 ${esc(l.followupNote)}</div>` : ''}
        <div style="display:flex;gap:6px">
${l.wapp ? `<a href="https://wa.me/${l.wapp.replace(/\D/g,'')}?text=${encodeURIComponent(getFollowupTemplate(l.followupNote))}" target="_blank" class="btn btn-success" style="padding:4px 10px;font-size:11.5px">WhatsApp</a>` : ''}
        ${l.phone ? `<a href="tel:${esc(l.phone)}" class="btn btn-ghost" style="padding:4px 10px;font-size:11.5px">Call</a>` : ''}
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:11.5px" onclick="closeFollowupPopup();editLead('${l.id}')">Edit</button>
        </div>
      </div>`;
  }).join('');
}

function renderFollowupHomeSection() {
  const overdue = getOverdueFollowups();
  const todayF = getTodayFollowups();
  const combined = [...overdue, ...todayF.filter(l => !overdue.find(o => o.id === l.id))];
  let el = document.getElementById('followup-home-section');
  if (!el) return;
  if (!combined.length) { el.style.display = 'none'; return; }
  el.style.display = 'none';
  el.innerHTML = `
    <div class="section-head">
      <div class="section-title">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        Follow-up Alerts <span class="badge badge-red">${combined.length}</span>
      </div>
    </div>
    ${combined.map(l => {
      const isOverdue = l.followupDate < todayISO();
      const dateDisplay = new Date(l.followupDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short' });
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:8px;background:${isOverdue ? 'var(--red-soft)' : 'var(--amber-soft)'};border:1px solid ${isOverdue ? 'var(--red)' : 'var(--amber)'};margin-bottom:8px">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(l.name)}</div>
            <div style="font-size:11.5px;color:var(--text3)">${isOverdue ? '🔴 Overdue' : '🟡 Today'} · ${dateDisplay}${l.followupTime ? ' · ⏰ ' + l.followupTime : ''}</div>
            ${l.followupNote ? `<div style="font-size:11px;color:var(--text2);margin-top:3px;padding:4px 6px;background:var(--surface3);border-radius:5px">📝 ${esc(l.followupNote)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            ${l.wapp ? `<a href="https://wa.me/${l.wapp.replace(/\D/g,'')}" target="_blank" class="icon-link wapp">${wappSVG()}</a>` : ''}
            <button class="icon-btn" onclick="editLead('${l.id}')">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </div>`;
    }).join('')}`;
}

// ── PROFILE ──
function loadProfileUI() {
  const name = state.user?.name || 'User';
  const email = state.user?.email || '—';
  const img = state.user?.profileImg || '';
  document.getElementById('sidebar-uname').textContent = name;
  updateSidebarAvatar(img);
  const nameDisplay = document.getElementById('profile-name-display');
  const emailDisplay = document.getElementById('profile-email-display');
  const initials = document.getElementById('profile-avatar-initials');
  const avatarImg = document.getElementById('profile-avatar-img');
  const nameInput = document.getElementById('profile-name-input');
  const removeBtn = document.getElementById('remove-img-btn');
  if (nameDisplay) nameDisplay.textContent = name;
  if (emailDisplay) emailDisplay.textContent = email;
  if (initials) initials.textContent = name[0].toUpperCase();
  if (nameInput) nameInput.value = name;
  if (img) {
    if (avatarImg) { avatarImg.src = img; avatarImg.style.display = 'block'; }
    if (initials) initials.style.display = 'none';
    if (removeBtn) removeBtn.style.display = '';
    updateSidebarAvatar(img);
  } else {
    if (avatarImg) avatarImg.style.display = 'none';
    if (initials) initials.style.display = '';
    if (removeBtn) removeBtn.style.display = 'none';
    updateSidebarAvatar(null);
  }
}

function updateSidebarAvatar(imgSrc) {
  const avatar = document.getElementById('sidebar-avatar');
  if (!avatar) return;
  if (imgSrc) {
    avatar.innerHTML = `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    const name = state.user?.name || 'U';
    avatar.innerHTML = name[0].toUpperCase();
  }
}

function handleProfileImg(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Image too large. Max 2MB.'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    state.user.profileImg = e.target.result;
    save(); loadProfileUI();
    await saveProfileToSupabase();
    toast('Profile photo updated!');
  };
  reader.readAsDataURL(file);
}

function removeProfileImg() {
  state.user.profileImg = '';
  document.getElementById('profile-img-input').value = '';
  save(); loadProfileUI(); saveProfileToSupabase(); toast('Photo removed');
}

async function saveProfileName() {
  const val = document.getElementById('profile-name-input').value.trim();
  if (!val) { toast('Name cannot be empty'); return; }
  state.user.name = val; save(); loadProfileUI();
  await saveProfileToSupabase(); toast('Name updated!');
}

async function saveProfileToSupabase() {
  const { supaUrl, supaKey } = state.settings;
  if (!supaKey || !state.user?.email) return;
  const payload = { user_email: state.user.email, display_name: state.user.name || '', profile_img: state.user.profileImg || '', updated_at: nowISOString() };
  try {
    await fetch(`${supaUrl}/rest/v1/profiles?user_email=eq.${encodeURIComponent(state.user.email)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
  } catch(e) { console.error('Profile save error:', e); }
}

// ── QUICK STATUS CHANGE ──
let contextMenuLeadId = null;

const statusMenuOptions = [
  { value: 'not_escalated', label: 'Not Escalated',   color: '#94a3b8' },
  { value: 'outreach_wapp', label: 'Outreach (Wapp)', color: '#22c55e' },
  { value: 'outreach_call', label: 'Outreach (Call)', color: '#3b82f6' },
  { value: 'prospecting',   label: 'Unresponsive',     color: '#f59e0b' },
  { value: 'payment',       label: 'Payment',         color: '#8b5cf6' },
  { value: 'followup',      label: 'Follow-up',       color: '#06b6d4' },
  { value: 'converted',     label: 'Converted',       color: '#4ade80' },
  { value: 'suspended',     label: 'Suspended',       color: '#ef4444' },
];

function openStatusMenu(e, leadId) {
  e.preventDefault(); e.stopPropagation();
  contextMenuLeadId = leadId;
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const menu = document.getElementById('status-context-menu');
  document.getElementById('status-menu-lead-name').textContent = lead.name;
  document.getElementById('status-menu-items').innerHTML = statusMenuOptions.map(opt => `
    <button class="status-menu-item ${lead.status === opt.value ? 'current' : ''}" onclick="applyQuickStatus('${opt.value}')">
      <span class="dot" style="background:${opt.color}"></span>
      ${opt.label}
      ${lead.status === opt.value ? '<svg style="margin-left:auto;width:12px;height:12px;stroke:var(--accent)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg>' : ''}
    </button>`).join('');
  const x = Math.min(e.clientX, window.innerWidth - 220);
  const y = Math.min(e.clientY, window.innerHeight - 320);
  menu.style.left = x + 'px'; menu.style.top = y + 'px'; menu.style.display = '';
  menu.style.opacity = '0'; menu.style.transform = 'scale(0.95)'; menu.style.transition = 'opacity .15s, transform .15s';
  requestAnimationFrame(() => { menu.style.opacity = '1'; menu.style.transform = 'scale(1)'; });
}

async function applyQuickStatus(newStatus) {
  const lead = state.leads.find(l => l.id === contextMenuLeadId);
  if (!lead) return;
  const oldStatus = lead.status;
  lead.status = newStatus;
  lead.statusChangedAt = nowISOString();

  if (oldStatus === 'not_escalated' && newStatus !== 'not_escalated') {
    const { supaUrl, supaKey } = state.settings;
    if (supaKey) {
      fetch(`${supaUrl}/rest/v1/lead_escalations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: uid(), lead_id: lead.id, lead_name: lead.name, from_status: oldStatus, to_status: newStatus, escalated_at: nowISOString(), user_email: state.user?.email || '' })
      }).catch(e => console.error('Escalation save error:', e));
    }
  }

  if (newStatus === 'converted' && oldStatus !== 'converted') {
    let amount = null;
    while (true) {
      const input = prompt('💰 Enter sale amount (₹) — required to convert:');
      if (input === null) { lead.status = oldStatus; closeStatusMenu(); toast('Conversion cancelled'); return; }
      const parsed = parseFloat(input);
      if (!input.trim()) { alert('⚠️ Sale amount cannot be empty. Please enter a value.'); continue; }
      if (isNaN(parsed) || parsed <= 0) { alert('⚠️ Please enter a valid amount greater than 0.'); continue; }
      amount = parsed; break;
    }
    lead.saleAmount = amount; lead.convertedAt = nowISOString();
  }

  if (newStatus === 'followup') { closeStatusMenu(); openFollowupQuick(lead.id, lead.status); return; }

  closeStatusMenu();
  const { supaUrl, supaKey } = state.settings;

  try {
    if (supaKey) {
      await fetch(`${supaUrl}/rest/v1/leads?id=eq.${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: newStatus, sale_amount: lead.saleAmount || 0, converted_at: lead.convertedAt || null, followup_date: lead.followupDate || null, followup_note: lead.followupNote || null, status_changed_at: lead.statusChangedAt })
      });
    }

    if (newStatus === 'converted' && oldStatus !== 'converted' && lead.saleAmount > 0) {
      const sale = { id: uid(), lead_id: lead.id, lead_name: lead.name, amount: lead.saleAmount, transaction_id: '', date: nowISOString().slice(0, 10), note: 'Auto-added on conversion', created_at: nowISOString(), user_email: state.user?.email || '' };
      if (supaKey) {
        const saleRes = await fetch(`${supaUrl}/rest/v1/sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=representation' },
          body: JSON.stringify(sale)
        });
        if (saleRes.ok) {
          const saleRows = await saleRes.json();
          if (Array.isArray(saleRows) && saleRows.length > 0) {
            const saved = saleRows[0];
            sale.id = saved.id; sale.lead_id = saved.lead_id; sale.lead_name = saved.lead_name;
            sale.amount = saved.amount; sale.date = saved.date; sale.created_at = saved.created_at;
          }
        }
      }
      state.sales = state.sales || [];
      state.sales.push(sale);
      toast(`✅ ${lead.name} converted! ₹${fmtNum(lead.saleAmount)} added to Sales`);
    } else {
      toast(`Status → ${statusLabel(newStatus)}`);
    }
  } catch(e) { console.error('Quick status error:', e); toast('Error saving status'); }

  save(); renderLeads(); renderSuspended(); renderSales(); renderHome();
}

function closeStatusMenu() {
  const menu = document.getElementById('status-context-menu');
  menu.style.opacity = '0'; menu.style.transform = 'scale(0.95)';
  setTimeout(() => { menu.style.display = 'none'; }, 150);
  contextMenuLeadId = null;
}

// ── FOLLOWUP QUICK MODAL ──
let _fqLeadId = null;
let _fqOldStatus = null;

function openFollowupQuick(leadId, oldStatus) {
  _fqLeadId = leadId; _fqOldStatus = oldStatus;
  _fqType = null;
  document.getElementById('fq-date').value = todayISO();
  document.getElementById('fq-date').min = todayISO();
  document.getElementById('fq-time').value = '';
  document.getElementById('fq-note').value = '';
  document.getElementById('fq-err').textContent = '';
  document.getElementById('fq-amount-row').style.display = 'none';
  document.getElementById('fq-amount').value = '';
  // reset type selection
  document.querySelectorAll('.fq-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('fq-fields').style.display = 'none';
  openModal('modal-followup-quick');
}

function cancelFollowupQuick() {
  const lead = state.leads.find(l => l.id === _fqLeadId);
  if (lead && _fqOldStatus) lead.status = _fqOldStatus;
  closeModal('modal-followup-quick');
  _fqLeadId = null; _fqOldStatus = null;
  renderLeads();
}

async function confirmFollowupQuick() {
  const date = document.getElementById('fq-date').value;
  const time = document.getElementById('fq-time').value;
  const note = document.getElementById('fq-note').value.trim();
  const err = document.getElementById('fq-err');
if (!_fqType) { err.textContent = '⚠️ Please select a follow-up type.'; return; }
if (_fqType === 'call' && !_fqCallSubtype) { err.textContent = '⚠️ Please select a call type.'; return; }
if (!date) { err.textContent = '⚠️ Date is required.'; return; }
  if (!time) { err.textContent = '⚠️ Time is required.'; return; }

  const lead = state.leads.find(l => l.id === _fqLeadId);
  if (!lead) { closeModal('modal-followup-quick'); return; }

  const oldStatus = _fqOldStatus;
lead.status = _fqType === 'payment' ? 'payment' : 'followup';
lead.followupDate = date;
lead.followupTime = time;
lead.followupNote = note;
lead.followupType = _fqType === 'call' ? _fqCallSubtype : _fqType;
  if (_fqType === 'payment') {
    lead.followupAmount = parseFloat(document.getElementById('fq-amount').value) || 0;
  }

  closeModal('modal-followup-quick');

  const { supaUrl, supaKey } = state.settings;

  // Auto-create call for Call type
  if (_fqType === 'call') {
    const call = {
      id: uid(), name: lead.name,
      phone: lead.phone || lead.wapp || '',
      time, note, date, done: false,
      reminder_mins: 15,
      createdAt: nowISOString()
    };
    state.calls.push(call);
    if (supaKey) {
      fetch(`${supaUrl}/rest/v1/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: call.id, name: call.name, phone: call.phone, time, note, date, done: false, created_at: call.createdAt, reminder_mins: 15, user_email: state.user?.email || '' })
      }).catch(e => console.error('Call auto-create error:', e));
    }
  }

  // Auto-create task for GBP type
  if (_fqType === 'gbp') {
    const task = {
      id: uid(),
      title: `GBP Report - ${lead.name}`,
      date,
      priority: 'high',
      note: `GBP report due by ${time}${note ? ' · ' + note : ''}`,
      done: false,
      createdAt: nowISOString()
    };
    state.tasks.push(task);
    if (supaKey) {
      fetch(`${supaUrl}/rest/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ id: task.id, title: task.title, date: task.date, priority: 'high', note: task.note, done: false, created_at: task.createdAt, user_email: state.user?.email || '' })
      }).catch(e => console.error('Task auto-create error:', e));
    }
  }

  // Escalation log
  if (oldStatus === 'not_escalated' && supaKey) {
    fetch(`${supaUrl}/rest/v1/lead_escalations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ id: uid(), lead_id: lead.id, lead_name: lead.name, from_status: oldStatus, to_status: 'followup', escalated_at: nowISOString(), user_email: state.user?.email || '' })
    }).catch(e => console.error(e));
  }

  if (supaKey) {
    try {
      await fetch(`${supaUrl}/rest/v1/leads?id=eq.${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
      status: _fqType === 'payment' ? 'payment' : 'followup',
          followup_date: date,
          followup_note: note,
          followup_time: time,
          followup_type: _fqType,
          followup_amount: lead.followupAmount || null,
          sale_amount: lead.saleAmount || 0
        })
      });
    } catch(e) { console.error('Followup save error:', e); }
  }

  save(); renderLeads(); renderSuspended(); renderHome();

  const typeLabels = { call: '📞 Call', payment: '💳 Payment', gbp: '📍 GBP Report' };
  toast(`${typeLabels[_fqType]} follow-up set for ${date} at ${time}`);
  _fqLeadId = null; _fqOldStatus = null; _fqType = null; _fqCallSubtype = null;
}

//added selectFqType 

let _fqType = null;
let _fqCallSubtype = null;

function selectFqType(type) {
  _fqType = type;
  document.querySelectorAll('.fq-type-btn').forEach(b => {
    const isSelected = b.dataset.type === type;
    b.style.borderColor = isSelected ? 'var(--accent)' : 'var(--border2)';
    b.style.background = isSelected ? 'var(--accent-soft)' : 'var(--surface2)';
    b.style.color = isSelected ? 'var(--accent)' : 'var(--text2)';
  });
document.getElementById('fq-fields').style.display = '';
document.getElementById('fq-amount-row').style.display = type === 'payment' ? '' : 'none';
document.getElementById('fq-call-subtype-row').style.display = type === 'call' ? '' : 'none';
}

function selectFqSubtype(sub) {
  _fqCallSubtype = sub;
  document.querySelectorAll('.fq-subtype-btn').forEach(b => {
    const isSelected = b.dataset.sub === sub;
    b.style.borderColor = isSelected ? 'var(--accent)' : 'var(--border2)';
    b.style.background = isSelected ? 'var(--accent-soft)' : 'var(--surface2)';
    b.style.color = isSelected ? 'var(--accent)' : 'var(--text2)';
  });
}

// ── EVENT LISTENERS ──
document.addEventListener('click', e => {
  const menu = document.getElementById('status-context-menu');
  const isOpen = menu && menu.style.display !== 'none';
  if (isOpen && !menu.contains(e.target)) closeStatusMenu();
  const popup = document.getElementById('followup-popup');
  const bell = document.getElementById('followup-bell');
  if (popup && popup.style.display !== 'none') {
    if (!popup.contains(e.target) && !bell.contains(e.target)) popup.style.display = 'none';
  }
});

document.addEventListener('scroll', closeStatusMenu, true);

document.addEventListener('click', e => {
  if (!document.getElementById('search-wrap')?.contains(e.target)) closeSearch();
});

// ── GLOBAL SEARCH ──
let searchTimeout = null;

function onSearch(val) {
  clearTimeout(searchTimeout);
  if (!val.trim()) { closeSearch(); return; }
  searchTimeout = setTimeout(() => runSearch(val.trim()), 200);
}

function runSearch(q) {
  const query = q.toLowerCase();
  const dropdown = document.getElementById('search-dropdown');
  const matchedLeads = state.leads.filter(l =>
    l.name?.toLowerCase().includes(query) || l.phone?.toLowerCase().includes(query) ||
    l.wapp?.toLowerCase().includes(query) || l.city?.toLowerCase().includes(query)
  ).slice(0, 5);
  const matchedContacts = state.contacts.filter(c =>
    c.name?.toLowerCase().includes(query) || c.phone?.toLowerCase().includes(query) ||
    c.wapp?.toLowerCase().includes(query) || c.city?.toLowerCase().includes(query)
  ).slice(0, 5);

  if (!matchedLeads.length && !matchedContacts.length) {
    dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No results for "<b style="color:var(--text)">${esc(q)}</b>"</div>`;
    dropdown.style.display = ''; return;
  }

  let html = '';
  if (matchedLeads.length) {
    html += `<div class="search-section-label">Leads</div>`;
    html += matchedLeads.map(l => `
      <div class="search-item" onclick="searchGoToLead('${l.id}')">
        <div class="search-item-avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent2))">${l.name[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="search-item-name">${highlight(esc(l.name), q)}</div>
          <div class="search-item-sub">
            ${l.phone ? highlight(esc(l.phone), q) + ' · ' : ''}
            <span class="status-pill ${statusClass(l.status)}" style="font-size:10.5px;padding:1px 7px">${statusLabel(l.status)}</span>
            ${l.city ? ' · ' + esc(l.city) : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${l.wapp ? `<a href="https://wa.me/${l.wapp.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" class="icon-link wapp">${wappSVG()}</a>` : ''}
          ${l.gbpUrl ? `<a href="${l.gbpUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="icon-link gbp">${googleSVG()}</a>` : ''}
        </div>
      </div>`).join('');
  }
  if (matchedContacts.length) {
    html += `<div class="search-section-label">Contacts</div>`;
    html += matchedContacts.map(c => `
      <div class="search-item" onclick="searchGoToContact()">
        <div class="search-item-avatar" style="background:linear-gradient(135deg,#06b6d4,#0284c7)">${c.name[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="search-item-name">${highlight(esc(c.name), q)}</div>
          <div class="search-item-sub">${c.phone ? highlight(esc(c.phone), q) : ''}${c.city ? ' · ' + esc(c.city) : ''}</div>
        </div>
        ${c.wapp ? `<a href="https://wa.me/${c.wapp.replace(/\D/g,'')}" target="_blank" onclick="event.stopPropagation()" class="icon-link wapp" style="flex-shrink:0">${wappSVG()}</a>` : ''}
      </div>`).join('');
  }
  dropdown.innerHTML = html;
  dropdown.style.display = '';
}

function highlight(text, query) {
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, `<mark style="background:var(--accent-soft);color:var(--accent);border-radius:3px;padding:0 2px">$1</mark>`);
}

function searchGoToLead(id) {
  closeSearch(); document.getElementById('global-search').value = '';
  const btn = document.querySelector(`.nav-item[onclick*="'leads'"]`);
  showPage('leads', btn); setTimeout(() => editLead(id), 100);
}

function searchGoToContact() {
  closeSearch(); document.getElementById('global-search').value = '';
  const btn = document.querySelector(`.nav-item[onclick*="'contacts'"]`);
  showPage('contacts', btn);
}

function closeSearch() { document.getElementById('search-dropdown').style.display = 'none'; }

// ── THEME ──
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('nexaflow_theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-icon-dark').style.display = isLight ? 'none' : '';
  document.getElementById('theme-icon-light').style.display = isLight ? '' : 'none';
}

function applyTheme() {
  const saved = localStorage.getItem('nexaflow_theme');
  if (saved === 'light') {
    document.body.classList.add('light');
    document.getElementById('theme-icon-dark').style.display = 'none';
    document.getElementById('theme-icon-light').style.display = '';
  }
}

// ── CSV EXPORT / IMPORT ──
function exportLeadsCSV() {
  const leads = state.leads;
  if (!leads.length) { toast('No leads to export'); return; }
  const headers = ['Name','Status','Phone','WhatsApp','City','Website','GBP Rank','Reviews','GBP URL','Report','Note','Sale Amount','Follow-up Date','Created At'];
  const rows = leads.map(l => [
    l.name||'', l.status||'', l.phone||'', l.wapp||'', l.city||'', l.website||'',
    l.gbpRank||'', l.reviews||'', l.gbpUrl||'', l.report||'',
    (l.note||'').replace(/,/g,';').replace(/\n/g,' '),
    l.saleAmount||'', l.followupDate||'', l.createdAt ? l.createdAt.slice(0,10) : ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `nexaflow-leads-${todayISO()}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('Exported ' + leads.length + ' leads!');
}

async function importLeadsCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) { toast('CSV is empty'); return; }
  const rows = lines.slice(1);
  let imported = 0, skipped = 0;
  const { supaUrl, supaKey } = state.settings;

  for (const line of rows) {
    const cols = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const name = cols[0]?.replace(/^"|"$/g,'').trim();
    if (!name) { skipped++; continue; }
    if (state.leads.find(l => l.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }

    const lead = {
      id: uid(), name,
      status: cols[1]?.replace(/^"|"$/g,'') || 'not_escalated',
      phone: cols[2]?.replace(/^"|"$/g,'') || '',
      wapp: cols[3]?.replace(/^"|"$/g,'') || '',
      city: cols[4]?.replace(/^"|"$/g,'') || '',
      website: cols[5]?.replace(/^"|"$/g,'') || 'no',
      gbp_rank: cols[6]?.replace(/^"|"$/g,'') || '',
      reviews: cols[7]?.replace(/^"|"$/g,'') || '',
      gbp_url: cols[8]?.replace(/^"|"$/g,'') || '',
      report: cols[9]?.replace(/^"|"$/g,'') || 'no',
      note: cols[10]?.replace(/^"|"$/g,'') || '',
      sale_amount: parseFloat(cols[11]) || 0,
      followup_date: cols[12]?.replace(/^"|"$/g,'') || null,
      created_at: nowISOString(), user_email: state.user?.email || ''
    };

    if (supaKey) {
      try {
        const res = await fetch(`${supaUrl}/rest/v1/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey, 'Prefer': 'return=minimal' },
          body: JSON.stringify(lead)
        });
        if (!res.ok) { skipped++; continue; }
      } catch(e) { skipped++; continue; }
    }

    state.leads.push({ id: lead.id, name: lead.name, status: lead.status, phone: lead.phone, wapp: lead.wapp, city: lead.city, website: lead.website, gbpRank: lead.gbp_rank, gbpUrl: lead.gbp_url, reviews: lead.reviews, report: lead.report, note: lead.note, saleAmount: lead.sale_amount, followupDate: lead.followup_date, createdAt: lead.created_at, userEmail: lead.user_email });
    imported++;
  }

  input.value = '';
  save(); renderLeads(); renderHome();
  toast(`Imported ${imported} leads${skipped ? ', skipped ' + skipped + ' duplicates' : ''}!`);
}

// ── SALES CHART ──
let salesChartInstance = null;
let chartYear = new Date().getFullYear();

function changeChartYear(dir) {
  chartYear += dir;
  document.getElementById('chart-year-label').textContent = chartYear;
  renderSalesChart();
}

function renderSalesChart() {
  const sales = state.sales || [];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('chart-year-label').textContent = chartYear;
  const monthlyTotals = Array(12).fill(0);
  const monthlyCounts = Array(12).fill(0);
  sales.forEach(s => {
    if (!s.date) return;
    const d = new Date(s.date);
    if (d.getFullYear() !== chartYear) return;
    const m = d.getMonth();
    monthlyTotals[m] += s.amount || 0;
    monthlyCounts[m]++;
  });
  const currentMonth = new Date().getFullYear() === chartYear ? new Date().getMonth() : -1;
  const totalYear = monthlyTotals.reduce((a, b) => a + b, 0);
  const bestMonth = monthlyTotals.indexOf(Math.max(...monthlyTotals));
  document.getElementById('chart-summary').innerHTML = `
    <div style="padding:10px 16px;background:var(--accent-soft);border:1px solid var(--accent)22;border-radius:10px;flex:1;min-width:120px">
      <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Year Total</div>
      <div style="font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--accent);margin-top:2px">₹${fmtNum(totalYear)}</div>
    </div>
    <div style="padding:10px 16px;background:var(--green-soft);border:1px solid var(--green)22;border-radius:10px;flex:1;min-width:120px">
      <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Best Month</div>
      <div style="font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--green);margin-top:2px">${monthlyTotals[bestMonth] > 0 ? months[bestMonth] : '—'}</div>
    </div>
    <div style="padding:10px 16px;background:var(--amber-soft);border:1px solid var(--amber)22;border-radius:10px;flex:1;min-width:120px">
      <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Avg/Month</div>
      <div style="font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--amber);margin-top:2px">₹${fmtNum(totalYear / 12)}</div>
    </div>
    <div style="padding:10px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;flex:1;min-width:120px">
      <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Total Deals</div>
      <div style="font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--text);margin-top:2px">${monthlyCounts.reduce((a,b) => a+b, 0)}</div>
    </div>`;

  const canvas = document.getElementById('sales-bar-chart');
  if (!canvas) return;
  canvas.style.width = '100%'; canvas.style.height = '220px';
  const ctx = canvas.getContext('2d');
  if (salesChartInstance) { salesChartInstance.destroy(); salesChartInstance = null; }

  const barColors = monthlyTotals.map((_, i) =>
    i === currentMonth ? '#4f8ef7' : monthlyTotals[i] === Math.max(...monthlyTotals) && monthlyTotals[i] > 0 ? '#22c55e' : '#4f8ef740'
  );

  salesChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Revenue', data: monthlyTotals, backgroundColor: barColors, borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: 'rgba(19,22,30,0.95)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#f1f5f9', bodyColor: '#94a3b8', padding: 10, cornerRadius: 8, displayColors: false, callbacks: { label: ctx => ` ₹${fmtNum(ctx.raw)} · ${monthlyCounts[ctx.dataIndex]} deal${monthlyCounts[ctx.dataIndex] !== 1 ? 's' : ''}` } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#4a5568', font: { size: 11, family: "'DM Sans', sans-serif" } } },
        y: { grid: { color: '#ffffff08' }, border: { display: false }, ticks: { color: '#4a5568', font: { size: 11 }, callback: v => '₹' + fmtNum(v) } }
      }
    }
  });
}

// ── COIN ANIMATION ──
function triggerCoinAnimation() {
  const coin = document.getElementById('coin-float');
  if (!coin) return;
  coin.style.animation = 'none'; coin.offsetHeight;
  coin.style.animation = 'coinFloat 0.8s ease-out forwards';
}

// ── LEADS STATS ──
async function renderLeadsStats() {
  const today = todayISO();
  const addedToday = state.leads.filter(l => l.createdAt && l.createdAt.slice(0,10) === today);
  const addedEl = document.getElementById('leads-added-today');
  const addedSubEl = document.getElementById('leads-added-today-sub');
  if (addedEl) addedEl.textContent = addedToday.length;
  if (addedSubEl) addedSubEl.textContent = addedToday.length === 1 ? '1 lead added' : addedToday.length + ' leads added';

  const { supaUrl, supaKey } = state.settings;
  if (supaKey) {
    try {
      const res = await fetch(`${supaUrl}/rest/v1/lead_escalations?escalated_at=gte.${today}T00:00:00&order=escalated_at.desc`, { headers: { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey } });
      if (res.ok) {
        const rows = await res.json();
        const escEl = document.getElementById('leads-escalated-today');
        const escSubEl = document.getElementById('leads-escalated-today-sub');
        if (escEl) escEl.textContent = rows.length;
        if (escSubEl) escSubEl.textContent = rows.length === 1 ? '1 lead escalated' : rows.length + ' leads escalated';
      }
    } catch(e) { console.error('Escalation fetch error:', e); }
  }
}

// ── ACTION PAGE ──
function renderActionPage() {
  const staleLeads = state.leads
    .filter(l => l.status !== 'suspended' && l.status !== 'converted' && getAgingDays(l) >= 5)
    .sort((a, b) => getAgingDays(b) - getAgingDays(a));

  const critical = staleLeads.filter(l => getAgingDays(l) >= 10);
  const warning  = staleLeads.filter(l => getAgingDays(l) >= 5 && getAgingDays(l) < 10);

  document.getElementById('action-critical').textContent = critical.length;
  document.getElementById('action-warning').textContent  = warning.length;
  document.getElementById('action-total').textContent    = staleLeads.length;
  document.getElementById('action-last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});

  updateActionBadge(staleLeads.length);
  const tb = document.getElementById('action-tbody');

  if (!staleLeads.length) {
    tb.innerHTML = `<tr><td colspan="7"><div class="empty-state"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg><p style="color:var(--green);font-weight:600">All leads are active! No stale leads.</p></div></td></tr>`;
    return;
  }

  tb.innerHTML = staleLeads.map(l => {
    const days = getAgingDays(l);
    const isCritical = days >= 10;
    const rowBg = isCritical ? 'background:rgba(239,68,68,0.05);' : 'background:rgba(245,158,11,0.04);';
    const badgeColor = isCritical ? 'background:rgba(239,68,68,0.15);color:#ef4444;' : 'background:rgba(245,158,11,0.15);color:#f59e0b;';
    const badgeIcon = isCritical ? '🔴' : '🟡';
    return `
      <tr style="${rowBg}cursor:context-menu" oncontextmenu="openStatusMenu(event,'${l.id}')">
        <td class="td-name">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:6px;height:36px;border-radius:3px;flex-shrink:0;background:${isCritical ? '#ef4444' : '#f59e0b'}"></div>
            <div>
              <div style="font-weight:600;color:var(--text)">${esc(l.name)}${l.timing ? `<span style="font-size:11px;color:var(--accent);font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px">⏱ ${esc(l.timing)}</span>` : ''}</div>
              ${l.note ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.note)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><span class="status-pill ${statusClass(l.status)}">${statusLabel(l.status)}</span></td>
        <td><span style="font-size:12px;font-weight:700;padding:3px 8px;border-radius:20px;${badgeColor}">${badgeIcon} ${days}d</span></td>
        <td>${l.phone ? `<a href="tel:${esc(l.phone)}" style="color:var(--text2);text-decoration:none">${esc(l.phone)}</a>` : '—'}</td>
        <td>${l.city ? esc(l.city) : '—'}</td>
        <td>
          <div class="row-actions">
            ${l.wapp ? `<a href="https://wa.me/${l.wapp.replace(/\D/g,'')}" target="_blank" class="icon-link wapp">${wappSVG()}</a>` : ''}
            ${l.gbpUrl ? `<a href="${l.gbpUrl}" target="_blank" rel="noopener noreferrer" class="icon-link gbp">${googleSVG()}</a>` : ''}
          </div>
        </td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" onclick="editLead('${l.id}')" title="Edit lead">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${l.wapp ? `<a href="https://wa.me/${l.wapp.replace(/\D/g,'')}" target="_blank" class="btn btn-success" style="padding:4px 10px;font-size:11.5px;text-decoration:none">WhatsApp</a>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function refreshActionPage() { renderActionPage(); toast('Action page refreshed'); }

function updateActionBadge(count) {
  const badge = document.getElementById('action-nav-badge');
  const btn   = document.getElementById('action-nav-btn');
  if (!badge || !btn) return;
  if (count > 0) {
    badge.textContent = count; badge.style.display = '';
    btn.style.color = '#ef4444'; btn.style.background = 'rgba(239,68,68,0.08)';
  } else {
    badge.style.display = 'none'; btn.style.color = ''; btn.style.background = '';
  }
}

// ── FUNNEL PAGE ──
function renderFunnelPage() {
  const el = document.getElementById('funnel-section');
  if (!el) return;
  const leads = state.leads || [];
  const total = leads.length;

  const stages = [
    { key: 'not_escalated', label: 'Not Escalated', color: '#94a3b8', icon: '📋' },
    { key: 'outreach_wapp', label: 'Outreach (Wapp)', color: '#22c55e', icon: '💬' },
    { key: 'outreach_call', label: 'Outreach (Call)', color: '#3b82f6', icon: '📞' },
    { key: 'unresponsive',   label: 'Unresponsive',    color: '#ffb300', icon: '🔍' },
    { key: 'followup',      label: 'Follow-up',      color: '#06b6d4', icon: '📅' },
    { key: 'payment',       label: 'Payment',        color: '#8b5cf6', icon: '💳' },
    { key: 'converted',     label: 'Converted',      color: '#22c55e', icon: '✅' },
  ];

  const counts = stages.map(s => ({ ...s, count: leads.filter(l => l.status === s.key).length }));
  const maxCount = Math.max(...counts.map(s => s.count), 1);
  const converted = counts.find(s => s.key === 'converted')?.count || 0;
  const convRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0';
  const active = leads.filter(l => l.status !== 'suspended' && l.status !== 'converted').length;

  let html = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:28px">
      <div style="padding:16px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Total Leads</div>
        <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--text)">${total}</div>
      </div>
      <div style="padding:16px;background:var(--green-soft);border:1px solid var(--green)33;border-radius:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Converted</div>
        <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--green)">${converted} <span style="font-size:14px;font-weight:500">(${convRate}%)</span></div>
      </div>
      <div style="padding:16px;background:var(--accent-soft);border:1px solid var(--accent)33;border-radius:12px;text-align:center">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">In Pipeline</div>
        <div style="font-family:var(--font-head);font-size:28px;font-weight:800;color:var(--accent)">${active}</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">`;

  counts.forEach((s, i) => {
    const barPct = maxCount > 0 ? Math.max(4, Math.round((s.count / maxCount) * 100)) : 4;
    const funnelWidth = Math.max(30, Math.round(100 - (i * (70 / counts.length))));
// find last non-zero previous stage
let prevCount = null;
for (let j = i - 1; j >= 0; j--) {
  if (counts[j].count > 0) { prevCount = counts[j].count; break; }
}
const dropoff = prevCount !== null && prevCount > 0 ? Math.round(((prevCount - s.count) / prevCount) * 100) : null;
    const dropoffColor = dropoff > 60 ? '#ef4444' : dropoff > 30 ? '#f59e0b' : '#22c55e';
    html += `
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:160px;flex-shrink:0;text-align:right">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${s.icon} ${s.label}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${s.count} leads</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;justify-content:center">
            <div style="width:${funnelWidth}%;background:${s.color}22;border:1.5px solid ${s.color}55;border-radius:8px;overflow:hidden;height:40px;position:relative;transition:all .3s ease;">
              <div style="height:100%;width:${barPct}%;background:linear-gradient(90deg,${s.color}99,${s.color});border-radius:6px;display:flex;align-items:center;padding-left:12px;min-width:48px;">
                <span style="font-family:var(--font-head);font-size:15px;font-weight:800;color:#fff;white-space:nowrap">${s.count}</span>
              </div>
              <div style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;color:${s.color};font-weight:600">${total > 0 ? Math.round(s.count / total * 100) : 0}%</div>
            </div>
          </div>
        </div>
        <div style="width:90px;flex-shrink:0;text-align:left">
          ${dropoff !== null ? `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;background:${dropoffColor}15;color:${dropoffColor};border:1px solid ${dropoffColor}33">${dropoff > 0 ? '▼ ' + dropoff + '% drop' : '▲ gain'}</span>` : '<span style="font-size:11px;color:var(--text3)">Top of funnel</span>'}
        </div>
      </div>
      ${i < counts.length - 1 ? `<div style="display:flex;align-items:center;gap:16px;padding-left:176px"><div style="color:var(--text3);font-size:18px;opacity:0.4">↓</div></div>` : ''}`;
  });

  html += `</div>
    <div style="margin-top:24px;padding:14px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;font-size:12px;color:var(--text3)">
      💡 <strong style="color:var(--text2)">Tip:</strong> Right-click any lead in the Leads page to quickly change its status and move it through the funnel.
    </div>`;

  el.innerHTML = html;
}

// ── REMINDER ──
function toggleReminderOption() {
  const toggle = document.getElementById('reminder-toggle');
  const options = document.getElementById('reminder-options');
  const isOn = toggle.classList.toggle('on');
  options.style.display = isOn ? '' : 'none';
  if (!isOn) {
    document.getElementById('call-reminder-mins').value = '';
    document.querySelectorAll('.reminder-chip').forEach(c => c.classList.remove('selected'));
  }
}

function selectReminder(mins) {
  document.getElementById('call-reminder-mins').value = mins;
  document.querySelectorAll('.reminder-chip').forEach(c => {
    c.classList.toggle('selected', parseInt(c.dataset.val) === mins);
  });
}

// ── CALL REMINDER POPUP ──
function checkCallReminders() {
  if (!state.user) return;
  const now = nowIST();
  const todayStr = now.getUTCFullYear() + '-' + String(now.getUTCMonth()+1).padStart(2,'0') + '-' + String(now.getUTCDate()).padStart(2,'0');
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  state.calls.forEach(c => {
    if (c.done) return;
    if (c.date !== todayStr) return;
    if (!c.time) return;
    const [ch, cm] = c.time.split(':').map(Number);
    const callMinutes = ch * 60 + cm;
    const reminderMins = c.reminder_mins ? parseInt(c.reminder_mins) : 0;
    const targetMinutes = callMinutes - reminderMins;
    // minute window so it never gets missed
  const catchWindow = reminderMins >= 60 ? 10 : reminderMins >= 30 ? 8 : reminderMins >= 15 ? 6 : 5;
if (nowMinutes < targetMinutes || nowMinutes > targetMinutes + catchWindow) return;
    const alreadyFired = sessionStorage.getItem('call_alerted_' + c.id + '_' + targetMinutes);
    if (alreadyFired) return;
    sessionStorage.setItem('call_alerted_' + c.id + '_' + targetMinutes, '1');
    showCallReminderPopup(c, reminderMins);
  });
}

// ── TASK REMINDER ──
function checkTaskReminders() {
  if (!state.user) return;
  const now = nowIST();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  
  // Only between 9AM and 9PM IST (IST = UTC+5:30, so 9AM IST = 3:30 UTC, 9PM IST = 15:30 UTC)
  const totalMinsUTC = hours * 60 + minutes;
  const istMins = totalMinsUTC + 330; // +5:30
  const istHour = Math.floor((istMins % 1440) / 60);
  if (istHour < 9 || istHour >= 21) return;

  const today = todayISO();
  state.tasks.forEach(t => {
    if (t.done) return;
    if (t.date && t.date !== today) return;

    const intervalMins = t.priority === 'high' ? 30 : t.priority === 'low' ? 120 : 60;
    const key = `task_reminded_${t.id}_${Math.floor((hours * 60 + minutes) / intervalMins)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    showTaskReminderPopup(t);
  });
}

function showTaskReminderPopup(task) {
  const intervalLabel = task.priority === 'high' ? '30 min' : task.priority === 'low' ? '2 hr' : '1 hr';
  sendTelegramNotification(
    '✅ <b>Task Reminder</b>\n\n' +
    '📋 <b>' + task.title + '</b>\n' +
    '🎯 Priority: ' + (task.priority || 'normal') + ' · every ' + intervalLabel + '\n' +
    (task.note ? '📝 ' + task.note : '')
  );
  const existing = document.getElementById('task-reminder-popup');
  if (existing) existing.remove();

  const priorityColor = task.priority === 'high' ? 'var(--red)' : task.priority === 'low' ? 'var(--text3)' : 'var(--accent)';
  const priorityBg = task.priority === 'high' ? 'var(--red-soft)' : task.priority === 'low' ? 'var(--surface2)' : 'var(--accent-soft)';

  const popup = document.createElement('div');
  popup.id = 'task-reminder-popup';
  popup.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99990;width:300px;background:var(--surface);border:1.5px solid ${priorityColor};border-radius:16px;box-shadow:0 8px 32px #00000080;padding:16px 18px;opacity:0;transform:translateY(20px);transition:all .25s cubic-bezier(.16,1,.3,1);font-family:var(--font-body);`;

  popup.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="width:36px;height:36px;border-radius:10px;background:${priorityBg};border:1px solid ${priorityColor}33;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg fill="none" stroke="${priorityColor}" viewBox="0 0 24 24" style="width:18px;height:18px;stroke-width:2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${priorityColor};margin-bottom:3px">
          ${task.priority === 'high' ? '🔴' : task.priority === 'low' ? '⚪' : '🔵'} ${task.priority} priority · every ${intervalLabel}
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(task.title)}</div>
        ${task.note ? `<div style="font-size:11.5px;color:var(--text3);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📝 ${esc(task.note)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px">
          <button onclick="markTaskDoneFromReminder('${task.id}')" style="flex:1;padding:6px 10px;background:${priorityColor};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:var(--font-body)">✓ Done</button>
          <button onclick="dismissTaskReminder()" style="flex:1;padding:6px 10px;background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:var(--font-body)">Dismiss</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(popup);
  requestAnimationFrame(() => { popup.style.opacity = '1'; popup.style.transform = 'translateY(0)'; });
  setTimeout(() => dismissTaskReminder(), 10000);
}

function dismissTaskReminder() {
  const popup = document.getElementById('task-reminder-popup');
  if (!popup) return;
  popup.style.opacity = '0';
  popup.style.transform = 'translateY(20px)';
  setTimeout(() => popup.remove(), 250);
}

function markTaskDoneFromReminder(id) {
  dismissTaskReminder();
  toggleTask(id);
  toast('✅ Task marked as done!');
}

function showCallReminderPopup(call, reminderMins) {
  sendTelegramNotification(
    '📞 <b>Call Reminder</b>\n\n' +
    '👤 <b>' + call.name + '</b>\n' +
    '⏰ Time: ' + (call.time || '—') + '\n' +
    '📱 Phone: ' + (call.phone || '—') + '\n' +
    (call.note ? '📝 ' + call.note + '\n' : '') +
    (reminderMins > 0 ? '⏱ ' + reminderMins + ' min before call' : '🔔 Call is now!')
  );
  const existing = document.getElementById('call-reminder-popup');
  if (existing) existing.remove();
  const popup = document.createElement('div');
  popup.id = 'call-reminder-popup';
  popup.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.85);z-index:99999;width:360px;max-width:94vw;background:var(--surface);border:1.5px solid var(--accent);border-radius:20px;box-shadow:0 0 0 4px #4f8ef722, 0 24px 64px #00000090;padding:32px 28px;text-align:center;opacity:0;transition:all .25s cubic-bezier(.16,1,.3,1);font-family:var(--font-body);`;
  const phone = call.phone ? call.phone.replace(/\D/g,'') : '';

  popup.innerHTML = `
    <div style="margin-bottom:18px;position:relative;display:inline-block">
      <div id="crp-ring1" style="position:absolute;inset:-12px;border-radius:50%;border:2px solid var(--accent);opacity:0;animation:ringPulse 1.2s ease-out infinite"></div>
      <div id="crp-ring2" style="position:absolute;inset:-24px;border-radius:50%;border:2px solid var(--accent);opacity:0;animation:ringPulse 1.2s ease-out .4s infinite"></div>
      <div style="width:64px;height:64px;background:var(--accent-soft);border:2px solid var(--accent)44;border-radius:50%;display:flex;align-items:center;justify-content:center;animation:phoneBounce .5s ease-in-out infinite alternate">
        <svg fill="none" stroke="var(--accent)" viewBox="0 0 24 24" style="width:28px;height:28px;stroke-width:2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
      </div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Tring... Tring...🔔</div>
    <div style="font-family:var(--font-head);font-size:22px;font-weight:800;color:var(--text);margin-bottom:6px;line-height:1.2">It's time to call<br><span style="color:var(--accent)">${esc(call.name)}</span></div>
    ${call.note ? `<div style="font-size:13px;color:var(--text3);margin-bottom:6px;padding:8px 12px;background:var(--surface2);border-radius:8px">📝 ${esc(call.note)}</div>` : ''}
    <div style="font-size:13px;color:var(--text2);margin-bottom:24px">⏰ ${reminderMins > 0 ? `Reminder: <strong style="color:var(--amber)">${reminderMins} min</strong> before · ` : ''}Call at <strong style="color:var(--text)">${call.time}</strong>${call.phone ? ` · <span style="color:var(--text3)">${esc(call.phone)}</span>` : ''}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${phone ? `<a href="tel:${phone}" onclick="dismissCallReminder('${call.id}',true)" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--accent);color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;transition:all .18s" onmouseover="this.style.background='#3b7fe3'" onmouseout="this.style.background='var(--accent)'">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:16px;height:16px;stroke-width:2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6z"/></svg>
        Call Now
      </a>` : ''}
      ${call.wapp || call.phone ? `<a href="https://wa.me/${(call.wapp || call.phone).replace(/\D/g,'')}" target="_blank" onclick="dismissCallReminder('${call.id}',false)" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;background:var(--green-soft);color:var(--green);border:1px solid var(--green)33;border-radius:12px;text-decoration:none;font-weight:600;font-size:13px;transition:all .18s">WhatsApp Instead</a>` : ''}
      <div style="display:flex;gap:8px">
        <button onclick="snoozeCallReminder('${call.id}', 5)" style="flex:1;padding:9px;background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber)33;border-radius:10px;cursor:pointer;font-size:12.5px;font-weight:600;font-family:var(--font-body);transition:all .18s">⏱ Snooze 5m</button>
        <button onclick="dismissCallReminder('${call.id}', false)" style="flex:1;padding:9px;background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:12.5px;font-weight:600;font-family:var(--font-body);transition:all .18s">Dismiss</button>
      </div>
    </div>`;

  document.body.appendChild(popup);
  requestAnimationFrame(() => { popup.style.opacity = '1'; popup.style.transform = 'translate(-50%,-50%) scale(1)'; });
  playTringSound();

  const backdrop = document.createElement('div');
  backdrop.id = 'call-reminder-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:#00000070;z-index:99998;backdrop-filter:blur(3px)';
  document.body.appendChild(backdrop);
}

function dismissCallReminder(callId, markDone) {
  const popup = document.getElementById('call-reminder-popup');
  const backdrop = document.getElementById('call-reminder-backdrop');
  if (popup) { popup.style.opacity = '0'; popup.style.transform = 'translate(-50%,-50%) scale(0.9)'; setTimeout(() => popup.remove(), 200); }
  if (backdrop) backdrop.remove();
  if (markDone) toggleCall(callId);
}

function snoozeCallReminder(callId, minutes) {
  dismissCallReminder(callId, false);
  toast(`⏱ Snoozed for ${minutes} min`);
  setTimeout(() => {
    const call = state.calls.find(c => c.id === callId);
    if (call) showCallReminderPopup(call);
  }, minutes * 60 * 1000);
}

function playTringSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    function beep(freq, start, dur) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
    }
    beep(880, 0, 0.15); beep(660, 0.05, 0.15);
    beep(880, 0.22, 0.15); beep(660, 0.27, 0.15);
  } catch(e) { /* audio not supported */ }
}
//schedule call for contacts

function scheduleCallFromContact(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  openCallModal();
  setTimeout(() => {
    document.getElementById('call-name').value = c.name || '';
    document.getElementById('call-phone').value = c.phone || c.wapp || '';
  }, 50);
}

setInterval(checkCallReminders, 15000);
setInterval(checkTaskReminders, 60000); // checks every 1 min