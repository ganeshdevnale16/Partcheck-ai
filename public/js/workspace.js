/* Inspection AI – workspace: role dashboards (demo data), projects & team, alerts.
   Registers with app.js through window.IAX so it can use the app's helpers. */
(window.IAX = window.IAX || []).push((A) => {
  'use strict';
  const { $, $$, esc, uid, LS, toast, show, RENDER, openModal, closeModal, track, state } = A;
  const C = { green: '#86bc25', deep: '#046a38', mid: '#3c8f2a', teal: '#007680', teal2: '#6fc2b4', blue: '#012169', blue2: '#005587', sky: '#62b5e5', grey: '#a7a8aa', dark: '#53565a', red: '#da291c', yellow: '#ffcd00', orange: '#ed8b00' };
  const ROLE_ICON = { Admin: 'AD', 'Safety manager': 'SM', 'Scaffolding inspector': 'SI', 'Safety team': 'ST' };
  const ROLE_SUB = {
    Admin: 'Organisation overview: projects, people, AI usage',
    'Safety manager': 'Site risk, red tags and corrective actions',
    'Scaffolding inspector': 'Your inspections for today',
    'Safety team': 'Actions, follow-ups and re-inspections',
  };

  // ======================= SVG CHARTS =======================
  let W = 560;
  // wide panels get a wider chart so it is not stretched tall
  const wideChart = (fn) => { const old = W; W = window.matchMedia('(min-width: 900px)').matches ? 1000 : 560; try { return fn(); } finally { W = old; } };
  const fmt = (n) => Number(n).toLocaleString('en-IN');
  function axis(h, max, steps = 4) {
    let g = '';
    for (let i = 0; i <= steps; i++) {
      const y = 12 + ((h - 40) * i) / steps;
      g += `<line x1="40" x2="${W - 8}" y1="${y}" y2="${y}" stroke="#e6e6e6"/><text x="34" y="${y + 4}" text-anchor="end" class="ax">${fmt(Math.round(max - (max * i) / steps))}</text>`;
    }
    return g;
  }
  const niceMax = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); return Math.ceil(v / p) * p || 1; };
  function legend(series) { return `<div class="ch-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`; }
  function lineChart({ labels, series }, h = 220) {
    const max = niceMax(Math.max(...series.flatMap((s) => s.values)) * 1.1);
    const x = (i) => 50 + ((W - 84) * i) / Math.max(1, labels.length - 1);
    const y = (v) => 12 + (h - 40) * (1 - v / max);
    let svg = axis(h, max);
    series.forEach((s) => {
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      if (s.area) svg += `<polygon points="${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}" fill="${s.color}" opacity=".12"/>`;
      svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.values.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#fff" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} · ${esc(labels[i])}: ${fmt(v)}</title></circle>`; });
    });
    labels.forEach((l, i) => { if (labels.length <= 8 || i % 2 === 0) svg += `<text x="${x(i)}" y="${h - 10}" text-anchor="middle" class="ax">${esc(l)}</text>`; });
    return `<svg viewBox="0 0 ${W} ${h}" class="chart" role="img">${svg}</svg>${legend(series)}`;
  }
  function barChart({ labels, series, stacked = false }, h = 220) {
    const totals = labels.map((_, i) => (stacked ? series.reduce((n, s) => n + s.values[i], 0) : Math.max(...series.map((s) => s.values[i]))));
    const max = niceMax(Math.max(...totals) * 1.1);
    const slot = (W - 56) / labels.length;
    const bw = stacked ? Math.min(34, slot * 0.6) : Math.min(22, (slot * 0.75) / series.length);
    const y = (v) => (h - 40) * (v / max);
    let svg = axis(h, max);
    labels.forEach((l, i) => {
      const cx = 46 + slot * i + slot / 2;
      let base = h - 28;
      series.forEach((s, k) => {
        const v = s.values[i]; const bh = y(v);
        if (stacked) { svg += `<rect x="${cx - bw / 2}" y="${base - bh}" width="${bw}" height="${Math.max(0, bh)}" fill="${s.color}" rx="2"><title>${esc(s.name)} · ${esc(l)}: ${fmt(v)}</title></rect>`; base -= bh; }
        else { const bx = cx - (bw * series.length) / 2 + k * bw; svg += `<rect x="${bx + 1}" y="${h - 28 - bh}" width="${bw - 2}" height="${Math.max(0, bh)}" fill="${s.color}" rx="2"><title>${esc(s.name)} · ${esc(l)}: ${fmt(v)}</title></rect>`; }
      });
      svg += `<text x="${cx}" y="${h - 10}" text-anchor="middle" class="ax">${esc(l)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${h}" class="chart" role="img">${svg}</svg>${series.length > 1 ? legend(series) : ''}`;
  }
  function hbar(items, unit = '') {
    const max = Math.max(...items.map((i) => i.value), 1);
    return `<div class="hbars">${items.map((i) => `<div class="hb"><span class="hb-l">${esc(i.label)}</span><span class="hb-t"><i style="width:${(i.value / max) * 100}%;background:${i.color || C.teal}"></i></span><b>${fmt(i.value)}${unit}</b></div>`).join('')}</div>`;
  }
  function donut(items, center, sub = '') {
    const total = items.reduce((n, i) => n + i.value, 0) || 1;
    let a = -Math.PI / 2, svg = '';
    const R = 70, r = 46, cx = 90, cy = 90;
    items.forEach((it) => {
      const ang = (it.value / total) * Math.PI * 2;
      if (it.value <= 0) return;
      const a2 = a + ang - 0.0001, big = ang > Math.PI ? 1 : 0;
      const p = (rad, ang2) => `${cx + rad * Math.cos(ang2)},${cy + rad * Math.sin(ang2)}`;
      svg += `<path d="M${p(R, a)} A${R},${R} 0 ${big} 1 ${p(R, a2)} L${p(r, a2)} A${r},${r} 0 ${big} 0 ${p(r, a)} Z" fill="${it.color}"><title>${esc(it.label)}: ${fmt(it.value)}</title></path>`;
      a += ang;
    });
    return `<div class="donut"><svg viewBox="0 0 180 180" role="img">${svg}<text x="90" y="88" text-anchor="middle" class="dn-c">${esc(center)}</text><text x="90" y="106" text-anchor="middle" class="ax">${esc(sub)}</text></svg>
      <ul>${items.map((i) => `<li><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${fmt(i.value)}</b><small>${Math.round((i.value / total) * 100)}%</small></li>`).join('')}</ul></div>`;
  }
  function spark(values, color = C.teal) {
    const max = Math.max(...values), min = Math.min(...values);
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80},${22 - ((v - min) / Math.max(1, max - min)) * 18}`).join(' ');
    return `<svg viewBox="0 0 80 24" class="spark"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  const kpi = (k) => `<div class="kpi2 ${k.tone || ''}"><div class="kpi2-top"><span>${esc(k.label)}</span>${k.spark ? spark(k.spark, k.color) : ''}</div><b>${esc(k.value)}</b>${k.delta ? `<small class="${k.good === false ? 'bad' : 'good'}">${esc(k.delta)}</small>` : k.note ? `<small>${esc(k.note)}</small>` : ''}</div>`;
  const panel = (title, body, cls = '', sub = '') => `<section class="panel ${cls}"><header><h3>${esc(title)}</h3>${sub ? `<span>${esc(sub)}</span>` : ''}</header>${body}</section>`;
  const table = (head, rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const pill = (text, tone) => `<span class="st-pill ${tone}">${esc(text)}</span>`;
  const weeks = (n) => [...Array(n)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i) * 7); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); });
  const days = (n) => [...Array(n)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2) + ' ' + d.getDate(); });

  // ======================= ROLE DASHBOARDS (demo data) =======================
  function dashAdmin() {
    const projects = getProjects();
    const members = projects.reduce((n, p) => n + p.members.length, 0);
    return `<div class="kpi2-grid" style="--kc:3">
        ${kpi({ label: 'Active projects', value: projects.filter((p) => p.status === 'Active').length, note: `${projects.length} in total`, spark: [2, 2, 3, 3, 3, 3], color: C.teal })}
        ${kpi({ label: 'Team members', value: members, delta: '+3 this month', spark: [9, 11, 12, 14, 15, members], color: C.blue2 })}
        ${kpi({ label: 'Inspections (30 days)', value: '412', delta: '+12% vs last month', spark: [70, 82, 88, 79, 95, 101, 104, 112], color: C.green })}
        ${kpi({ label: 'Pass rate', value: '81%', delta: '+4 pts', spark: [72, 75, 74, 78, 77, 81], color: C.deep, tone: 'go' })}
        ${kpi({ label: 'AI checks this month', value: '2,486', note: 'Gemini 61% · Azure 39%', spark: [300, 420, 380, 510, 560, 316], color: C.sky })}
        ${kpi({ label: 'Open alerts', value: String(alertsFor('Admin').filter((a) => !isRead(a)).length), note: 'Across all roles', tone: 'stop' })}
      </div>
      <div class="dash-grid">
        ${panel('Inspections per week', wideChart(() => lineChart({ labels: weeks(10), series: [{ name: 'Inspections', color: C.teal, area: true, values: [68, 74, 81, 77, 90, 96, 88, 101, 104, 112] }, { name: 'Red tags', color: C.red, values: [9, 8, 11, 7, 9, 6, 8, 5, 7, 4] }] }, 200)), 'wide', 'Last 10 weeks')}
        ${panel('Result mix', donut([{ label: 'Green', value: 334, color: C.deep }, { label: 'Yellow', value: 46, color: C.yellow }, { label: 'Red', value: 32, color: C.red }], '412', 'inspections'))}
        ${panel('Inspections by project', barChart({ labels: projects.slice(0, 5).map((p) => p.short || p.name.split(' ')[0]), series: [{ name: 'Green', color: C.deep, values: [168, 96, 70, 30, 20].slice(0, projects.length) }, { name: 'Yellow', color: C.yellow, values: [21, 14, 11, 4, 3].slice(0, projects.length) }, { name: 'Red', color: C.red, values: [15, 9, 8, 3, 2].slice(0, projects.length) }], stacked: true }), '', '30 days')}
        ${panel('AI usage by engine', hbar([{ label: 'Google Gemini', value: 1516, color: C.green }, { label: 'Azure OpenAI', value: 970, color: C.blue2 }, { label: 'OpenAI', value: 0, color: C.grey }, { label: 'Claude', value: 0, color: C.grey }]), '', 'AI calls this month')}
        ${panel('Team activity', table(['Member', 'Role', 'Inspections', 'Last active'], [
          ['Rahul Deshmukh', 'Scaffolding inspector', '96', '12 min ago'], ['Amit Shinde', 'Scaffolding inspector', '81', '1 h ago'], ['Neha More', 'Scaffolding inspector', '64', 'Today 09:40'],
          ['Priya Kulkarni', 'Safety manager', '22', 'Today 11:05'], ['Sneha Patil', 'Safety team', '18', 'Yesterday'],
        ]), 'wide', 'Top 5 this month')}
      </div>`;
  }
  function dashManager() {
    return `<div class="kpi2-grid k4">
        ${kpi({ label: 'Red tags open', value: '4', delta: '−2 vs last week', spark: [7, 6, 8, 6, 5, 4], color: C.red, tone: 'stop' })}
        ${kpi({ label: 'Overdue inspections', value: '3', delta: '+1 vs yesterday', good: false, spark: [1, 2, 2, 1, 2, 3], color: C.orange, tone: 'warn' })}
        ${kpi({ label: 'Avg days to close a red tag', value: '2.6', delta: '−0.8 days', spark: [4.1, 3.8, 3.5, 3.2, 3.4, 2.6], color: C.deep })}
        ${kpi({ label: 'Critical findings (30 days)', value: '17', note: '11 closed, 6 open', spark: [3, 5, 2, 4, 3], color: C.blue2 })}
      </div>
      <div class="dash-grid">
        ${panel('Weekly results', wideChart(() => barChart({ labels: weeks(8), series: [{ name: 'Green', color: C.deep, values: [61, 66, 70, 64, 78, 80, 74, 86] }, { name: 'Yellow', color: C.yellow, values: [9, 8, 10, 12, 8, 9, 7, 8] }, { name: 'Red', color: C.red, values: [8, 11, 7, 9, 6, 8, 5, 4] }], stacked: true }, 200)), 'wide', 'All sites')}
        ${panel('Corrective actions', donut([{ label: 'Open', value: 14, color: C.red }, { label: 'In progress', value: 9, color: C.yellow }, { label: 'Awaiting re-check', value: 6, color: C.sky }, { label: 'Closed', value: 58, color: C.deep }], '87', 'actions'))}
        ${panel('Findings by category', hbar([{ label: 'Edge protection (rails, toe boards)', value: 23, color: C.red }, { label: 'Access & ladders', value: 17, color: C.orange }, { label: 'Base & foundation', value: 12, color: C.teal }, { label: 'Ties to structure', value: 9, color: C.blue2 }, { label: 'Tags & documentation', value: 8, color: C.grey }, { label: 'Platform boarding', value: 6, color: C.dark }]), '', '30 days')}
        ${panel('Site risk ranking', table(['Site / area', 'Open reds', 'Overdue', 'Risk'], [
          ['Tower B – north face', '2', '1', pill('High', 'red')], ['Service yard – drain side', '1', '1', pill('High', 'red')], ['Riverside Block C', '1', '0', pill('Medium', 'yellow')],
          ['Tower A – east elevation', '0', '1', pill('Medium', 'yellow')], ['Podium – ramp area', '0', '0', pill('Low', 'green')],
        ]), 'wide')}
      </div>`;
  }
  function dashInspector() {
    const due = state.assets.filter((a) => A.dueInfo(a).due).slice(0, 6);
    const list = due.length ? due.map((a) => { const di = A.dueInfo(a); return `<button type="button" class="route-row" data-asset="${esc(a.id)}"><span class="minitag ${di.tag}">${di.tag === 'NONE' ? '–' : di.tag[0]}</span><span><b>${esc(a.id)}</b><small>${esc(a.location)} · ${esc(di.text)}</small></span><span class="btn btn-hivis btn-sm">Inspect</span></button>`; }).join('') : '<p class="muted">Nothing due right now.</p>';
    return `<div class="kpi2-grid k4">
        ${kpi({ label: 'Due today', value: String(Math.max(due.length, 5)), note: 'Route below', tone: 'warn' })}
        ${kpi({ label: 'Done today', value: '3', delta: 'On track', spark: [0, 1, 1, 2, 3], color: C.deep })}
        ${kpi({ label: 'This week', value: '14', delta: '+3 vs last week', spark: [9, 11, 10, 12, 14], color: C.teal })}
        ${kpi({ label: 'Red tagged by me', value: '2', note: 'This week', tone: 'stop' })}
      </div>
      <div class="dash-grid">
        ${panel("Today's route", `<div class="route">${list}</div>`, 'wide', 'Tags due or red')}
        ${panel('My results (30 days)', donut([{ label: 'Green', value: 71, color: C.deep }, { label: 'Yellow', value: 9, color: C.yellow }, { label: 'Red', value: 8, color: C.red }], '88', 'inspections'))}
        ${panel('My inspections per day', barChart({ labels: days(10), series: [{ name: 'Inspections', color: C.teal, values: [5, 6, 4, 0, 7, 6, 5, 6, 4, 3] }] }))}
        ${panel('Average time per inspection', wideChart(() => lineChart({ labels: weeks(6), series: [{ name: 'Live scan (min)', color: C.green, values: [6.2, 5.8, 5.1, 4.9, 4.4, 4.1] }, { name: 'Photo mode (min)', color: C.blue2, values: [9.5, 9.1, 8.4, 8.6, 7.9, 7.5] }] }, 200)), 'wide')}
      </div>`;
  }
  function dashTeam() {
    return `<div class="kpi2-grid k4">
        ${kpi({ label: 'Open actions', value: '23', delta: '−5 this week', spark: [31, 29, 30, 28, 26, 23], color: C.orange })}
        ${kpi({ label: 'Closed this week', value: '11', delta: '+4 vs last week', spark: [5, 7, 6, 8, 7, 11], color: C.deep, tone: 'go' })}
        ${kpi({ label: 'Overdue actions', value: '5', note: '2 critical', tone: 'stop' })}
        ${kpi({ label: 'Toolbox talks this month', value: '6', note: 'Next: Fri 10:00, Tower B' })}
      </div>
      <div class="dash-grid">
        ${panel('Actions opened vs closed', wideChart(() => lineChart({ labels: weeks(8), series: [{ name: 'Opened', color: C.red, values: [12, 9, 14, 10, 11, 8, 9, 6] }, { name: 'Closed', color: C.deep, area: true, values: [7, 10, 9, 12, 10, 11, 8, 11] }] }, 200)), 'wide')}
        ${panel('Action status', barChart({ labels: ['Open', 'In progress', 'Awaiting re-check', 'Closed (7 d)'], series: [{ name: 'Actions', color: C.teal, values: [14, 9, 6, 11] }] }))}
        ${panel('Actions by project', hbar(getProjects().map((p, i) => ({ label: p.name, value: [12, 7, 4, 2, 1][i] || 1, color: [C.teal, C.blue2, C.green, C.grey, C.dark][i] }))))}
        ${panel('Upcoming re-inspections', table(['Tag', 'Location', 'Due', 'Owner'], [
          ['SC-027', 'Tower B – north face', pill('Today', 'red'), 'Rahul D.'], ['SC-040', 'Service yard', pill('Tomorrow', 'yellow'), 'Amit S.'],
          ['SC-014', 'Tower A – east elevation', pill('In 3 days', 'green'), 'Rahul D.'], ['SC-031', 'Podium – ramp area', pill('In 5 days', 'green'), 'Neha M.'],
        ]), 'wide')}
      </div>`;
  }
  const DASH = { Admin: dashAdmin, 'Safety manager': dashManager, 'Scaffolding inspector': dashInspector, 'Safety team': dashTeam };

  function renderRoleDash() {
    const box = $('#roleDash'); if (!box) return;
    const sel = $('#roleSelect');
    sel.innerHTML = A.ROLES.map((r) => `<option ${r === state.role ? 'selected' : ''}>${esc(r)}</option>`).join('');
    $('#roleSub').textContent = ROLE_SUB[state.role];
    $('#roleBadge').textContent = ROLE_ICON[state.role];
    box.innerHTML = DASH[state.role]();
    $$('#roleDash [data-asset]').forEach((b) => b.addEventListener('click', () => A.openTagDetail(b.dataset.asset)));
  }
  const baseHome = RENDER.home;
  RENDER.home = () => { baseHome(); renderRoleDash(); paintBell(); };
  $('#roleSelect').addEventListener('change', (e) => { A.setRole(e.target.value); toast(`Dashboard for ${e.target.value}`); });
  window.addEventListener('ia:role', () => { if (state.view === 'home') renderRoleDash(); paintBell(); if (state.view === 'settings') RENDER.settings(); });

  // ======================= PROJECTS & TEAM =======================
  const SEED_PROJECTS = () => [
    { id: 'p1', name: 'Orchid Heights – Towers A & B', short: 'Orchid', client: 'Orchid Infra Pvt Ltd', site: 'Orchid Heights, Pune', location: 'Hinjewadi Phase 2, Pune', start: '2026-04-01', end: '2027-03-31', status: 'Active', progress: 62,
      members: [m('Priya Kulkarni', 'priya.k@orchidinfra.in', '+91 98220 11223', 'Safety manager'), m('Rahul Deshmukh', 'rahul.d@orchidinfra.in', '+91 98901 44556', 'Scaffolding inspector'), m('Amit Shinde', 'amit.s@orchidinfra.in', '+91 97660 77889', 'Scaffolding inspector'), m('Sneha Patil', 'sneha.p@orchidinfra.in', '+91 99700 33445', 'Safety team')] },
    { id: 'p2', name: 'Riverside Business Park – Block C', short: 'Riverside', client: 'Riverside Developers LLP', site: 'Riverside Business Park', location: 'Baner, Pune', start: '2026-06-15', end: '2027-06-30', status: 'Active', progress: 35,
      members: [m('Vikram Joshi', 'vikram.j@riverside.in', '+91 98500 12121', 'Safety manager'), m('Neha More', 'neha.m@riverside.in', '+91 98230 45454', 'Scaffolding inspector'), m('Sanjay Pawar', 'sanjay.p@riverside.in', '+91 90110 78787', 'Safety team')] },
    { id: 'p3', name: 'Metro Depot – Maintenance Shed', short: 'Metro', client: 'Metro Rail Corp.', site: 'Metro Depot', location: 'Pimpri, Pune', start: '2025-11-01', end: '2026-12-15', status: 'On hold', progress: 80,
      members: [m('Kiran Jadhav', 'kiran.j@metrodepot.in', '+91 98811 23232', 'Safety manager'), m('Rohit Gaikwad', 'rohit.g@metrodepot.in', '+91 97300 56565', 'Scaffolding inspector')] },
  ];
  function m(name, email, phone, role) { return { id: uid(), name, email, phone, role, added: new Date(Date.now() - 20 * 864e5).toISOString() }; }
  function getProjects() { let p = LS.get('ia_projects', null); if (!p) { p = SEED_PROJECTS(); LS.set('ia_projects', p); } return p; }
  const saveProjects = (p) => LS.set('ia_projects', p);
  const STATUS_TONE = { Active: 'green', 'On hold': 'yellow', Completed: 'grey', Planned: 'blue' };
  const fmtD = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '–');

  RENDER.projects = () => {
    const list = getProjects();
    const q = ($('#projSearch').value || '').toLowerCase();
    const shown = list.filter((p) => !q || [p.name, p.client, p.site, p.location, ...p.members.map((x) => x.name)].join(' ').toLowerCase().includes(q));
    const people = list.reduce((n, p) => n + p.members.length, 0);
    $('#projStats').innerHTML = `<span><b>${list.length}</b> projects</span><span><b>${list.filter((p) => p.status === 'Active').length}</b> active</span><span><b>${people}</b> team members</span>`;
    $('#projGrid').innerHTML = shown.map((p) => `
      <button type="button" class="proj" data-proj="${esc(p.id)}">
        <div class="proj-top"><span class="proj-badge">${esc((p.short || p.name)[0])}</span><div><b>${esc(p.name)}</b><small>${esc(p.client)}</small></div>${pill(p.status, STATUS_TONE[p.status] || 'grey')}</div>
        <div class="proj-meta"><span>📍 ${esc(p.location)}</span><span>🗓 ${fmtD(p.start)} – ${fmtD(p.end)}</span></div>
        <div class="proj-prog"><span style="width:${p.progress}%"></span></div><small class="muted">${p.progress}% complete</small>
        <div class="proj-team">${p.members.slice(0, 5).map((x) => `<span class="av" title="${esc(x.name)} · ${esc(x.role)}">${esc(A.initialsOf(x.name))}</span>`).join('')}${p.members.length > 5 ? `<span class="av more">+${p.members.length - 5}</span>` : ''}<small>${p.members.length} member${p.members.length === 1 ? '' : 's'}</small></div>
      </button>`).join('') || '<div class="empty"><b>No projects</b><span>Create the first project.</span></div>';
    $$('#projGrid [data-proj]').forEach((b) => b.addEventListener('click', () => openProject(b.dataset.proj)));
  };
  $('#projSearch').addEventListener('input', () => RENDER.projects());
  $('#btnNewProject').addEventListener('click', () => projectForm());

  function projectForm(p = null) {
    openModal(`
      <div class="modal-head"><div><h2>${p ? 'Edit project' : 'New project'}</h2><p>${p ? esc(p.name) : 'Sites, dates and the team that inspects them.'}</p></div><button type="button" class="icon-btn" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>
      <form id="projForm" novalidate>
        <label class="field"><span>Project name</span><input id="pjName" maxlength="100" value="${esc(p?.name || '')}" placeholder="e.g. Orchid Heights – Tower C" /></label>
        <div class="grid2">
          <label class="field"><span>Client</span><input id="pjClient" maxlength="100" value="${esc(p?.client || '')}" /></label>
          <label class="field"><span>Site</span><input id="pjSite" maxlength="100" value="${esc(p?.site || state.profile.site || '')}" /></label>
          <label class="field"><span>Location</span><input id="pjLoc" maxlength="120" value="${esc(p?.location || '')}" placeholder="Area, city" /></label>
          <label class="field"><span>Status</span><select id="pjStatus">${['Planned', 'Active', 'On hold', 'Completed'].map((s) => `<option ${s === (p?.status || 'Active') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="field"><span>Start date</span><input id="pjStart" type="date" value="${esc(p?.start || new Date().toISOString().slice(0, 10))}" /></label>
          <label class="field"><span>End date</span><input id="pjEnd" type="date" value="${esc(p?.end || '')}" /></label>
        </div>
        <label class="field"><span>Progress (%)</span><input id="pjProg" type="number" min="0" max="100" step="1" value="${p?.progress ?? 0}" /></label>
        <div class="modal-actions"><button type="submit" class="btn btn-hivis btn-block">${p ? 'Save project' : 'Create project'}</button></div>
      </form>`, (mm) => {
      $('#projForm', mm).addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#pjName', mm).value.trim();
        if (!name) { $('#pjName', mm).classList.add('invalid'); return toast('Enter the project name.', true); }
        const start = $('#pjStart', mm).value, end = $('#pjEnd', mm).value;
        if (start && end && end < start) { $('#pjEnd', mm).classList.add('invalid'); return toast('End date is before the start date.', true); }
        const prog = Math.max(0, Math.min(100, parseInt($('#pjProg', mm).value, 10) || 0));
        const list = getProjects();
        const data = { name, client: $('#pjClient', mm).value.trim(), site: $('#pjSite', mm).value.trim(), location: $('#pjLoc', mm).value.trim(), status: $('#pjStatus', mm).value, start, end, progress: prog };
        let id = p?.id;
        if (p) Object.assign(list.find((x) => x.id === p.id), data);
        else { id = 'p' + uid(); list.unshift({ id, short: name.split(/\s+/)[0], members: [], ...data }); }
        saveProjects(list); track(p ? 'project_edited' : 'project_created', { project: name });
        toast(p ? 'Project saved' : 'Project created'); RENDER.projects(); openProject(id);
      });
    });
  }

  function openProject(id) {
    const p = getProjects().find((x) => x.id === id);
    if (!p) return;
    const tags = state.assets.filter((a) => a.projectId === p.id || (a.site && p.site && a.site.toLowerCase() === p.site.toLowerCase()));
    const byRole = A.ROLES.map((r) => ({ r, n: p.members.filter((x) => x.role === r).length }));
    openModal(`
      <div class="modal-head"><div><h2>${esc(p.name)}</h2><p>${esc(p.client)} · ${esc(p.location)}</p></div><button type="button" class="icon-btn" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>
      <dl class="kv">
        <dt>Status</dt><dd>${pill(p.status, STATUS_TONE[p.status] || 'grey')}</dd>
        <dt>Dates</dt><dd>${fmtD(p.start)} – ${fmtD(p.end)}</dd>
        <dt>Progress</dt><dd><div class="proj-prog inline"><span style="width:${p.progress}%"></span></div> ${p.progress}%</dd>
        <dt>QR tags</dt><dd>${tags.length ? tags.map((t) => esc(t.id)).join(', ') : 'None linked yet'}</dd>
      </dl>
      <div class="sec-row" style="margin:.4rem 0 .5rem"><h3 class="card-title" style="margin:0">Team (${p.members.length})</h3><span class="muted" style="margin:0">${byRole.filter((x) => x.n).map((x) => `${x.n} ${x.r.toLowerCase()}`).join(' · ')}</span></div>
      <ul class="members" id="pmList">${p.members.map((x) => `
        <li><span class="av">${esc(A.initialsOf(x.name))}</span><span class="mi"><b>${esc(x.name)}</b><small>${esc(x.email)}${x.phone ? ' · ' + esc(x.phone) : ''}</small></span>
          <select data-role="${esc(x.id)}" aria-label="Role of ${esc(x.name)}">${A.ROLES.map((r) => `<option ${r === x.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <button type="button" class="icon-btn" data-remove="${esc(x.id)}" aria-label="Remove ${esc(x.name)}"><svg><use href="#i-close"/></svg></button></li>`).join('') || '<li class="muted">No members yet.</li>'}</ul>
      <form id="pmForm" class="member-form" novalidate>
        <h4>Add team member</h4>
        <div class="grid2">
          <label class="field"><span>Full name</span><input id="pmName" maxlength="80" /></label>
          <label class="field"><span>Email</span><input id="pmEmail" type="email" maxlength="120" /></label>
          <label class="field"><span>Phone (optional)</span><input id="pmPhone" type="tel" maxlength="20" /></label>
          <label class="field"><span>Role</span><select id="pmRole">${A.ROLES.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
        </div>
        <button type="submit" class="btn btn-ink btn-block"><svg><use href="#i-plus"/></svg>Add to project</button>
      </form>
      <div class="modal-actions" style="margin-top:.8rem"><div class="two"><button type="button" class="btn btn-line" id="pjEdit">Edit project</button><button type="button" class="btn btn-danger" id="pjDel">Delete project</button></div></div>`, (mm) => {
      const list = getProjects(); const proj = list.find((x) => x.id === id);
      $$('[data-role]', mm).forEach((s) => s.addEventListener('change', () => { const x = proj.members.find((y) => y.id === s.dataset.role); x.role = s.value; saveProjects(list); toast(`${x.name} is now ${s.value}`); RENDER.projects(); }));
      $$('[data-remove]', mm).forEach((b) => b.addEventListener('click', () => { const x = proj.members.find((y) => y.id === b.dataset.remove); if (!confirm(`Remove ${x.name} from this project?`)) return; proj.members = proj.members.filter((y) => y !== x); saveProjects(list); track('member_removed', { project: proj.name }); toast('Member removed'); RENDER.projects(); openProject(id); }));
      $('#pmForm', mm).addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#pmName', mm).value.trim(), email = $('#pmEmail', mm).value.trim().toLowerCase(), phone = $('#pmPhone', mm).value.trim();
        if (!name) { $('#pmName', mm).classList.add('invalid'); return toast('Enter the member\u2019s name.', true); }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#pmEmail', mm).classList.add('invalid'); return toast('Enter a valid email.', true); }
        if (phone && !/^[+\d][\d\s-]{6,18}$/.test(phone)) { $('#pmPhone', mm).classList.add('invalid'); return toast('Enter a valid phone number.', true); }
        if (proj.members.some((x) => x.email === email)) { $('#pmEmail', mm).classList.add('invalid'); return toast('This email is already in the project.', true); }
        proj.members.push(m(name, email, phone, $('#pmRole', mm).value)); proj.members[proj.members.length - 1].added = new Date().toISOString();
        saveProjects(list); track('member_added', { project: proj.name, role: $('#pmRole', mm).value });
        toast(`${name} added`); RENDER.projects(); openProject(id);
      });
      $('#pjEdit', mm).addEventListener('click', () => projectForm(proj));
      $('#pjDel', mm).addEventListener('click', () => { if (!confirm(`Delete the project "${proj.name}" and its team list?`)) return; saveProjects(list.filter((x) => x.id !== id)); closeModal(); toast('Project deleted'); RENDER.projects(); });
    });
  }

  // ======================= ALERTS =======================
  const mins = (n) => new Date(Date.now() - n * 60000).toISOString();
  const DEMO_ALERTS = [
    { id: 'a1', roles: ['Admin', 'Safety manager', 'Safety team'], level: 'critical', title: 'Red tag: SC-027 Tower B – north face', body: 'Toe boards and mid rail missing, base on loose bricks. Scaffold must not be used.', at: mins(18), link: { tag: 'SC-027' } },
    { id: 'a2', roles: ['Scaffolding inspector', 'Safety manager'], level: 'warning', title: 'SC-040 re-inspection due tomorrow', body: 'Service yard – drain side wall. Ladder landing and toe boards to be re-checked.', at: mins(55), link: { tag: 'SC-040' } },
    { id: 'a3', roles: ['Scaffolding inspector'], level: 'info', title: '5 tags on your route today', body: 'Start with SC-027 (red) then SC-040. Tap to open your route.', at: mins(95), link: { view: 'home' } },
    { id: 'a4', roles: ['Safety team', 'Safety manager'], level: 'warning', title: 'Corrective action overdue', body: 'Fit toe boards on Tower B north face – due yesterday, owner: Apex Access Pvt Ltd.', at: mins(140) },
    { id: 'a5', roles: ['Admin'], level: 'info', title: 'New member added to Riverside Business Park', body: 'Neha More joined as Scaffolding inspector.', at: mins(260), link: { view: 'projects' } },
    { id: 'a6', roles: ['Admin'], level: 'warning', title: 'AI usage at 80% of the monthly budget', body: '2,486 AI checks used this month. Review limits in Settings → AI engine.', at: mins(320), link: { view: 'settings' } },
    { id: 'a7', roles: ['Safety manager', 'Admin'], level: 'success', title: 'SC-014 passed – Green tag', body: 'Tower A – east elevation inspected and signed off.', at: mins(600), link: { tag: 'SC-014' } },
    { id: 'a8', roles: ['Safety team'], level: 'info', title: 'Toolbox talk scheduled', body: 'Friday 10:00 at Tower B: working at height and edge protection.', at: mins(1440) },
    { id: 'a9', roles: ['Scaffolding inspector', 'Safety team'], level: 'critical', title: 'Weather alert: high wind after 4 pm', body: 'Re-inspect scaffolds above 10 m after the wind drops before anyone goes up.', at: mins(30) },
    { id: 'a10', roles: ['Admin', 'Safety manager'], level: 'warning', title: '3 inspections overdue', body: 'SC-031, FE-108 and one Riverside tag have passed their 7-day re-inspection.', at: mins(720), link: { view: 'tags' } },
  ];
  function liveAlerts() {
    // alerts raised by real saved reports in this browser
    return state.history.filter((h) => !h.sample && A.resultTag(h) === 'RED').slice(0, 5).map((h) => ({
      id: 'r-' + h.id, roles: ['Admin', 'Safety manager', 'Safety team'], level: 'critical', title: `Red tag: ${h.asset.id} ${h.asset.location || ''}`.trim(),
      body: `${h.result.counts.missing} check(s) Not OK. Inspected by ${h.meta.inspector}.`, at: h.result.evaluatedAt, link: { report: h.id },
    }));
  }
  const readSet = () => new Set(LS.get('ia_alerts_read', []));
  const isRead = (a) => readSet().has(a.id);
  function alertsFor(role) { return [...liveAlerts(), ...DEMO_ALERTS].filter((a) => a.roles.includes(role)).sort((x, y) => new Date(y.at) - new Date(x.at)); }
  function paintBell() {
    const n = alertsFor(state.role).filter((a) => !isRead(a)).length;
    $$('.bell-badge').forEach((b) => { b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; });
  }
  const LVL = { critical: 'Critical', warning: 'Warning', info: 'Info', success: 'Done' };
  function openAlerts(filter = 'all') {
    const all = alertsFor(state.role);
    const list = filter === 'unread' ? all.filter((a) => !isRead(a)) : all;
    openModal(`
      <div class="modal-head"><div><h2>Alerts</h2><p>For ${esc(state.role)} · ${all.filter((a) => !isRead(a)).length} unread</p></div><button type="button" class="icon-btn" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>
      <div class="alert-bar"><div class="seg" id="alSeg"><button type="button" data-v="all" class="${filter === 'all' ? 'on' : ''}">All</button><button type="button" data-v="unread" class="${filter === 'unread' ? 'on' : ''}">Unread</button></div><button type="button" class="link-btn" id="alAll">Mark all read</button></div>
      <ul class="alerts">${list.map((a) => `
        <li class="al ${a.level} ${isRead(a) ? 'read' : ''}"><button type="button" data-al="${esc(a.id)}">
          <span class="al-dot"></span><span class="al-main"><span class="al-top"><b>${esc(a.title)}</b><small>${esc(A.ago(a.at))}</small></span><span class="al-body">${esc(a.body)}</span><span class="al-lvl">${LVL[a.level]}</span></span></button></li>`).join('') || '<li class="muted" style="padding:1rem">No alerts here.</li>'}</ul>
      <p class="muted" style="margin-top:.8rem">Demo alerts, plus real alerts when a report is saved with a Red result. Change your role on the dashboard to see other people's alerts.</p>`, (mm) => {
      $$('#alSeg button', mm).forEach((b) => b.addEventListener('click', () => openAlerts(b.dataset.v)));
      $('#alAll', mm).addEventListener('click', () => { LS.set('ia_alerts_read', [...new Set([...readSet(), ...all.map((a) => a.id)])]); paintBell(); openAlerts(filter); });
      $$('[data-al]', mm).forEach((b) => b.addEventListener('click', () => {
        const a = all.find((x) => x.id === b.dataset.al);
        LS.set('ia_alerts_read', [...new Set([...readSet(), a.id])]); paintBell();
        closeModal();
        if (a.link?.tag && A.getAsset(a.link.tag)) A.openTagDetail(a.link.tag);
        else if (a.link?.report) A.openHistory(a.link.report);
        else if (a.link?.view) show(a.link.view);
        else openAlerts(filter);
      }));
    });
    track('alerts_opened', { role: state.role });
  }
  $$('[data-alerts]').forEach((b) => b.addEventListener('click', () => openAlerts()));
  paintBell();
  setInterval(paintBell, 30000);
});
