// POST /api/log  - the app sends one event per call; stored in Redis (and printed to Vercel Logs)
import { configured, redis, KEY } from './_store.js';
const clip = (v, n = 200) => String(v ?? '').slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (!b.action) return res.status(400).json({ ok: false });
  const entry = {
    time: new Date().toISOString(),
    email: clip(b.email, 120) || 'anonymous',
    action: clip(b.action, 60),
    view: clip(b.view, 30),
    detail: b.detail && typeof b.detail === 'object' ? JSON.parse(JSON.stringify(b.detail, (k, v) => (typeof v === 'string' ? clip(v) : v))) : {},
    session: clip(b.session, 40),
    ip: clip((req.headers['x-forwarded-for'] || '').split(',')[0].trim(), 60),
    ua: clip(req.headers['user-agent'], 160),
  };
  const line = JSON.stringify(entry);
  console.log('ACTIVITY', line); // also visible in Vercel > Logs
  if (configured()) {
    try { await redis(['RPUSH', KEY, line]); } catch (e) { console.error('redis error', e.message); }
  }
  res.status(200).json({ ok: true });
}
