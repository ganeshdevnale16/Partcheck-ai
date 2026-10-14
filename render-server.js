// Static server for the Inspection AI client demo (Render.com or local). No API keys needed.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.get('/api/health', (req, res) => res.json({ ok: true, version: '5.0.0-demo', demo: true }));
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Inspection AI demo running on http://localhost:${port}`));
