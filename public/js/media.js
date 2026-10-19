/* Inspection AI – DEMO MEDIA
   getImage(key) returns { img, src } for a demo photo.
   Order: local copy in /demo/images (if downloaded) -> Wikimedia thumbnail -> Wikimedia FilePath -> drawn fallback.
   Tag close-ups are drawn so they carry the right tag ID, date and colour. */
(() => {
  'use strict';
  const D = window.DEMO;
  const cache = new Map();
  let local = null;

  const ready = (async () => {
    try {
      const r = await fetch('demo/images/manifest.json', { cache: 'no-store' });
      if (r.ok) local = await r.json();
    } catch { /* no local copies */ }
  })();

  function loadImg(src, cors, timeout = 9000) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      if (cors) i.crossOrigin = 'anonymous';
      const t = setTimeout(() => { i.src = ''; reject(new Error('timeout')); }, timeout);
      i.onload = () => { clearTimeout(t); resolve(i); };
      i.onerror = () => { clearTimeout(t); reject(new Error('load failed')); };
      i.src = src;
    });
  }

  function sourcesFor(key) {
    const list = [];
    if (local && local[key]) list.push({ src: 'demo/images/' + local[key], cors: true });
    const c = D.COMMONS[key];
    if (c) {
      const fname = c.path.split('/').pop();
      list.push({ src: `https://upload.wikimedia.org/wikipedia/commons/thumb/${c.path}/1280px-${fname}`, cors: true });
      list.push({ src: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(c.file.replace(/ /g, '_'))}?width=1280`, cors: false });
    }
    return list;
  }

  // key examples: 'p-base', 'f-plat', 'p-tag|SC-014|2026-10-14'
  function getImage(key) {
    if (cache.has(key)) return cache.get(key);
    const p = (async () => {
      await ready;
      const [base, assetId, date] = key.split('|');
      if (D.GENERATED[base]) {
        const url = drawTag(base === 'p-tag' ? 'pass' : 'fail', assetId || 'SC-000', date);
        return { img: await loadImg(url, false), src: url, generated: true };
      }
      for (const s of sourcesFor(base)) {
        try { const img = await loadImg(s.src, s.cors); return { img, src: s.src, cors: s.cors }; } catch { /* try next */ }
      }
      const url = drawScene(base);
      return { img: await loadImg(url, false), src: url, generated: true };
    })();
    cache.set(key, p);
    return p;
  }

  // warm the cache so the demo never waits on a photo
  function preload(keys) { keys.forEach((k) => getImage(k).catch(() => {})); }

  // ---------- drawing helpers ----------
  let noiseTile;
  function noise(ctx, w, h, alpha = 0.06) {
    if (!noiseTile) {
      noiseTile = document.createElement('canvas');
      noiseTile.width = noiseTile.height = 160;
      const n = noiseTile.getContext('2d');
      const d = n.createImageData(160, 160);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      n.putImageData(d, 0, 0);
    }
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(noiseTile, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  function vignette(ctx, w, h, s = 0.55) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${s})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function tube(ctx, x1, y1, x2, y2, r, tone = 150) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    ctx.save(); ctx.translate(x1, y1); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, `rgb(${tone - 60},${tone - 55},${tone - 50})`);
    g.addColorStop(0.35, `rgb(${tone + 70},${tone + 72},${tone + 75})`);
    g.addColorStop(0.6, `rgb(${tone},${tone + 3},${tone + 6})`);
    g.addColorStop(1, `rgb(${tone - 80},${tone - 76},${tone - 72})`);
    ctx.fillStyle = g; ctx.fillRect(0, -r, len, r * 2);
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------- close-up photo of a scaffold tag ----------
  function drawTag(kind, assetId, isoDate) {
    const W = 1200, H = 900;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const pass = kind === 'pass';
    const inspected = isoDate ? new Date(isoDate) : new Date(Date.now() - (pass ? 2 : 21) * 864e5);
    const due = new Date(inspected.getTime() + 7 * 864e5);
    const dfmt = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // out-of-focus site background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#9fb3c4'); bg.addColorStop(0.45, '#c9cbc4'); bg.addColorStop(1, '#6e6a62');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.filter = 'blur(10px)';
    ctx.fillStyle = '#b9b3a6'; ctx.fillRect(0, 120, W, 420);
    for (let x = 30; x < W; x += 120) { ctx.fillStyle = 'rgba(70,80,90,.45)'; ctx.fillRect(x, 170, 60, 90); ctx.fillRect(x, 330, 60, 90); }
    tube(ctx, 0, 640, W, 610, 26, 120);
    tube(ctx, 960, 0, 990, H, 28, 125);
    ctx.restore();
    // the tube the tag hangs on, sharp
    tube(ctx, 140, -20, 175, H + 20, 34, 140);
    tube(ctx, -20, 92, W + 20, 70, 30, 135);
    // coupler
    ctx.fillStyle = '#5d6168'; roundRect(ctx, 115, 46, 92, 76, 10); ctx.fill();
    ctx.fillStyle = '#868b93'; ctx.fillRect(126, 58, 70, 12);

    // tag holder
    ctx.save();
    ctx.translate(600, 470); ctx.rotate(-0.035);
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    const tw = 560, th = 700;
    ctx.fillStyle = '#f4f1e6'; roundRect(ctx, -tw / 2, -th / 2, tw, th, 26); ctx.fill();
    ctx.shadowColor = 'transparent';
    // header band
    ctx.fillStyle = '#000000'; roundRect(ctx, -tw / 2, -th / 2, tw, 150, 26); ctx.fill(); ctx.fillRect(-tw / 2, -th / 2 + 110, tw, 40);
    // punched hole
    ctx.fillStyle = '#3b3f45'; ctx.beginPath(); ctx.arc(0, -th / 2 + 50, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9ccd0'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#86bc25'; ctx.font = '700 34px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SCAFFOLD INSPECTION TAG', 0, -th / 2 + 122);
    // status insert
    ctx.fillStyle = pass ? '#26890d' : '#da291c'; roundRect(ctx, -tw / 2 + 36, -th / 2 + 180, tw - 72, 170, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 76px Arial, sans-serif';
    ctx.fillText(pass ? 'SAFE TO USE' : 'DO NOT USE', 0, -th / 2 + 290);
    ctx.font = '600 26px Arial, sans-serif';
    ctx.fillText(pass ? 'This scaffold has been inspected' : 'Unsafe – keep off this scaffold', 0, -th / 2 + 330);
    // fields
    ctx.textAlign = 'left'; ctx.fillStyle = '#1d2830';
    const rows = [['Scaffold ID', assetId], ['Inspected', dfmt(inspected)], ['Next due', dfmt(due)], ['Inspector', 'R. Deshmukh']];
    rows.forEach(([k, v], i) => {
      const y = -th / 2 + 410 + i * 66;
      ctx.font = '600 24px Arial, sans-serif'; ctx.fillStyle = '#5b6b78'; ctx.fillText(k, -tw / 2 + 44, y);
      ctx.font = '700 34px Arial, sans-serif'; ctx.fillStyle = '#1d2830'; ctx.fillText(v, -tw / 2 + 230, y);
      ctx.strokeStyle = 'rgba(29,40,48,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-tw / 2 + 44, y + 20); ctx.lineTo(tw / 2 - 44, y + 20); ctx.stroke();
    });
    if (!pass) {
      ctx.save(); ctx.rotate(-0.32); ctx.globalAlpha = 0.82;
      ctx.strokeStyle = '#b3201a'; ctx.lineWidth = 10; roundRect(ctx, -170, 120, 340, 110, 12); ctx.stroke();
      ctx.fillStyle = '#b3201a'; ctx.font = '900 74px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('EXPIRED', 0, 202);
      ctx.restore();
    }
    ctx.restore();
    // cable tie from the hole to the tube
    ctx.strokeStyle = '#151515'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(588, 152); ctx.quadraticCurveTo(420, 70, 190, 96); ctx.stroke();
    noise(ctx, W, H, 0.12); vignette(ctx, W, H, 0.5);
    return c.toDataURL('image/jpeg', 0.86);
  }

  // ---------- drawn fallback when a photo cannot be loaded (offline) ----------
  function drawScene(key) {
    const W = 1280, H = 960;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const fail = key.startsWith('f-');
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, '#7fa6c9'); sky.addColorStop(1, '#dfe6ea');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // building
    ctx.fillStyle = '#c8bfae'; ctx.fillRect(60, 80, W - 120, H - 200);
    for (let y = 120; y < H - 200; y += 150) for (let x = 110; x < W - 160; x += 170) { ctx.fillStyle = '#4c5866'; ctx.fillRect(x, y, 80, 100); }
    // ground
    ctx.fillStyle = '#7b7266'; ctx.fillRect(0, H - 130, W, 130);
    // scaffold
    const cols = [150, 390, 630, 870, 1110];
    const lifts = [H - 150, H - 350, H - 550, H - 750];
    cols.forEach((x, i) => { if (!(fail && i === 4)) tube(ctx, x, 40, x + (fail && i === 3 ? 26 : 0), H - 140, 11, 150); });
    lifts.forEach((y, j) => { if (!(fail && j === 2)) tube(ctx, 120, y, W - 120, y - (fail && j === 1 ? 10 : 0), 10, 140); });
    if (!fail) for (let i = 0; i < 4; i += 2) tube(ctx, cols[i], lifts[0], cols[i + 1], lifts[2], 9, 135);
    // boards
    lifts.slice(1).forEach((y) => { for (let x = 140; x < W - 140; x += 120) { if (fail && x > 640 && x < 900 && y === lifts[1]) continue; ctx.fillStyle = '#9a7448'; ctx.fillRect(x, y - 4, 112, 22); } });
    // base
    cols.forEach((x) => {
      if (fail && x > 500) { ctx.fillStyle = '#a3482f'; ctx.fillRect(x - 36, H - 150, 72, 26); ctx.fillRect(x - 28, H - 176, 56, 26); }
      else { ctx.fillStyle = '#8c6a43'; ctx.fillRect(x - 70, H - 136, 140, 16); ctx.fillStyle = '#5c6166'; ctx.fillRect(x - 26, H - 146, 52, 10); }
    });
    noise(ctx, W, H, 0.1); vignette(ctx, W, H, 0.45);
    return c.toDataURL('image/jpeg', 0.84);
  }

  // A neutral "camera" frame for non-scaffold demo inspections
  function drawGeneric(label, i = 0) {
    const W = 1280, H = 960;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, W, H);
    const tones = [['#3f4a52', '#9aa4a8'], ['#4a3f38', '#b0a296'], ['#2f4048', '#8fa6ae']][i % 3];
    g.addColorStop(0, tones[0]); g.addColorStop(1, tones[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; roundRect(ctx, 380, 180, 520, 600, 40); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '600 44px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, H / 2);
    noise(ctx, W, H, 0.14); vignette(ctx, W, H, 0.5);
    return c.toDataURL('image/jpeg', 0.82);
  }

  window.MEDIA = { getImage, preload, drawTag, drawGeneric, ready };
})();
