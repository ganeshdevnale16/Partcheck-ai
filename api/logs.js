// GET /api/logs?key=ADMIN_KEY            -> JSON lines file
// GET /api/logs?key=ADMIN_KEY&format=csv -> CSV for Excel
import { configured, redis, KEY } from './_store.js';

export default async function handler(req, res) {
  const admin = process.env.ADMIN_KEY || '';
  if (!admin || req.query.key !== admin) return res.status(403).send('Forbidden');
  if (!configured()) return res.status(500).send('Database not connected. In Vercel: Storage > add Upstash Redis, then redeploy.');
  const rows = (await redis(['LRANGE', KEY, 0, -1])) || [];
  if (!rows.length) return res.status(404).send('No activity yet');
  if (req.query.format === 'csv') {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const list = rows.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const csv = ['time,email,action,view,detail,session,ip', ...list.map((e) => [e.time, e.email, e.action, e.view, JSON.stringify(e.detail), e.session, e.ip].map(q).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="activity-log.csv"');
    return res.status(200).send('\uFEFF' + csv);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="activity.log"');
  res.status(200).send(rows.join('\n'));
}
