# Partcheck AI v6.3 — hybrid localization architecture

Scan a scaffold's QR tag, inspect it with the camera, and get a Green / Yellow / Red result and a signed PDF report.
Inspections can use **real AI** (Azure OpenAI, OpenAI, Google Gemini or Anthropic Claude) or pre-recorded demo results.

## What's new in v6.1
- **AI boxes on live-scan photos** – every OK / Not OK the live AI finds is drawn on the exact frame it was found in,
  in the result and the PDF. Switch: Settings → AI engine → "Live scan: draw AI boxes…" (on by default).
  Real-AI photo mode now also shows boxes on photos taken with the device camera or uploaded.
- **AI checklist for any inspection** – Settings → Inspection types → Create (or "Create custom inspection").
  Enter a name and description (e.g. "FSSAI kitchen audit") and optionally add files: PDF, Word (.docx), Excel,
  CSV, text or photos (up to 6). The AI builds views and checks from them and keeps clause numbers from documents.
  Scanned PDFs are turned into page images in the browser, so they also work with Azure OpenAI.

## What's new in v6.1
- **Live scan boxes are back** – every frame that proved a check is kept as an evidence photo with the AI's boxes
  (OK green, Not OK red), on screen and in the PDF. Switch: Settings → AI engine → "Live scan: draw AI boxes".
- **Create checklist with AI** – builds views and checks for ANY inspection (FSSAI, fire, electrical, forklift, hotel…)
  from the name, the description and **reference files**: PDF, Word (.docx), Excel, CSV, text or photos (up to 6).
  PDF/Word/Excel text is read in the browser; scanned PDFs (no text) are sent to the AI as a file
  (Gemini, OpenAI and Claude read PDFs; for Azure use a PDF with selectable text).
  Without an AI key a neutral starter template is added instead.

## What's new in v6.0
- **Real AI** – photo-by-photo and live camera scan are analysed by your AI provider (Settings → AI engine).
- **Real location** – device GPS + street address on photos, result and PDF, with an Open in Maps link.
- **Role dashboards** – Admin, Safety manager, Scaffolding inspector, Safety team (demo data, charts, KPI cards).
- **Edit after the AI** – change any line's result, criticality (Critical / Major / Minor) or note; the result recalculates.
  A Minor item that is Not OK gives Yellow, not Red. Edited lines are marked in the report and CSV.
- **Projects & team** – projects with dates, status, progress and members (name, email, phone, role).
- **Alerts** – bell with unread badge, alerts per role; saving a Red report raises a real alert.

## Turn on real AI
1. Deploy on Vercel (the `api` folder becomes serverless functions automatically).
2. In the app: change the dashboard role to **Admin** → **Settings → AI engine**.
3. Choose **Live AI**, pick the provider, enter the key, press **Test connection**, then **Save**.

Where the key is kept:
| Option | What it means | Needs |
|---|---|---|
| **On the server** (recommended) | One key for every user, stored encrypted (AES-256) in Redis; never sent back to the browser | Upstash Redis + `ADMIN_KEY` in Vercel |
| **This device only** | Key stays in this browser and is sent with each AI request over HTTPS | Nothing |
| **Environment variables** | Put the key in Vercel env vars (see `.env.example`) | Redeploy after changing |

Provider details:
- **Azure OpenAI** – endpoint `https://<resource>.openai.azure.com`, key, deployment name of a vision model (gpt-4o / gpt-4.1), API version `2024-10-21`.
- **OpenAI** – key from platform.openai.com, model e.g. `gpt-5-mini` or `gpt-4.1-mini`.
- **Google Gemini** – key from aistudio.google.com, model e.g. `gemini-2.5-flash`.
- **Anthropic Claude** – key from console.anthropic.com, model e.g. `claude-sonnet-5-5`.
Model names are editable in Settings if your account uses different ones.

How the AI checks work:
- **Photo mode** – all photos go in one request; every checklist item comes back OK / Not OK / Unclear with evidence,
  a box on the photo, defects and corrective actions. Optional second pass re-checks every OK (about 2× the AI cost).
- **Live scan** – a camera frame every 2/3/5 s. A check is confirmed only after the AI sees it in **two frames**.
  Unconfirmed checks are marked Unclear. Without a camera (desktop), the AI checks the sample photos instead.

## Vercel setup
1. Push to GitHub, import in Vercel (framework: Other; output directory `public` is set in `vercel.json`).
2. Storage → add **Upstash Redis** (gives `UPSTASH_REDIS_REST_URL` / `_TOKEN`; also used by the activity log).
3. Environment variables → add `ADMIN_KEY` (a long secret). Redeploy.
`vercel.json` gives `/api/ai` 60 seconds to answer. Note: Vercel's free Hobby plan is for non-commercial use.

## Run locally
```
npm install
npm start        # http://localhost:3000 – serves the app and the same /api functions
```
Put env vars in your shell or use "This device only" for the key.

## Security notes
- Anyone with the site link can trigger AI calls on your key. With Redis connected, each network is limited to
  240 AI calls per hour. Add real user accounts before sharing widely.
- Logins are still demo logins (any password). Roles are chosen in the dashboard dropdown.
- Photos are sent to the AI provider you choose; check their data policy with your client.

## Files
```
api/_ai.js          providers (Azure OpenAI, OpenAI, Gemini, Claude), prompts, encrypted key storage
api/ai.js           POST /api/ai – evaluate photos, live frames, test, suggest
api/ai-config.js    GET/POST/DELETE /api/ai-config – server-saved AI key (admin key required)
api/log.js, logs.js activity log (Upstash Redis)
public/js/app.js        app: inspections, live scan, results, reports, QR tags, settings, AI client
public/js/workspace.js  role dashboards + charts, projects & team, alerts
public/js/demo-data.js  checklists, demo scenarios, sample tags
render-server.js        local / Render server (same /api)
```

## Optional object detector for better box localization (v6.2)

The existing vision model still handles checklist reasoning and natural-language explanations. If `DETECTOR_URL` is configured, Partcheck also sends each inspection image to an optional YOLO detector. A detector box replaces a vision-estimated box only when a detector class label matches the check/defect text and its confidence is at least 0.45. If no match is found, the vision estimate is retained and marked in the API response as `localization.source: "vision_estimate"` with `verified: false`. The app remains usable if the detector is unavailable.

**Important:** this ZIP does not contain trained construction-defect weights. The detector service intentionally returns 503 until a model is installed. Generic COCO weights are not sufficient for construction defects. The detection endpoint becomes useful only after you label and validate a dataset for your categories. Missing objects (such as an absent guardrail) cannot be located merely by object detection; the vision/checklist logic must judge absence from a suitable view, and uncertainty must remain unclear when the view is insufficient.

### Run both services on one host with Docker Compose

1. Install Docker Engine and the Docker Compose plugin.
2. Put your trained model at `detector/models/partcheck.pt` (see training below). If you do not have weights yet, you can still start the services, but detector localization will report unavailable.
3. Create a private `.env` file from `.env.example` and add your AI provider key. Never commit `.env`.
4. Run `docker compose up --build -d`. Open `http://localhost:3000`.
5. Check detector health at `http://localhost:8001/health` only from the host/container network; the compose file does not publish port 8001 to the public internet. The app calls it internally using `DETECTOR_URL=http://detector:8001`.
6. View logs with `docker compose logs -f app detector`; stop with `docker compose down`.

### Train your own detector

1. Collect site photos representative of your users, devices, lighting, distance and camera angles.
2. Label boxes using a tool such as CVAT or Label Studio, export in Ultralytics YOLO detection format, and split by site/project (not random near-duplicate frames) into train/validation/test sets. Include negative examples and different defect severities.
3. Copy `detector/data-yaml.example.yaml` and edit the paths and class names to exactly match your labels. Make sure every class has enough diverse labelled examples.
4. In a Python environment with a supported GPU if available, install `pip install -r detector/requirements.txt`, then run `python detector/train.py --data /path/to/data.yaml --weights yolov8s.pt --epochs 100 --imgsz 960 --device 0`. Use `--device cpu` if no supported GPU is available (training will be much slower).
5. Review `runs/partcheck/defect-detector` metrics and, crucially, test images from unseen sites. Investigate false negatives and box quality; do not rely only on a single aggregate score. Copy `best.pt` to `detector/models/partcheck.pt`, then rebuild/restart the detector container.

### Localization response and safety behavior

Each check/defect can include `localization` metadata: `object_detector` means a class-matched detector box was used as additional localization evidence; it is still not guaranteed correct. `vision_estimate` means the box is an unverified vision-model estimate; `none` means no box was supplied. Confidence is a model score, not a guarantee of correctness. For a missing requirement, a detector cannot prove absence, so its lack of a detection must never turn the result green. Keep unclear results and qualified-inspector review for safety-critical findings.

### Deployment compatibility

The normal Node app can still run on Vercel/Render without the detector. For same-host deployment, Docker Compose is the simplest way to run Node and Python together. If you use Vercel serverless, host the detector separately on a private network-capable service and set `DETECTOR_URL` to its HTTPS endpoint; protect that endpoint with authentication and request limits before exposing it.
