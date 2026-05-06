// ── REALTIME SYNC ──
let _realtimeChannels = [];
let _wsConnected = false;

function startAutoRefresh() {
  // Fallback polling — only fires every 10 min if WebSocket is dead
  setInterval(async () => {
    if (!state.user || _wsConnected) return;
    await fetchAllFromSupabase();
    _reRenderAll();
  }, 600000);

  initRealtimeSync();
}

function initRealtimeSync() {
  const { supaUrl, supaKey } = state.settings;
  if (!supaUrl || !supaKey) return;

  _realtimeChannels.forEach(ch => { try { ch.close(); } catch(e) {} });
  _realtimeChannels = [];

  ['leads', 'sales', 'tasks', 'calls', 'contacts'].forEach(table => {
    _realtimeChannels.push(subscribeToTable(supaUrl, supaKey, table));
  });
}

function subscribeToTable(supaUrl, supaKey, table) {
  const wsUrl = supaUrl.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + supaKey + '&vsn=1.0.0';
  let ws, heartbeatTimer, reconnectTimer, ref = 1;

  function connect() {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        updateRealtimeStatus(false);

        ws.send(JSON.stringify({
          topic: `realtime:public:${table}`,
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [{ event: '*', schema: 'public', table }]
            }
          },
          ref: String(ref++)
        }));

        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref++) }));
          }
        }, 30000);
      };

ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.event === 'phx_reply' && msg.payload?.status === 'ok' && msg.topic?.startsWith('realtime:')) {
      _wsConnected = true;
      updateRealtimeStatus(true);
    }
    handleRealtimeMessage(msg, table);
  } catch(e) {}
};

      ws.onerror = () => {
        _wsConnected = false;
        updateRealtimeStatus(false);
      };

      ws.onclose = () => {
        _wsConnected = false;
        updateRealtimeStatus(false);
        clearInterval(heartbeatTimer);
        reconnectTimer = setTimeout(connect, 5000);
      };

    } catch(e) {
      console.error('WebSocket connect error:', e);
      reconnectTimer = setTimeout(connect, 10000);
    }
  }

  connect();
  return { close() { clearInterval(heartbeatTimer); clearTimeout(reconnectTimer); if (ws) ws.close(); } };
}

async function handleRealtimeMessage(msg, table) {
  const payload = msg.payload;
  const changeType = payload?.data?.type || payload?.type || msg.event;
  if (!changeType || !['INSERT', 'UPDATE', 'DELETE'].includes(changeType)) return;

  await refetchTable(table);
  _reRenderForTable(table);
}

async function refetchTable(table) {
  const { supaUrl, supaKey } = state.settings;
  if (!supaKey) return;
  const headers = { 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey };

  try {
    if (table === 'leads') {
      const res = await fetch(`${supaUrl}/rest/v1/leads?order=created_at.desc`, { headers });
      if (res.ok) {
        state.leads = (await res.json()).map(r => ({
          id: r.id, name: r.name, city: r.city, phone: r.phone, wapp: r.wapp,
          website: r.website, report: r.report, gbpRank: r.gbp_rank, gbpUrl: r.gbp_url,
          reviews: r.reviews, note: r.note, status: r.status, saleAmount: r.sale_amount,
          convertedAt: r.converted_at, followupDate: r.followup_date || '',
          timing: r.timing || '', followupNote: r.followup_note || '',
          followupTime: r.followup_time || '', followupType: r.followup_type || '',
          followupAmount: r.followup_amount || 0,
          createdAt: r.created_at, statusChangedAt: r.status_changed_at || r.created_at,
          userEmail: r.user_email
        }));
      }
    } else if (table === 'sales') {
      const res = await fetch(`${supaUrl}/rest/v1/sales?order=created_at.desc&limit=1000`, { headers });
      if (res.ok) {
        state.sales = (await res.json()).map(r => ({
          id: r.id, lead_id: r.lead_id, lead_name: r.lead_name,
          amount: Number(r.amount) || 0, transaction_id: r.transaction_id || '',
          date: r.date, note: r.note || '', created_at: r.created_at, user_email: r.user_email
        }));
      }
    } else if (table === 'tasks') {
      const res = await fetch(`${supaUrl}/rest/v1/tasks?order=created_at.asc`, { headers });
      if (res.ok) {
        state.tasks = (await res.json()).map(r => ({
          id: r.id, title: r.title, date: r.date, priority: r.priority || 'normal',
          note: r.note || '', done: r.done || false, createdAt: r.created_at
        }));
      }
    } else if (table === 'calls') {
      const res = await fetch(`${supaUrl}/rest/v1/calls?order=date.asc`, { headers });
      if (res.ok) {
        state.calls = (await res.json()).map(r => ({
          id: r.id, name: r.name, phone: r.phone || '', time: r.time || '',
          note: r.note || '', date: r.date, done: r.done || false,
          createdAt: r.created_at, reminder_mins: r.reminder_mins || null
        }));
      }
    } else if (table === 'contacts') {
      const res = await fetch(`${supaUrl}/rest/v1/contacts?order=created_at.desc`, { headers });
      if (res.ok) {
        state.contacts = (await res.json()).map(r => ({
          id: r.id, name: r.name, phone: r.phone || '', city: r.city || '',
          wapp: r.wapp || '', note: r.note || '', createdAt: r.created_at, userEmail: r.user_email
        }));
      }
    }
    save();
  } catch(e) {
    console.error('refetchTable error:', e);
  }
}

function _reRenderForTable(table) {
  if (table === 'leads') {
    renderLeads(); renderSuspended(); renderHome(); renderLeadsStats();
    updateActionBadge(state.leads.filter(l =>
      l.status !== 'suspended' && l.status !== 'converted' && getAgingDays(l) >= 5
    ).length);
    const activePage = localStorage.getItem('nexaflow_page');
    if (activePage === 'action') renderActionPage();
    if (activePage === 'funnel') renderFunnelPage();
  } else if (table === 'sales') {
    renderSales(); renderHome();
  } else if (table === 'tasks' || table === 'calls') {
    renderHome();
  } else if (table === 'contacts') {
    renderContacts();
  }
}

function _reRenderAll() {
  renderHome(); renderLeads(); renderLeadsStats();
  renderSuspended(); renderContacts(); renderSales();
}

function updateRealtimeStatus(connected) {
  updateDbStatus(connected);
}