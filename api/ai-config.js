// GET    /api/ai-config                      -> which AI engine the server will use (never returns the key)
// POST   /api/ai-config  { adminKey, config } -> save the AI key on the server (encrypted, in Redis)
// DELETE /api/ai-config  { adminKey }         -> remove the saved key
import { canStoreOnServer, loadServerConfig, saveServerConfig, deleteServerConfig, envConfig, clean, validate, publicInfo } from './_ai.js';
import crypto from 'node:crypto';

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export default async function handler(req, res) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (req.method === 'GET') {
    const s = await loadServerConfig();
    const e = envConfig();
    return res.json({ ok: true, canStore: canStoreOnServer(), server: s ? publicInfo({ ...s, source: 'server' }) : null, env: e ? publicInfo({ ...e, source: 'env' }) : null });
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ ok: false });
  if (!canStoreOnServer()) {
    return res.status(400).json({ ok: false, error: 'Server storage is not set up. In Vercel add Upstash Redis (Storage) and an ADMIN_KEY environment variable, then redeploy. Until then, use "This device only".' });
  }
  if (!b.adminKey || !same(b.adminKey, process.env.ADMIN_KEY)) return res.status(403).json({ ok: false, error: 'Admin key is wrong.' });
  if (req.method === 'DELETE') { await deleteServerConfig(); return res.json({ ok: true }); }
  const c = clean(b.config);
  // keep the saved key when the admin leaves the key field empty while changing other settings
  if (!c.apiKey) { const old = await loadServerConfig(); if (old && old.provider === c.provider) c.apiKey = old.apiKey; }
  const err = validate(c);
  if (err) return res.status(400).json({ ok: false, error: err });
  const saved = { ...c, savedAt: new Date().toISOString(), savedBy: String(b.savedBy || '').slice(0, 120) };
  await saveServerConfig(saved);
  return res.json({ ok: true, server: publicInfo({ ...saved, source: 'server' }) });
}
