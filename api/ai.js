// POST /api/ai  { task: 'evaluate' | 'frame' | 'test' | 'suggest', ..., device?: { provider, apiKey, ... } }
// Runs the inspection photos through the configured vision model and returns structured results.
import {
  resolveConfig, callVision, parseJson, friendlyError, rateLimit, publicInfo,
  SYSTEM_INSPECTOR, SYSTEM_CHECKLIST, evaluatePrompt, verifyPrompt, framePrompt, suggestPrompt,
} from './_ai.js';

const MAX_PHOTOS = 12;
const okImage = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length < 3_000_000;
const clip = (v, n = 400) => String(v ?? '').slice(0, n);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
function box(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  let [x, y, w, h] = b.map(Number);
  if ([x, y, w, h].some((v) => !Number.isFinite(v))) return null;
  if (x > 1 || y > 1 || w > 1 || h > 1) { x /= 1000; y /= 1000; w /= 1000; h /= 1000; } // some models answer in 0-1000
  x = num(x); y = num(y); w = num(w); h = num(h);
  if (w < 0.01 || h < 0.01) return null;
  return [x, y, Math.min(w, 1 - x), Math.min(h, 1 - y)];
}
const STATUS = new Set(['present', 'missing', 'unclear']);
const SEV = new Set(['high', 'medium', 'low']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!(await rateLimit(ip))) return res.status(429).json({ ok: false, error: 'Too many AI requests from this network. Try again in an hour.' });

  const cfg = await resolveConfig(b.device);
  if (!cfg) return res.status(400).json({ ok: false, code: 'no_config', error: 'No AI key is set up. An Admin can add one in Settings → AI engine.' });
  const started = Date.now();
  try {
    if (b.task === 'test') {
      const out = await callVision(cfg, { system: 'You are a helpful assistant.', text: 'Reply with JSON {"ok": true, "model_says": "<3 words>"}', maxTokens: 300, timeoutMs: 25000 });
      parseJson(out);
      return res.json({ ok: true, info: publicInfo(cfg), ms: Date.now() - started });
    }

    if (b.task === 'suggest') {
      const name = clip(b.name, 120);
      if (!name) return res.status(400).json({ ok: false, error: 'Enter the inspection name.' });
      const images = (Array.isArray(b.images) ? b.images : []).filter(okImage).slice(0, 8);
      const docs = (Array.isArray(b.docs) ? b.docs : []).filter((d) => d && d.mime === 'application/pdf' && typeof d.data === 'string' && d.data.length < 3_600_000).slice(0, 2)
        .map((d) => ({ mime: 'application/pdf', data: d.data, name: clip(d.name, 120) }));
      const fileNames = (Array.isArray(b.fileNames) ? b.fileNames : []).slice(0, 10).map((f) => clip(f, 120));
      const text = suggestPrompt({ name, description: clip(b.description, 2000), documentText: clip(b.documentText, 60000), fileNames, imageCount: images.length, docCount: docs.length });
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_CHECKLIST, text, images, docs, maxTokens: 6000, timeoutMs: 55000 }));
      const chk = (c) => ({ name: clip(c?.name, 80).replace(/::|^!/g, ' ').trim(), rule: clip(c?.rule, 300).replace(/::/g, ' ').trim(), critical: !!c?.critical });
      const angles = (Array.isArray(raw.angles) ? raw.angles : []).slice(0, 8).map((v) => ({
        name: clip(v?.name, 60).trim(), guidance: clip(v?.guidance, 200).trim(),
        checks: (Array.isArray(v?.checks) ? v.checks : []).slice(0, 10).map(chk).filter((c) => c.name),
      })).filter((v) => v.name && v.checks.length);
      if (!angles.length) return res.status(502).json({ ok: false, error: 'The AI did not return any checks. Add more detail to the description and try again.' });
      const seen = new Set();
      angles.forEach((v) => { let n = v.name, k = 2; while (seen.has(n.toLowerCase())) n = `${v.name} ${k++}`; v.name = n; seen.add(n.toLowerCase()); });
      return res.json({
        ok: true, info: publicInfo(cfg), ms: Date.now() - started,
        result: { description: clip(raw.description, 300), idLabel: clip(raw.idLabel, 40), safety: !!raw.safety, basedOn: clip(raw.basedOn, 300),
          angles, general: (Array.isArray(raw.general) ? raw.general : []).slice(0, 6).map(chk).filter((c) => c.name) },
      });
    }

    if (b.task === 'evaluate') {
      const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p) => okImage(p?.image)).slice(0, MAX_PHOTOS);
      const checks = (Array.isArray(b.checks) ? b.checks : []).slice(0, 80).map((c) => ({ id: clip(c.id, 10), view: clip(c.view, 60), name: clip(c.name, 80), rule: clip(c.rule, 240), critical: !!c.critical }));
      if (!photos.length) return res.status(400).json({ ok: false, error: 'No photos received.' });
      if (!checks.length) return res.status(400).json({ ok: false, error: 'No checks to evaluate.' });
      const p = { item: clip(b.item, 80), description: clip(b.description, 300), assetId: clip(b.assetId, 60), location: clip(b.location, 160), photos: photos.map((x) => ({ view: clip(x.view, 60) })), checks };
      const images = photos.map((x) => x.image);
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_INSPECTOR, text: evaluatePrompt(p), images, maxTokens: 6000 }));
      const byId = new Map((raw.checks || []).map((c) => [String(c.id), c]));
      let results = checks.map((c) => {
        const r = byId.get(c.id) || {};
        const photo = Number(r.photo) >= 1 && Number(r.photo) <= photos.length ? Number(r.photo) : null;
        return { id: c.id, status: STATUS.has(r.status) ? r.status : 'unclear', evidence: clip(r.evidence || (byId.has(c.id) ? '' : 'Not assessed by the AI'), 300), photo, box: photo ? box(r.box) : null };
      });
      // second, independent check of every OK (strict mode)
      let verified = false;
      const oks = results.filter((r) => r.status === 'present');
      if (b.verify !== false && oks.length && Date.now() - started < 30000) {
        try {
          const vp = { ...p, checks: oks.map((r) => ({ ...checks.find((c) => c.id === r.id), evidence: r.evidence })) };
          const v = parseJson(await callVision(cfg, { system: SYSTEM_INSPECTOR, text: verifyPrompt(vp), images, maxTokens: 2500, timeoutMs: Math.max(10000, 55000 - (Date.now() - started)) }));
          const vm = new Map((v.results || []).map((x) => [String(x.id), x]));
          results = results.map((r) => {
            if (r.status !== 'present') return r;
            const x = vm.get(r.id);
            if (x && x.confirmed === false) return { ...r, status: 'unclear', evidence: `${r.evidence} · second check could not confirm${x.reason ? ': ' + clip(x.reason, 160) : ''}` };
            return { ...r, evidence: `${r.evidence} · confirmed by second check` };
          });
          verified = true;
        } catch { /* keep first-pass result if the second check fails */ }
      }
      return res.json({
        ok: true, info: publicInfo(cfg), ms: Date.now() - started, verified,
        result: {
          item_identified: clip(raw.item_identified, 160), item_matches: raw.item_matches !== false,
          photo_quality: (raw.photo_quality || []).slice(0, MAX_PHOTOS).map((q) => ({ photo: Number(q.photo) || 0, ok: q.ok !== false, issue: clip(q.issue, 160) })),
          checks: results,
          defects: (raw.defects || []).slice(0, 15).map((d) => ({ photo: Number(d.photo) || null, description: clip(d.description, 240), severity: SEV.has(d.severity) ? d.severity : 'medium', box: box(d.box) })).filter((d) => d.description),
          summary: clip(raw.summary, 900), recommendations: (raw.recommendations || []).slice(0, 10).map((r) => clip(r, 260)).filter(Boolean),
        },
      });
    }

    if (b.task === 'frame') {
      if (!okImage(b.image)) return res.status(400).json({ ok: false, error: 'No camera frame received.' });
      const checks = (Array.isArray(b.checks) ? b.checks : []).slice(0, 60).map((c) => ({ id: clip(c.id, 10), name: clip(c.name, 80), rule: clip(c.rule, 200), critical: !!c.critical }));
      const p = { item: clip(b.item, 80), assetId: clip(b.assetId, 60), views: (b.views || []).slice(0, 12).map((v) => clip(v, 60)), view: clip(b.view, 60), checks };
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_INSPECTOR, text: framePrompt(p), images: [b.image], maxTokens: 1800, timeoutMs: 25000 }));
      const ids = new Set(checks.map((c) => c.id));
      return res.json({
        ok: true, ms: Date.now() - started,
        result: {
          view_guess: clip(raw.view_guess, 60), frame_ok: raw.frame_ok !== false, hint: clip(raw.hint, 80),
          checks: (raw.checks || []).filter((c) => ids.has(String(c.id)) && (c.status === 'present' || c.status === 'missing')).map((c) => ({ id: String(c.id), status: c.status, evidence: clip(c.evidence, 240), box: box(c.box) })),
          defects: (raw.defects || []).slice(0, 5).map((d) => ({ description: clip(d.description, 200), severity: SEV.has(d.severity) ? d.severity : 'medium', box: box(d.box) })).filter((d) => d.description),
        },
      });
    }
    return res.status(400).json({ ok: false, error: 'Unknown task.' });
  } catch (e) {
    console.error('AI error', cfg.provider, e.status, e.message);
    return res.status(e.status && e.status < 500 ? 502 : 502).json({ ok: false, error: friendlyError(e, cfg) });
  }
}
