# Inspection AI v7.1

Scan a scaffold's QR tag, inspect it with the camera, and get a Green / Yellow / Red result and a signed PDF report.
Inspections can use **real AI** (Azure OpenAI, OpenAI, Google Gemini or Anthropic Claude) or pre-recorded demo results.

## What's new in v7.1 – Microsoft Foundry keys
- Azure provider now accepts every endpoint Microsoft Foundry shows: paste the deployment's **Target URI** into Endpoint and it is
  split into endpoint + deployment name + API version automatically. Also works with `/openai/v1`, `/models` (Foundry model
  inference) and project endpoints (`/api/projects/...`).
- If one endpoint style answers "deployment not found", the others are tried; the one that works is remembered.
- Older API version rejected by the model (GPT-5 / o-series) → retried with a newer one automatically.
- Clear message when the model name is used instead of the deployment **Name** (Foundry → Models + endpoints → Name column).

## What's new in v7.0 – scaffold accuracy (site-test feedback, Nov 2026)
Fixes for the 8 findings of the Runwal site test (baseline 39 % correct):
1. **Scaffold type** – choose Tube & coupler, Cup-lock, Ring-lock, Mobile tower, Frame (or "Not sure – let AI detect") when
   creating a QR tag or an inspection. The AI identifies the system from the photos first and asks if it disagrees.
   Checks that do not apply to the system are Not applicable automatically (e.g. couplers on cup-lock, sole boards on a mobile tower).
2. **Existence before compliance** – the AI first decides if each component exists, and only then whether it is OK.
3. **Five result types** – OK · Not OK (defect) · Not provided · Not visible · Not applicable (excluded from the score).
4. **Fewer false positives** – a visual scaffold guide is sent with every scaffold request (what bracing / ties / ladders / tags /
   couplers are, and their look-alikes such as raking props and wire ropes). Every OK must be pointed to on a photo by the
   precise-marking pass, otherwise it becomes Not visible.
5. **Ground** – the AI classifies the surface first; a level concrete slab needs no sole boards.
6. **Rust** – photos are sent at 1600 px (was 1024); light surface rust = OK, heavy rust / pitting = defect; new close-up view.
7. **More photos needed** – when checks are Not visible the result lists what to photograph and offers "Add photos and re-check".
8. **Annotations** – boxes only around components that exist (no boxes for Not provided / Not visible / Not applicable).
- New checklist syntax: `?` = optional part, `@cuplock,ringlock` = applies only to those systems.
- Field-test scoring: `tests/field-test-2026-11/ground_truth.json` + `node scripts/score-field-test.mjs <export.json>`.
- Claude: if a model rejects the forced JSON tool, the app falls back to plain JSON automatically (fixes the "tool_choice" error).

## What's new in v6.9
- Checklists without sections: if the AI grouping fails it is retried once and the real error is shown.
- The fallback no longer makes blocks of rows ("Checks R01–R08"); it groups questions into real views by keywords
  (Licence & records, Receiving, Storage, Preparation & cooking, Staff & hygiene, Cleaning & pests, Allergens,
  Service & packaging, Premises & equipment). Every row is still kept exactly once.
- AI-made views with more than 15 questions are split into parts of about 12.

## What's new in v6.8 – views for checklists without sections
Uploaded Excel / CSV checklists are split into views in this order:
1. a section / area / category column, 2. section heading rows (e.g. a row "COLD STORAGE" above its questions),
3. IDs: A01 → section A, 3.2 → section 3, 4. otherwise the AI groups the questions into views by where they are
photographed (every row exactly once – rows it forgets or repeats are repaired), 5. without an AI key: blocks of ~8 rows.
Your own heading names are kept as view names.

## What's new in v6.7 – no photo limit
- Take or upload any number of photos (the 12-photo limit is gone).
- Real-AI checks run in batches: one view at a time (max 8 photos / 3 MB per request, under Vercel's 4.5 MB limit),
  3 requests in parallel, merged into one result (Not OK in any photo of a view wins). A failed batch is retried once;
  if it still fails only that view's checks are marked Unclear and you are told.
- Precise marking runs at most 4 photos at a time.
- Saved-report photos are kept in IndexedDB (hundreds of MB) instead of localStorage (~5 MB), so big reports are no
  longer dropped. Export all (JSON) still includes the photos.

## What's new in v6.6
- Built-in inspection type **FSSAI food safety audit**: 11 views, 77 checks (A01–K06) from the Food Safety
  Inspection Checklist, written as photo checks with the temperature limits; 19 "Critical" rows marked critical.
  Existing installations get it automatically.
- **Duplicate** an inspection type: Settings → Inspection types → Duplicate (any type, incl. built-in), or the
  Duplicate button inside the editor (copies the form as it is, including unsaved edits). The copy is yours to edit.

## What's new in v6.5 – keep every item of an uploaded checklist
- Excel / CSV checklists are recognised automatically (columns found by their content: IDs like A01, risk
  Low/Medium/High/Critical, the question text, sections from a section column or the ID letter).
- Choose **Keep every item** (default) or **AI picks the key photo checks**.
- Keep every item: one view per section, exactly one check per row, row reference kept (e.g. "(D04)"), rows with
  risk "Critical" marked critical. Sections are converted by the AI 3 at a time; any row the AI misses, or any
  section that fails, is built directly from the file – nothing is dropped. Works without an AI key too.
- Inspections now handle up to 150 checks (was 80); AI answer room grows with the number of checks.

## What's new in v6.4 – several photos per view
- After a view's first photo, tap **+ Same view** to take another photo of the same view (no typing).
- Gallery upload accepts several photos at once; they all go to the current view.
- Up to 12 photos per inspection. The AI judges each check using all photos of its view and marks the
  finding on the exact photo that shows it. Every photo appears in the result and the PDF with its boxes.
- Retake on an added photo removes it. The "+" button still adds a new, separately named view.

## What's new in v6.3 – reliable AI answers (fixes "The AI answer was not valid JSON")
- Claude now answers through a forced JSON tool call, so its answer is always one valid JSON object.
- Cut-off answers are detected for every provider (Claude max_tokens, OpenAI/Azure length, Gemini MAX_TOKENS).
- Checklist from big documents: much more answer room, a compact size limit in the prompt, one automatic
  "keep it shorter" retry, and if it is still cut off, every complete view and check is kept (you are told).
- GPT-5 / o-series: extra room for hidden reasoning and reasoning_effort "low"; removed automatically if a model rejects it.
- Inspection answers can be repaired too (trailing commas, text around the JSON, cut-off endings).

## What's new in v6.2 – accurate boxes
- Boxes are requested in the format each model is trained on: Gemini `box_2d [ymin, xmin, ymax, xmax]`,
  OpenAI / Azure / Claude `[xmin, ymin, xmax, ymax]`, both on a 0–1000 scale (was x, y, width, height fractions).
- **Precise marking** (Settings → AI engine, on by default): after the AI decides OK / Not OK, it marks every
  finding again on ONE photo at a time. GPT and Claude get a light 0–1000 grid on that copy of the photo to read
  positions; Gemini does not need it. Live-scan evidence frames are re-marked the same way when you finish.
  Cost: one small extra AI call per photo.
- For a missing item (e.g. toe board) the box marks where it should be (the open platform edge).
- Useless boxes are dropped (covering almost the whole photo, or tiny). If the AI cannot find a finding
  confidently, no box is drawn instead of a wrong one.
- Boxes on the same spot merge into one box (red beats yellow beats green) with up to 3 labels + "+N more".

## What's new in v6.1
- **AI boxes on live-scan photos** – every OK / Not OK the live AI finds is drawn on the exact frame it was found in,
  in the result and the PDF. Switch: Settings → AI engine → "Live scan: draw AI boxes…" (on by default).
  Real-AI photo mode now also shows boxes on photos taken with the device camera or uploaded.
- **AI checklist for any inspection** – Settings → Inspection types → Create (or "Create custom inspection").
  Enter a name and description (e.g. "FSSAI kitchen audit") and optionally add files: PDF, Word (.docx), Excel,
  CSV, text or photos (up to 6). The AI builds views and checks from them and keeps clause numbers from documents.
  Scanned PDFs are turned into page images in the browser, so they also work with Azure OpenAI.

## What's new in v6.3 – reliable AI answers (fixes "The AI answer was not valid JSON")
- Claude now answers through a forced JSON tool call, so its answer is always one valid JSON object.
- Cut-off answers are detected for every provider (Claude max_tokens, OpenAI/Azure length, Gemini MAX_TOKENS).
- Checklist from big documents: much more answer room, a compact size limit in the prompt, one automatic
  "keep it shorter" retry, and if it is still cut off, every complete view and check is kept (you are told).
- GPT-5 / o-series: extra room for hidden reasoning and reasoning_effort "low"; removed automatically if a model rejects it.
- Inspection answers can be repaired too (trailing commas, text around the JSON, cut-off endings).

## What's new in v6.2 – accurate boxes
- Boxes are requested in the format each model is trained on: Gemini `box_2d [ymin, xmin, ymax, xmax]`,
  OpenAI / Azure / Claude `[xmin, ymin, xmax, ymax]`, both on a 0–1000 scale (was x, y, width, height fractions).
- **Precise marking** (Settings → AI engine, on by default): after the AI decides OK / Not OK, it marks every
  finding again on ONE photo at a time. GPT and Claude get a light 0–1000 grid on that copy of the photo to read
  positions; Gemini does not need it. Live-scan evidence frames are re-marked the same way when you finish.
  Cost: one small extra AI call per photo.
- For a missing item (e.g. toe board) the box marks where it should be (the open platform edge).
- Useless boxes are dropped (covering almost the whole photo, or tiny). If the AI cannot find a finding
  confidently, no box is drawn instead of a wrong one.
- Boxes on the same spot merge into one box (red beats yellow beats green) with up to 3 labels + "+N more".

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
