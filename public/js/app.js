/* Inspection AI 5.0 – CLIENT DEMO
   Same flows as the real product (inspect, live scan, photo by photo, result, sign-off, reports, QR tags),
   but the camera shows real sample site photos and the AI findings are pre-recorded (see demo-data.js).
   No server or API keys needed. */
(() => {
  'use strict';
  const D = window.DEMO;
  const M = window.MEDIA;

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const splitLines = (s) => String(s || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
  const fmtDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
  const cap = (s) => String(s || '').replace(/^\s*([a-z])/, (m, c) => m.replace(c, c.toUpperCase()));
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
    return fmtDay(iso);
  }
  const splitCheck = (s) => {
    let t = String(s || '').trim();
    const critical = t.startsWith('!');
    if (critical) t = t.slice(1);
    const [n, ...r] = t.split('::');
    return { name: n.trim(), rule: r.join('::').trim(), critical };
  };
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  // ---------- activity log: sends who did what to the server (logs/activity.log) ----------
  const SESSION_ID = Math.random().toString(36).slice(2, 10);
  function track(action, detail = {}) {
    try {
      const u = LS.get('ia_user', null);
      const body = JSON.stringify({ email: u?.email || '', action, detail, view: document.body.dataset.view || '', session: SESSION_ID });
      if (navigator.sendBeacon && navigator.sendBeacon('/api/log', new Blob([body], { type: 'text/plain' }))) return;
      fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* logging must never break the app */ }
  }
  const ANY = 'Any view';
  // evidence outline: [x, y, w, h] rectangle or { poly: [[x, y], ...] }, all as fractions of the photo
  const bboxOf = (b) => {
    if (!b) return null;
    if (Array.isArray(b)) return b;
    const xs = b.poly.map((p) => p[0]), ys = b.poly.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  // the photo (view) a check's evidence is shown on
  const viewOf = (c) => c.foundIn || c.group;
  // scaffold duty classes and safe working load (SWL, kg)
  const DUTIES = ['Light', 'Medium', 'Heavy', 'Special'];
  const normDuty = (d) => {
    const t = String(d || '').trim().replace(/\s*duty$/i, '');
    if (/^general$/i.test(t)) return 'Medium';
    return DUTIES.find((x) => x.toLowerCase() === t.toLowerCase()) || '';
  };
  const dutyText = (d) => (normDuty(d) ? `${normDuty(d)} duty` : '');
  const fmtM = (v) => (Number(v) > 0 ? `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 })} m` : '');
  // "12 m high × 18 m long, 6 lifts"
  const sizeText = (a) => [[a.height && `${fmtM(a.height)} high`, a.length && `${fmtM(a.length)} long`].filter(Boolean).join(' × '), a.lifts && `${a.lifts} lifts`].filter(Boolean).join(', ');
  function readMeters(input, label) {
    const raw = String(input.value || '').trim();
    input.classList.remove('invalid');
    if (!raw) return '';
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 1000) { input.classList.add('invalid'); input.focus(); throw new Error(`${label} must be a number in metres, between 0.1 and 1,000.`); }
    return String(Math.round(n * 10) / 10);
  }
  const swlText = (v) => (Number(v) > 0 ? `${Number(v).toLocaleString('en-IN')} kg` : '');
  function readSwl(input) {
    const raw = String(input.value || '').trim();
    input.classList.remove('invalid');
    if (!raw) return '';
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 100000) { input.classList.add('invalid'); input.focus(); throw new Error('SWL must be a whole number in kg, between 1 and 100,000.'); }
    return String(n);
  }
  const SEED_VERSION = 'ia_seed_v6';

  // ---------- state ----------
  const state = {
    user: LS.get('ia_user', null),
    profile: LS.get('ia_profile', { name: '', role: 'Site safety officer', company: 'Orchid Infra Pvt Ltd', site: 'Orchid Heights, Pune' }),
    types: LS.get('ia_types', null) || clone(D.TYPES),
    assets: LS.get('ia_assets', []),
    history: LS.get('ia_history', []),
    speed: LS.get('ia_speed', 1),
    selTypeId: LS.get('ia_last_type', 'type-scaffold'),
    scenario: 'pass',
    fromAsset: null,
    editor: null,
    cur: null,
    view: 'home',
    histFilter: 'all', histQuery: '', typeQuery: '',
    installEvt: null,
    started: false,
  };
  const getType = (id) => state.types.find((t) => t.id === id);
  const getAsset = (id) => state.assets.find((a) => a.id.toLowerCase() === String(id || '').toLowerCase());
  const saveTypes = () => LS.set('ia_types', state.types);
  const saveAssets = () => { window.DEMO_SWL = Object.fromEntries(state.assets.filter((a) => a.swl).map((a) => [a.id, a.swl])); return LS.set('ia_assets', state.assets); };
  const countChecks = (t) => t.angles.reduce((n, a) => n + a.parts.length, 0) + (t.general_parts || []).length;
  function saveHistory() {
    let ok = LS.set('ia_history', state.history);
    while (!ok && state.history.length > 2) { state.history.pop(); ok = LS.set('ia_history', state.history); }
    return ok;
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('err', isErr); t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 4500 : 2600);
  }

  // ---------- result tag logic (same rules as the real app) ----------
  const TAG_WORDS = {
    safety: { GREEN: { word: 'SAFE TO USE', sub: 'All checks passed' }, YELLOW: { word: 'USE WITH CAUTION', sub: 'Some points need checking' }, RED: { word: 'DO NOT USE', sub: 'Fix or verify the flagged points' } },
    standard: { GREEN: { word: 'PASSED', sub: 'All checks passed' }, YELLOW: { word: 'NEEDS REVIEW', sub: 'Some points could not be confirmed' }, RED: { word: 'FAILED', sub: 'One or more checks failed' } },
  };
  const isSafety = (rec) => rec?.safety ?? rec?.module === 'scaffold';
  const tagWords = (rec, tag) => (isSafety(rec) ? TAG_WORDS.safety : TAG_WORDS.standard)[tag] || TAG_WORDS.standard.YELLOW;
  function resultTag(rec) {
    if (!rec?.result) return 'NONE';
    const ov = rec.override?.status;
    if (ov === 'PASS') return 'GREEN';
    if (ov === 'REVIEW') return 'YELLOW';
    if (ov === 'FAIL') return 'RED';
    const st = rec.result.status;
    const critBad = (rec.result.checklist || []).some((c) => c.critical && c.status !== 'present');
    if (st === 'FAIL' || (st === 'REVIEW' && critBad)) return 'RED';
    if (st === 'REVIEW') return 'YELLOW';
    return 'GREEN';
  }
  const TAG_LABEL = { GREEN: 'Green', YELLOW: 'Yellow', RED: 'Red', NONE: 'Not inspected' };

  // ---------- SCRIPTED AI ENGINE ----------
  function scriptFor(rec) { return rec.module === 'scaffold' ? D.SCAFFOLD_SCRIPT[D.SCAFFOLD_SCRIPT[rec.scenario] ? rec.scenario : 'pass'] : null; }
  const SCEN_LABEL = { pass: 'Pass', fail: 'Fail', site: 'Site photos' };

  // Which demo photo the camera shows for a view
  const genericCache = new Map();
  function imageKeyFor(rec, viewName) {
    const sc = scriptFor(rec);
    if (sc && sc.images[viewName]) {
      const k = sc.images[viewName];
      if (k.endsWith('-tag')) {
        const when = new Date(rec.createdAt).getTime() - (rec.scenario === 'fail' ? 21 : 6) * 864e5;
        return `${k}|${rec.asset.id || 'SC-000'}|${isoDay(when)}`;
      }
      return k;
    }
    return null;
  }
  async function demoImageFor(rec, viewName) {
    const key = imageKeyFor(rec, viewName);
    if (key) return M.getImage(key);
    const gk = `${rec.typeId}|${viewName}`;
    if (!genericCache.has(gk)) {
      const i = rec.angles.findIndex((a) => a.name === viewName);
      const src = M.drawGeneric(`${rec.typeName} – ${viewName}`, Math.max(0, i));
      genericCache.set(gk, new Promise((res) => { const img = new Image(); img.onload = () => res({ img, src, generated: true }); img.src = src; }));
    }
    return genericCache.get(gk);
  }

  // The checklist the "AI" returns for this record
  function scriptedChecklist(rec) {
    const sc = scriptFor(rec);
    const fail = rec.scenario === 'fail';
    const rows = [];
    let failedOne = false, unclearOne = false;
    const make = (group, part, idx) => {
      const c = splitCheck(part);
      let s = sc?.checks[c.name];
      if (!s) {
        // generic script for other inspection types and custom checks
        let status = 'present';
        if (fail && !failedOne && (c.critical || idx > 0)) { status = 'missing'; failedOne = true; }
        else if (fail && !unclearOne && !c.critical) { status = 'unclear'; unclearOne = true; }
        const conf = status === 'present' ? 0.86 + ((c.name.length * 7) % 12) / 100 : status === 'missing' ? 0.88 : 0.55;
        const evidence = status === 'present' ? `${c.name} clearly visible – ${c.rule || 'present on the item'}` : status === 'missing' ? `Not true in the photo: ${c.rule || c.name + ' is not there'}` : `${c.name} is partly hidden – could not confirm`;
        s = { status, confidence: conf, evidence, box: null };
      }
      const row = { id: uid(), group, part, critical: c.critical, status: s.status, confidence: s.confidence, note: s.evidence, box: s.box || null };
      if (s.status === 'present') row.note += ' · confirmed by second check';
      if (group === ANY) row.foundIn = sc?.generalFoundIn?.[c.name] || rec.angles[0]?.name || '';
      else if (s.on) row.foundIn = s.on;
      return row;
    };
    rec.angles.forEach((a) => a.parts.forEach((p, i) => rows.push(make(a.name, p, i))));
    (rec.general_parts || []).forEach((p, i) => rows.push(make(ANY, p, i + 1)));
    return rows;
  }

  function decide(rows, defects, rec) {
    const total = rows.length;
    const present = rows.filter((c) => c.status === 'present').length;
    const missing = rows.filter((c) => c.status === 'missing').length;
    const unclear = total - present - missing;
    const completion = total ? Math.round((present / total) * 100) : 100;
    const high = defects.filter((d) => d.severity === 'high').length;
    const critFail = rows.filter((c) => c.critical && c.status === 'missing').length;
    const critUnclear = rows.filter((c) => c.critical && c.status === 'unclear').length;
    const reasons = [];
    if (critFail) reasons.push(`${critFail} critical safety check${critFail > 1 ? 's' : ''} failed`);
    if (missing) reasons.push(`${missing} check${missing > 1 ? 's' : ''} failed`);
    if (critUnclear) reasons.push(`${critUnclear} critical check${critUnclear > 1 ? 's' : ''} not confirmed`);
    if (high) reasons.push(`${high} serious defect${high > 1 ? 's' : ''} found`);
    if (unclear) reasons.push(`${unclear} check${unclear > 1 ? 's' : ''} could not be confirmed`);
    let status = 'PASS';
    if (missing || high) status = 'FAIL'; else if (unclear) status = 'REVIEW';
    if (status === 'PASS') reasons.push('All checks confirmed twice');
    return { status, completion, counts: { total, present, missing, unclear }, reasons };
  }

  function buildResult(rec, rows, extra = {}) {
    const sc = scriptFor(rec);
    const fail = rec.scenario === 'fail';
    const defects = sc ? clone(sc.defects) : fail ? [{ angle: rec.angles[0]?.name || '', description: `${splitCheck(rows.find((r) => r.status === 'missing')?.part || 'Item').name} not in order`, severity: 'medium' }] : [];
    const summary = sc ? sc.summary : fail ? `${rec.typeName} needs attention: one check failed and one could not be confirmed.` : `${rec.typeName} is in order. Every check was confirmed in the photos.`;
    const recommendations = sc ? sc.recommendations : fail ? ['Fix the failed point and re-inspect.', 'Retake the unclear view in better light.'] : ['Next routine check as per schedule.'];
    const d = decide(rows, defects, rec);
    return {
      ...d, checklist: rows,
      ai: { item_identified: rec.typeName, item_matches: true, defects, summary, recommendations },
      secondCheck: true, evaluatedAt: extra.evaluatedAt || new Date().toISOString(), liveStats: extra.liveStats || null, demo: true,
    };
  }

  // old saved data: "General duty" -> Medium, fill SWL of the sample tags
  function migrateAssets() {
    const seedSwl = Object.fromEntries(D.ASSETS.map((a) => [a.id, a]));
    state.assets.forEach((a) => {
      a.duty = normDuty(a.duty);
      if (!a.length && seedSwl[a.id]?.length && a.typeId === seedSwl[a.id].typeId) a.length = seedSwl[a.id].length;
      if (!a.swl && seedSwl[a.id]?.swl && a.typeId === seedSwl[a.id].typeId) { a.swl = seedSwl[a.id].swl; if (!a.duty) a.duty = seedSwl[a.id].duty; }
    });
    state.history.forEach((h) => { if (h.asset) { h.asset.duty = normDuty(h.asset.duty); if (!h.asset.swl && seedSwl[h.asset.id]) h.asset.swl = seedSwl[h.asset.id].swl || ''; if (!h.asset.length && seedSwl[h.asset.id]) h.asset.length = seedSwl[h.asset.id].length || ''; } });
    window.DEMO_SWL = Object.fromEntries(state.assets.filter((a) => a.swl).map((a) => [a.id, a.swl]));
  }

  // ---------- seeding: sample tags + two sample reports ----------
  async function seed(force = false) {
    if (!force && LS.get(SEED_VERSION, false)) return;
    const seeded = D.ASSETS.map((a) => ({ ...a, createdAt: new Date(Date.now() - a.createdDaysAgo * 864e5).toISOString() }));
    // a reset restores the sample tags; an upgrade keeps every tag the user has (and their edits) and only adds missing samples
    state.assets = force ? seeded : [...state.assets, ...seeded.filter((a) => !state.assets.some((x) => x.id === a.id))];
    const keep = force ? [] : state.history.filter((h) => !h.sample);
    const samples = [];
    for (const s of D.SEED_REPORTS) {
      const asset = state.assets.find((a) => a.id === s.assetId);
      const t = getType(asset.typeId) || D.TYPES[0];
      const when = new Date(); when.setDate(when.getDate() - s.daysAgo); when.setHours(s.hour, 12, 0, 0);
      const rec = blankRecord(t, { asset, scenario: s.scenario, inspector: s.inspector, mode: s.mode, createdAt: when.toISOString() });
      rec.sample = true;
      for (const a of rec.angles) {
        const key = imageKeyFor(rec, a.name);
        let src;
        if (key && key.includes('-tag|')) src = (await M.getImage(key)).src;
        else if (key) { const c = D.COMMONS[key]; src = `https://upload.wikimedia.org/wikipedia/commons/thumb/${c.path}/1280px-${c.path.split('/').pop()}`; }
        else src = (await demoImageFor(rec, a.name)).src;
        rec.shots[a.name] = { src, key, ts: when.toISOString(), quality: { ok: true, brightness: 132, sharpness: 210 } };
      }
      const rows = scriptedChecklist(rec);
      rec.result = buildResult(rec, rows, { evaluatedAt: new Date(when.getTime() + 6 * 60000).toISOString(), liveStats: s.mode === 'live' ? { frames: 46, seconds: 74 } : null });
      rec.override = { status: '', remarks: s.remarks };
      rec.signoff = s.signed ? { done: true, by: s.inspector, at: new Date(when.getTime() + 9 * 60000).toISOString() } : { done: false };
      rec.saved = true;
      rec.reportNo = reportNo(rec);
      samples.push(rec);
    }
    state.history = [...keep, ...samples].sort((a, b) => new Date(b.result?.evaluatedAt || b.createdAt) - new Date(a.result?.evaluatedAt || a.createdAt));
    migrateAssets(); saveAssets(); saveHistory();
    LS.set(SEED_VERSION, true);
  }
  // report built from the client's real site photos (taken 21 Oct 2026, 11:08–11:09)
  function seedSite(force = false) {
    const FLAG = 'ia_seed_site_v3';
    if (!force && LS.get(FLAG, false)) return;
    const def = D.ASSETS.find((a) => a.id === 'SC-040');
    let asset = getAsset('SC-040');
    if (asset && force && def) Object.assign(asset, { ...def, createdAt: asset.createdAt });
    if (!asset && def) { asset = { ...def, createdAt: new Date(2026, 9, 18, 10, 0).toISOString() }; state.assets.unshift(asset); }
    if (!asset) return;
    const t = getType('type-scaffold') || D.TYPES[0];
    const sc = D.SCAFFOLD_SCRIPT.site;
    const at = (hms) => { const [h, m, x] = hms.split(':').map(Number); return new Date(2026, 9, 21, h, m, x).toISOString(); };
    const rec = blankRecord(t, { asset, scenario: 'site', mode: 'photo', createdAt: at('11:08:40'), reason: 'Before first use / handover' });
    rec.sample = true;
    rec.angles.forEach((a) => {
      const key = sc.images[a.name];
      if (key) rec.shots[a.name] = { src: 'demo/images/' + D.LOCAL[key], key, ts: at(sc.shotTimes[a.name]), quality: { ok: true } };
    });
    rec.result = buildResult(rec, scriptedChecklist(rec), { evaluatedAt: at('11:14:20') });
    rec.override = { status: '', remarks: 'Red tagged at the ladder access. Contractor informed to secure the ladder, fit toe boards and replace the rusted base jack before re-inspection.' };
    rec.signoff = { done: true, by: rec.meta.inspector, at: at('11:18:05') };
    rec.saved = true;
    rec.reportNo = reportNo(rec);
    state.history = [...state.history.filter((h) => !(h.sample && h.scenario === 'site')), rec]
      .sort((a, b) => new Date(b.result?.evaluatedAt || b.createdAt) - new Date(a.result?.evaluatedAt || a.createdAt));
    saveAssets(); saveHistory();
    LS.set(FLAG, true);
  }

  function reportNo(rec) {
    const d = new Date(rec.result?.evaluatedAt || rec.createdAt);
    return `IR-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${(rec.asset.id || 'X').replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase()}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ---------- records ----------
  function blankRecord(t, o = {}) {
    const asset = o.asset || {};
    const scaffold = t.module === 'scaffold';
    const location = o.location ?? asset.location ?? '';
    const desc = [t.description, normDuty(o.duty ?? asset.duty) && dutyText(o.duty ?? asset.duty), swlText(o.swl ?? asset.swl) && `SWL ${swlText(o.swl ?? asset.swl)}`, sizeText({ height: o.height ?? asset.height, length: o.length ?? asset.length }), asset.lifts && `${asset.lifts} lifts`].filter(Boolean).join('. ');
    return {
      id: uid(), mode: o.mode || 'photo', typeId: t.id, typeName: t.name, module: t.module || '', safety: Boolean(t.safety),
      idLabel: t.idLabel || 'Asset ID', scenario: o.scenario || 'pass', assetId: asset.id && getAsset(asset.id) ? asset.id : null,
      asset: {
        id: o.id ?? asset.id ?? '', location, site: asset.site || state.profile.site || '',
        height: scaffold ? (o.height ?? asset.height ?? '') : '', length: scaffold ? (o.length ?? asset.length ?? '') : '', lifts: scaffold ? (o.lifts ?? asset.lifts ?? '') : '',
        duty: scaffold ? normDuty(o.duty ?? asset.duty ?? '') : '', swl: scaffold ? (o.swl ?? asset.swl ?? '') : '', erector: scaffold ? (o.erector ?? asset.erector ?? '') : '',
        lastInspection: o.lastInspection || '', reason: o.reason || 'Routine check',
      },
      createdAt: o.createdAt || new Date().toISOString(), item: t.name, description: desc,
      angles: clone(t.angles), general_parts: clone(t.general_parts || []),
      meta: { inspector: o.inspector || state.profile.name || state.user?.name || 'Site inspector', notes: o.notes || '', gps: null, company: state.profile.company || '' },
      shots: {}, result: null, override: { status: '', remarks: '' }, signoff: { done: false, by: '', at: '' }, saved: false,
    };
  }

  // ---------- navigation ----------
  const CAM_VIEWS = ['capture', 'live', 'scan'];
  const NAV_OF = { home: 'home', setup: 'setup', details: 'setup', editor: 'settings', capture: 'setup', live: 'setup', scan: 'scan', result: 'reports', reports: 'reports', tags: 'tags', settings: 'settings' };
  const leaveHooks = [];
  function show(view, opts = {}) {
    const prev = state.view;
    if (prev !== view) leaveHooks.forEach((fn) => fn(prev, view));
    state.view = view;
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
    if (prev !== view) { document.body.dataset.view = view; if (!document.body.classList.contains('locked')) track('page_view', { page: view }); }
    document.body.classList.toggle('cam', CAM_VIEWS.includes(view));
    const nav = view === 'editor' && state.editor?.returnTo !== 'settings' ? 'setup' : NAV_OF[view];
    $$('.tabbar [data-go], .side-nav [data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === nav));
    $('#btnBack').hidden = !['result', 'details', 'editor'].includes(view);
    const r = RENDER[view]; if (r) r();
    if (opts.push !== false && location.hash !== '#' + view) history.pushState({ view }, '', '#' + view);
    if (!opts.keepScroll) window.scrollTo({ top: 0 });
  }
  const RENDER = {};
  function safeView(v) {
    const ok = ['home', 'setup', 'details', 'editor', 'capture', 'live', 'scan', 'result', 'reports', 'tags', 'settings'];
    if (!ok.includes(v)) return 'home';
    if (['capture', 'live'].includes(v) && !state.cur) return 'setup';
    if (v === 'details' && !getType(state.selTypeId)) return 'setup';
    if (v === 'editor' && !state.editor) return 'settings';
    if (v === 'result' && !state.cur?.result) return 'reports';
    return v;
  }
  window.addEventListener('popstate', (e) => {
    if (document.body.classList.contains('locked')) return;
    closeModal(); closeDoc();
    const v = safeView(e.state?.view || location.hash.slice(1));
    if (['capture', 'live'].includes(state.view) && state.cur && !state.cur.result && Object.keys(state.cur.shots || {}).length && !confirm('Leave this inspection? Photos not checked yet will be lost.')) {
      history.pushState({ view: state.view }, '', '#' + state.view); return;
    }
    show(v, { push: false });
  });
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    e.preventDefault();
    closeModal();
    show(go.dataset.go);
  });
  $('#btnBack').addEventListener('click', () => history.back());

  // ---------- modal + analysing overlay ----------
  function openModal(html, onMount) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-card">${html}</div></div>`;
    const m = $('.modal', root);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModal(); });
    onMount?.(m);
    setTimeout(() => $('button, input', m)?.focus({ preventScroll: true }), 30);
    return m;
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeDoc(); } });

  async function analyse(photoSrc, steps, totalMs = 4200) {
    const el = document.createElement('div');
    el.className = 'analyse';
    el.innerHTML = `<div class="analyse-box">
      ${photoSrc ? `<div class="analyse-photo"><img src="${esc(photoSrc)}" alt="" /></div>` : ''}
      <h3>${photoSrc ? 'Checking every point' : 'AI is working'}</h3>
      <ul class="steps">${steps.map((s) => `<li><i></i>${esc(s)}</li>`).join('')}</ul></div>`;
    document.body.appendChild(el);
    const lis = $$('.steps li', el);
    const per = totalMs / steps.length / Math.max(1, state.speed > 1 ? 1.6 : 1);
    for (let i = 0; i < lis.length; i++) {
      lis[i].classList.add('doing');
      await sleep(per);
      lis[i].classList.remove('doing'); lis[i].classList.add('done'); $('i', lis[i]).textContent = '✓';
    }
    await sleep(250);
    el.remove();
  }

  // ---------- SIGN IN (demo) ----------
  function showLogin(msg) {
    document.body.classList.add('locked');
    $('#splash').hidden = true;
    $('#loginScreen').hidden = false;
    $('#loginUser').value = state.user?.email || '';
    if (msg) $('.login-hint').textContent = msg;
    M.getImage('p-elev').then((r) => { $('#loginArt').src = r.src; }).catch(() => {});
    setTimeout(() => ($('#loginUser').value ? $('#loginPass') : $('#loginUser')).focus(), 60);
  }
  $('#pwToggle').addEventListener('click', () => {
    const i = $('#loginPass'); const s = i.type === 'password';
    i.type = s ? 'text' : 'password'; $('#pwToggle').textContent = s ? 'Hide' : 'Show';
  });
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#loginUser').value.trim().toLowerCase();
    const name = email.split('@')[0];
    const err = (m) => { $('#loginErr').textContent = m; const c = $('.login-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err('Enter a valid email ID.'); $('#loginUser').focus(); return; }
    if (!$('#loginPass').value) { err('Enter any password.'); $('#loginPass').focus(); return; }
    $('#loginBtn').disabled = true; $('#loginBtn').textContent = 'Signing in…';
    await sleep(650);
    state.user = { name, email, at: new Date().toISOString() };
    LS.set('ia_user', state.user);
    track('login');
    state.profile.name = name; LS.set('ia_profile', state.profile);
    $('#loginBtn').disabled = false; $('#loginBtn').textContent = 'Sign in';
    unlock();
    toast(`Signed in as ${name}`);
  });
  function signOut() {
    if (!confirm('Sign out of this demo?')) return;
    track('logout');
    LS.del('ia_user'); state.user = null; state.cur = null;
    show('home', { push: false });
    showLogin('You are signed out.');
  }
  $('#btnSignOut').addEventListener('click', signOut);
  $('#sideSignOut').addEventListener('click', signOut);

  // sample reports and tag drawings carry the signed-in inspector's name
  function syncSampleNames() {
    const name = state.profile.name || state.user?.name || 'Site inspector';
    window.DEMO_INSPECTOR = name;
    M.forgetTags();
    let changed = false;
    state.history.forEach((h) => {
      if (!h.sample) return;
      if (h.meta.inspector !== name) { h.meta.inspector = name; changed = true; }
      if (h.signoff?.done && h.signoff.by !== name) { h.signoff.by = name; changed = true; }
      Object.values(h.shots || {}).forEach((sh) => {
        if (!sh.key?.includes('-tag|')) return;
        const [k, id, date] = sh.key.split('|');
        sh.src = M.drawTag(k === 'p-tag' ? 'pass' : 'fail', id, date); changed = true;
      });
    });
    if (changed) saveHistory();
  }

  function unlock() {
    syncSampleNames();
    $('#loginScreen').hidden = true; $('#splash').hidden = true;
    document.body.classList.remove('locked');
    paintProfile();
    const hash = location.hash.slice(1);
    if (!state.started) {
      state.started = true;
      const tagMatch = hash.match(/^tag\/(.+)$/i);
      const v = tagMatch ? 'home' : safeView(hash || 'home');
      history.replaceState({ view: v }, '', '#' + v);
      show(v, { push: false });
      if (tagMatch) setTimeout(() => openScannedTag(decodeURIComponent(tagMatch[1])), 200);
    } else show(state.view, { push: false });
  }
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#tag\/(.+)$/i);
    if (m && !document.body.classList.contains('locked')) { history.replaceState({ view: state.view }, '', '#' + state.view); openScannedTag(decodeURIComponent(m[1])); }
  });

  // ---------- profile bits ----------
  const initials = (n) => (String(n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
  function paintProfile() {
    const p = state.profile;
    const name = p.name || state.user?.name || 'Inspector';
    $('#topAvatar').textContent = initials(name);
    $('#sideAvatar').textContent = initials(name);
    $('#sideName').textContent = name;
    $('#sideRole').textContent = p.role || 'Demo workspace';
  }

  // ---------- HOME ----------
  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function lastReportFor(assetId) { return state.history.find((h) => h.assetId === assetId || (h.asset?.id && h.asset.id === assetId)); }
  function dueInfo(asset) {
    const last = lastReportFor(asset.id);
    if (!last) return { tag: 'NONE', text: 'Not inspected yet', due: true };
    const tag = resultTag(last);
    const days = Math.floor((Date.now() - new Date(last.result.evaluatedAt).getTime()) / 864e5);
    const dueIn = 7 - days;
    return { tag, last, text: tag === 'RED' ? 'Red tagged – do not use' : dueIn < 0 ? `Overdue by ${-dueIn} d` : dueIn === 0 ? 'Due today' : `Next due in ${dueIn} d`, due: dueIn <= 0 || tag === 'RED' };
  }
  function rowHtml(h) {
    const tag = resultTag(h);
    const a = h.asset || {};
    const sub = [h.typeName, a.location, ago(h.result?.evaluatedAt || h.createdAt), h.meta?.inspector].filter(Boolean).join(', ');
    const first = Object.values(h.shots || {})[0];
    const thumb = first?.src;
    return `<button type="button" class="row" data-open="${esc(h.id)}">
      <span class="minitag ${tag}" aria-label="${TAG_LABEL[tag]}">${tag === 'NONE' ? '–' : tag[0]}</span>
      ${thumb ? `<img class="row-thumb" src="${esc(thumb)}" ${first.key ? `data-key="${esc(first.key)}"` : ''} alt="" />` : ''}
      <span class="row-main"><span class="row-title">${esc(a.id || h.typeName)} ${h.sample ? '<span class="pill sample">Sample</span>' : ''}</span><span class="row-sub">${esc(sub)}</span></span>
      <svg class="row-chev" aria-hidden="true"><use href="#i-chev"/></svg></button>`;
  }
  function wireRows(box) { $$('[data-open]', box).forEach((b) => b.addEventListener('click', () => openHistory(b.dataset.open))); }

  RENDER.home = () => {
    const p = state.profile;
    $('#greet').textContent = `${greeting()}${(p.name || state.user?.name) ? ', ' + (p.name || state.user.name).split(' ')[0] : ''}`;
    $('#homeSite').textContent = p.site || 'Your site';
    M.getImage('x-site').then((r) => { $('#heroImg').style.backgroundImage = `url("${r.src}")`; }).catch(() => {});
    const hist = state.history;
    const week = hist.filter((h) => Date.now() - new Date(h.result?.evaluatedAt || h.createdAt).getTime() < 7 * 864e5);
    const green = week.filter((h) => resultTag(h) === 'GREEN').length;
    const openDefects = hist.filter((h) => resultTag(h) === 'RED').reduce((n, h) => n + h.result.checklist.filter((c) => c.status === 'missing').length, 0);
    const due = state.assets.filter((a) => dueInfo(a).due).length;
    $('#kpis').innerHTML = `
      <button type="button" class="kpi" data-go="reports"><b>${week.length}</b><span>Inspections this week</span></button>
      <button type="button" class="kpi go" data-go="reports"><b>${week.length ? Math.round((green / week.length) * 100) : 0}%</b><span>Passed first time</span></button>
      <button type="button" class="kpi stop" data-kpi-red><b>${openDefects}</b><span>Open findings</span></button>
      <button type="button" class="kpi caution" data-go="tags"><b>${due}</b><span>Tags due or red</span></button>`;
    $('[data-kpi-red]').addEventListener('click', () => { state.histFilter = 'RED'; show('reports'); });
    // week chart
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
    const per = days.map((d) => {
      const list = hist.filter((h) => { const t = new Date(h.result?.evaluatedAt || h.createdAt); return t >= d && t < new Date(d.getTime() + 864e5); });
      return { d, G: list.filter((h) => resultTag(h) === 'GREEN').length, Y: list.filter((h) => resultTag(h) === 'YELLOW').length, R: list.filter((h) => resultTag(h) === 'RED').length };
    });
    const max = Math.max(3, ...per.map((x) => x.G + x.Y + x.R));
    $('#weekChart').innerHTML = per.map((x) => `<div class="bar"><div class="stack">
        ${x.G ? `<i style="height:${(x.G / max) * 100}%;background:var(--go)"></i>` : ''}${x.Y ? `<i style="height:${(x.Y / max) * 100}%;background:var(--caution)"></i>` : ''}${x.R ? `<i style="height:${(x.R / max) * 100}%;background:var(--stop)"></i>` : ''}
        ${!(x.G + x.Y + x.R) ? '<i style="height:4px;background:#d9dcd4"></i>' : ''}</div>
      <span>${x.d.toLocaleDateString([], { weekday: 'short' })}</span></div>`).join('');
    $('#homeRecent').innerHTML = hist.length ? hist.slice(0, 5).map(rowHtml).join('') : '<div class="empty"><b>No reports yet</b><span>Scan a QR tag to run the first inspection.</span></div>';
    wireRows($('#homeRecent'));
    $('#homeTags').innerHTML = state.assets.slice(0, 5).map((a) => {
      const di = dueInfo(a);
      return `<button type="button" class="row" data-asset="${esc(a.id)}"><span class="minitag ${di.tag}">${di.tag === 'NONE' ? '–' : di.tag[0]}</span>
        <span class="row-main"><span class="row-title">${esc(a.id)}</span><span class="row-sub">${esc(a.location)}, ${esc(di.text)}</span></span><svg class="row-chev"><use href="#i-chev"/></svg></button>`;
    }).join('') || '<div class="empty"><b>No QR tags</b><span>Create tags for your scaffolds in QR tags.</span></div>';
    $$('#homeTags [data-asset]').forEach((b) => b.addEventListener('click', () => openTagDetail(b.dataset.asset)));
  };

  // ---------- STEP 1: choose type ----------
  function typeIcon(t, cls = 'type-icon') {
    if (t?.module === 'scaffold') return `<span class="${cls}"><svg><use href="#i-scaffold"/></svg></span>`;
    const name = t?.name || '?';
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="${cls} t${(h % 4) + 1}">${esc(name.trim()[0]?.toUpperCase() || '?')}</span>`;
  }
  RENDER.setup = () => {
    const q = state.typeQuery.toLowerCase();
    const list = state.types.filter((t) => !q || `${t.name} ${t.description}`.toLowerCase().includes(q));
    $('#typeGrid').innerHTML = list.map((t) => `
      <button type="button" class="type-card ${t.module === 'scaffold' ? 'feature' : ''}" data-type="${esc(t.id)}">${typeIcon(t)}
        <b>${esc(t.name)}</b><p>${esc(t.description || '')}</p><small>${t.angles.length} view${t.angles.length === 1 ? '' : 's'}, ${countChecks(t)} checks</small></button>`).join('') + `
      <button type="button" class="type-card new" data-new-type="picker"><span class="type-icon" style="background:#e3e5df;color:var(--ink)"><svg><use href="#i-plus"/></svg></span>
        <b>Create custom inspection</b><p>Your own name, views and checklist</p></button>`;
    $$('#typeGrid [data-type]').forEach((b) => b.addEventListener('click', () => selectType(b.dataset.type)));
  };
  $('#typeSearch').addEventListener('input', (e) => { state.typeQuery = e.target.value; RENDER.setup(); });
  function selectType(id, asset = null) {
    if (state.selTypeId !== id || asset) resetSetupForm();
    state.selTypeId = id; LS.set('ia_last_type', id);
    state.fromAsset = asset;
    state.scenario = asset?.scenario || 'pass';
    if (asset) fillFormFromAsset(asset);
    show('details');
  }

  // ---------- STEP 2: details ----------
  function fillFormFromAsset(a) {
    $('#sfId').value = a.id || ''; $('#sfLocation').value = a.location || '';
    $('#sfHeight').value = a.height || ''; $('#sfLength').value = a.length || ''; $('#sfLifts').value = a.lifts || ''; $('#sfDuty').value = normDuty(a.duty); $('#sfSwl').value = a.swl || ''; $('#sfErector').value = a.erector || '';
    const last = lastReportFor(a.id); $('#sfLast').value = last ? isoDay(last.result.evaluatedAt) : '';
  }
  function resetSetupForm() {
    ['#sfId', '#sfLocation', '#sfHeight', '#sfLength', '#sfLifts', '#sfSwl', '#sfErector', '#sfLast', '#sfNotes'].forEach((s) => { $(s).value = ''; });
    $('#sfDuty').value = ''; $('#sfId').classList.remove('invalid');
  }
  function paintScenario() { $$('#scenarioSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.scenario)); }
  $$('#scenarioSeg button').forEach((b) => b.addEventListener('click', () => { state.scenario = b.dataset.v; paintScenario(); }));
  RENDER.details = () => {
    const t = getType(state.selTypeId);
    if (!t) return;
    const a = state.fromAsset;
    $('#fromTag').innerHTML = a ? `<div class="from-tag"><img src="${qrUrl(tagLink(a.id), 160)}" alt="" /><div><b>Tag ${esc(a.id)} scanned</b><span>${esc(a.location)}${a.site ? ', ' + esc(a.site) : ''}</span></div></div>` : '';
    $('#dtIconWrap').innerHTML = typeIcon(t);
    $('#dtName').textContent = t.name;
    $('#dtDesc').textContent = t.description || '';
    $('#sfIdLabel').textContent = t.idLabel || 'Asset ID / serial no.';
    $('#sfId').placeholder = t.module === 'scaffold' ? 'e.g. SC-014' : 'e.g. A-102';
    $('#scaffoldExtras').hidden = t.module !== 'scaffold';
    if (!$('#sfInspector').value) $('#sfInspector').value = state.profile.name || state.user?.name || '';
    $('#scenarioSeg [data-v="site"]').hidden = t.module !== 'scaffold';
    if (t.module !== 'scaffold' && state.scenario === 'site') state.scenario = 'pass';
    paintScenario();
    $('#planSteps').innerHTML = t.angles.map((v) => {
      const crit = v.parts.filter((p) => splitCheck(p).critical).length;
      return `<li><b>${esc(v.name)}</b><span>${v.parts.length} check${v.parts.length === 1 ? '' : 's'}${crit ? `, ${crit} critical` : ''}. ${esc(v.guidance || '')}</span></li>`;
    }).join('') + ((t.general_parts || []).length ? `<li class="any"><b>Seen in any view</b><span>${t.general_parts.map((p) => esc(splitCheck(p).name)).join(', ')}</span></li>` : '');
  };
  $('#dtChange').addEventListener('click', () => { state.fromAsset = null; show('setup'); });
  $('#btnEditThisType').addEventListener('click', () => openEditor(state.selTypeId, 'details'));
  $('#sfId').addEventListener('input', () => $('#sfId').classList.remove('invalid'));

  function newRecordFromForm(mode) {
    const t = getType(state.selTypeId);
    if (!t) throw new Error('Choose what you are inspecting first.');
    if (!countChecks(t)) throw new Error('This inspection type has no checks yet. Tap Edit checklist to add some.');
    const id = $('#sfId').value.trim();
    if (!id) { $('#sfId').classList.add('invalid'); $('#sfId').focus(); throw new Error(`Enter the ${(t.idLabel || 'asset ID').toLowerCase()}.`); }
    const asset = getAsset(id) || state.fromAsset || {};
    const rec = blankRecord(t, {
      asset: asset.id ? asset : { site: state.profile.site }, mode, scenario: state.scenario,
      id, location: $('#sfLocation').value.trim() || asset.location || state.profile.site || '',
      height: t.module === 'scaffold' ? readMeters($('#sfHeight'), 'Height') : '', length: t.module === 'scaffold' ? readMeters($('#sfLength'), 'Length') : '', lifts: $('#sfLifts').value, duty: $('#sfDuty').value, swl: t.module === 'scaffold' ? readSwl($('#sfSwl')) : '', erector: $('#sfErector').value.trim(),
      lastInspection: $('#sfLast').value, reason: $('#sfReason').value, inspector: $('#sfInspector').value.trim(), notes: $('#sfNotes').value.trim(),
    });
    if ($('#sfGps').checked) getGps(rec);
    return rec;
  }
  function getGps(rec) {
    if (!navigator.geolocation) { toast('GPS is not available on this device.', true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { rec.meta.gps = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }; },
      () => toast('Location permission denied. Photos will not have GPS.', true), { enableHighAccuracy: true, timeout: 10000 });
  }
  $('#btnStart').addEventListener('click', () => { try { state.cur = newRecordFromForm('photo'); } catch (e) { toast(e.message, true); return; } startPhoto(); });
  $('#btnLive').addEventListener('click', () => { try { state.cur = newRecordFromForm('live'); } catch (e) { toast(e.message, true); return; } startLive(); });

  function startFromAsset(asset, mode) {
    const t = getType(asset.typeId) || getType('type-scaffold');
    state.selTypeId = t.id; state.fromAsset = asset; state.scenario = asset.scenario || 'pass';
    resetSetupForm(); fillFormFromAsset(asset);
    const rec = blankRecord(t, { asset, mode, scenario: state.scenario, lastInspection: $('#sfLast').value });
    state.cur = rec;
    if (mode === 'live') startLive(); else startPhoto();
  }

  // ======================================================================================
  // ---------- canvas helpers shared by the camera screens ----------
  function fitCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w, h, dpr };
  }
  // draws img so it covers the canvas, centred on (cx, cy) = point of the photo (0-1) at zoom z
  function drawCover(ctx, img, w, h, z = 1, cx = 0.5, cy = 0.5, rot = 0) {
    const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
    if (!iw || !ih) return null;
    const s = Math.max(w / iw, h / ih) * z;
    const halfW = w / (2 * iw * s), halfH = h / (2 * ih * s);
    cx = Math.min(1 - halfW, Math.max(halfW, cx));
    cy = Math.min(1 - halfH, Math.max(halfH, cy));
    const dx = w / 2 - cx * iw * s, dy = h / 2 - cy * ih * s;
    ctx.save();
    if (rot) { ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2); }
    ctx.drawImage(img, dx, dy, iw * s, ih * s);
    ctx.restore();
    return { dx, dy, s, iw, ih, map: (b) => [dx + b[0] * iw * s, dy + b[1] * ih * s, b[2] * iw * s, b[3] * ih * s] };
  }
  function shrinkDataUrl(src, side = 1024, q = 0.78) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }
  const wmText = (rec, view, ts) => `${rec.asset.id || rec.typeName}  |  ${view}  |  ${new Date(ts || Date.now()).toLocaleString()}${rec.meta.gps ? `  |  ${rec.meta.gps.lat}, ${rec.meta.gps.lng}` : ''}`;
  async function openDeviceCamera(video) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available in this browser.');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    video.srcObject = stream; await video.play().catch(() => {});
    return stream;
  }
  const stopStream = (s) => s?.getTracks().forEach((t) => t.stop());

  // ======================= PHOTO BY PHOTO =======================
  const P = { idx: 0, raf: 0, source: 'demo', stream: null, img: null, imgView: '', viewSince: 0, loading: false };
  const capCanvas = $('#capCanvas'), capVideo = $('#capVideo');

  function startPhoto() {
    track('inspection_start', { mode: 'photo', tag: state.cur?.asset?.id, type: state.cur?.typeName });
    P.idx = 0;
    show('capture');
    renderCapture();
    loop();
  }
  async function loadViewImage() {
    const a = state.cur.angles[P.idx];
    if (P.imgView === a.name || P.loading) return;
    P.loading = true;
    try { const r = await demoImageFor(state.cur, a.name); if (state.cur?.angles[P.idx]?.name === a.name) { P.img = r; P.imgView = a.name; P.viewSince = performance.now(); } }
    finally { P.loading = false; }
  }
  function loop() {
    cancelAnimationFrame(P.raf);
    const tick = (now) => {
      if (state.view !== 'capture' || !state.cur) return;
      const a = state.cur.angles[P.idx];
      if (!state.cur.shots[a.name]) {
        const { w, h } = fitCanvas(capCanvas);
        const ctx = capCanvas.getContext('2d');
        if (P.source === 'device' && capVideo.videoWidth) {
          drawCover(ctx, capVideo, w, h);
        } else {
          if (P.imgView !== a.name) loadViewImage();
          ctx.fillStyle = '#0b1116'; ctx.fillRect(0, 0, w, h);
          if (P.img && P.imgView === a.name) {
            const t = now / 1000;
            const settle = Math.max(0, 1 - (now - P.viewSince) / 900);
            const jx = Math.sin(t * 1.3) * 0.008 + Math.sin(t * 3.1) * 0.003 + settle * 0.05;
            const jy = Math.cos(t * 1.1) * 0.006 + Math.sin(t * 2.3) * 0.002 + settle * 0.02;
            drawCover(ctx, P.img.img, w, h, 1.06 + settle * 0.08, 0.5 + jx, 0.5 + jy, Math.sin(t * 0.9) * 0.004);
          }
        }
        const steadyIn = now - P.viewSince < 900 && P.source === 'demo';
        const q = $('#capQbar');
        const html = steadyIn ? '<span class="qpill bad">Hold steady</span><span class="qpill good">Light OK</span>' : '<span class="qpill good">Light OK</span><span class="qpill good">Sharp</span>';
        if (q.innerHTML !== html) q.innerHTML = html;
      }
      P.raf = requestAnimationFrame(tick);
    };
    P.raf = requestAnimationFrame(tick);
  }
  function stopPhoto() { cancelAnimationFrame(P.raf); stopStream(P.stream); P.stream = null; if (P.source === 'device') { P.source = 'demo'; paintSource(); } }
  leaveHooks.push((from) => { if (from === 'capture') stopPhoto(); });

  function paintSource() { $('#capSource span').textContent = P.source === 'demo' ? 'Demo' : 'Device'; $('#capSource').classList.toggle('on', P.source === 'device'); capVideo.hidden = true; }
  $('#capSource').addEventListener('click', async () => {
    if (P.source === 'demo') {
      try { P.stream = await openDeviceCamera(capVideo); P.source = 'device'; toast('Using this device\u2019s camera. Results stay pre-recorded.'); }
      catch { toast('Camera blocked or not found. Staying on the demo feed.', true); }
    } else { stopStream(P.stream); P.stream = null; P.source = 'demo'; P.viewSince = performance.now(); }
    paintSource();
  });

  function renderCapture() {
    const cur = state.cur;
    const a = cur.angles[P.idx];
    const shot = cur.shots[a.name];
    const done = cur.angles.filter((x) => cur.shots[x.name]).length;
    const total = cur.angles.length;
    $('#capProgress').textContent = `${cur.asset.id}, view ${P.idx + 1} of ${total}`;
    $('#angleName').textContent = a.name;
    $('#angleChips').innerHTML = cur.angles.map((x, i) => `<button type="button" role="tab" class="${i === P.idx ? 'cur' : ''} ${cur.shots[x.name] ? 'ok' : ''}" data-i="${i}">${i + 1}. ${esc(x.name)}</button>`).join('');
    $$('#angleChips button').forEach((b) => b.addEventListener('click', () => { P.idx = +b.dataset.i; P.viewSince = performance.now(); renderCapture(); }));
    const chip = $('#angleChips .cur'), bar = $('#angleChips');
    if (chip) bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
    $('#angleGuide').textContent = a.guidance || 'Fill the frame with this view.';
    $('#angleParts').innerHTML = a.parts.length ? a.parts.map((p) => { const c = splitCheck(p); return `<li>${esc(c.name)}${c.critical ? '<span class="crit-dot">critical</span>' : ''}</li>`; }).join('') : '<li>Extra evidence photo, no checks.</li>';
    $('#capThumbs').innerHTML = cur.angles.map((x, i) => { const s = cur.shots[x.name]; return `<button type="button" class="${i === P.idx ? 'cur' : ''}" data-i="${i}" aria-label="${esc(x.name)}">${s ? `<img src="${esc(s.src)}" alt="" />` : `<span class="empty-th" style="position:static;background:none;font-size:1rem">${i + 1}</span>`}<span>${esc(x.name)}</span></button>`; }).join('');
    $$('#capThumbs button').forEach((b) => b.addEventListener('click', () => { P.idx = +b.dataset.i; P.viewSince = performance.now(); renderCapture(); }));
    $('#capPreview').hidden = !shot; capCanvas.hidden = Boolean(shot);
    $('#capLive').hidden = Boolean(shot);
    $('#capWm').hidden = !shot;
    if (shot) { $('#capPreview').src = shot.src; $('#capWm').textContent = wmText(cur, a.name, shot.ts); $('#capQbar').innerHTML = '<span class="qpill good">Light OK</span><span class="qpill good">Sharp</span>'; }
    $('#btnShoot').hidden = Boolean(shot); $('#lblUpload').hidden = Boolean(shot);
    $('#btnRetake').hidden = !shot;
    $('#btnNext').hidden = !shot || done === total;
    const ev = $('#btnEvaluate');
    ev.disabled = done === 0;
    ev.textContent = done === total ? 'Check photos and get result' : `Check photos (${done} of ${total})`;
  }
  function flash(el) { el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); navigator.vibrate?.(30); }
  $('#btnShoot').addEventListener('click', async () => {
    const cur = state.cur; const a = cur.angles[P.idx];
    flash($('#capFlash'));
    let shot;
    if (P.source === 'device' && capVideo.videoWidth) {
      const c = document.createElement('canvas'); const s = Math.min(1, 1024 / Math.max(capVideo.videoWidth, capVideo.videoHeight));
      c.width = Math.round(capVideo.videoWidth * s); c.height = Math.round(capVideo.videoHeight * s);
      c.getContext('2d').drawImage(capVideo, 0, 0, c.width, c.height);
      shot = { src: c.toDataURL('image/jpeg', 0.78), custom: true };
    } else {
      const r = P.img && P.imgView === a.name ? P.img : await demoImageFor(cur, a.name);
      shot = { src: r.src, key: imageKeyFor(cur, a.name) };
    }
    cur.shots[a.name] = { ...shot, ts: new Date().toISOString(), quality: { ok: true, brightness: 128, sharpness: 190 } };
    cur.result = null;
    renderCapture();
    // move on to the next view without a photo
    const next = cur.angles.findIndex((x, i) => i > P.idx && !cur.shots[x.name]);
    if (next >= 0) setTimeout(() => { if (state.view === 'capture') { P.idx = next; P.viewSince = performance.now(); renderCapture(); } }, 700);
  });
  $('#fileInput').addEventListener('change', (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !f.type.startsWith('image/')) { if (f) toast('Choose an image file.', true); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const a = state.cur.angles[P.idx];
      state.cur.shots[a.name] = { src: await shrinkDataUrl(reader.result), custom: true, ts: new Date().toISOString(), quality: { ok: true } };
      renderCapture();
    };
    reader.readAsDataURL(f);
  });
  $('#btnRetake').addEventListener('click', () => { const a = state.cur.angles[P.idx]; delete state.cur.shots[a.name]; P.viewSince = performance.now(); renderCapture(); });
  $('#btnNext').addEventListener('click', () => {
    const cur = state.cur;
    const n = cur.angles.findIndex((x, i) => i > P.idx && !cur.shots[x.name]);
    const any = cur.angles.findIndex((x) => !cur.shots[x.name]);
    P.idx = n >= 0 ? n : any >= 0 ? any : P.idx; P.viewSince = performance.now(); renderCapture();
  });
  $('#btnExtra').addEventListener('click', () => {
    const name = prompt('Name for the extra photo (e.g. "Close-up of damage"):');
    if (!name?.trim()) return;
    if (state.cur.angles.some((a) => a.name.toLowerCase() === name.trim().toLowerCase())) { toast('A view with that name already exists.', true); return; }
    state.cur.angles.push({ name: name.trim().slice(0, 60), guidance: 'Extra evidence photo', parts: [], extra: true });
    P.idx = state.cur.angles.length - 1; P.viewSince = performance.now(); renderCapture();
  });
  $('#capClose').addEventListener('click', () => {
    if (Object.keys(state.cur?.shots || {}).length && !confirm('Close the camera? Photos taken so far will be lost.')) return;
    show(state.fromAsset ? 'home' : 'details');
  });
  $('#btnEvaluate').addEventListener('click', async () => {
    const cur = state.cur;
    const missingViews = cur.angles.filter((a) => !cur.shots[a.name] && a.parts.length);
    if (missingViews.length && !confirm(`No photo yet for: ${missingViews.map((a) => a.name).join(', ')}.\nTheir checks will be marked Not OK. Check anyway?`)) return;
    stopPhoto();
    const first = Object.values(cur.shots)[0]?.src;
    await analyse(first, ['Reading photos and view angles', `Checking ${cur.angles.reduce((n, a) => n + a.parts.length, 0) + cur.general_parts.length} points`, 'Looking for damage and defects', 'Second check of every OK', 'Building the result'], 4600);
    const rows = scriptedChecklist(cur);
    rows.forEach((r) => { if (r.group !== ANY && !cur.shots[r.group]) Object.assign(r, { status: 'missing', confidence: 1, note: 'This view was not photographed', box: null }); });
    cur.result = buildResult(cur, rows);
    track('inspection_complete', { mode: 'photo', tag: cur.asset?.id, result: TAG_LABEL[resultTag(cur)] });
    cur.saved = false;
    renderResult();
    show('result');
  });

  // ======================= LIVE SCAN (simulated camera) =======================
  const L = { raf: 0, steps: [], rows: [], t: 0, last: 0, paused: false, stepIdx: -1, imgs: {}, cam: { x: 0.5, y: 0.5, z: 1.15 }, resolved: new Set(), defectsShown: new Set(), done: false, startedAt: 0, frames: 0 };
  const lvCanvas = $('#lvCanvas');
  const T = { intro: 1300, per: 1650, outro: 900 };

  async function startLive() {
    const rec = state.cur;
    track('inspection_start', { mode: 'live', tag: rec.asset?.id, type: rec.typeName });
    rec.mode = 'live';
    L.rows = scriptedChecklist(rec);
    L.steps = rec.angles.map((a) => ({ view: a.name, rows: L.rows.filter((r) => viewOf(r) === a.name) })).filter((s) => s.rows.length);
    // general checks whose view has no checks of its own go to the last step
    const placed = new Set(L.steps.flatMap((s) => s.rows.map((r) => r.id)));
    L.rows.filter((r) => !placed.has(r.id)).forEach((r) => L.steps[L.steps.length - 1]?.rows.push(r));
    let t0 = 0;
    L.steps.forEach((s) => { s.start = t0; s.dur = T.intro + s.rows.length * T.per + T.outro; s.rows.forEach((r, i) => { r._at = t0 + T.intro + (i + 1) * T.per - 250; }); t0 += s.dur; });
    L.total = t0; L.t = 0; L.last = 0; L.paused = false; L.stepIdx = -1; L.resolved = new Set(); L.defectsShown = new Set(); L.done = false; L.frames = 0; L.startedAt = Date.now();
    L.cam = { x: 0.5, y: 0.5, z: 1.15 };
    $('#lvItem').textContent = `${rec.typeName} ${rec.asset.id}`;
    $('#lvDone').hidden = true; $('#lvDefects').hidden = true; $('#lvDefectList').innerHTML = '';
    paintSpeed(); paintPause();
    show('live');
    renderLiveList();
    $('#lvStats').textContent = 'Loading camera…';
    await Promise.all(L.steps.map(async (s) => { L.imgs[s.view] = await demoImageFor(rec, s.view); }));
    if (state.view !== 'live') return;
    cancelAnimationFrame(L.raf);
    L.raf = requestAnimationFrame(liveTick);
  }
  function stopLive() { cancelAnimationFrame(L.raf); }
  leaveHooks.push((from) => { if (from === 'live') stopLive(); });

  function liveTick(now) {
    if (state.view !== 'live') return;
    const dt = L.last ? Math.min(100, now - L.last) : 16; L.last = now;
    if (!L.paused && !L.done) L.t += dt * state.speed;
    L.frames++;
    const rec = state.cur;
    // current step
    let si = L.steps.findIndex((s) => L.t >= s.start && L.t < s.start + s.dur);
    if (si < 0) si = L.steps.length - 1;
    if (si !== L.stepIdx) enterStep(si);
    const step = L.steps[si];
    // resolve checks that are due
    L.rows.forEach((r) => { if (r._at !== undefined && L.t >= r._at && !L.resolved.has(r.id)) resolveRow(r); });
    // camera target = next pending check of this step (looks like the inspector moving the phone)
    const pending = step.rows.find((r) => !L.resolved.has(r.id));
    const tb = bboxOf(pending?.box) || bboxOf(step.rows.filter((r) => r.box).pop()?.box);
    const tx = tb ? tb[0] + tb[2] / 2 : 0.5, ty = tb ? tb[1] + tb[3] / 2 : 0.5;
    const tz = pending ? 1.28 : 1.08;
    const k = L.paused ? 0 : Math.min(1, dt / 900);
    L.cam.x += (tx - L.cam.x) * k; L.cam.y += (ty - L.cam.y) * k; L.cam.z += (tz - L.cam.z) * k;
    // draw
    const { w, h, dpr } = fitCanvas(lvCanvas);
    const ctx = lvCanvas.getContext('2d');
    ctx.fillStyle = '#0b1116'; ctx.fillRect(0, 0, w, h);
    const img = L.imgs[step.view]?.img;
    const tt = now / 1000;
    const jx = L.paused ? 0 : Math.sin(tt * 1.4) * 0.006 + Math.sin(tt * 3.3) * 0.002;
    const jy = L.paused ? 0 : Math.cos(tt * 1.2) * 0.005;
    const fit = img ? drawCover(ctx, img, w, h, L.cam.z, L.cam.x + jx, L.cam.y + jy, Math.sin(tt * 0.8) * 0.003) : null;
    if (fit) {
      const local = L.t - step.start;
      // scan sweep
      if (!L.paused && !L.done) {
        const y = ((local % 2200) / 2200) * h;
        const g = ctx.createLinearGradient(0, y - 60 * dpr, 0, y);
        g.addColorStop(0, 'rgba(134,188,37,0)'); g.addColorStop(1, 'rgba(134,188,37,.22)');
        ctx.fillStyle = g; ctx.fillRect(0, y - 60 * dpr, w, 60 * dpr);
        ctx.fillStyle = 'rgba(134,188,37,.8)'; ctx.fillRect(0, y, w, 1.5 * dpr);
      }
      const scripted = Boolean(scriptFor(rec));
      step.rows.forEach((r, i) => {
        const box = r.box ? bboxOf(r.box) : scripted ? null : synthBox(i, step.rows.length);
        if (!box) { if (r === pending) drawSeeker(ctx, w * 0.3, h * 0.35, w * 0.4, h * 0.3, splitCheck(r.part).name, dpr, tt); return; }
        const [x, y, bw, bh] = fit.map(box);
        if (L.resolved.has(r.id)) {
          const age = Math.min(1, (L.t - r._at) / 350);
          drawDetection(ctx, x, y, bw, bh, r, age, dpr, r.box.poly ? r.box.poly.map((p) => fit.map([p[0], p[1], 0, 0]).slice(0, 2)) : null);
        } else if (r === pending) {
          const slotStart = r._at - T.per + 250;
          const p = Math.max(0, Math.min(1, (L.t - slotStart) / (T.per * 0.75)));
          const e = 1 - Math.pow(1 - p, 3);
          const cx = w / 2, cy = h / 2, sw = w * 0.5, sh = h * 0.36;
          const bx = cx - sw / 2 + (x - (cx - sw / 2)) * e, by = cy - sh / 2 + (y - (cy - sh / 2)) * e;
          const ww = sw + (bw - sw) * e, hh = sh + (bh - sh) * e;
          drawSeeker(ctx, bx, by, ww, hh, splitCheck(r.part).name, dpr, tt);
        }
      });
    }
    // HUD
    const done = L.resolved.size, total = L.rows.length;
    $('#lvPct').textContent = `${done}/${total}`;
    $('#lvRingFg').style.strokeDashoffset = String(97.4 * (1 - (total ? done / total : 0)));
    $('#lvStats').textContent = `${done} of ${total} checks · ${Math.round((Date.now() - L.startedAt) / 1000)} s`;
    if (!L.done && done === total && L.t >= L.total - 200) completeLive();
    L.raf = requestAnimationFrame(liveTick);
  }
  function synthBox(i, n) { const cols = Math.min(3, n); const c = i % cols, r = Math.floor(i / cols); return [0.12 + c * 0.27, 0.18 + r * 0.26, 0.22, 0.2]; }
  function cornerPath(ctx, x, y, w, h, l) {
    ctx.beginPath();
    ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
    ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
    ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
    ctx.stroke();
  }
  const COL = { present: '#86bc25', missing: '#da291c', unclear: '#ffcd00' };
  function label(ctx, x, y, text, bg, fg, dpr) {
    ctx.font = `700 ${12 * dpr}px "Open Sans", Arial, sans-serif`;
    const tw = ctx.measureText(text).width + 12 * dpr, th = 20 * dpr;
    const ly = y - th - 3 * dpr < 0 ? Math.max(0, y) + 3 * dpr : y - th - 3 * dpr;
    x = Math.max(4 * dpr, Math.min(x, ctx.canvas.width - tw - 4 * dpr));
    ctx.fillStyle = bg; ctx.fillRect(x, ly, tw, th);
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 6 * dpr, ly + th / 2);
  }
  function drawSeeker(ctx, x, y, w, h, name, dpr, t) {
    ctx.save();
    ctx.strokeStyle = `rgba(134,188,37,${0.65 + Math.sin(t * 8) * 0.3})`; ctx.lineWidth = 2.5 * dpr;
    cornerPath(ctx, x, y, w, h, Math.min(w, h) * 0.22);
    label(ctx, x, y, `Checking: ${name}`, 'rgba(134,188,37,.95)', '#000', dpr);
    ctx.restore();
  }
  function drawDetection(ctx, x, y, w, h, r, a, dpr, poly) {
    ctx.save(); ctx.globalAlpha = a;
    const c = COL[r.status];
    ctx.beginPath();
    if (poly) { poly.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); } else ctx.rect(x, y, w, h);
    if (r.status === 'missing') { ctx.fillStyle = 'rgba(218,41,28,.18)'; ctx.fill(); }
    ctx.strokeStyle = c; ctx.lineWidth = 2.5 * dpr;
    if (r.status === 'unclear') ctx.setLineDash([7 * dpr, 5 * dpr]);
    ctx.stroke(); ctx.setLineDash([]);
    const name = splitCheck(r.part).name;
    const mark = r.status === 'present' ? '✓' : r.status === 'missing' ? '✕' : '?';
    label(ctx, x, y, `${mark} ${name}`, c, r.status === 'missing' ? '#fff' : '#000', dpr);
    ctx.restore();
  }
  function enterStep(i) {
    L.stepIdx = i;
    const s = L.steps[i];
    const rec = state.cur;
    $('#lvView').textContent = s.view;
    const hints = D.LIVE_HINTS[s.view] || ['Hold steady', 'Move closer'];
    setLiveHint(hints[0]);
    clearInterval(L.hintTimer);
    let hi = 0;
    L.hintTimer = setInterval(() => { if (state.view !== 'live' || L.stepIdx !== i) return clearInterval(L.hintTimer); hi = (hi + 1) % hints.length; setLiveHint(hints[hi]); }, 2600 / state.speed);
    // the frame becomes the proof photo for this view
    const r = L.imgs[s.view];
    if (r && !rec.shots[s.view]) rec.shots[s.view] = { src: r.src, key: imageKeyFor(rec, s.view), ts: new Date().toISOString(), quality: { ok: true } };
    renderLiveList();
  }
  function setLiveHint(t) { $('#lvHint').textContent = t; $('#lvHint').hidden = !t; }
  function resolveRow(r) {
    L.resolved.add(r.id);
    navigator.vibrate?.(r.status === 'missing' ? [40, 40, 40] : 18);
    const sc = scriptFor(state.cur);
    if (sc && r.status !== 'present') {
      sc.defects.filter((d) => d.angle === L.steps[L.stepIdx]?.view && !L.defectsShown.has(d.description)).forEach((d) => {
        L.defectsShown.add(d.description);
        $('#lvDefects').hidden = false;
        $('#lvDefectList').insertAdjacentHTML('beforeend', `<li><b>${esc(cap(d.severity))}:</b> ${esc(d.description)}</li>`);
      });
    }
    renderLiveList();
  }
  function renderLiveList() {
    const cur = state.cur;
    const step = L.steps[L.stepIdx];
    const pending = step?.rows.find((r) => !L.resolved.has(r.id));
    $('#lvNext').textContent = L.done ? 'All checks done.' : pending ? `Now checking: ${splitCheck(pending.part).name}` : 'Moving to the next view…';
    const groups = [...cur.angles.map((a) => a.name), ANY];
    $('#lvList').innerHTML = groups.map((g) => {
      const rows = L.rows.filter((r) => r.group === g);
      if (!rows.length) return '';
      const okN = rows.filter((r) => L.resolved.has(r.id)).length;
      return `<div class="lv-group"><h4><span>${esc(g)}</span><span>${okN}/${rows.length}</span></h4><ul>${rows.map((r) => {
        const st = L.resolved.has(r.id) ? r.status : r === pending ? 'active' : '';
        const icon = st === 'present' ? '✓' : st === 'missing' ? '✕' : st === 'unclear' ? '?' : '';
        return `<li class="${st}"><i>${icon}</i><span>${esc(splitCheck(r.part).name)}</span></li>`;
      }).join('')}</ul></div>`;
    }).join('');
    const active = $('#lvList li.active');
    if (active && window.matchMedia('(min-width: 1100px)').matches) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function completeLive() {
    L.done = true;
    setLiveHint('');
    $('#lvDone').hidden = false;
    renderLiveList();
    navigator.vibrate?.([30, 60, 30]);
    setTimeout(() => { if (state.view === 'live') finishLive(false); }, 1500);
  }
  async function finishLive(early) {
    const rec = state.cur;
    if (!rec || rec.result) return;
    if (early) {
      const left = L.rows.filter((r) => !L.resolved.has(r.id)).length;
      if (left && !confirm(`${left} check${left > 1 ? 's were' : ' was'} not seen yet and will be marked Unclear. Finish anyway?`)) return;
    }
    stopLive(); clearInterval(L.hintTimer);
    const rows = L.rows.map((r) => {
      const { _at, ...row } = r;
      if (!L.resolved.has(r.id)) Object.assign(row, { status: 'unclear', confidence: 0, note: 'Not seen during the live scan' });
      return row;
    });
    await analyse(Object.values(rec.shots)[0]?.src, ['Second check of every OK', 'Building the result'], 1800);
    rec.result = buildResult(rec, rows, { liveStats: { frames: Math.max(12, Math.round(L.t / 1600)), seconds: Math.round((Date.now() - L.startedAt) / 1000) } });
    track('inspection_complete', { mode: 'live', tag: rec.asset?.id, result: TAG_LABEL[resultTag(rec)] });
    rec.saved = false;
    renderResult();
    show('result');
  }
  $('#lvFinish').addEventListener('click', () => finishLive(true));
  $('#lvClose').addEventListener('click', () => {
    if (!state.cur?.result && L.resolved.size && !confirm('Stop the live scan? Progress will be lost.')) return;
    show(state.fromAsset ? 'home' : 'details');
  });
  function paintPause() { $('#lvPause').innerHTML = `<svg><use href="#${L.paused ? 'i-play' : 'i-pause'}"/></svg>`; $('#lvState').textContent = L.paused ? 'Paused' : 'Scanning'; $('#lvState').classList.toggle('scan', !L.paused); }
  $('#lvPause').addEventListener('click', () => { L.paused = !L.paused; paintPause(); });
  function paintSpeed() { $('#lvSpeed').textContent = `${state.speed}×`; }
  $('#lvSpeed').addEventListener('click', () => { state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1; LS.set('ia_speed', state.speed); paintSpeed(); toast(`Demo speed ${state.speed}×`); });
  $('#lvSkip').addEventListener('click', () => {
    const s = L.steps[L.stepIdx]; if (!s || L.done) return;
    L.t = Math.min(L.total - 1, s.start + s.dur);
  });
  $('#lvShoot').addEventListener('click', () => {
    const s = L.steps[L.stepIdx]; if (!s) return;
    flash($('#lvFlash')); toast(`Photo saved to "${s.view}"`);
  });

  // ======================= QR CODES =======================
  const qrCache = new Map();
  function tagLink(id) { return `${location.origin}${location.pathname}#tag/${encodeURIComponent(id)}`; }
  function qrUrl(text, size = 512) {
    const k = text + '|' + size;
    if (qrCache.has(k)) return qrCache.get(k);
    let url = '';
    try { url = window.QRGen.toDataURL(text, size); } catch { /* too long */ }
    if (!url) url = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><text x="50" y="54" font-size="9" text-anchor="middle" font-family="Arial">Text too long</text></svg>`);
    qrCache.set(k, url);
    return url;
  }
  function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

  // printable / downloadable label for one tag
  async function labelCanvas(a) {
    const W = 900, H = 1240;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 10; rr(20, 20, W - 40, H - 40, 60); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, 80, 24, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#000000'; rr(70, 140, W - 140, 110, 20); ctx.fill();
    ctx.fillStyle = '#86bc25'; ctx.font = '800 54px "Open Sans", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SCAN TO INSPECT', W / 2, 197);
    const qr = await loadImage(qrUrl(tagLink(a.id), 720));
    ctx.drawImage(qr, (W - 600) / 2, 290, 600, 600);
    ctx.fillStyle = '#000000'; ctx.font = '800 92px "Open Sans", Arial, sans-serif';
    ctx.fillText(a.id, W / 2, 970);
    ctx.font = '600 36px "Open Sans", Arial, sans-serif'; ctx.fillStyle = '#53565a';
    ctx.fillText(`${getType(a.typeId)?.name || 'Asset'} · ${a.location}`.slice(0, 44), W / 2, 1050);
    ctx.setLineDash([12, 10]); ctx.lineWidth = 3; ctx.strokeStyle = '#000000'; ctx.beginPath(); ctx.moveTo(90, 1110); ctx.lineTo(W - 90, 1110); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 32px "Open Sans", Arial, sans-serif'; ctx.fillStyle = '#000000';
    ctx.fillText('Inspection AI · open the app and scan', W / 2, 1160);
    return c;
  }
  async function downloadLabel(a) {
    track('tag_label_download', { tag: a.id });
    const c = await labelCanvas(a);
    c.toBlob((b) => download(`qr-tag-${a.id}.png`, b), 'image/png');
  }
  function labelHtml(a) {
    return `<div class="label"><div class="lh">SCAN TO INSPECT</div><img src="${qrUrl(tagLink(a.id), 480)}" alt="QR code for ${esc(a.id)}" />
      <b>${esc(a.id)}</b><span>${esc(getType(a.typeId)?.name || 'Asset')} · ${esc(a.location)}</span><span>${esc(a.site || '')}</span><div class="scan">Open Inspection AI and scan</div></div>`;
  }
  function printLabels(list) {
    track('tag_label_print', { tags: list.map((x) => x.id).join(',') });
    $('#printArea').innerHTML = `<div class="label-sheet">${list.map(labelHtml).join('')}</div>`;
    setTimeout(() => window.print(), 250);
  }

  // ======================= QR TAGS SCREEN =======================
  RENDER.tags = () => {
    $('#tagGrid').innerHTML = state.assets.map((a) => {
      const di = dueInfo(a);
      return `<button type="button" class="qtag ${di.tag}" data-asset="${esc(a.id)}"><span class="band"></span>
        <div class="qtag-top"><img src="${qrUrl(tagLink(a.id), 240)}" alt="" /><div><b>${esc(a.id)}</b><span>${esc(getType(a.typeId)?.name || '')}</span><br /><span>${esc(a.location)}</span></div></div>
        <div class="qtag-status"><span>${esc(di.text)}</span><span class="status-chip ${di.tag}">${TAG_LABEL[di.tag]}</span></div></button>`;
    }).join('') || '<div class="empty"><b>No QR tags yet</b><span>Create a tag for each scaffold, print it and fix it at the access point.</span></div>';
    $$('#tagGrid [data-asset]').forEach((b) => b.addEventListener('click', () => openTagDetail(b.dataset.asset)));
  };
  $('#btnNewTag').addEventListener('click', () => openTagForm());
  $('#btnPrintAll').addEventListener('click', () => { if (!state.assets.length) return toast('No tags to print yet.'); printLabels(state.assets); });

  function nextTagId(prefix = 'SC') {
    const nums = state.assets.filter((a) => a.id.startsWith(prefix + '-')).map((a) => parseInt(a.id.split('-')[1], 10)).filter((n) => !isNaN(n));
    return `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
  }
  function openTagForm() {
    let scenario = 'pass';
    const opts = state.types.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    openModal(`
      <div class="modal-head"><div><h2>Create QR tag</h2><p>Print it and fix it at the scaffold's access point.</p></div><button type="button" class="icon-btn" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>
      <form id="tagForm" novalidate>
        <div class="grid2">
          <label class="field"><span>Inspection type</span><select id="tfType">${opts}</select></label>
          <label class="field"><span>Tag ID</span><input id="tfId" maxlength="30" value="${nextTagId()}" /></label>
        </div>
        <label class="field"><span>Location</span><input id="tfLoc" maxlength="120" placeholder="e.g. Tower C – west elevation" /></label>
        <label class="field"><span>Site</span><input id="tfSite" maxlength="120" value="${esc(state.profile.site || '')}" /></label>
        <div class="grid2" id="tfScaffold">
          <label class="field"><span>Height (m)</span><input id="tfH" type="number" min="0" step="0.5" inputmode="decimal" /></label>
          <label class="field"><span>Length (m)</span><input id="tfLen" type="number" min="0.1" max="1000" step="0.1" inputmode="decimal" placeholder="e.g. 18" /></label>
          <label class="field"><span>Lifts</span><input id="tfL" type="number" min="0" inputmode="numeric" /></label>
          <label class="field"><span>Duty</span><select id="tfDuty"><option value="">Not known</option>${DUTIES.map((d) => `<option value="${d}">${d}</option>`).join('')}</select></label>
          <label class="field"><span>SWL (kg)</span><input id="tfSwl" type="number" min="1" max="100000" step="1" inputmode="numeric" placeholder="e.g. 600" /></label>
          <label class="field"><span>Erected by</span><input id="tfErector" maxlength="80" /></label>
        </div>
        <div class="scenario-box"><p><b>Demo outcome</b><br />Result shown when this tag is inspected.</p><div class="seg" id="tfSeg"><button type="button" data-v="pass" class="on">Pass</button><button type="button" data-v="fail">Fail</button><button type="button" data-v="site">Site photos</button></div></div>
        <div class="modal-actions"><button type="submit" class="btn btn-hivis btn-block"><svg><use href="#i-qr"/></svg>Create QR tag</button></div>
      </form>`, (m) => {
      const paintType = () => { const t = getType($('#tfType', m).value); $('#tfScaffold', m).hidden = t?.module !== 'scaffold'; $('#tfSeg [data-v="site"]', m).hidden = t?.module !== 'scaffold'; if (t?.module !== 'scaffold' && scenario === 'site') $('#tfSeg [data-v="pass"]', m).click(); const pre = t?.module === 'scaffold' ? 'SC' : (t?.name || 'AS').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(); $('#tfId', m).value = nextTagId(pre); };
      $('#tfType', m).addEventListener('change', paintType);
      $$('#tfSeg button', m).forEach((b) => b.addEventListener('click', () => { scenario = b.dataset.v; $$('#tfSeg button', m).forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#tagForm', m).addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('#tfId', m).value.trim().toUpperCase();
        const loc = $('#tfLoc', m).value.trim();
        if (!id) { $('#tfId', m).classList.add('invalid'); return toast('Enter a tag ID.', true); }
        if (getAsset(id)) { $('#tfId', m).classList.add('invalid'); return toast(`Tag ${id} already exists.`, true); }
        if (!loc) { $('#tfLoc', m).classList.add('invalid'); return toast('Enter where the tag is fixed.', true); }
        let swl = '', height = '', length = '';
        if (getType($('#tfType', m).value)?.module === 'scaffold') {
          try { height = readMeters($('#tfH', m), 'Height'); length = readMeters($('#tfLen', m), 'Length'); swl = readSwl($('#tfSwl', m)); } catch (err) { return toast(err.message, true); }
        }
        const a = { id, typeId: $('#tfType', m).value, location: loc, site: $('#tfSite', m).value.trim(), height, length, lifts: $('#tfL', m).value, duty: $('#tfDuty', m).value, swl, erector: $('#tfErector', m).value.trim(), scenario, createdAt: new Date().toISOString() };
        state.assets.unshift(a); saveAssets();
        track('tag_created', { tag: id, location: loc });
        toast(`QR tag ${id} created`);
        if (state.view === 'tags') RENDER.tags();
        openTagDetail(id);
      });
    });
  }
  function openTagDetail(id) {
    const a = getAsset(id);
    if (!a) return toast('Tag not found.', true);
    const t = getType(a.typeId);
    const di = dueInfo(a);
    const last = di.last;
    openModal(`
      <div class="modal-head"><div><h2>${esc(a.id)}</h2><p>${esc(t?.name || '')}, ${esc(a.location)}</p></div><button type="button" class="icon-btn" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>
      <div class="qr-big"><img src="${qrUrl(tagLink(a.id), 520)}" alt="QR code for ${esc(a.id)}" /><small>${esc(tagLink(a.id))}</small></div>
      <dl class="kv">
        <dt>Status</dt><dd><span class="status-chip ${di.tag}">${TAG_LABEL[di.tag]}</span> ${esc(di.text)}</dd>
        ${a.site ? `<dt>Site</dt><dd>${esc(a.site)}</dd>` : ''}
        ${sizeText(a) ? `<dt>Size</dt><dd>${esc(sizeText(a))}${normDuty(a.duty) ? ', ' + esc(dutyText(a.duty)) : ''}</dd>` : ''}
        ${swlText(a.swl) ? `<dt>SWL</dt><dd>${esc(swlText(a.swl))}</dd>` : ''}
        ${a.erector ? `<dt>Erected by</dt><dd>${esc(a.erector)}</dd>` : ''}
        ${last ? `<dt>Last report</dt><dd>${esc(fmtDate(last.result.evaluatedAt))} by ${esc(last.meta.inspector)}</dd>` : ''}
        <dt>Demo outcome</dt><dd><div class="seg" id="tdSeg"><button type="button" data-v="pass">Pass</button><button type="button" data-v="fail">Fail</button>${t?.module === 'scaffold' ? '<button type="button" data-v="site">Site photos</button>' : ''}</div></dd>
      </dl>
      <div class="modal-actions">
        <button type="button" class="btn btn-hivis btn-block" id="tdScan"><svg><use href="#i-scan"/></svg>Simulate scan by inspector</button>
        <div class="two"><button type="button" class="btn btn-line" id="tdPrint"><svg><use href="#i-print"/></svg>Print label</button><button type="button" class="btn btn-line" id="tdPng"><svg><use href="#i-download"/></svg>Download PNG</button></div>
        <div class="two"><button type="button" class="btn btn-line" id="tdCopy"><svg><use href="#i-share"/></svg>Copy link</button>${last ? '<button type="button" class="btn btn-line" id="tdLast">Last report</button>' : '<button type="button" class="btn btn-line" id="tdStart">Start inspection</button>'}</div>
        <button type="button" class="btn btn-danger btn-sm" id="tdDel" style="justify-self:start">Delete tag</button>
      </div>`, (m) => {
      const paint = () => $$('#tdSeg button', m).forEach((b) => b.classList.toggle('on', b.dataset.v === (a.scenario || 'pass')));
      paint();
      $$('#tdSeg button', m).forEach((b) => b.addEventListener('click', () => { a.scenario = b.dataset.v; saveAssets(); paint(); toast(a.scenario === 'site' ? `${a.id} will use the real site photos` : `${a.id} will show a ${a.scenario.toUpperCase()} result`); }));
      $('#tdScan', m).addEventListener('click', () => { closeModal(); S.assetId = a.id; show('scan'); });
      $('#tdPrint', m).addEventListener('click', () => printLabels([a]));
      $('#tdPng', m).addEventListener('click', () => downloadLabel(a));
      $('#tdCopy', m).addEventListener('click', async () => { try { await navigator.clipboard.writeText(tagLink(a.id)); toast('Link copied'); } catch { prompt('Copy this link:', tagLink(a.id)); } });
      $('#tdLast', m)?.addEventListener('click', () => { closeModal(); openHistory(last.id); });
      $('#tdStart', m)?.addEventListener('click', () => { closeModal(); selectType(a.typeId, a); });
      $('#tdDel', m).addEventListener('click', () => { if (!confirm(`Delete tag ${a.id}? Its reports are kept.`)) return; state.assets = state.assets.filter((x) => x !== a); saveAssets(); track('tag_deleted', { tag: a.id }); closeModal(); toast('Tag deleted'); if (RENDER[state.view]) RENDER[state.view](); });
    });
  }

  // after a tag is scanned (demo, real camera or a link)
  function openScannedTag(raw) {
    const text = String(raw || '').trim();
    const m = text.match(/#tag\/([^?#&]+)/i);
    const id = decodeURIComponent(m ? m[1] : text);
    const a = getAsset(id);
    track('tag_scanned', { tag: id, found: !!a });
    if (!a) { toast(`Unknown tag "${id.slice(0, 40)}". Create it in QR tags first.`, true); return; }
    const t = getType(a.typeId);
    const di = dueInfo(a);
    navigator.vibrate?.([20, 40, 20]);
    openModal(`
      <div class="modal-head"><div><h2>Tag ${esc(a.id)}</h2><p>${esc(t?.name || '')} at ${esc(a.location)}</p></div><button type="button" class="icon-btn" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>
      <dl class="kv">
        <dt>Current tag</dt><dd><span class="status-chip ${di.tag}">${TAG_LABEL[di.tag]}</span> ${esc(di.text)}</dd>
        ${a.site ? `<dt>Site</dt><dd>${esc(a.site)}</dd>` : ''}
        ${sizeText(a) ? `<dt>Scaffold</dt><dd>${esc(sizeText(a))}${normDuty(a.duty) ? ', ' + esc(dutyText(a.duty)) : ''}</dd>` : ''}
        ${swlText(a.swl) ? `<dt>SWL</dt><dd>${esc(swlText(a.swl))}</dd>` : ''}
        ${a.erector ? `<dt>Erected by</dt><dd>${esc(a.erector)}</dd>` : ''}
        <dt>Inspector</dt><dd>${esc(state.profile.name || state.user?.name || 'Inspector')}</dd>
      </dl>
      <div class="modal-actions">
        <button type="button" class="btn btn-hivis btn-block btn-xl" id="stLive"><svg><use href="#i-scan"/></svg><span><b>Start live scan</b><small>Walk around the scaffold with the camera</small></span></button>
        <button type="button" class="btn btn-line btn-block btn-xl" id="stPhoto"><svg><use href="#i-camera"/></svg><span><b>Photo by photo</b><small>${t ? t.angles.length : 0} views, ${t ? countChecks(t) : 0} checks</small></span></button>
        <div class="two"><button type="button" class="btn btn-line" id="stDetails">Edit details first</button>${di.last ? '<button type="button" class="btn btn-line" id="stLast">Last report</button>' : '<button type="button" class="btn btn-line" data-close>Cancel</button>'}</div>
      </div>`, (mm) => {
      $('#stLive', mm).addEventListener('click', () => { closeModal(); startFromAsset(a, 'live'); });
      $('#stPhoto', mm).addEventListener('click', () => { closeModal(); startFromAsset(a, 'photo'); });
      $('#stDetails', mm).addEventListener('click', () => { closeModal(); selectType(a.typeId, a); });
      $('#stLast', mm)?.addEventListener('click', () => { closeModal(); openHistory(di.last.id); });
    });
  }

  // ======================= SCAN QR SCREEN =======================
  const S = { raf: 0, assetId: LS.get('ia_scan_pick', ''), t0: 0, locked: false, opened: false, source: 'demo', stream: null, bg: null, cards: new Map(), detectTimer: null, detector: null };
  const scCanvas = $('#scCanvas'), scVideo = $('#scVideo');
  RENDER.scan = () => {
    if (!getAsset(S.assetId)) S.assetId = (state.assets.find((a) => a.scenario === 'fail') || state.assets[0])?.id || '';
    $('#scChips').innerHTML = state.assets.map((a) => { const di = dueInfo(a); return `<button type="button" data-id="${esc(a.id)}" class="${a.id === S.assetId ? 'on' : ''}"><span class="dot" style="background:${a.scenario === 'fail' ? 'var(--stop)' : a.scenario === 'site' ? '#00a3e0' : 'var(--go)'}"></span>${esc(a.id)} <small style="opacity:.7">${esc((SCEN_LABEL[a.scenario] || 'Pass').toLowerCase())}</small></button>`; }).join('') || '<p>No tags yet. Create one in QR tags.</p>';
    $$('#scChips button').forEach((b) => b.addEventListener('click', () => { S.assetId = b.dataset.id; LS.set('ia_scan_pick', S.assetId); RENDER.scan(); }));
    restartScan();
  };
  function restartScan() {
    S.t0 = performance.now(); S.locked = false; S.opened = false;
    $('#scReticle').classList.remove('locked');
    $('#scMsg').textContent = S.source === 'device' ? 'Point at a printed Inspection AI tag' : 'Looking for a QR tag…';
    if (!S.bg) M.getImage('x-net').then((r) => { S.bg = r.img; }).catch(() => {});
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(scanTick);
  }
  async function cardFor(id) {
    if (S.cards.has(id)) return S.cards.get(id);
    const a = getAsset(id); if (!a) return null;
    const c = await labelCanvas(a);
    S.cards.set(id, c);
    return c;
  }
  function scanTick(now) {
    if (state.view !== 'scan') return;
    const { w, h } = fitCanvas(scCanvas);
    const ctx = scCanvas.getContext('2d');
    ctx.fillStyle = '#0b1116'; ctx.fillRect(0, 0, w, h);
    const t = (now - S.t0) / 1000;
    if (S.source === 'device' && scVideo.videoWidth) {
      drawCover(ctx, scVideo, w, h);
    } else {
      if (S.bg) { ctx.save(); ctx.filter = 'blur(3px) brightness(.8)'; drawCover(ctx, S.bg, w, h, 1.25, 0.5 + Math.sin(t * 0.7) * 0.02, 0.5 + Math.cos(t * 0.6) * 0.015); ctx.restore(); }
      const card = S.cards.get(S.assetId);
      if (!card && S.assetId) cardFor(S.assetId);
      if (card) {
        const p = Math.min(1, t / 2.2), e = 1 - Math.pow(1 - p, 3);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const rw = Math.min(0.62 * w, 300 * dpr);              // reticle size in canvas pixels
        const finalW = rw * 0.78 * (card.width / 600);         // QR (600 px wide on the label) fills the reticle
        const cw = finalW * (0.5 + 0.5 * e), ch = cw * card.height / card.width;
        const qrOff = ((590 - card.height / 2) / card.height) * ch; // QR centre is above the label centre
        const cx = w / 2 + (1 - e) * w * 0.3 + Math.sin(t * 1.6) * 3 * dpr;
        const cy = h * 0.46 - qrOff + (1 - e) * h * 0.32 + Math.cos(t * 1.3) * 3 * dpr;
        ctx.save(); ctx.translate(cx, cy + qrOff); ctx.rotate((1 - e) * 0.35 + 0.015 * Math.sin(t)); ctx.translate(0, -qrOff);
        ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30;
        ctx.drawImage(card, -cw / 2, -ch / 2, cw, ch); ctx.restore();
        if (t > 2.5 && !S.locked) {
          S.locked = true; $('#scReticle').classList.add('locked'); $('#scMsg').textContent = `Tag ${S.assetId} found`; navigator.vibrate?.(60);
        }
        if (t > 3.1 && !S.opened) { S.opened = true; openScannedTag(S.assetId); }
      }
    }
    S.raf = requestAnimationFrame(scanTick);
  }
  function stopScan() { cancelAnimationFrame(S.raf); clearInterval(S.detectTimer); stopStream(S.stream); S.stream = null; if (S.source === 'device') { S.source = 'demo'; paintScanSource(); } }
  leaveHooks.push((from) => { if (from === 'scan') stopScan(); });
  $('#scStage').addEventListener('click', () => { if (S.source === 'demo' && !$('#modalRoot').innerHTML) restartScan(); });
  $('#scClose').addEventListener('click', () => history.length > 1 ? history.back() : show('home'));
  $('#scManual').addEventListener('click', () => { const id = prompt('Tag ID (e.g. SC-014):'); if (id?.trim()) openScannedTag(id.trim()); });
  function paintScanSource() { $('#scSource span').textContent = S.source === 'demo' ? 'Demo' : 'Device'; $('#scSource').classList.toggle('on', S.source === 'device'); }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  $('#scSource').addEventListener('click', async () => {
    if (S.source === 'device') { stopStream(S.stream); S.stream = null; clearInterval(S.detectTimer); S.source = 'demo'; paintScanSource(); restartScan(); return; }
    try { S.stream = await openDeviceCamera(scVideo); } catch { toast('Camera blocked or not found. Staying on the demo scanner.', true); return; }
    S.source = 'device'; paintScanSource(); restartScan();
    toast('Real scanning on: point at a printed tag from QR tags.');
    if ('BarcodeDetector' in window) { try { S.detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { S.detector = null; } }
    if (!S.detector && !window.jsQR) { try { await loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'); } catch { toast('QR reader could not load. Check the internet connection.', true); } }
    const grab = document.createElement('canvas'); const gctx = grab.getContext('2d', { willReadFrequently: true });
    clearInterval(S.detectTimer);
    S.detectTimer = setInterval(async () => {
      if (state.view !== 'scan' || S.source !== 'device' || !scVideo.videoWidth || $('#modalRoot').innerHTML) return;
      let text = '';
      try {
        if (S.detector) { const r = await S.detector.detect(scVideo); text = r[0]?.rawValue || ''; }
        else if (window.jsQR) {
          const s = Math.min(1, 720 / Math.max(scVideo.videoWidth, scVideo.videoHeight));
          grab.width = Math.round(scVideo.videoWidth * s); grab.height = Math.round(scVideo.videoHeight * s);
          gctx.drawImage(scVideo, 0, 0, grab.width, grab.height);
          const d = gctx.getImageData(0, 0, grab.width, grab.height);
          text = window.jsQR(d.data, d.width, d.height)?.data || '';
        }
      } catch { /* keep scanning */ }
      if (text) { $('#scReticle').classList.add('locked'); $('#scMsg').textContent = 'Tag found'; openScannedTag(text); setTimeout(() => $('#scReticle').classList.remove('locked'), 1200); }
    }, 350);
  });

  // ======================= RESULT =======================
  const ICON = { present: '✓', missing: '✕', unclear: '?' };
  const STATUS_TEXT = { present: 'OK', missing: 'Not OK', unclear: 'Unclear' };
  function boxesFor(rec, group) {
    return (rec.result?.checklist || []).filter((c) => c.box && viewOf(c) === group);
  }
  function annoHtml(rec, group, shot, zoomable = true) {
    if (!shot) return `<div class="noimg">${group === ANY ? 'All views' : 'No photo'}</div>`;
    const boxes = shot.custom ? [] : boxesFor(rec, group);
    return `<div class="anno" ${zoomable ? `data-zoom="${esc(group)}"` : ''}><img src="${esc(shot.src)}" ${shot.key ? `data-key="${esc(shot.key)}"` : ''} alt="${esc(group)} photo" />
      ${boxes.map((c) => { const b = bboxOf(c.box); const lbl = `<em>${ICON[c.status]} ${esc(splitCheck(c.part).name)}</em>`;
        return Array.isArray(c.box)
          ? `<span class="bx ${c.status} ${b[1] < 0.09 ? 'low' : ''}" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${b[2] * 100}%;height:${b[3] * 100}%">${lbl}</span>`
          : `<span class="bx poly ${c.status} ${b[1] < 0.09 ? 'low' : ''}" style="left:${b[0] * 100}%;top:${b[1] * 100}%;width:${b[2] * 100}%;height:${b[3] * 100}%">${lbl}</span>`; }).join('')}
      ${boxes.some((c) => !Array.isArray(c.box)) ? `<svg class="polys" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${boxes.filter((c) => !Array.isArray(c.box)).map((c) => `<polygon class="${c.status}" points="${c.box.poly.map((p) => `${p[0] * 100},${p[1] * 100}`).join(' ')}" />`).join('')}</svg>` : ''}
      <div class="wm">${esc(wmText(rec, group, shot.ts))}</div></div>`;
  }
  function partRow(c) {
    const sc = splitCheck(c.part);
    const where = c.foundIn && c.foundIn !== c.group ? `Seen in the ${c.foundIn.toLowerCase()} photo. ` : '';
    return `<li class="${c.status}"><span class="ic ${c.status}" aria-label="${STATUS_TEXT[c.status]}">${ICON[c.status]}</span>
      <span><span class="pn">${c.critical ? '<span class="crit">Critical</span>' : ''}${esc(sc.name)}</span>
      ${sc.rule ? `<span class="prule">Must be: ${esc(sc.rule)}</span>` : ''}
      <span class="pnote">${esc(STATUS_TEXT[c.status] + '. ' + where + cap(c.note || ''))}</span></span>
</li>`;
  }
  function ringSvg(pct, color) {
    const L = 97.4;
    return `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" stroke="#e6e8e2"/><circle cx="18" cy="18" r="15.5" stroke="${color}" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - pct / 100)}"/></svg>`;
  }
  const LOGO = '<svg viewBox="0 0 32 40" style="width:24px;height:30px"><path d="M4 6h24v26a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#86BC25"/><circle cx="16" cy="11" r="3" fill="#000000"/><path d="M10 23l4.5 4.5L23 18" stroke="#000000" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TAG_COLOR = { GREEN: 'var(--go)', YELLOW: 'var(--caution)', RED: 'var(--stop)' };

  function renderResult() {
    const rec = state.cur;
    const r = rec.result;
    const ai = r.ai || {};
    const tag = resultTag(rec);
    const tt = tagWords(rec, tag);
    const a = rec.asset;
    const ov = rec.override?.status || '';
    const bad = r.checklist.filter((c) => c.status === 'missing').sort((x, y) => Number(y.critical) - Number(x.critical));
    const unc = r.checklist.filter((c) => c.status === 'unclear');
    const attention = [...bad, ...unc];
    const groups = [...rec.angles.map((x) => x.name), ...(r.checklist.some((c) => c.group === ANY) ? [ANY] : [])];
    const details = [sizeText(a), dutyText(a.duty), swlText(a.swl) && `SWL ${swlText(a.swl)}`, a.erector && `erected by ${a.erector}`, a.reason].filter(Boolean).join(', ');
    const groupHtml = groups.map((g) => {
      const rows = r.checklist.filter((c) => c.group === g);
      const shot = rec.shots[g];
      if (!rows.length && !shot) return '';
      const okN = rows.filter((c) => c.status === 'present').length;
      return `<div class="check-group"><div class="cg-head ${g === ANY ? 'solo' : ''}">${g === ANY ? '' : annoHtml(rec, g, shot)}<div><h3>${esc(g)}</h3><p>${rows.length ? `${okN} of ${rows.length} OK` : 'Extra photo'}</p>
        ${rows.length ? `<ul class="plist">${rows.map(partRow).join('')}</ul>` : ''}</div></div></div>`;
    }).join('');

    $('#view-result').innerHTML = `
      <div class="result-wrap">
        <div class="stag-col">
          <article class="stag ${tag}" aria-label="${TAG_LABEL[tag]} tag: ${tt.word}">
            <div class="stag-top"><div class="stag-word">${tt.word}</div><div class="stag-sub">${ov ? 'Set by inspector' : esc(tt.sub)}</div></div>
            <div class="stag-body">
              <dl class="stag-fields">
                <div><dt>${esc(rec.typeName)}</dt><dd>${esc(a.id || '–')}</dd></div>
                <div><dt>Location</dt><dd>${esc(a.location || '–')}</dd></div>
                <div><dt>Inspected by</dt><dd>${esc(rec.meta.inspector || '–')}</dd></div>
                <div><dt>Date</dt><dd>${esc(fmtDate(r.evaluatedAt))}</dd></div>
              </dl>
              <div class="score"><div class="score-ring">${ringSvg(r.completion, TAG_COLOR[tag])}<b>${r.counts.present}/${r.counts.total}</b></div>
                <div class="counts"><span class="ok">${r.counts.present} OK</span><span class="bad">${r.counts.missing} not OK</span><span class="unc">${r.counts.unclear} unclear</span></div></div>
              ${rec.signoff?.done ? `<p class="stag-note signed">✓ Signed off by ${esc(rec.signoff.by)}, ${esc(fmtDate(rec.signoff.at))}</p>` : `<p class="stag-note">AI result. ${isSafety(rec) ? 'Needs sign-off by a competent person.' : 'Confirm and save.'}</p>`}
            </div>
          </article>
          <div class="result-actions">
            <button type="button" class="btn btn-hivis wide" id="btnSave">${rec.saved ? '✓ Saved – update' : 'Save inspection'}</button>
            <button type="button" class="btn btn-ink wide" id="btnReport"><svg><use href="#i-history"/></svg>Open full report</button>
            <button type="button" class="btn btn-line" id="btnShare"><svg><use href="#i-share"/></svg>Share</button>
            <button type="button" class="btn btn-line" id="btnCsv"><svg><use href="#i-download"/></svg>CSV</button>
            ${!rec.fromHistory ? `<button type="button" class="btn btn-line wide btn-sm" id="btnRecapture">${rec.mode === 'live' ? 'Scan again' : 'Retake photos'}</button>` : ''}
          </div>
        </div>
        <div class="result-main">
          <div class="card"><h2 class="card-title">${attention.length ? 'Needs attention' : `All ${r.counts.total} checks passed`}</h2>
            <p class="ai-summary">${esc(ai.summary || '')}</p>
            ${attention.length ? `<ul class="plist" style="margin-top:.6rem">${attention.map(partRow).join('')}</ul>` : ''}</div>
          ${ai.defects?.length ? `<div class="card"><h2 class="card-title">Damage spotted</h2><ul class="defects">${ai.defects.map((d) => `<li><span class="sev ${esc(d.severity)}">${esc(d.severity)}</span><span>${esc(d.description)}${d.angle ? ` <span class="muted">(${esc(d.angle)})</span>` : ''}</span></li>`).join('')}</ul></div>` : ''}
          ${ai.recommendations?.length ? `<div class="card"><h2 class="card-title">${tag === 'GREEN' ? 'Next steps' : 'Corrective actions'}</h2><ol class="actions-list">${ai.recommendations.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
          <div class="card"><h2 class="card-title">Your decision</h2>
            <div class="decision" role="radiogroup" aria-label="Final result">
              <button type="button" data-o="" class="${!ov ? 'on' : ''}">Keep AI</button><button type="button" data-o="PASS" class="${ov === 'PASS' ? 'on' : ''}">Green</button>
              <button type="button" data-o="REVIEW" class="${ov === 'REVIEW' ? 'on' : ''}">Yellow</button><button type="button" data-o="FAIL" class="${ov === 'FAIL' ? 'on' : ''}">Red</button></div>
            <label class="field" style="margin:0"><span>Remarks and actions</span><textarea id="ovRemarks" rows="2" maxlength="500" placeholder="e.g. Toe board fitted on east side, re-inspect tomorrow">${esc(rec.override?.remarks || '')}</textarea></label>
            <label class="signoff"><input type="checkbox" id="signoff" ${rec.signoff?.done ? 'checked' : ''} /><span>${isSafety(rec) ? `I have inspected this ${esc(rec.typeName.toLowerCase())} in person as a competent person and agree with this result.` : 'I have checked this result.'}</span></label>
          </div>
          <div class="card"><h2 class="card-title">Why this result</h2><ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
            ${details ? `<p class="muted">Details: ${esc(details)}.</p>` : ''}${rec.meta.notes ? `<p class="muted">Notes: ${esc(rec.meta.notes)}</p>` : ''}${rec.meta.gps ? `<p class="muted">GPS: ${rec.meta.gps.lat}, ${rec.meta.gps.lng}</p>` : ''}</div>
          <div class="card"><h2 class="card-title">All checks and photos</h2>${groupHtml}</div>
          <p class="disclaimer">${rec.module === 'scaffold' ? 'AI pre-inspection only, not a scaffold certificate. A competent person must inspect and sign the tag before use.' : 'AI pre-inspection only. A competent person must confirm.'}${r.liveStats ? ` Live scan checked ${r.liveStats.frames} frames in ${r.liveStats.seconds} s.` : ''} Every OK was double-checked.</p>
        </div>
      </div>`;

    $$('.decision button').forEach((b) => b.addEventListener('click', () => { rec.override.status = b.dataset.o; track('decision_changed', { tag: rec.asset?.id, decision: b.dataset.o || 'AI result' }); rec.saved = false; renderResult(); toast(b.dataset.o ? `Result set to ${TAG_LABEL[resultTag(rec)]}` : 'Using the AI result'); }));
    $('#ovRemarks').addEventListener('input', (e) => { rec.override.remarks = e.target.value; rec.saved = false; });
    $('#signoff').addEventListener('change', (e) => {
      rec.signoff = e.target.checked ? { done: true, by: state.profile.name || rec.meta.inspector || 'Inspector', at: new Date().toISOString() } : { done: false, by: '', at: '' };
      rec.saved = false; renderResult();
    });
    $('#btnSave').addEventListener('click', () => saveToHistory(rec));
    $('#btnReport').addEventListener('click', () => openReport(rec));
    $('#btnShare').addEventListener('click', () => shareSummary(rec));
    $('#btnCsv').addEventListener('click', () => exportCsv([rec]));
    $('#btnRecapture')?.addEventListener('click', () => {
      rec.result = null;
      if (rec.mode === 'live') { rec.shots = {}; startLive(); } else startPhoto();
    });
    $$('#view-result [data-zoom]').forEach((el) => el.addEventListener('click', () => zoom(el)));
  }
  function zoom(el) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = el.outerHTML;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  }

  function saveToHistory(rec) {
    track('report_saved', { tag: rec.asset?.id, result: TAG_LABEL[resultTag(rec)], signedOff: !!rec.signoff?.done });
    rec.saved = true;
    rec.reportNo = rec.reportNo || reportNo(rec);
    const copy = { ...clone(rec), fromHistory: false };
    if (copy.assetId == null && getAsset(copy.asset.id)) copy.assetId = copy.asset.id;
    state.history = [copy, ...state.history.filter((h) => h.id !== rec.id)];
    if (!saveHistory()) { toast('Device storage is full. Delete old reports in Settings.', true); return; }
    renderResult();
    toast(rec.assetId || getAsset(rec.asset.id) ? `Saved. Tag ${rec.asset.id} is now ${TAG_LABEL[resultTag(rec)]}.` : 'Inspection saved');
  }
  function openHistory(id) {
    const rec = state.history.find((h) => h.id === id);
    if (!rec) return;
    track('report_opened', { tag: rec.asset?.id, reportNo: rec.reportNo });
    state.cur = { ...clone(rec), fromHistory: true, saved: true };
    renderResult();
    show('result');
  }

  function summaryText(rec) {
    const tag = resultTag(rec); const r = rec.result;
    const bad = r.checklist.filter((c) => c.status !== 'present').map((c) => `- ${splitCheck(c.part).name}: ${STATUS_TEXT[c.status]}`);
    return [`${rec.typeName} ${rec.asset.id}${rec.asset.location ? ' at ' + rec.asset.location : ''}`, `${TAG_LABEL[tag]}: ${tagWords(rec, tag).word}`, `${r.counts.present} of ${r.counts.total} checks OK`,
      ...(bad.length ? ['Needs attention:', ...bad.slice(0, 10)] : []), rec.override?.remarks ? `Remarks: ${rec.override.remarks}` : '',
      `Inspected by ${rec.meta.inspector} on ${fmtDate(r.evaluatedAt)}`, 'Checked with Inspection AI.'].filter(Boolean).join('\n');
  }
  async function shareSummary(rec) {
    track('report_shared', { tag: rec.asset?.id });
    const text = summaryText(rec);
    try {
      if (navigator.share) { await navigator.share({ title: `${rec.typeName} ${rec.asset.id} inspection`, text }); return; }
      await navigator.clipboard.writeText(text); toast('Summary copied. Paste it in WhatsApp or email.');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not share on this device.', true); }
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'inspection';
  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCsv(list) {
    track('csv_export', { reports: list.length, tag: list.length === 1 ? list[0].asset?.id : undefined });
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Report no.', 'Inspection type', 'ID', 'Location', 'Inspector', 'Date', 'Result', 'Checks OK', 'View', 'Check', 'Critical', 'Status', 'Evidence', 'Remarks'];
    const rows = list.flatMap((rec) => rec.result.checklist.map((c) => [rec.reportNo || '', rec.typeName, rec.asset.id, rec.asset.location, rec.meta.inspector, fmtDate(rec.result.evaluatedAt), TAG_LABEL[resultTag(rec)], `${rec.result.counts.present} of ${rec.result.counts.total}`, c.group, splitCheck(c.part).name, c.critical ? 'yes' : '', STATUS_TEXT[c.status], c.note, rec.override?.remarks]));
    const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
    download(list.length === 1 ? `${slug(list[0].typeName)}-${slug(list[0].asset.id)}.csv` : `inspection-reports-${isoDay(Date.now())}.csv`, csv, 'text/csv;charset=utf-8');
  }

  // ======================= FULL REPORT DOCUMENT =======================
  function reportHtml(rec) {
    const r = rec.result; const ai = r.ai || {}; const a = rec.asset;
    const tag = resultTag(rec); const tt = tagWords(rec, tag);
    const no = rec.reportNo || reportNo(rec);
    const findings = r.checklist.filter((c) => c.status !== 'present');
    const groups = rec.angles.map((x) => x.name).filter((g) => rec.shots[g]);
    return `<article class="doc">
      <header class="doc-head">
        <div><div class="brandline">${LOGO}<span>Inspection AI</span></div>
          <h1 style="margin-top:3mm">${esc(rec.typeName)} inspection report</h1><div style="color:#4b5a65">${esc(a.site || state.profile.site || '')}${state.profile.company ? ' · ' + esc(state.profile.company) : ''}</div></div>
        <div class="meta"><img class="client-logo" src="brand/client-logo.png" alt="" onerror="this.remove()" /><b>${esc(no)}</b><br />${esc(fmtDate(r.evaluatedAt))}<br />${rec.mode === 'live' ? 'Live scan' : 'Photo inspection'}</div>
      </header>
      <section class="doc-verdict ${tag}"><div><div class="w">${tt.word}</div><p>${rec.override?.status ? 'Final result set by the inspector' : esc(tt.sub)}</p></div>
        <div class="sc"><b>${r.counts.present}/${r.counts.total}</b><span>checks OK · ${r.counts.missing} not OK · ${r.counts.unclear} unclear</span></div></section>
      <div class="summary-box">${esc(ai.summary || '')}</div>
      <div class="doc-grid">
        <div><h2>Asset</h2><table class="kvt"><tbody>
          <tr><td>${esc(rec.idLabel || 'ID')}</td><td><b>${esc(a.id)}</b></td></tr><tr><td>Location</td><td>${esc(a.location || '–')}</td></tr>
          ${a.height ? `<tr><td>Height</td><td>${esc(fmtM(a.height))}</td></tr>` : ''}${a.length ? `<tr><td>Length</td><td>${esc(fmtM(a.length))}</td></tr>` : ''}${a.lifts ? `<tr><td>Lifts</td><td>${esc(a.lifts)}</td></tr>` : ''}${normDuty(a.duty) ? `<tr><td>Duty</td><td>${esc(dutyText(a.duty))}</td></tr>` : ''}${swlText(a.swl) ? `<tr><td>Safe working load</td><td>${esc(swlText(a.swl))}</td></tr>` : ''}
          ${a.erector ? `<tr><td>Erected by</td><td>${esc(a.erector)}</td></tr>` : ''}<tr><td>Reason</td><td>${esc(a.reason || 'Routine check')}</td></tr>
          ${a.lastInspection ? `<tr><td>Previous inspection</td><td>${esc(fmtDay(a.lastInspection))}</td></tr>` : ''}</tbody></table></div>
        <div><h2>Inspection</h2><table class="kvt"><tbody>
          <tr><td>Inspector</td><td><b>${esc(rec.meta.inspector)}</b></td></tr><tr><td>Company</td><td>${esc(rec.meta.company || state.profile.company || '–')}</td></tr>
          <tr><td>Method</td><td>${rec.mode === 'live' ? `Live camera scan${r.liveStats ? `, ${r.liveStats.frames} frames in ${r.liveStats.seconds} s` : ''}` : `${groups.length} photos`}</td></tr>
          <tr><td>AI checks</td><td>${r.counts.total} points, every OK double-checked</td></tr>
          <tr><td>Next inspection</td><td>${tag === 'GREEN' ? esc(fmtDay(new Date(r.evaluatedAt).getTime() + 7 * 864e5)) : 'After corrective action'}</td></tr>
          ${rec.meta.gps ? `<tr><td>GPS</td><td>${rec.meta.gps.lat}, ${rec.meta.gps.lng}</td></tr>` : ''}</tbody></table></div>
      </div>
      ${findings.length ? `<h2>Findings</h2><table><thead><tr><th style="width:26%">Check</th><th style="width:16%">View</th><th style="width:11%">Status</th><th>Evidence</th></tr></thead><tbody>
        ${findings.map((c) => `<tr><td>${c.critical ? '<b style="color:var(--stop)">Critical · </b>' : ''}${esc(splitCheck(c.part).name)}</td><td>${esc(c.group === ANY ? c.foundIn || 'Any view' : c.group)}${c.foundIn && c.group !== ANY && c.foundIn !== c.group ? `<br /><small>photo: ${esc(c.foundIn)}</small>` : ''}</td><td class="st ${c.status}">${STATUS_TEXT[c.status]}</td><td>${esc(cap(c.note))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${ai.defects?.length ? `<h2>Defects</h2><table><thead><tr><th style="width:14%">Severity</th><th>Description</th><th style="width:22%">Where</th></tr></thead><tbody>${ai.defects.map((d) => `<tr><td class="st ${d.severity === 'high' ? 'missing' : 'unclear'}">${esc(cap(d.severity))}</td><td>${esc(d.description)}</td><td>${esc(d.angle || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${ai.recommendations?.length ? `<div class="avoid"><h2>${tag === 'GREEN' ? 'Next steps' : 'Corrective actions required'}</h2><ol style="margin:0;padding-left:5mm">${ai.recommendations.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
      ${groups.length ? `<h2>Photo evidence</h2><div class="doc-photos">${groups.map((g) => `<figure>${annoHtml(rec, g, rec.shots[g], false)}<figcaption><b>${esc(g)}</b>${r.checklist.filter((c) => c.group === g).length ? ` – ${r.checklist.filter((c) => c.group === g && c.status === 'present').length} of ${r.checklist.filter((c) => c.group === g).length} OK` : ''}</figcaption></figure>`).join('')}</div>` : ''}
      <h2>Full checklist</h2><table><thead><tr><th style="width:18%">View</th><th style="width:27%">Check</th><th style="width:11%">Status</th><th>Evidence</th></tr></thead><tbody>
        ${r.checklist.map((c) => `<tr><td>${esc(c.group)}</td><td>${c.critical ? '<b>! </b>' : ''}${esc(splitCheck(c.part).name)}</td><td class="st ${c.status}">${STATUS_TEXT[c.status]}</td><td>${esc(cap(c.note))}</td></tr>`).join('')}</tbody></table>
      <div class="avoid"><h2>Sign-off</h2>
        ${rec.override?.remarks ? `<p><b>Remarks:</b> ${esc(rec.override.remarks)}</p>` : ''}
        <div class="doc-sign">
          <div>${rec.signoff?.done ? `<span class="sig">${esc(rec.signoff.by)}</span><br />` : '<br /><br />'}Competent person: ${esc(rec.signoff?.by || rec.meta.inspector)}</div>
          <div>${rec.signoff?.done ? esc(fmtDate(rec.signoff.at)) : '<br />'}<br />Date and time</div>
          ${getAsset(a.id) ? `<img src="${qrUrl(tagLink(a.id), 300)}" alt="Tag QR" />` : ''}
        </div></div>
      <footer class="doc-foot">${rec.module === 'scaffold' ? 'AI pre-inspection only, not a scaffold certificate. A competent person must inspect and sign the tag before use.' : 'AI pre-inspection only. A competent person must confirm the result.'} Generated by Inspection AI · ${esc(no)} · Demo build.</footer>
    </article>`;
  }
  function openReport(rec) {
    closeDoc();
    const shell = document.createElement('div');
    shell.className = 'doc-shell'; shell.id = 'docShell';
    shell.innerHTML = `<div class="doc-bar"><button type="button" class="icon-btn light" id="docClose" aria-label="Close report"><svg><use href="#i-close"/></svg></button><b>Report<small>${esc(rec.reportNo || reportNo(rec))}</small></b>
      <button type="button" class="btn btn-hivis btn-sm" id="docPrint"><svg><use href="#i-print"/></svg>Print / Save PDF</button></div>${reportHtml(rec)}`;
    document.body.appendChild(shell);
    document.body.style.overflow = 'hidden';
    $('#docClose', shell).addEventListener('click', closeDoc);
    $('#docPrint', shell).addEventListener('click', () => { track('report_print_pdf', { tag: rec.asset?.id, reportNo: rec.reportNo }); $('#printArea').innerHTML = reportHtml(rec); setTimeout(() => window.print(), 300); });
  }
  function closeDoc() { $('#docShell')?.remove(); document.body.style.overflow = ''; }

  // ======================= REPORTS LIST =======================
  RENDER.reports = () => {
    const all = state.history;
    const q = state.histQuery.toLowerCase();
    const list = all.filter((h) => (state.histFilter === 'all' || resultTag(h) === state.histFilter) && (!q || [h.asset?.id, h.typeName, h.asset?.location, h.meta?.inspector, h.reportNo].join(' ').toLowerCase().includes(q)));
    $$('#histFilters button').forEach((b) => b.classList.toggle('on', b.dataset.f === state.histFilter));
    const box = $('#historyList');
    if (!all.length) { box.innerHTML = '<div class="empty"><b>No reports yet</b><span>Scan a QR tag to run an inspection, then tap Save inspection.</span><button type="button" class="btn btn-hivis btn-sm" data-go="scan">Scan QR tag</button></div>'; return; }
    box.innerHTML = list.length ? list.map(rowHtml).join('') : '<div class="empty"><b>Nothing matches</b><span>Try another search or filter.</span></div>';
    wireRows(box);
  };
  $('#histSearch').addEventListener('input', (e) => { state.histQuery = e.target.value; RENDER.reports(); });
  $$('#histFilters button').forEach((b) => b.addEventListener('click', () => { state.histFilter = b.dataset.f; RENDER.reports(); }));
  $('#btnExportCsvAll').addEventListener('click', () => { if (!state.history.length) return toast('Nothing to export yet.'); exportCsv(state.history); });

  // ======================= SETTINGS =======================
  RENDER.settings = () => {
    const p = state.profile;
    $('#pfName').value = p.name || ''; $('#pfRole').value = p.role || ''; $('#pfCompany').value = p.company || ''; $('#pfSite').value = p.site || '';
    $('#profAvatar').textContent = initialsOf(p.name);
    $('#profName').textContent = p.name || 'Your name';
    $('#profSub').textContent = [p.role, p.company].filter(Boolean).join(', ');
    $$('#speedSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.v === state.speed));
    renderTypeList(); renderInstall();
    let bytes = 0; try { bytes = (localStorage.getItem('ia_history') || '').length; } catch { /* ignore */ }
    $('#dataInfo').textContent = `${state.history.length} report${state.history.length === 1 ? '' : 's'} and ${state.assets.length} QR tags on this device (${(bytes / 1048576).toFixed(1)} MB).`;
  };
  function initialsOf(n) { return (String(n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase(); }
  $('#profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.profile = { name: $('#pfName').value.trim(), role: $('#pfRole').value.trim(), company: $('#pfCompany').value.trim(), site: $('#pfSite').value.trim() };
    LS.set('ia_profile', state.profile); syncSampleNames(); paintProfile(); RENDER.settings(); toast('Profile saved');
  });
  $$('#speedSeg button').forEach((b) => b.addEventListener('click', () => { state.speed = +b.dataset.v; LS.set('ia_speed', state.speed); RENDER.settings(); }));
  $('#btnResetDemo').addEventListener('click', async () => {
    if (!confirm('Reset the demo? Sample tags and the two sample reports are restored. Reports you saved are removed.')) return;
    state.types = clone(D.TYPES); saveTypes();
    state.history = [];
    await seed(true);
    seedSite(true);
    track('demo_reset'); toast('Demo reset'); RENDER.settings();
  });
  $('#btnExportAll').addEventListener('click', () => { if (!state.history.length) return toast('Nothing to export yet.'); download(`inspections-${isoDay(Date.now())}.json`, JSON.stringify({ assets: state.assets, reports: state.history }, null, 2), 'application/json'); });
  $('#btnClearHistory').addEventListener('click', () => { if (!confirm('Delete ALL reports from this device?')) return; state.history = []; saveHistory(); RENDER.settings(); toast('All reports deleted'); });

  function renderTypeList() {
    $('#typeList').innerHTML = state.types.map((t) => `<button type="button" class="row" data-edit-type="${esc(t.id)}">${typeIcon(t)}
      <span class="row-main"><span class="row-title">${esc(t.name)} ${t.builtin ? '<span class="type-badge">Built-in</span>' : ''}</span><span class="row-sub">${t.angles.length} views, ${countChecks(t)} checks</span></span>
      <svg class="row-chev"><use href="#i-chev"/></svg></button>`).join('');
    $$('#typeList [data-edit-type]').forEach((b) => b.addEventListener('click', () => openEditor(b.dataset.editType, 'settings')));
  }
  $('#btnRestoreTypes').addEventListener('click', () => {
    if (!confirm('Restore the built-in inspection types? Your custom types are kept.')) return;
    D.TYPES.forEach((b) => { const i = state.types.findIndex((t) => t.id === b.id); if (i >= 0) state.types[i] = clone(b); else state.types.push(clone(b)); });
    saveTypes(); renderTypeList(); toast('Built-in types restored');
  });
  document.addEventListener('click', (e) => { const n = e.target.closest('[data-new-type]'); if (n) openEditor(null, n.dataset.newType === 'picker' ? 'picker' : 'settings'); });

  // ---------- type editor ----------
  function edViewRow(a = { name: '', guidance: '', parts: [] }, i = 0) {
    const div = document.createElement('div');
    div.className = 'ed-view';
    div.innerHTML = `<div class="ed-top"><span class="ed-num">${i + 1}</span><input class="aname" placeholder="View name, e.g. Front" maxlength="60" value="${esc(a.name)}" aria-label="View name" />
      <button type="button" class="icon-btn ed-x" aria-label="Remove view"><svg><use href="#i-close"/></svg></button></div>
      <input class="guide" placeholder="How to frame the photo" maxlength="200" value="${esc(a.guidance || '')}" aria-label="Photo guidance" />
      <textarea class="aparts" rows="${Math.max(3, a.parts.length + 1)}" aria-label="Checks" placeholder="One check per line">${esc(a.parts.join('\n'))}</textarea>`;
    $('.ed-x', div).addEventListener('click', () => { div.remove(); $$('#edViews .ed-num').forEach((n, k) => { n.textContent = k + 1; }); });
    return div;
  }
  function fillEditorViews(angles, general) { const box = $('#edViews'); box.innerHTML = ''; angles.forEach((a, i) => box.appendChild(edViewRow(a, i))); $('#edGeneral').value = (general || []).join('\n'); }
  function openEditor(id, returnTo) {
    const t = id ? getType(id) : null;
    state.editor = { id: t ? t.id : null, returnTo };
    $('#edTitle').textContent = t ? `Edit: ${t.name}` : 'New inspection type';
    $('#edName').value = t?.name || ''; $('#edDesc').value = t?.description || ''; $('#edIdLabel').value = t?.idLabel || ''; $('#edSafety').checked = Boolean(t?.safety);
    fillEditorViews(t ? t.angles : [{ name: 'Front', guidance: '', parts: [] }, { name: 'Back', guidance: '', parts: [] }], t?.general_parts || []);
    $('#edDelete').hidden = !t;
    show('editor');
  }
  function readEditor() {
    const name = $('#edName').value.trim();
    const angles = $$('#edViews .ed-view').map((row) => ({ name: $('.aname', row).value.trim(), guidance: $('.guide', row).value.trim(), parts: splitLines($('.aparts', row).value) })).filter((a) => a.name);
    if (!name) { $('#edName').focus(); throw new Error('Enter a name for this inspection type.'); }
    if (!angles.length) throw new Error('Add at least one view.');
    if (new Set(angles.map((a) => a.name.toLowerCase())).size !== angles.length) throw new Error('Each view needs a different name.');
    const general = splitLines($('#edGeneral').value);
    if (!angles.some((a) => a.parts.length) && !general.length) throw new Error('Add at least one check.');
    return { name, description: $('#edDesc').value.trim(), idLabel: $('#edIdLabel').value.trim(), safety: $('#edSafety').checked, angles, general_parts: general };
  }
  function leaveEditor(savedId) {
    const back = state.editor?.returnTo; state.editor = null;
    if (back === 'picker' && savedId) { selectType(savedId); return; }
    if (back === 'details') { show(getType(state.selTypeId) ? 'details' : 'setup'); return; }
    if (back === 'picker') { show('setup'); return; }
    show('settings');
  }
  $('#edAddView').addEventListener('click', () => { const r = edViewRow(undefined, $$('#edViews .ed-view').length); $('#edViews').appendChild(r); $('.aname', r).focus(); });
  $('#edSave').addEventListener('click', () => {
    let data; try { data = readEditor(); } catch (e) { toast(e.message, true); return; }
    let id = state.editor?.id;
    if (id) Object.assign(getType(id), data);
    else { id = 'type-' + uid(); state.types.push({ id, builtin: false, module: /scaffold/i.test(data.name) ? 'scaffold' : '', ...data }); }
    saveTypes(); toast('Inspection type saved'); leaveEditor(id);
  });
  $('#edCancel').addEventListener('click', () => leaveEditor(null));
  $('#edDelete').addEventListener('click', () => {
    const t = getType(state.editor?.id);
    if (!t || !confirm(`Delete the inspection type "${t.name}"? Saved reports are kept.`)) return;
    state.types = state.types.filter((x) => x.id !== t.id); saveTypes(); toast('Inspection type deleted');
    if (state.editor.returnTo === 'details') state.editor.returnTo = 'picker';
    leaveEditor(null);
  });
  $('#btnSuggest').addEventListener('click', async () => {
    const item = $('#edName').value.trim();
    if (!item) { toast('Type the name first, e.g. "Forklift".', true); $('#edName').focus(); return; }
    if ($$('#edViews .aparts').some((t) => t.value.trim()) && !confirm('Replace the current views and checks with AI suggestions?')) return;
    await analyse('', [`Understanding "${item}"`, 'Choosing camera views', 'Writing visual checks'], 2600);
    const lib = D.SUGGEST_LIBRARY.find((x) => x.k.test(item));
    const out = lib ? { angles: lib.angles, general: lib.general } : {
      angles: [
        { name: 'Front', guidance: `Whole ${item.toLowerCase()} from the front`, parts: ['Nameplate :: nameplate or ID label present and readable', 'Body condition :: no dents, cracks or heavy rust'] },
        { name: 'Left side', guidance: 'Left side fully in frame', parts: ['Guards and covers :: all guards and covers fitted', 'Fasteners :: no missing bolts or screws'] },
        { name: 'Right side', guidance: 'Right side fully in frame', parts: ['! Moving parts :: guarded, nothing loose or broken'] },
        { name: 'Controls / close-up', guidance: 'Close-up of controls, gauges or connections', parts: ['! Emergency stop :: present and not damaged', 'Labels :: warning labels present'] },
      ], general: ['Leaks :: no oil, fluid or gas leaks visible'],
    };
    fillEditorViews(out.angles, out.general);
    toast('Checklist suggested. Review it, then save.');
  });

  // ---------- install (PWA) ----------
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvt = e; if (state.view === 'settings') renderInstall(); });
  window.addEventListener('appinstalled', () => { state.installEvt = null; toast('App installed. Open it from your home screen.'); renderInstall(); });
  function renderInstall() {
    const btn = $('#installBtn'), steps = $('#installSteps');
    steps.hidden = true; btn.hidden = false;
    if (isStandalone()) { $('#installText').textContent = '✓ Installed. You are using the app version.'; btn.hidden = true; return; }
    if (state.installEvt) $('#installText').textContent = 'Install Inspection AI on this device. It opens full screen from the home screen.';
    else if (isIOS()) { $('#installText').textContent = 'On iPhone and iPad, add the app from Safari:'; btn.hidden = true; steps.hidden = false; steps.innerHTML = '<ol><li>Tap the Share button.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol>'; }
    else $('#installText').textContent = 'Open this page in Chrome or Edge to install it as an app.';
  }
  $('#installBtn').addEventListener('click', async () => {
    if (!state.installEvt) { toast('Use your browser menu: Install app / Add to Home screen.'); return; }
    state.installEvt.prompt(); await state.installEvt.userChoice.catch(() => {}); state.installEvt = null; renderInstall();
  });

  // a saved photo link that no longer loads is replaced by the next working source (local copy, FilePath, drawn)
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img?.tagName !== 'IMG' || !img.dataset.key || img.dataset.fixed) return;
    img.dataset.fixed = '1';
    M.getImage(img.dataset.key).then((r) => { if (r.src !== img.src) img.src = r.src; }).catch(() => {});
  }, true);

  // clear a red field as soon as the user edits it
  document.addEventListener('input', (e) => { if (e.target.classList?.contains('invalid')) e.target.classList.remove('invalid'); });

  // ======================= BOOT =======================
  (async () => {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    // ensure built-in types exist (in case of old saved data)
    D.TYPES.forEach((b) => {
      const cur = getType(b.id);
      if (!cur) state.types.push(clone(b));
      else if (cur.builtin && (cur.rev || 1) < (b.rev || 1)) Object.assign(cur, clone(b)); // newer built-in checklist
    });
    saveTypes();
    await seed();
    seedSite();
    migrateAssets(); saveAssets(); saveHistory();
    // warm photo cache for a smooth demo
    M.preload(['p-base', 'p-elev', 'p-plat', 'p-ladder', 'f-base', 'f-elev', 'f-plat', 'f-ladder', 'x-site', 'x-net']);
    await sleep(500);
    if (state.user?.email) { track('session_resume'); unlock(); } else showLogin();
  })();
})();
