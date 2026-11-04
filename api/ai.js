// POST /api/ai  { task: 'evaluate' | 'frame' | 'test' | 'suggest', ..., device?: { provider, apiKey, ... } }
// Runs the inspection photos through the configured vision model and returns structured results.
import {
  resolveConfig, callVision, parseJson, friendlyError, rateLimit, publicInfo,
  SYSTEM_INSPECTOR, SYSTEM_CHECKLIST, SYSTEM_LOCATE, SYSTEM_CONVERT, convertPrompt, SYSTEM_GROUP, groupPrompt, evaluatePrompt, verifyPrompt, framePrompt, suggestPrompt, locatePrompt, boxSpec, readBox,
} from './_ai.js';

const MAX_PHOTOS = 12;
const okImage = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length < 3_000_000;
const clip = (v, n = 400) => String(v ?? '').slice(0, n);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
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
      // big documents can produce a long answer: if it is cut off, retry once asking for a compact checklist,
      // and if that is cut off too, keep every complete view/check from the partial answer
      let raw, partial = false;
      const ask = async (extra, maxTokens) => parseJson(await callVision(cfg, { system: SYSTEM_CHECKLIST, text: text + extra, images, docs, maxTokens, timeoutMs: 50000 }), { allowPartial: false });
      try { raw = await ask('', 12000); }
      catch (e) {
        if (e.code !== 'truncated' && !/not valid JSON/.test(e.message)) throw e;
        try { raw = await ask('\n\nIMPORTANT: your previous answer was too long. Return at most 6 views with at most 6 checks each, rules under 15 words.', 12000); }
        catch (e2) {
          const rescued = (e2.partial || e.partial) ? parseJson(e2.partial || e.partial) : null;
          if (!rescued || !Array.isArray(rescued.angles)) throw new Error('The AI answer was too long and was cut off. Try a shorter document or add a description of what to check.');
          raw = rescued; partial = true;
        }
      }
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
        result: { partial, description: clip(raw.description, 300), idLabel: clip(raw.idLabel, 40), safety: !!raw.safety, basedOn: clip(raw.basedOn, 300),
          angles, general: (Array.isArray(raw.general) ? raw.general : []).slice(0, 6).map(chk).filter((c) => c.name) },
      });
    }

    if (b.task === 'evaluate') {
      const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p) => okImage(p?.image)).slice(0, MAX_PHOTOS);
      const checks = (Array.isArray(b.checks) ? b.checks : []).slice(0, 150).map((c) => ({ id: clip(c.id, 10), view: clip(c.view, 60), name: clip(c.name, 80), rule: clip(c.rule, 240), critical: !!c.critical }));
      if (!photos.length) return res.status(400).json({ ok: false, error: 'No photos received.' });
      if (!checks.length) return res.status(400).json({ ok: false, error: 'No checks to evaluate.' });
      const p = { item: clip(b.item, 80), description: clip(b.description, 300), assetId: clip(b.assetId, 60), location: clip(b.location, 160), photos: photos.map((x) => ({ view: clip(x.view, 60) })), checks, box: boxSpec(cfg.provider) };
      const images = photos.map((x) => x.image);
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_INSPECTOR, text: evaluatePrompt(p), images, maxTokens: Math.min(20000, 4000 + checks.length * 110) }));
      const byId = new Map((raw.checks || []).map((c) => [String(c.id), c]));
      let results = checks.map((c) => {
        const r = byId.get(c.id) || {};
        const photo = Number(r.photo) >= 1 && Number(r.photo) <= photos.length ? Number(r.photo) : null;
        return { id: c.id, status: STATUS.has(r.status) ? r.status : 'unclear', evidence: clip(r.evidence || (byId.has(c.id) ? '' : 'Not assessed by the AI'), 300), photo, box: photo ? readBox(r, cfg.provider) : null };
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
          defects: (raw.defects || []).slice(0, 15).map((d) => ({ photo: Number(d.photo) || null, description: clip(d.description, 240), severity: SEV.has(d.severity) ? d.severity : 'medium', box: readBox(d, cfg.provider) })).filter((d) => d.description),
          summary: clip(raw.summary, 900), recommendations: (raw.recommendations || []).slice(0, 10).map((r) => clip(r, 260)).filter(Boolean),
        },
      });
    }

    if (b.task === 'group') {
      const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 400).map((r) => ({ ref: clip(r.ref, 20), text: clip(r.text, 220).replace(/\s+/g, ' ') })).filter((r) => r.ref && r.text);
      if (rows.length < 2) return res.status(400).json({ ok: false, error: 'Not enough rows to group.' });
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_GROUP, text: groupPrompt({ name: clip(b.name, 120), description: clip(b.description, 600), rows }), maxTokens: Math.min(16000, 1500 + rows.length * 25), timeoutMs: 50000 }));
      // every ref exactly once: drop unknown / repeated refs, put forgotten rows next to the row before them
      const known = new Set(rows.map((r) => r.ref)), seen = new Set();
      const views = (Array.isArray(raw.views) ? raw.views : []).slice(0, 20).map((v) => ({
        name: clip(v?.name, 60).trim(), guidance: clip(v?.guidance, 200).trim(),
        refs: (Array.isArray(v?.refs) ? v.refs : []).map((x) => String(x).trim()).filter((x) => known.has(x) && !seen.has(x) && seen.add(x)),
      })).filter((v) => v.name && v.refs.length);
      if (!views.length) return res.status(502).json({ ok: false, error: 'The AI did not return any views. Try again.' });
      rows.forEach((r, i) => {
        if (seen.has(r.ref)) return;
        const prev = rows.slice(0, i).reverse().find((p) => seen.has(p.ref));
        const host = (prev && views.find((v) => v.refs.includes(prev.ref))) || views[views.length - 1];
        host.refs.splice(prev ? host.refs.indexOf(prev.ref) + 1 : host.refs.length, 0, r.ref); seen.add(r.ref);
      });
      // no giant views: split anything over 15 rows into parts of about 12
      const sized = [];
      views.forEach((v) => { if (v.refs.length <= 15) sized.push(v); else { const parts = Math.ceil(v.refs.length / 12); for (let k = 0; k < parts; k++) sized.push({ ...v, name: `${v.name} ${k + 1}`, refs: v.refs.slice(Math.round((k * v.refs.length) / parts), Math.round(((k + 1) * v.refs.length) / parts)) }); } });
      views.length = 0; views.push(...sized);
      const names = new Set();
      views.forEach((v) => { let n = v.name, k = 2; while (names.has(n.toLowerCase())) n = `${v.name} ${k++}`; v.name = n; names.add(n.toLowerCase()); });
      return res.json({ ok: true, info: publicInfo(cfg), result: { views } });
    }

    if (b.task === 'convert') {
      const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 40).map((r) => ({ ref: clip(r.ref, 20), cells: (Array.isArray(r.cells) ? r.cells : []).slice(0, 15).map((c) => clip(c, 400).replace(/\s+/g, ' ')) })).filter((r) => r.ref);
      if (!rows.length) return res.status(400).json({ ok: false, error: 'No rows to convert.' });
      const text = convertPrompt({ name: clip(b.name, 120), description: clip(b.description, 600), header: clip(b.header, 600), sectionKey: clip(b.sectionKey, 40), rows });
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_CONVERT, text, maxTokens: Math.min(16000, 1500 + rows.length * 220), timeoutMs: 50000 }));
      const byRef = new Map((raw.checks || []).map((c) => [String(c.ref || '').trim(), c]));
      return res.json({ ok: true, info: publicInfo(cfg), result: {
        view: clip(raw.view, 60).trim(), guidance: clip(raw.guidance, 200).trim(),
        checks: rows.map((r) => { const c = byRef.get(r.ref); return c ? { ref: r.ref, name: clip(c.name, 80).replace(/::|^!/g, ' ').trim(), rule: clip(c.rule, 300).replace(/::/g, ' ').trim(), critical: !!c.critical } : { ref: r.ref, missing: true }; }),
      } });
    }

    if (b.task === 'locate') {
      if (!okImage(b.image)) return res.status(400).json({ ok: false, error: 'No photo received.' });
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((t) => ({ id: clip(t.id, 10), name: clip(t.name, 80), rule: clip(t.rule, 200), result: t.result === 'NOT OK' ? 'NOT OK' : 'OK', evidence: clip(t.evidence, 200) }));
      if (!items.length) return res.json({ ok: true, result: { items: [] } });
      const p = { item: clip(b.item, 80), view: clip(b.view, 60), grid: !!b.grid, items, box: boxSpec(cfg.provider) };
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_LOCATE, text: locatePrompt(p), images: [b.image], maxTokens: 1500, timeoutMs: 40000 }));
      const ids = new Set(items.map((t) => t.id));
      return res.json({ ok: true, ms: Date.now() - started, result: { items: (raw.items || []).filter((t) => ids.has(String(t.id))).map((t) => ({ id: String(t.id), box: readBox(t, cfg.provider) })) } });
    }

    if (b.task === 'frame') {
      if (!okImage(b.image)) return res.status(400).json({ ok: false, error: 'No camera frame received.' });
      const checks = (Array.isArray(b.checks) ? b.checks : []).slice(0, 150).map((c) => ({ id: clip(c.id, 10), name: clip(c.name, 80), rule: clip(c.rule, 200), critical: !!c.critical }));
      const p = { item: clip(b.item, 80), assetId: clip(b.assetId, 60), views: (b.views || []).slice(0, 12).map((v) => clip(v, 60)), view: clip(b.view, 60), checks, box: boxSpec(cfg.provider) };
      const raw = parseJson(await callVision(cfg, { system: SYSTEM_INSPECTOR, text: framePrompt(p), images: [b.image], maxTokens: 1800, timeoutMs: 25000 }));
      const ids = new Set(checks.map((c) => c.id));
      return res.json({
        ok: true, ms: Date.now() - started,
        result: {
          view_guess: clip(raw.view_guess, 60), frame_ok: raw.frame_ok !== false, hint: clip(raw.hint, 80),
          checks: (raw.checks || []).filter((c) => ids.has(String(c.id)) && (c.status === 'present' || c.status === 'missing')).map((c) => ({ id: String(c.id), status: c.status, evidence: clip(c.evidence, 240), box: readBox(c, cfg.provider) })),
          defects: (raw.defects || []).slice(0, 5).map((d) => ({ description: clip(d.description, 200), severity: SEV.has(d.severity) ? d.severity : 'medium', box: readBox(d, cfg.provider) })).filter((d) => d.description),
        },
      });
    }
    return res.status(400).json({ ok: false, error: 'Unknown task.' });
  } catch (e) {
    console.error('AI error', cfg.provider, e.status, e.message);
    return res.status(e.status && e.status < 500 ? 502 : 502).json({ ok: false, error: friendlyError(e, cfg) });
  }
}
