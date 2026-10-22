// Static server for the Inspection AI client demo (Render.com or local). No API keys needed.
// + Activity logging: the app sends events to POST /api/log, which are appended to logs/activity.log
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', true); // so req.ip is the real client IP behind Render / proxies

// ---------- activity log ----------
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'activity.log');
fs.mkdirSync(LOG_DIR, { recursive: true });
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // set this to be able to download the log
const clip = (v, n = 200) => String(v ?? '').slice(0, n);

app.post('/api/log', express.json({ limit: '10kb', type: ['application/json', 'text/plain'] }), (req, res) => {
  const b = req.body || {};
  const entry = {
    time: new Date().toISOString(),
    email: clip(b.email, 120) || 'anonymous',
    action: clip(b.action, 60),
    view: clip(b.view, 30),
    detail: typeof b.detail === 'object' && b.detail ? JSON.parse(JSON.stringify(b.detail, (k, v) => (typeof v === 'string' ? clip(v) : v))) : {},
    session: clip(b.session, 40),
    ip: req.ip,
    ua: clip(req.get('user-agent'), 160),
  };
  if (!entry.action) return res.status(400).json({ ok: false });
  fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', () => {});
  res.json({ ok: true });
});

// Download the log:  /api/logs?key=YOUR_ADMIN_KEY          (add &format=csv for Excel)
app.get('/api/logs', (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(403).send('Forbidden');
  if (!fs.existsSync(LOG_FILE)) return res.status(404).send('No activity yet');
  if (req.query.format === 'csv') {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const csv = ['time,email,action,view,detail,session,ip', ...lines.map((e) => [e.time, e.email, e.action, e.view, JSON.stringify(e.detail), e.session, e.ip].map(q).join(','))].join('\r\n');
    res.type('text/csv').attachment('activity-log.csv').send('\uFEFF' + csv);
  } else {
    res.type('text/plain').attachment('activity.log').send(fs.readFileSync(LOG_FILE));
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, version: '5.0.0-demo', demo: true }));
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Inspection AI demo running on http://localhost:${port}`));
