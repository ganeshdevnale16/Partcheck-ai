// Downloads the demo photos into public/demo/images so the demo works without internet
// and never depends on Wikimedia. Run once:  npm run images
// To use YOUR OWN photos instead: put them in public/demo/images and edit manifest.json (key -> file name).
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'public', 'demo', 'images');
const src = await fs.readFile(path.join(root, 'public', 'js', 'demo-data.js'), 'utf8');
const ctx = { window: {} }; vm.runInNewContext(src, ctx);
const { COMMONS } = ctx.window.DEMO;
await fs.mkdir(out, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(path.join(out, 'manifest.json'), 'utf8')); } catch {}
for (const [key, c] of Object.entries(COMMONS)) {
  if (manifest[key]) { console.log(`skip ${key} (already in manifest: ${manifest[key]})`); continue; }
  const fname = c.path.split('/').pop();
  const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/${c.path}/1280px-${fname}`;
  const ext = /\.png$/i.test(fname) ? 'png' : 'jpg';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'InspectionAI-demo/5.0 (image download script)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(path.join(out, `${key}.${ext}`), buf);
    manifest[key] = `${key}.${ext}`;
    console.log(`ok   ${key}  ${(buf.length / 1024).toFixed(0)} KB  (${c.file})`);
  } catch (e) { console.log(`FAIL ${key}: ${e.message}`); }
}
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nSaved to public/demo/images (${Object.keys(manifest).length} photos). Commit them so the demo works offline.`);
