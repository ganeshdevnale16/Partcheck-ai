// Local / Render server: serves the app and the same /api functions that run on Vercel.
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true, version: '6.0.0' }));
app.all('/api/:name', async (req, res) => {
  const name = String(req.params.name).replace(/[^a-z0-9-]/gi, '');
  if (!name || name.startsWith('_')) return res.status(404).end();
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, 'api', `${name}.js`)).href);
    await mod.default(req, res);
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return res.status(404).json({ ok: false });
    console.error(e); if (!res.headersSent) res.status(500).json({ ok: false, error: 'Server error' });
  }
});
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Inspection AI running on http://localhost:${port}`));
