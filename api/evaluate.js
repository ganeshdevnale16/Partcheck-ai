import {
  checkAuth, requirePost, getBody, chatJSON, isImageDataUrl, cleanText,
  sendError, HttpError, MODEL, PROVIDER, MIN_CONFIDENCE,
} from '../lib/common.js';

// "per_view" (default): each photo is checked in its own AI call, in parallel – more accurate.
// "combined": all photos in one AI call (the original behaviour).
const EVAL_MODE = String(process.env.EVAL_MODE || process.env.eval_mode || 'per_view').trim().toLowerCase();

// ---------- schemas (evidence comes BEFORE status so the AI looks first, then decides) ----------
const partSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'evidence', 'status', 'confidence'],
  properties: {
    name: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string', enum: ['present', 'missing', 'unclear'] },
    confidence: { type: 'number' },
  },
};

const viewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['item_identified', 'item_matches', 'correct_view', 'image_quality', 'quality_issues', 'parts', 'general_parts', 'observations', 'defects'],
  properties: {
    item_identified: { type: 'string' },
    item_matches: { type: 'boolean' },
    correct_view: { type: 'boolean' },
    image_quality: { type: 'string', enum: ['good', 'acceptable', 'poor'] },
    quality_issues: { type: 'array', items: { type: 'string' } },
    parts: { type: 'array', items: partSchema },
    general_parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'evidence', 'status', 'confidence'],
        properties: {
          name: { type: 'string' },
          evidence: { type: 'string' },
          status: { type: 'string', enum: ['present', 'not_in_this_photo'] },
          confidence: { type: 'number' },
        },
      },
    },
    observations: { type: 'array', items: { type: 'string' } },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'severity'],
        properties: {
          description: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
};

const combinedSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['item_identified', 'item_matches', 'angles', 'general_parts', 'defects', 'summary', 'recommendations'],
  properties: {
    item_identified: { type: 'string' },
    item_matches: { type: 'boolean' },
    angles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['angle', 'correct_view', 'image_quality', 'quality_issues', 'parts', 'observations'],
        properties: {
          angle: { type: 'string' },
          correct_view: { type: 'boolean' },
          image_quality: { type: 'string', enum: ['good', 'acceptable', 'poor'] },
          quality_issues: { type: 'array', items: { type: 'string' } },
          parts: { type: 'array', items: partSchema },
          observations: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    general_parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'evidence', 'status', 'confidence', 'found_in'],
        properties: {
          name: { type: 'string' },
          evidence: { type: 'string' },
          status: { type: 'string', enum: ['present', 'missing', 'unclear'] },
          confidence: { type: 'number' },
          found_in: { type: 'string' },
        },
      },
    },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['angle', 'description', 'severity'],
        properties: {
          angle: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    summary: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
};

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'recommendations'],
  properties: {
    summary: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
};

// ---------- prompts ----------
const RULES = `How to inspect:
- Look over the WHOLE photo carefully, region by region (top, middle, bottom, left, right, corners). Small parts are easy to miss: look again before saying a part is missing.
- For every part, FIRST write "evidence": where in the photo the part is and what it looks like (position, colour, shape), or exactly why you cannot see it. THEN choose the status.
- "present": you can actually see the part in the photo.
- "missing": the place where the part belongs is clearly visible and the part is not there (empty slot, bare mount, hole, loose connector).
- "unclear": that area is hidden, cut off, blurry, too dark or too far away, or you are not sure.
- Part names may differ from brand to brand. Match a part by its function and appearance, not only by its exact name.
- Never assume a part is there just because this kind of item usually has it.
- "confidence" (0 to 1) = how sure you are about the status you chose.
- Use the exact part names you were given and report each one exactly once.
- Report visible damage: cracks, dents, rust, burns, leaks, loose or cut wires, missing screws, broken seals.
- Ignore the small timestamp strip at the bottom of each photo.
- Write evidence, notes and observations in short, simple English (under 20 words each).`;

const SYSTEM_VIEW = `You are a careful visual quality inspector. You receive ONE photo of an item, the view it should show, and the parts that must be visible in it.
${RULES}
- correct_view: true if the photo really shows the requested view of the item (a close-up of the right area also counts).
- item_matches: false only if the photo clearly shows a different kind of item.
- For "parts visible from any view": use "present" if you can see it in THIS photo, otherwise "not_in_this_photo".`;

const SYSTEM_COMBINED = `You are a careful visual quality inspector. You check photos of one item against a required-parts checklist. Each photo is labelled with its view.
${RULES}
- For each view, say whether its photo really shows that view (correct_view) and rate the image quality.
- item_matches is false if the photos show a different kind of item than the one named.
- For parts visible from any view, check all photos and set found_in to the view where you saw it ("" if not seen).
- Write the summary last, based only on what you found.`;

// ---------- helpers ----------
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const quoteList = (arr) => arr.map((p) => `"${p}"`).join(', ');

function cleanList(arr, max = 20, len = 80) {
  return (Array.isArray(arr) ? arr : []).map((p) => cleanText(p, len)).filter(Boolean).slice(0, max);
}

function validate(body) {
  const item = cleanText(body.item, 120);
  if (!item) throw new HttpError(400, 'Item name is required.');
  const angles = (Array.isArray(body.angles) ? body.angles : []).slice(0, 12).map((a) => ({
    name: cleanText(a?.name, 60),
    guidance: cleanText(a?.guidance, 200),
    parts: cleanList(a?.parts),
    image: isImageDataUrl(a?.image) ? a.image : null,
  })).filter((a) => a.name);
  if (!angles.some((a) => a.image)) throw new HttpError(400, 'Capture at least one photo before evaluating.');
  return { item, description: cleanText(body.description, 600), angles, general_parts: cleanList(body.general_parts, 10) };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return out;
}

// ---------- per-view mode ----------
function viewMessages(input, a) {
  const text = [
    `Item: ${input.item}`,
    input.description && `Details: ${input.description}`,
    `This photo should show the view: "${a.name}"`,
    a.guidance && `How the photo should look: ${a.guidance}`,
    `Required parts for this view (${a.parts.length}): ${a.parts.length ? quoteList(a.parts) : 'none'}`,
    input.general_parts.length && `Parts visible from any view (report for this photo only): ${quoteList(input.general_parts)}`,
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: SYSTEM_VIEW },
    { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: a.image, detail: 'high' } }] },
  ];
}

async function evaluatePerView(input) {
  const shot = input.angles.filter((a) => a.image);
  const results = await pool(shot, 4, (a) => chatJSON({ name: 'view_inspection', schema: viewSchema, messages: viewMessages(input, a) }));

  const angles = shot.map((a, i) => ({
    angle: a.name,
    correct_view: results[i].correct_view,
    image_quality: results[i].image_quality,
    quality_issues: results[i].quality_issues || [],
    parts: results[i].parts || [],
    observations: results[i].observations || [],
  }));

  const general_parts = input.general_parts.map((p) => {
    let best = null;
    shot.forEach((a, i) => {
      const g = (results[i].general_parts || []).find((x) => norm(x.name) === norm(p));
      if (g?.status === 'present' && (!best || g.confidence > best.confidence)) best = { ...g, found_in: a.name };
    });
    return best
      ? { name: p, status: 'present', confidence: best.confidence, found_in: best.found_in, evidence: best.evidence }
      : { name: p, status: 'missing', confidence: 0.8, found_in: '', evidence: 'Not seen in any photo' };
  });

  const defects = shot.flatMap((a, i) => (results[i].defects || []).map((d) => ({ angle: a.name, ...d })));
  const mismatches = results.filter((r) => r.item_matches === false);
  const item_matches = mismatches.length <= results.length / 2;
  const item_identified = item_matches ? results[0].item_identified : mismatches[0].item_identified;

  return { item_identified, item_matches, angles, general_parts, defects, summary: '', recommendations: [] };
}

async function addSummary(ai, input, scored) {
  const facts = {
    item: input.item,
    final_status: scored.status,
    checklist_complete_percent: scored.completion,
    missing_parts: scored.checklist.filter((c) => c.status === 'missing').map((c) => `${c.part} (${c.group})`),
    not_sure_parts: scored.checklist.filter((c) => c.status === 'unclear').map((c) => `${c.part} (${c.group})`),
    defects: ai.defects,
    photo_problems: ai.angles.filter((a) => a.image_quality === 'poor' || a.correct_view === false).map((a) => a.angle),
    observations: ai.angles.flatMap((a) => a.observations.map((o) => `${a.angle}: ${o}`)).slice(0, 20),
  };
  try {
    const out = await chatJSON({
      name: 'summary',
      schema: summarySchema,
      messages: [
        { role: 'system', content: 'Write a short inspection summary (2 to 3 sentences, simple English) and 0 to 4 practical next actions. Use ONLY the facts given. Do not invent new findings. The final status is decided already; do not change it.' },
        { role: 'user', content: JSON.stringify(facts) },
      ],
    });
    ai.summary = cleanText(out.summary, 600);
    ai.recommendations = cleanList(out.recommendations, 4, 200);
  } catch {
    const c = scored.counts;
    ai.summary = `${c.present} of ${c.total} required parts confirmed.` +
      (facts.missing_parts.length ? ` Missing: ${facts.missing_parts.join(', ')}.` : '') +
      (facts.not_sure_parts.length ? ` Not sure: ${facts.not_sure_parts.join(', ')}.` : '');
    ai.recommendations = [];
  }
}

// ---------- combined mode ----------
function combinedMessages(input) {
  const shot = input.angles.filter((a) => a.image);
  const checklist = {
    item: input.item,
    details: input.description || undefined,
    views: shot.map((a) => ({ view: a.name, how_it_should_look: a.guidance || undefined, required_parts: a.parts })),
    parts_visible_from_any_view: input.general_parts,
  };
  const content = [{ type: 'text', text: 'Inspection checklist:\n' + JSON.stringify(checklist, null, 2) + '\n\nPhotos follow, one per view.' }];
  shot.forEach((a) => {
    content.push({ type: 'text', text: `Photo for view: "${a.name}"` });
    content.push({ type: 'image_url', image_url: { url: a.image, detail: 'high' } });
  });
  return [{ role: 'system', content: SYSTEM_COMBINED }, { role: 'user', content }];
}

// ---------- scoring (fixed rules, the AI does not decide PASS/FAIL) ----------
function score(ai, input) {
  const aiAngles = Array.isArray(ai.angles) ? ai.angles : [];
  const shot = input.angles.filter((a) => a.image);
  const checklist = [];

  const effective = (rp) => {
    if (!rp) return { status: 'unclear', confidence: 0, note: 'Not reported by AI' };
    const conf = Math.max(0, Math.min(1, Number(rp.confidence) || 0));
    let status = ['present', 'missing', 'unclear'].includes(rp.status) ? rp.status : 'unclear';
    let note = cleanText(rp.evidence ?? rp.note, 200);
    if (status === 'present' && conf < MIN_CONFIDENCE) {
      status = 'unclear';
      note = (note ? note + ' ' : '') + `(low confidence ${Math.round(conf * 100)}%)`;
    }
    return { status, confidence: conf, note };
  };

  input.angles.forEach((a) => {
    if (!a.image) {
      a.parts.forEach((p) => checklist.push({ group: a.name, part: p, status: 'missing', confidence: 1, note: 'This view was not photographed' }));
      return;
    }
    const idx = shot.indexOf(a);
    const ra = aiAngles.find((x) => norm(x.angle) === norm(a.name)) || aiAngles[idx] || { parts: [] };
    a.parts.forEach((p) => {
      const rp = (ra.parts || []).find((x) => norm(x.name) === norm(p));
      checklist.push({ group: a.name, part: p, ...effective(rp) });
    });
  });

  const aiGeneral = Array.isArray(ai.general_parts) ? ai.general_parts : [];
  input.general_parts.forEach((p) => {
    const rp = aiGeneral.find((x) => norm(x.name) === norm(p));
    checklist.push({ group: 'Any view', part: p, foundIn: cleanText(rp?.found_in, 60), ...effective(rp) });
  });

  const total = checklist.length;
  const present = checklist.filter((c) => c.status === 'present').length;
  const missing = checklist.filter((c) => c.status === 'missing').length;
  const unclear = total - present - missing;
  const completion = total ? Math.round((present / total) * 100) : 100;

  const defects = Array.isArray(ai.defects) ? ai.defects : [];
  const highDefects = defects.filter((d) => d.severity === 'high');
  const badViews = aiAngles.filter((a) => a.correct_view === false).map((a) => a.angle);
  const poorViews = aiAngles.filter((a) => a.image_quality === 'poor').map((a) => a.angle);

  const reasons = [];
  if (missing) reasons.push(`${missing} required part${missing > 1 ? 's' : ''} missing`);
  if (highDefects.length) reasons.push(`${highDefects.length} serious defect${highDefects.length > 1 ? 's' : ''} found`);
  if (unclear) reasons.push(`${unclear} part${unclear > 1 ? 's' : ''} could not be confirmed`);
  if (poorViews.length) reasons.push(`Poor photo quality: ${poorViews.join(', ')}`);
  if (badViews.length) reasons.push(`Wrong view captured: ${badViews.join(', ')}`);
  if (ai.item_matches === false) reasons.push(`Photos look like "${cleanText(ai.item_identified, 80)}", not "${input.item}"`);

  let status = 'PASS';
  if (missing || highDefects.length) status = 'FAIL';
  else if (unclear || poorViews.length || badViews.length || ai.item_matches === false) status = 'REVIEW';
  if (status === 'PASS') reasons.push('All required parts confirmed');

  return { status, completion, counts: { total, present, missing, unclear }, reasons, checklist };
}

export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkAuth(req, res)) return;
  try {
    const input = validate(getBody(req));
    let ai;
    if (EVAL_MODE === 'combined') {
      ai = await chatJSON({ name: 'inspection', schema: combinedSchema, messages: combinedMessages(input) });
    } else {
      ai = await evaluatePerView(input);
    }
    const result = score(ai, input);
    if (EVAL_MODE !== 'combined') await addSummary(ai, input, result);
    res.status(200).json({
      ...result,
      ai,
      provider: PROVIDER,
      model: MODEL,
      evalMode: EVAL_MODE === 'combined' ? 'combined' : 'per_view',
      minConfidence: MIN_CONFIDENCE,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    sendError(res, err);
  }
}
