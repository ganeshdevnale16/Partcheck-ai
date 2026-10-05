/* PartCheck AI – front end (no framework, no build step) */
(() => {
  'use strict';

  // ---------- small helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const splitLines = (s) => String(s || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fmtDate = (iso) => new Date(iso).toLocaleString();
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const ICONS = {
    camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H7l1.6-2.2h6.8L17 6h1.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.8"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-5-5L5 21"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="m8.5 12.2 2.5 2.5 4.5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10"/>',
    save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
    sparkles: '<path d="M11 3l1.7 4.6L17.3 9.3l-4.6 1.7L11 15.6l-1.7-4.6L4.7 9.3l4.6-1.7z"/><path d="M18.5 14.5l.8 2.1 2.2.9-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.9z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16.5 16.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
    file: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
    question: '<path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.5-1.5 1.2-1.5 2.3M12 17.5v.1"/>',
    play: '<path d="M7 5v14l11-7z"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  function hydrateIcons(root = document) { $$('i[data-icon]', root).forEach((el) => { el.outerHTML = icon(el.dataset.icon); }); }

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // Photo size sent to the AI: short side up to 1024 px, long side up to 1600 px (good detail for small parts)
  const SHORT_MAX = 1024;
  const LONG_MAX = 1600;
  const JPEG_Q = 0.82;
  const PAYLOAD_LIMIT_MB = 4.0; // Vercel request limit is 4.5 MB
  const THUMB_SIDE = 480;       // size stored in history

  // ---------- built-in sample items ----------
  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl-panel', name: 'Electrical control panel', description: 'Wall-mounted LT control panel',
      angles: [
        { name: 'Front (door closed)', guidance: 'Whole front face in frame, door closed', parts: ['Door handle / lock', 'Indicator lamps', 'Emergency stop button', 'Danger warning sticker'] },
        { name: 'Inside (door open)', guidance: 'Open the door, capture all components', parts: ['MCBs / breakers', 'Contactor', 'Terminal block', 'Earthing wire', 'Wire ferrules / labels'] },
        { name: 'Left side', guidance: 'Full left side panel', parts: ['Ventilation louvers', 'Cable gland'] },
        { name: 'Right side', guidance: 'Full right side panel', parts: ['Ventilation louvers'] },
      ],
      general_parts: ['Nameplate / serial label'],
    },
    {
      id: 'tpl-laptop', name: 'Laptop (handover check)', description: 'Company laptop returned by employee',
      angles: [
        { name: 'Lid closed', guidance: 'Top of the closed lid, whole laptop visible', parts: ['Brand logo'] },
        { name: 'Open – screen & keyboard', guidance: 'Lid open, screen and keyboard fully visible', parts: ['Screen (no cracks)', 'Keyboard with all keys', 'Touchpad', 'Webcam'] },
        { name: 'Left side', guidance: 'Close-up of all left-side ports', parts: ['Charging port', 'USB port'] },
        { name: 'Right side', guidance: 'Close-up of all right-side ports', parts: ['USB port', 'Audio jack'] },
        { name: 'Bottom', guidance: 'Flip the laptop, whole base visible', parts: ['Rubber feet', 'Base screws'] },
      ],
      general_parts: ['Serial number / service tag label', 'Charger adapter'],
    },
    {
      id: 'tpl-pump', name: 'Water pump with motor', description: 'Monoblock pump set',
      angles: [
        { name: 'Front', guidance: 'Pump casing and inlet facing the camera', parts: ['Pump casing', 'Suction inlet', 'Nameplate'] },
        { name: 'Top', guidance: 'From above, outlet and priming plug visible', parts: ['Delivery outlet', 'Priming plug'] },
        { name: 'Motor side', guidance: 'Full motor body side view', parts: ['Motor body', 'Fan cover', 'Terminal box'] },
        { name: 'Base', guidance: 'Mounting base and bolts', parts: ['Mounting base', 'Foundation bolts'] },
      ],
      general_parts: [],
    },
  ];

  // ---------- state ----------
  const state = {
    templates: LS.get('pc_templates', null) || clone(DEFAULT_TEMPLATES),
    tplId: null,
    editingId: null,
    server: {},
    cur: null,          // current inspection record
    angleIdx: 0,
    stream: null,
    liveTimer: null,
    spinTimer: null,
    installEvt: null,
    histFilter: 'ALL',
  };
  if (!LS.get('pc_templates', null)) LS.set('pc_templates', state.templates);

  // ---------- UI basics ----------
  let toastTimer;
  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', isErr);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 5000 : 2800);
  }
  function loading(on, text = 'Working…') {
    $('#loading').hidden = !on;
    $('#loadingText').textContent = text;
  }

  function show(view) {
    $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
    $$('.nav [data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === view || (view !== 'history' && b.dataset.nav === 'setup')));
    $('#steps').hidden = view === 'history';
    const order = ['setup', 'capture', 'result'];
    $$('#steps li').forEach((li) => {
      const i = order.indexOf(li.dataset.step), cur = order.indexOf(view);
      li.classList.toggle('on', i === cur);
      li.classList.toggle('done', i < cur);
    });
    if (view !== 'capture') stopCamera();
    if (view !== 'result') stopSpin();
    window.scrollTo({ top: 0 });
  }

  // ---------- login ----------
  function showLogin({ msg = '', config = false } = {}) {
    stopCamera();
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#loginChecking').hidden = true;
    if (config) {
      $('#loginForm').hidden = true;
      $('#loginMsg').hidden = false;
      $('#loginMsg').innerHTML = `<b>The app password is not set on the server.</b>
        <ol><li>Vercel → your project → Settings → Environment Variables</li>
        <li>Add <b>APP_PASSWORD</b> with your password</li>
        <li>Deployments → ⋯ → <b>Redeploy</b>, then reopen this page</li></ol>`;
      return;
    }
    $('#loginMsg').hidden = true;
    $('#loginForm').hidden = false;
    $('#loginErr').textContent = msg;
    $('#loginPw').value = '';
    setTimeout(() => $('#loginPw').focus(), 50);
  }

  async function login(password) {
    let r;
    try {
      r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    } catch {
      return { ok: false, error: 'Cannot reach the server. Check your internet connection.' };
    }
    const data = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true };
    return { ok: false, code: data.code, error: data.error || `Login failed (${r.status}).` };
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#loginPw').value.trim();
    if (!pw) { $('#loginErr').textContent = 'Enter the password.'; return; }
    $('#loginBtn').disabled = true;
    $('#loginErr').textContent = '';
    const res = await login(pw);
    $('#loginBtn').disabled = false;
    if (res.ok) { LS.set('pc_pw', pw); enterApp(); return; }
    if (res.code === 'NO_PASSWORD') { showLogin({ config: true }); return; }
    $('#loginErr').textContent = res.error;
  });

  $('#pwToggle').addEventListener('click', () => {
    const inp = $('#loginPw');
    const showPw = inp.type === 'password';
    inp.type = showPw ? 'text' : 'password';
    $('#pwToggle').innerHTML = icon(showPw ? 'eyeoff' : 'eye');
    $('#pwToggle').setAttribute('aria-label', showPw ? 'Hide password' : 'Show password');
  });

  $('#btnLogout').addEventListener('click', () => {
    if (!confirm('Log out? You will need the password to open the app again.')) return;
    LS.del('pc_pw');
    state.cur = null;
    showLogin();
  });

  function enterApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    const s = state.server;
    const banner = $('#setupBanner');
    banner.hidden = !s.missing?.length;
    if (s.missing?.length) banner.innerHTML = `<b>Setup incomplete:</b> add ${esc(s.missing.join(', '))} in Vercel environment variables, then Redeploy.`;
    $('#howItWorks').hidden = LS.get('pc_how_x', false);
    updateInstallUI();
    renderItems();
    show('setup');
  }

  $('#btnHowX').addEventListener('click', () => { LS.set('pc_how_x', true); $('#howItWorks').hidden = true; });

  // ---------- install as an app (phone or computer) ----------
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(navigator.userAgent);

  function updateInstallUI() {
    const can = !isStandalone();
    $('#btnInstall').hidden = !can;
    $('#installBanner').hidden = !can || LS.get('pc_install_later', false);
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvt = e; updateInstallUI(); });
  window.addEventListener('appinstalled', () => {
    state.installEvt = null;
    $('#installBanner').hidden = true;
    $('#btnInstall').hidden = true;
    toast('PartCheck is installed. Open it from your home screen or desktop.');
  });

  async function installApp() {
    if (state.installEvt) {
      state.installEvt.prompt();
      const choice = await state.installEvt.userChoice.catch(() => null);
      state.installEvt = null;
      if (choice?.outcome === 'accepted') { $('#installBanner').hidden = true; return; }
      updateInstallUI();
      return;
    }
    // No automatic prompt (iPhone, Firefox, or prompt not ready yet): show the steps
    const blocks = { ios: $('#instIos'), android: $('#instAndroid'), desktop: $('#instDesktop') };
    const mine = isIos ? 'ios' : isAndroid ? 'android' : 'desktop';
    Object.entries(blocks).forEach(([k, el]) => el.classList.toggle('first', k === mine));
    blocks[mine].parentNode.insertBefore(blocks[mine], blocks[mine].parentNode.querySelector('.dlg-block'));
    $('#dlgInstall').showModal();
  }
  $('#btnInstall').addEventListener('click', installApp);
  $('#btnInstallBanner').addEventListener('click', installApp);
  $('#btnInstallLater').addEventListener('click', () => { LS.set('pc_install_later', true); $('#installBanner').hidden = true; });

  // ---------- API ----------
  async function api(path, body) {
    const headers = { 'Content-Type': 'application/json', 'x-app-password': LS.get('pc_pw', '') };
    let r;
    try {
      r = await fetch(path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('Cannot reach the server. Check your internet connection.');
    }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { LS.del('pc_pw'); showLogin({ msg: 'Please enter the password again.' }); throw new Error('Password needed.'); }
    if (r.status === 503 && data.code === 'NO_PASSWORD') { showLogin({ config: true }); throw new Error(data.error); }
    if (r.status === 413) throw new Error('Photos are too large to send. Remove the extra views and try again.');
    if (r.status === 504) throw new Error('The AI took too long to answer. Try again with fewer photos.');
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status}).`);
    return data;
  }

  // ---------- STEP 1: templates ----------
  function saveTemplates() { LS.set('pc_templates', state.templates); }
  function getTpl(id) { return state.templates.find((t) => t.id === id); }

  const partCount = (t) => t.angles.reduce((n, a) => n + a.parts.length, 0) + (t.general_parts?.length || 0);

  function renderItems() {
    if (!getTpl(state.tplId)) state.tplId = LS.get('pc_tpl', null);
    if (!getTpl(state.tplId)) state.tplId = state.templates[0]?.id || null;
    const list = $('#itemList');
    $('#btnStart').disabled = !state.templates.length;
    if (!state.templates.length) { list.innerHTML = '<p class="muted">No items yet. Create your first item below.</p>'; return; }
    list.innerHTML = state.templates.map((t) => {
      const sel = t.id === state.tplId;
      const detail = sel ? `<div class="item-detail">
          ${t.angles.map((a, i) => `<div class="vl"><span class="vn">${i + 1}</span><span><b>${esc(a.name)}</b><small>${esc(a.parts.join(', ') || 'Photo only')}</small></span></div>`).join('')}
          ${t.general_parts?.length ? `<div class="vl"><span class="vn">+</span><span><b>Any view</b><small>${esc(t.general_parts.join(', '))}</small></span></div>` : ''}
        </div>` : '';
      return `<div class="item ${sel ? 'sel' : ''}" role="radio" aria-checked="${sel}" tabindex="0" data-id="${esc(t.id)}">
        <span class="item-ic">${icon(sel ? 'check' : 'box')}</span>
        <span class="item-txt"><b>${esc(t.name)}</b><small>${plural(t.angles.length, 'photo')} to take, ${plural(partCount(t), 'part')} to check</small></span>
        <button type="button" class="icon-btn" data-edit="${esc(t.id)}" aria-label="Edit ${esc(t.name)}" title="Edit checklist">${icon('edit')}</button>
        ${detail}
      </div>`;
    }).join('');
    $$('.item', list).forEach((el) => {
      const pick = () => { state.tplId = el.dataset.id; LS.set('pc_tpl', state.tplId); closeEditor(); renderItems(); };
      el.addEventListener('click', (e) => { if (!e.target.closest('[data-edit]')) pick(); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    $$('[data-edit]', list).forEach((b) => b.addEventListener('click', () => { state.tplId = b.dataset.edit; renderItems(); openEditor(getTpl(b.dataset.edit)); }));
  }

  function angleRow(a = { name: '', guidance: '', parts: [] }) {
    const div = document.createElement('div');
    div.className = 'ed-angle';
    div.innerHTML = `
      <div class="ed-top">
        <span class="ed-num"></span>
        <input class="aname" placeholder="View name, e.g. Front" maxlength="60" value="${esc(a.name)}" aria-label="View name" />
        <button type="button" class="ed-x" title="Remove view" aria-label="Remove view">${icon('trash')}</button>
      </div>
      <input class="guide" placeholder="How to frame the photo (optional)" maxlength="200" value="${esc(a.guidance || '')}" />
      <textarea class="aparts" rows="3" placeholder="Parts that must be visible, one per line">${esc((a.parts || []).join('\n'))}</textarea>`;
    $('.ed-x', div).addEventListener('click', () => { div.remove(); numberRows(); });
    return div;
  }
  function numberRows() { $$('#edAngles .ed-num').forEach((n, i) => { n.textContent = i + 1; }); }

  function openEditor(tpl) {
    state.editingId = tpl?.id || null;
    $('#editorTitle').textContent = tpl ? `Edit: ${tpl.name}` : 'Custom item';
    $('#edName').value = tpl?.name || '';
    $('#edDesc').value = tpl?.description || '';
    $('#edGeneral').value = (tpl?.general_parts || []).join('\n');
    const box = $('#edAngles');
    box.innerHTML = '';
    (tpl?.angles?.length ? tpl.angles : [{ name: 'Front', guidance: '', parts: [] }, { name: 'Back', guidance: '', parts: [] }, { name: 'Left side', guidance: '', parts: [] }, { name: 'Right side', guidance: '', parts: [] }])
      .forEach((a) => box.appendChild(angleRow(a)));
    numberRows();
    $('#btnDeleteTpl').hidden = !tpl;
    $('#editor').hidden = false;
    $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!tpl) $('#edName').focus({ preventScroll: true });
  }
  function closeEditor() { $('#editor').hidden = true; state.editingId = null; }

  function readEditor() {
    const name = $('#edName').value.trim();
    const angles = $$('#edAngles .ed-angle').map((row) => ({
      name: $('.aname', row).value.trim(),
      guidance: $('.guide', row).value.trim(),
      parts: splitLines($('.aparts', row).value),
    })).filter((a) => a.name);
    const names = angles.map((a) => a.name.toLowerCase());
    if (!name) throw new Error('Enter an item name.');
    if (!angles.length) throw new Error('Add at least one view.');
    if (new Set(names).size !== names.length) throw new Error('Each view needs a different name.');
    return { id: state.editingId || 'tpl-' + uid(), name, description: $('#edDesc').value.trim(), angles, general_parts: splitLines($('#edGeneral').value) };
  }

  $('#btnNewTpl').addEventListener('click', () => openEditor(null));
  $('#btnCancelTpl').addEventListener('click', closeEditor);
  $('#btnAddAngle').addEventListener('click', () => { const r = angleRow(); $('#edAngles').appendChild(r); numberRows(); $('.aname', r).focus(); });

  $('#btnSaveTpl').addEventListener('click', () => {
    try {
      const t = readEditor();
      const i = state.templates.findIndex((x) => x.id === t.id);
      if (i >= 0) state.templates[i] = t; else state.templates.push(t);
      saveTemplates();
      state.tplId = t.id;
      LS.set('pc_tpl', t.id);
      closeEditor();
      renderItems();
      toast('Item saved');
    } catch (e) { toast(e.message, true); }
  });

  $('#btnDeleteTpl').addEventListener('click', () => {
    if (!state.editingId || !confirm('Delete this item and its checklist?')) return;
    state.templates = state.templates.filter((t) => t.id !== state.editingId);
    saveTemplates();
    closeEditor();
    renderItems();
    toast('Item deleted');
  });

  $('#btnSuggest').addEventListener('click', async () => {
    const item = $('#edName').value.trim();
    if (!item) { toast('Type the item name first.', true); $('#edName').focus(); return; }
    loading(true, 'AI is building a checklist…');
    try {
      const out = await api('/api/suggest', { item, description: $('#edDesc').value.trim() });
      const box = $('#edAngles');
      box.innerHTML = '';
      out.angles.forEach((a) => box.appendChild(angleRow(a)));
      numberRows();
      $('#edGeneral').value = out.general_parts.join('\n');
      toast('Checklist suggested. Review it, then save.');
    } catch (e) { toast(e.message, true); }
    finally { loading(false); }
  });

  // inspection details (remember inspector name)
  $('#mInspector').value = LS.get('pc_inspector', '');

  $('#btnStart').addEventListener('click', async () => {
    let tpl;
    try { tpl = !$('#editor').hidden ? readEditor() : getTpl(state.tplId); }
    catch (e) { toast(e.message, true); return; }
    if (!tpl) { toast('Choose or create an item first.', true); return; }
    LS.set('pc_inspector', $('#mInspector').value.trim());

    state.cur = {
      id: uid(),
      createdAt: new Date().toISOString(),
      item: tpl.name,
      description: tpl.description || '',
      angles: clone(tpl.angles),
      general_parts: clone(tpl.general_parts || []),
      meta: {
        inspector: $('#mInspector').value.trim(),
        serial: $('#mSerial').value.trim(),
        location: $('#mLocation').value.trim(),
        notes: $('#mNotes').value.trim(),
        gps: null,
      },
      shots: {},
      result: null,
      render3d: null,
      override: { status: '', remarks: '' },
      saved: false,
    };
    state.angleIdx = 0;
    if ($('#mGps').checked) getGps();
    show('capture');
    renderCapture();
    startCamera();
  });

  function getGps() {
    if (!navigator.geolocation) return toast('GPS is not available on this device.', true);
    navigator.geolocation.getCurrentPosition(
      (p) => { if (state.cur) state.cur.meta.gps = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }; },
      () => toast('Location permission denied. Photos will not have GPS.', true),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ---------- STEP 2: capture ----------
  const video = $('#video');

  async function startCamera() {
    $('#nocam').hidden = true;
    if (state.stream) { startLiveCheck(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { $('#nocam').hidden = false; $('#btnShoot').disabled = true; return; }
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      video.srcObject = state.stream;
      await video.play().catch(() => {});
      $('#btnShoot').disabled = false;
      startLiveCheck();
    } catch (e) {
      $('#nocam').hidden = false;
      $('#btnShoot').disabled = true;
      toast('Camera blocked or not found. Use Upload photo instead.', true);
    }
  }

  function stopCamera() {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
    if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
    video.srcObject = null;
  }

  // The camera box shows only part of the camera image (it is cropped to fit the box).
  // Work out exactly which part is visible, so the saved photo = what you see in the box.
  function visibleCrop() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const r = video.getBoundingClientRect();
    if (!vw || !vh || !r.width || !r.height) return { sx: 0, sy: 0, sw: vw || 1, sh: vh || 1 };
    const scale = Math.max(r.width / vw, r.height / vh); // object-fit: cover
    const sw = r.width / scale, sh = r.height / scale;
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
  }

  // Brightness + sharpness check (like the "move closer / too dark" hints in face KYC)
  const qCanvas = document.createElement('canvas');
  function analyze(src, sx, sy, sw, sh) {
    const w = 256, h = Math.max(1, Math.round((sh / sw) * 256));
    qCanvas.width = w; qCanvas.height = h;
    const ctx = qCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += g[j]; }
    const brightness = sum / g.length;
    let n = 0, m = 0, m2 = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      n++; const delta = lap - m; m += delta / n; m2 += delta * (lap - m);
    }
    const sharpness = n > 1 ? m2 / (n - 1) : 0;
    const issues = [];
    if (brightness < 55) issues.push('Too dark');
    else if (brightness > 215) issues.push('Too bright');
    if (sharpness < 40) issues.push('Blurry – hold steady');
    return { brightness: Math.round(brightness), sharpness: Math.round(sharpness), ok: issues.length === 0, issues };
  }

  function qualityPills(q) {
    if (!q) return '';
    const light = q.brightness < 55 ? ['bad', 'Too dark'] : q.brightness > 215 ? ['bad', 'Too bright'] : ['good', 'Light OK'];
    const sharp = q.sharpness < 40 ? ['bad', 'Blurry'] : ['good', 'Sharp'];
    return [light, sharp].map(([c, t]) => `<span class="qpill ${c}">${t}</span>`).join('');
  }

  function startLiveCheck() {
    clearInterval(state.liveTimer);
    state.liveTimer = setInterval(() => {
      if (!state.cur || $('#view-capture').hidden) return;
      const a = state.cur.angles[state.angleIdx];
      if (state.cur.shots[a?.name] || !video.videoWidth) return;
      const c = visibleCrop();
      $('#qbar').innerHTML = qualityPills(analyze(video, c.sx, c.sy, c.sw, c.sh));
    }, 600);
  }

  function watermark(ctx, w, h, angleName) {
    const strip = Math.max(18, Math.round(h * 0.034));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, h - strip, w, strip);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(strip * 0.6)}px Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    const gps = state.cur.meta.gps ? `  |  ${state.cur.meta.gps.lat}, ${state.cur.meta.gps.lng}` : '';
    const text = `${state.cur.item}  |  ${angleName}  |  ${new Date().toLocaleString()}${gps}`;
    ctx.fillText(text, Math.round(strip * 0.4), h - strip / 2, w - strip);
  }

  function processImage(src, sx, sy, sw, sh) {
    const a = state.cur.angles[state.angleIdx];
    const scale = Math.min(1, LONG_MAX / Math.max(sw, sh), SHORT_MAX / Math.min(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const quality = analyze(c, 0, 0, w, h);
    watermark(ctx, w, h, a.name);
    state.cur.shots[a.name] = { dataUrl: c.toDataURL('image/jpeg', JPEG_Q), quality, ts: new Date().toISOString() };
    state.cur.result = null; // photos changed -> old result no longer valid
    if (!quality.ok) toast(`Photo saved, but: ${quality.issues.join(', ')}. Retake for a better result.`, true);
    renderCapture();
  }

  $('#btnShoot').addEventListener('click', () => {
    if (!video.videoWidth) { toast('Camera is still starting…'); return; }
    const c = visibleCrop();
    processImage(video, c.sx, c.sy, c.sw, c.sh);
  });

  $('#fileInput').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Choose an image file.', true); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { processImage(img, 0, 0, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
    img.onerror = () => { toast('Could not read that image. Try JPG or PNG.', true); URL.revokeObjectURL(url); };
    img.src = url;
  });

  $('#btnRetake').addEventListener('click', () => {
    const a = state.cur.angles[state.angleIdx];
    delete state.cur.shots[a.name];
    state.cur.result = null;
    renderCapture();
  });

  $('#btnNext').addEventListener('click', () => {
    const angles = state.cur.angles;
    const nextMissing = angles.findIndex((a, i) => i > state.angleIdx && !state.cur.shots[a.name]);
    const anyMissing = angles.findIndex((a) => !state.cur.shots[a.name]);
    state.angleIdx = nextMissing >= 0 ? nextMissing : anyMissing >= 0 ? anyMissing : state.angleIdx;
    renderCapture();
  });

  $('#btnExtraAngle').addEventListener('click', () => {
    const name = prompt('Name for the extra view (e.g. "Close-up of damage"):');
    if (!name?.trim()) return;
    if (state.cur.angles.some((a) => a.name.toLowerCase() === name.trim().toLowerCase())) { toast('A view with that name already exists.', true); return; }
    state.cur.angles.push({ name: name.trim().slice(0, 60), guidance: 'Extra evidence photo', parts: [], extra: true });
    state.angleIdx = state.cur.angles.length - 1;
    renderCapture();
  });

  $('#btnBackSetup').addEventListener('click', () => show('setup'));

  function renderCapture() {
    const cur = state.cur;
    const a = cur.angles[state.angleIdx];
    const shot = cur.shots[a.name];
    const done = cur.angles.filter((x) => cur.shots[x.name]).length;

    $('#capItem').textContent = cur.item;
    $('#capProgress').textContent = `Photo ${state.angleIdx + 1} of ${cur.angles.length}, ${done} taken${cur.meta.serial ? ' (#' + cur.meta.serial + ')' : ''}`;
    $('#capBar').style.width = `${Math.round((done / cur.angles.length) * 100)}%`;

    $('#angleChips').innerHTML = cur.angles.map((x, i) => {
      const s = cur.shots[x.name];
      const cls = ['chip', i === state.angleIdx ? 'cur' : '', s ? (s.quality.ok ? 'ok' : 'warn') : ''].join(' ');
      const lead = s ? `<img src="${s.dataUrl}" alt="" />` : `<span class="cnum">${i + 1}</span>`;
      return `<button type="button" role="tab" class="${cls}" data-i="${i}" aria-selected="${i === state.angleIdx}">${lead}${esc(x.name)}</button>`;
    }).join('');
    $$('#angleChips .chip').forEach((b) => b.addEventListener('click', () => { state.angleIdx = +b.dataset.i; renderCapture(); }));
    $('#angleChips .chip.cur')?.scrollIntoView({ inline: 'center', block: 'nearest' });

    $('#stageLabel').textContent = a.name;
    $('#angleName').textContent = a.name;
    $('#angleGuide').textContent = a.guidance || 'Fill the box with this view of the item.';
    $('#angleParts').innerHTML = a.parts.length
      ? a.parts.map((p) => `<li>${esc(p)}</li>`).join('')
      : '<li class="none">No required parts. This photo is extra evidence.</li>';

    const stage = $('#stage');
    stage.classList.toggle('has-shot', Boolean(shot));
    $('#preview').hidden = !shot;
    video.hidden = Boolean(shot);
    if (shot) {
      $('#preview').src = shot.dataUrl;
      $('#qbar').innerHTML = qualityPills(shot.quality);
      $('#nocam').hidden = true;
    } else {
      $('#qbar').innerHTML = '';
      $('#nocam').hidden = Boolean(state.stream) || !$('#btnShoot').disabled;
    }
    $('#btnShoot').hidden = Boolean(shot);
    $('#lblUpload').hidden = Boolean(shot);
    $('#btnRetake').hidden = !shot;
    const allDone = done === cur.angles.length;
    $('#btnNext').hidden = !shot || allDone;
    $('#ctlSpacer').hidden = Boolean(shot);

    const ev = $('#btnEvaluate');
    ev.disabled = done === 0;
    ev.innerHTML = icon('sparkles') + (allDone ? 'Evaluate photos' : `Evaluate photos (${done}/${cur.angles.length})`);
  }

  // ---------- evaluate ----------
  $('#btnEvaluate').addEventListener('click', evaluate);

  async function evaluate() {
    const cur = state.cur;
    const missingViews = cur.angles.filter((a) => !cur.shots[a.name] && a.parts.length);
    if (missingViews.length && !confirm(`${missingViews.length} view(s) not photographed: ${missingViews.map((a) => a.name).join(', ')}.\nTheir parts will be marked missing. Evaluate anyway?`)) return;

    const payload = {
      item: cur.item,
      description: cur.description,
      general_parts: cur.general_parts,
      angles: cur.angles.map((a) => ({ name: a.name, guidance: a.guidance || '', parts: a.parts, image: cur.shots[a.name]?.dataUrl || null })),
    };

    loading(true, 'AI is inspecting your photos…');
    try {
      // keep the upload under Vercel's limit: shrink photos a little only if needed
      let tries = 0;
      while (JSON.stringify(payload).length / 1048576 > PAYLOAD_LIMIT_MB && tries < 3) {
        tries++;
        const side = [1280, 1024, 800][tries - 1];
        for (const a of payload.angles) if (a.image) a.image = await shrink(a.image, side, 0.75);
      }
      cur.result = await api('/api/evaluate', payload);
      cur.override = { status: '', remarks: '' };
      cur.render3d = null;
      cur.saved = false;
      stopCamera();
      renderResult();
      show('result');
    } catch (e) {
      toast(e.message, true);
    } finally {
      loading(false);
    }
  }

  // ---------- STEP 3: result ----------
  const ICON = { present: 'check', missing: 'x', unclear: 'question' };
  const VERDICT = { PASS: 'All required parts are there.', FAIL: 'Something is missing or damaged.', REVIEW: 'Some parts could not be confirmed. Please check.' };
  const STATUS_TEXT = { present: 'Present', missing: 'Missing', unclear: 'Unclear' };

  function finalStatus(rec) { return rec.override?.status || rec.result.status; }

  function renderResult() {
    const rec = state.cur;
    const r = rec.result;
    const ai = r.ai || {};
    const st = finalStatus(rec);
    const metaBits = [rec.meta.serial && `#${rec.meta.serial}`, rec.meta.inspector, fmtDate(r.evaluatedAt || rec.createdAt)].filter(Boolean);
    const shotAngles = rec.angles.filter((a) => rec.shots[a.name]);
    const canRecheck = !rec.fromHistory && shotAngles.length;

    const viewCards = rec.angles.map((a) => {
      const shot = rec.shots[a.name];
      const aa = (ai.angles || []).find((x) => norm(x.angle) === norm(a.name)) || null;
      const ORDER = { missing: 0, unclear: 1, present: 2 };
      const rows = r.checklist.filter((c) => c.group === a.name).sort((x, y) => ORDER[x.status] - ORDER[y.status]);
      const q = aa?.image_quality;
      return `
        <article class="vcard">
          ${shot ? `<img src="${shot.dataUrl}" alt="${esc(a.name)} photo" data-zoom />` : '<div class="noimg">Not photographed</div>'}
          <div class="vbody">
            <div class="vhead">
              <h3>${esc(a.name)}</h3>
              ${rows.length ? `<span class="count">${rows.filter((c) => c.status === 'present').length}/${rows.length}</span>` : ''}
            </div>
            ${q ? `<span class="badge ${esc(q)}">Photo quality: ${esc(q)}</span>` : ''}
            ${aa && aa.correct_view === false ? '<p class="sev high">This photo does not show the requested view.</p>' : ''}
            ${aa?.quality_issues?.length ? `<p class="muted">${esc(aa.quality_issues.join('; '))}</p>` : ''}
            ${rows.length ? `<ul class="plist">${rows.map(partRow).join('')}</ul>` : '<p class="muted">No required parts for this view.</p>'}
            ${aa?.observations?.length ? `<ul class="obs">${aa.observations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
          </div>
        </article>`;
    }).join('');

    const general = r.checklist.filter((c) => c.group === 'Any view');
    const defects = ai.defects || [];

    $('#view-result').innerHTML = `
      <div class="result-top">
        <div class="tag">
          <div class="tag-item">${esc(rec.item)}</div>
          <div class="tag-meta">${esc(metaBits.join('  ·  '))}</div>
          <span class="stamp ${st}">${st}</span>
          <p class="verdict">${VERDICT[st]}</p>
          <div class="meter-label"><span>Checklist complete</span><span>${r.completion}%</span></div>
          <div class="meter" role="progressbar" aria-valuenow="${r.completion}" aria-valuemin="0" aria-valuemax="100"><div style="width:${r.completion}%"></div></div>
          <div class="counts">
            <div><b style="color:var(--pass)">${r.counts.present}</b><small>Present</small></div>
            <div><b style="color:var(--fail)">${r.counts.missing}</b><small>Missing</small></div>
            <div><b style="color:var(--review)">${r.counts.unclear}</b><small>Unclear</small></div>
          </div>
          <ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="override">
            <label class="field"><span>Inspector decision</span>
              <select id="ovStatus">
                <option value="">Use AI result (${r.status})</option>
                <option value="PASS">Override: PASS</option>
                <option value="FAIL">Override: FAIL</option>
                <option value="REVIEW">Override: REVIEW</option>
              </select>
            </label>
            <label class="field"><span>Remarks</span><textarea id="ovRemarks" rows="2" maxlength="500" placeholder="Reason for override, follow-up actions">${esc(rec.override.remarks)}</textarea></label>
            ${rec.override.status ? `<p class="muted">AI said ${r.status}; inspector changed it to ${rec.override.status}.</p>` : ''}
          </div>
        </div>

        <div class="panel summary-panel">
          <h2>Summary</h2>
          ${ai.item_matches === false ? `<div class="warn-box">The photos look like <b>${esc(ai.item_identified)}</b>, not ${esc(rec.item)}.</div>` : ''}
          <p>${esc(ai.summary || '')}</p>
          ${rec.meta.location || rec.meta.notes || rec.meta.gps ? `<p class="muted">${esc([rec.meta.location, rec.meta.notes, rec.meta.gps && `GPS ${rec.meta.gps.lat}, ${rec.meta.gps.lng}`].filter(Boolean).join(' | '))}</p>` : ''}
          ${ai.recommendations?.length ? `<h3>Recommended actions</h3><ul>${ai.recommendations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <p class="footnote">Checked by ${esc(r.provider === 'azure' ? 'Azure OpenAI' : r.provider)} (${esc(r.model)}). Parts below ${Math.round((r.minConfidence || 0) * 100)}% confidence count as unclear. Tap a photo to zoom.</p>
          <div class="actions">
            <div class="actions-main">
              <button type="button" class="btn primary" id="btnSave">${icon(rec.saved ? 'check' : 'save')}${rec.saved ? 'Saved (update)' : 'Save to history'}</button>
              <button type="button" class="btn ghost" id="btnPrint">${icon('file')}Print / save PDF</button>
            </div>
            <div class="actions-more">
              ${canRecheck ? `<button type="button" class="btn ghost small" id="btnRecheck">${icon('rotate')}Check again</button>` : ''}
              ${canRecheck ? `<button type="button" class="btn ghost small" id="btnRecapture">${icon('camera')}Retake photos</button>` : ''}
              <button type="button" class="btn ghost small" id="btnCsv">${icon('download')}CSV</button>
              <button type="button" class="btn ghost small" id="btnJson">${icon('download')}JSON</button>
              <button type="button" class="btn ghost small" id="btnNewInspection">${icon('plus')}New inspection</button>
            </div>
          </div>
        </div>
      </div>

      ${general.length ? `<div class="panel section"><h2>Parts checked across all views</h2><ul class="plist">${general.map(partRow).join('')}</ul></div>` : ''}

      ${defects.length ? `<div class="panel section"><h2>Damage and defects</h2><div class="table-wrap"><table class="defects">
          <thead><tr><th>View</th><th>Finding</th><th>Severity</th></tr></thead>
          <tbody>${defects.map((d) => `<tr><td>${esc(d.angle)}</td><td>${esc(d.description)}</td><td class="sev ${esc(d.severity)}">${esc(d.severity)}</td></tr>`).join('')}</tbody>
        </table></div></div>` : ''}

      <h2>Views</h2>
      <div class="views">${viewCards}</div>

      ${shotAngles.length ? `
      <div class="panel section">
        <h2>360° view and 3D render</h2>
        <div class="viewer-grid">
          <div>
            <div class="spin" id="spin"><img id="spinImg" alt="Item rotation view" /><span class="spin-label" id="spinLabel"></span></div>
            <div class="spin-ctrl">
              <button type="button" class="btn ghost small" id="spinPrev" aria-label="Previous view">◀</button>
              <button type="button" class="btn ghost small" id="spinPlay">Auto-rotate</button>
              <button type="button" class="btn ghost small" id="spinNext" aria-label="Next view">▶</button>
              <span class="muted">Drag the photo sideways to turn the item.</span>
            </div>
          </div>
          <div>
            <div class="render-box" id="renderBox">
              ${rec.render3d ? `<img src="${rec.render3d}" alt="AI 3D render of ${esc(rec.item)}" data-zoom />`
                : state.server.renderEnabled ? '<p>Build a single 3D-style product image from your photos.</p>'
                : '<p>AI 3D render is off. Deploy gpt-image-1 in Azure and set AZURE_OPENAI_IMAGE_DEPLOYMENT to turn it on.</p>'}
            </div>
            <div class="spin-ctrl">
              <button type="button" class="btn primary small" id="btnRender" ${state.server.renderEnabled ? '' : 'disabled'}>${rec.render3d ? 'Generate again' : 'Generate 3D render'}</button>
              ${rec.render3d ? `<a class="btn ghost small" download="${esc(rec.item)}-3d.png" href="${rec.render3d}">Download</a>` : ''}
            </div>
          </div>
        </div>
      </div>` : ''}
    `;

    // wire up
    $('#ovStatus').value = rec.override.status;
    $('#ovStatus').addEventListener('change', (e) => { rec.override.status = e.target.value; renderResult(); });
    $('#ovRemarks').addEventListener('input', (e) => { rec.override.remarks = e.target.value; });
    $('#btnSave').addEventListener('click', () => saveToHistory(rec));
    $('#btnRecheck')?.addEventListener('click', () => evaluate());
    $('#btnPrint').addEventListener('click', () => window.print());
    $('#btnCsv').addEventListener('click', () => exportCsv(rec));
    $('#btnJson').addEventListener('click', () => download(`${slug(rec.item)}-${rec.id}.json`, JSON.stringify(stripForExport(rec), null, 2), 'application/json'));
    $('#btnNewInspection').addEventListener('click', () => { state.cur = null; $('#mSerial').value = ''; $('#mNotes').value = ''; renderItems(); show('setup'); });
    $('#btnRecapture')?.addEventListener('click', () => { show('capture'); renderCapture(); startCamera(); });
    $('#btnRender')?.addEventListener('click', () => generateRender(rec));
    $$('#view-result [data-zoom]').forEach((img) => img.addEventListener('click', () => zoom(img.src)));
    if (shotAngles.length) setupSpin(shotAngles.map((a) => ({ name: a.name, src: rec.shots[a.name].dataUrl })));
  }

  function partRow(c) {
    const where = c.group === 'Any view' && c.foundIn ? ` – seen in ${c.foundIn}` : '';
    return `<li class="${c.status}">
      <span class="ic ${c.status}" aria-label="${STATUS_TEXT[c.status]}">${icon(ICON[c.status])}</span>
      <span><span class="pn">${esc(c.part)}</span><span class="pnote">${esc(STATUS_TEXT[c.status] + where + (c.note ? ' – ' + c.note : ''))}</span></span>
      <span class="pc">${Math.round((c.confidence || 0) * 100)}%</span>
    </li>`;
  }

  function zoom(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${src}" alt="Enlarged photo" />`;
    const close = () => { lb.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    lb.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
  }

  // 360° viewer: drag across captured views
  function setupSpin(frames) {
    let idx = 0;
    const img = $('#spinImg'), label = $('#spinLabel'), box = $('#spin');
    const draw = () => { img.src = frames[idx].src; label.textContent = `${frames[idx].name} (${idx + 1}/${frames.length})`; };
    const step = (d) => { idx = (idx + d + frames.length) % frames.length; draw(); };
    draw();
    $('#spinPrev').addEventListener('click', () => step(-1));
    $('#spinNext').addEventListener('click', () => step(1));
    $('#spinPlay').addEventListener('click', (e) => {
      if (state.spinTimer) { stopSpin(); e.target.textContent = 'Auto-rotate'; }
      else { state.spinTimer = setInterval(() => step(1), 900); e.target.textContent = 'Stop'; }
    });
    let startX = null;
    box.addEventListener('pointerdown', (e) => { startX = e.clientX; box.setPointerCapture(e.pointerId); });
    box.addEventListener('pointermove', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 45) { step(dx > 0 ? -1 : 1); startX = e.clientX; }
    });
    const end = () => { startX = null; };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
  }
  function stopSpin() { clearInterval(state.spinTimer); state.spinTimer = null; }

  async function generateRender(rec) {
    const images = rec.angles.filter((a) => rec.shots[a.name]).slice(0, 6).map((a) => rec.shots[a.name].dataUrl);
    loading(true, 'Creating 3D render… this can take up to a minute');
    try {
      const out = await api('/api/render3d', { item: rec.item, images });
      rec.render3d = out.image;
      renderResult();
      toast('3D render ready');
    } catch (e) { toast(e.message, true); }
    finally { loading(false); }
  }

  // ---------- export ----------
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'inspection';

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function stripForExport(rec) {
    const { fromHistory, saved, ...rest } = rec;
    return { ...rest, finalStatus: finalStatus(rec) };
  }

  function exportCsv(rec) {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Item', 'Serial', 'Inspector', 'Date', 'Final status', 'AI status', 'Completion %', 'View', 'Part', 'Status', 'Confidence %', 'Note'];
    const rows = rec.result.checklist.map((c) => [
      rec.item, rec.meta.serial, rec.meta.inspector, fmtDate(rec.result.evaluatedAt), finalStatus(rec), rec.result.status,
      rec.result.completion, c.group, c.part, c.status, Math.round(c.confidence * 100), c.note,
    ]);
    const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
    download(`${slug(rec.item)}-${rec.id}.csv`, csv, 'text/csv;charset=utf-8');
  }

  // ---------- history (stored on this device) ----------
  function shrink(dataUrl, side = THUMB_SIDE, qual = 0.6) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', qual));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function saveToHistory(rec) {
    const small = { ...clone({ ...rec, shots: {}, render3d: null }), saved: true, fromHistory: false };
    for (const [name, s] of Object.entries(rec.shots)) {
      small.shots[name] = { ...s, dataUrl: await shrink(s.dataUrl) };
    }
    if (rec.render3d) small.render3d = await shrink(rec.render3d, 512, 0.7);

    const hist = LS.get('pc_history', []).filter((h) => h.id !== rec.id);
    hist.unshift(small);
    let ok = LS.set('pc_history', hist);
    let dropped = 0;
    while (!ok && hist.length > 1) { hist.pop(); dropped++; ok = LS.set('pc_history', hist); }
    if (!ok) { toast('Device storage is full. Export and clear history first.', true); return; }
    rec.saved = true;
    renderResult();
    toast(dropped ? `Saved. ${dropped} oldest inspection(s) removed to make space.` : 'Saved to history');
  }

  function renderHistory() {
    const hist = LS.get('pc_history', []);
    const statusOf = (h) => h.override?.status || h.result.status;
    const counts = { ALL: hist.length, PASS: 0, FAIL: 0, REVIEW: 0 };
    hist.forEach((h) => { counts[statusOf(h)]++; });
    $('#histFilters').hidden = !hist.length;
    $('#histFilters').innerHTML = ['ALL', 'PASS', 'FAIL', 'REVIEW'].map((f) =>
      `<button type="button" role="tab" class="filter ${state.histFilter === f ? 'on' : ''}" data-f="${f}" aria-selected="${state.histFilter === f}">${f === 'ALL' ? 'All' : f} (${counts[f]})</button>`).join('');
    $$('#histFilters .filter').forEach((b) => b.addEventListener('click', () => { state.histFilter = b.dataset.f; renderHistory(); }));

    const list = $('#historyList');
    if (!hist.length) {
      list.innerHTML = `<div class="empty">${icon('clock')}<p><b>No saved inspections yet.</b></p><p class="muted">Finish an inspection and tap Save to history.</p><button type="button" class="btn primary" data-go="setup">${icon('camera')}Start an inspection</button></div>`;
      $('[data-go]', list).addEventListener('click', () => { renderItems(); show('setup'); });
      return;
    }
    const shown = hist.filter((h) => state.histFilter === 'ALL' || statusOf(h) === state.histFilter);
    if (!shown.length) { list.innerHTML = `<div class="empty"><p class="muted">No ${esc(state.histFilter)} inspections.</p></div>`; return; }
    list.innerHTML = shown.map((h) => {
      const first = Object.values(h.shots)[0];
      const st = statusOf(h);
      return `<div class="hrow">
        ${first?.dataUrl ? `<img src="${first.dataUrl}" alt="" loading="lazy" />` : '<span class="ph"></span>'}
        <div>
          <div class="ht">${esc(h.item)}${h.meta.serial ? ' #' + esc(h.meta.serial) : ''}</div>
          <div class="hs">${esc(fmtDate(h.result.evaluatedAt || h.createdAt))}</div>
          <div class="hs">${h.result.completion}% complete${h.meta.inspector ? ', by ' + esc(h.meta.inspector) : ''}</div>
        </div>
        <div class="hbtns">
          <span class="hstat ${st}">${st}</span>
          <button type="button" class="btn ghost small" data-open="${h.id}">Open</button>
          <button type="button" class="icon-btn" data-del="${h.id}" aria-label="Delete" title="Delete">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('');
    $$('[data-open]', list).forEach((b) => b.addEventListener('click', () => {
      const rec = LS.get('pc_history', []).find((h) => h.id === b.dataset.open);
      if (!rec) return;
      state.cur = { ...rec, fromHistory: true, saved: true };
      renderResult();
      show('result');
    }));
    $$('[data-del]', list).forEach((b) => b.addEventListener('click', () => {
      if (!confirm('Delete this inspection?')) return;
      LS.set('pc_history', LS.get('pc_history', []).filter((h) => h.id !== b.dataset.del));
      renderHistory();
    }));
  }

  $('#btnExportAll').addEventListener('click', () => {
    const hist = LS.get('pc_history', []);
    if (!hist.length) { toast('Nothing to export yet.'); return; }
    download(`partcheck-history-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(hist, null, 2), 'application/json');
  });
  $('#btnClearHistory').addEventListener('click', () => {
    if (!confirm('Delete ALL saved inspections from this device?')) return;
    LS.set('pc_history', []);
    renderHistory();
    toast('History cleared');
  });

  // ---------- navigation ----------
  $$('[data-nav]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    const v = el.dataset.nav;
    if (v === 'history') renderHistory();
    if (v === 'setup') renderItems();
    show(v);
  }));

  window.addEventListener('beforeunload', (e) => {
    if (state.cur && Object.keys(state.cur.shots).length && !state.cur.saved) { e.preventDefault(); e.returnValue = ''; }
  });

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

  // ---------- boot: password check first ----------
  async function boot() {
    hydrateIcons();
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      state.server = await r.json();
    } catch {
      state.server = {};
    }
    if (state.server.passwordConfigured === false) { showLogin({ config: true }); return; }
    const saved = LS.get('pc_pw', '');
    if (saved) {
      const res = await login(saved);
      if (res.ok) { enterApp(); return; }
      if (res.code === 'NO_PASSWORD') { showLogin({ config: true }); return; }
      LS.del('pc_pw');
      showLogin({ msg: res.code === 'BAD_PASSWORD' ? 'Password changed. Enter the new password.' : res.error });
      return;
    }
    showLogin();
  }

  boot();
})();
