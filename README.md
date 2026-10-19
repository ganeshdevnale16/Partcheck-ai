# Inspection AI – Client Demo (v5.1, Deloitte-style theme)

Demo build of Inspection AI for client presentations. Every screen and flow works like the real product,
but **no AI backend or API keys are needed**: the camera shows real scaffold site photos and the AI findings
are pre-recorded. The real tool is developed separately.

## Demo script (5 minutes)
1. **Sign in** – any name, any password.
2. **Dashboard** – KPIs, weekly chart, recent reports, tag status.
3. **QR tags** → **Create QR tag** (pick *Pass* or *Fail* as the demo outcome) → print / download the label.
4. **Scan** (yellow button) → pick the tag → it is detected → **Start live scan**.
   The camera pans to each part, boxes lock on, checks tick off, damage is flagged. Use **1× / 2× / 4×** for speed.
5. **Result** – Green / Yellow / Red tag, findings, corrective actions, your decision, sign-off → **Save**.
6. **Open full report** → **Print / Save PDF** (A4 report with photos, checklist, signature and tag QR).
7. **Reports** – two sample reports are always there: **SC-014 (PASS)** and **SC-027 (FAIL)**.

Also works: Photo-by-photo mode, other inspection types, custom types with "Suggest with AI",
remarks, CSV export, share, install as an app, offline use.

**Real QR scanning:** in Scan, tap **Demo → Device** to use the phone camera on a printed tag.
Scanning a printed tag with a phone's normal camera also opens the app straight to that scaffold.
(QR links point to the address the demo runs on, so print labels from the deployed URL.)

## Run locally
```
npm install
npm start          # http://localhost:3000
```

## Deploy
- **Render**: push to GitHub → New Web Service → build `npm install`, start `npm start` (or use render.yaml).
- **Vercel / Netlify**: static site, output directory `public`, no build command.

## Photos
Real scaffold photos load from Wikimedia Commons (CC BY-SA). For a demo that never depends on the internet:
```
npm run images     # saves the photos into public/demo/images
```
To use your own site photos: put them in `public/demo/images` and map them in `manifest.json`
(keys: p-base, p-elev, p-plat, p-ladder = PASS views; f-base, f-elev, f-plat, f-ladder = FAIL views;
x-site = home background; x-net = scanner background). Tag close-ups are drawn by the app.
If a photo can't load, the app draws a fallback image so the demo never breaks.

## Files
```
public/index.html        all screens
public/styles.css        design
public/js/app.js         app logic (screens, live scan, photo mode, QR tags, scanner, results, reports)
public/js/demo-data.js   checklists, scripted PASS / FAIL findings, sample tags, photo list
public/js/media.js       photo loading + drawn tag close-ups and fallbacks
public/js/qr.js          built-in QR code generator (no internet needed)
scripts/download-demo-images.mjs
render-server.js         static server
```
Reset everything anytime: **Settings → Demo controls → Reset**.

## Theme (v5.1)
Black / white / cool grey with green accent (#86BC25), Open Sans, square corners.
Colours live in the `:root` block at the top of `public/styles.css`; the theme layer is at the end of that file.

**Client logo (optional):** put a file at `public/brand/client-logo.png`. It appears in the sidebar and on every
PDF report header. If the file is missing nothing shows. Only use a client's logo with their permission.
