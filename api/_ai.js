// Shared AI helpers for the serverless functions (Vercel / local Express).
// Providers: Azure OpenAI, OpenAI, Google Gemini, Anthropic Claude. No npm packages needed.
import crypto from 'node:crypto';
import { configured as redisReady, redis } from './_store.js';

export const PROVIDERS = {
  azure: { label: 'Azure OpenAI / Foundry', defaultModel: '' },
  openai: { label: 'OpenAI', defaultModel: 'gpt-5-mini' },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-2.5-flash' },
  anthropic: { label: 'Anthropic Claude', defaultModel: 'claude-sonnet-5-5' },
};
const CONFIG_KEY = 'ai_config_v1';

// ---------- secret storage (AES-256-GCM, key derived from CONFIG_SECRET or ADMIN_KEY) ----------
function secretKey() {
  const s = process.env.CONFIG_SECRET || process.env.ADMIN_KEY || '';
  return s ? crypto.createHash('sha256').update('inspection-ai:' + s).digest() : null;
}
export const canStoreOnServer = () => redisReady() && !!secretKey() && !!process.env.ADMIN_KEY;
function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}
function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
}
export async function loadServerConfig() {
  if (!canStoreOnServer()) return null;
  try { const v = await redis(['GET', CONFIG_KEY]); return v ? decrypt(v) : null; } catch { return null; }
}
export async function saveServerConfig(cfg) { await redis(['SET', CONFIG_KEY, encrypt(cfg)]); }
export async function deleteServerConfig() { await redis(['DEL', CONFIG_KEY]); }

export function envConfig() {
  const p = (process.env.AI_PROVIDER || '').toLowerCase();
  const pick = p || (process.env.AZURE_OPENAI_API_KEY ? 'azure' : process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : '');
  if (!pick) return null;
  const c = {
    azure: { provider: 'azure', apiKey: process.env.AZURE_OPENAI_API_KEY, endpoint: process.env.AZURE_OPENAI_ENDPOINT, deployment: process.env.AZURE_OPENAI_DEPLOYMENT, apiVersion: process.env.AZURE_OPENAI_API_VERSION },
    openai: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
    gemini: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL },
    anthropic: { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL },
  }[pick];
  return c && c.apiKey ? c : null;
}

// Which config to use: key sent from this device > saved on server > Vercel environment variables
export async function resolveConfig(deviceCfg) {
  if (deviceCfg && deviceCfg.provider && deviceCfg.apiKey) return { ...clean(deviceCfg), source: 'device' };
  const s = await loadServerConfig();
  if (s && s.apiKey) return { ...s, source: 'server' };
  const e = envConfig();
  if (e) return { ...e, source: 'env' };
  return null;
}
// Azure OpenAI / Microsoft Foundry: accept any endpoint shape the portal shows
//   https://<res>.openai.azure.com                                   (classic)
//   https://<res>.cognitiveservices.azure.com/openai/deployments/<name>/chat/completions?api-version=...   (Foundry "Target URI")
//   https://<res>.openai.azure.com/openai/v1                         (v1 API, model name in the body)
//   https://<res>.services.ai.azure.com/models                       (Foundry model inference)
//   https://<res>.services.ai.azure.com/api/projects/<project>       (Foundry project endpoint)
export function parseAzureEndpoint(endpoint, deployment = '', apiVersion = '') {
  let u;
  try { u = new URL(String(endpoint || '').trim()); } catch { return null; }
  const path = u.pathname.replace(/\/+$/, '');
  const fromPath = (path.match(/\/openai\/deployments\/([^/]+)/i) || [])[1];
  const hint = /\/openai\/v1/i.test(path) ? 'v1' : /^\/models/i.test(path) ? 'inference' : 'deployments';
  return {
    origin: u.origin, hint,
    deployment: String(deployment || '').trim() || (fromPath ? decodeURIComponent(fromPath) : ''),
    apiVersion: String(apiVersion || '').trim() || u.searchParams.get('api-version') || '',
  };
}

export function clean(c = {}) {
  const t = (v, n = 300) => String(v ?? '').trim().slice(0, n);
  const provider = PROVIDERS[c.provider] ? c.provider : '';
  return {
    provider, apiKey: t(c.apiKey, 400), model: t(c.model, 120), endpoint: t(c.endpoint, 300).replace(/\/+$/, ''),
    deployment: t(c.deployment, 120), apiVersion: t(c.apiVersion, 40),
    ...(provider === 'azure' && /\/openai\/deployments\//i.test(String(c.endpoint || '')) ? (() => {
      const z = parseAzureEndpoint(t(c.endpoint, 300), t(c.deployment, 120), t(c.apiVersion, 40));
      return z ? { endpoint: z.origin, deployment: z.deployment, apiVersion: z.apiVersion } : {};
    })() : {}),
  };
}
export function validate(c) {
  if (!c.provider) return 'Choose an AI provider.';
  if (!c.apiKey) return 'Enter the API key.';
  if (c.provider === 'azure') {
    const z = /^https:\/\/[^\s/]+/.test(c.endpoint || '') ? parseAzureEndpoint(c.endpoint, c.deployment, c.apiVersion) : null;
    if (!z) return 'Enter the endpoint, e.g. https://your-resource.openai.azure.com (or paste the Target URI from Microsoft Foundry).';
    if (!z.deployment) return 'Enter the deployment name (Foundry → Models + endpoints → the Name column).';
  }
  return '';
}
export function publicInfo(c) {
  if (!c) return null;
  return {
    provider: c.provider, label: PROVIDERS[c.provider]?.label, source: c.source,
    model: c.provider === 'azure' ? c.deployment : c.model || PROVIDERS[c.provider]?.defaultModel,
    endpoint: c.provider === 'azure' ? c.endpoint : '', keyHint: c.apiKey ? '••••' + c.apiKey.slice(-4) : '',
    savedAt: c.savedAt || '', savedBy: c.savedBy || '',
  };
}

// ---------- one call to a vision model; returns text ----------
const b64 = (dataUrl) => String(dataUrl).split(',')[1] || '';
const mime = (dataUrl) => (String(dataUrl).match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';

async function postJson(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    if (!r.ok) {
      const msg = j?.error?.message || j?.message || text.slice(0, 300);
      const e = new Error(msg || `HTTP ${r.status}`); e.status = r.status; throw e;
    }
    return j;
  } catch (e) {
    if (e.name === 'AbortError') { const x = new Error('The AI took too long to answer. Try again or use fewer photos.'); x.status = 504; throw x; }
    throw e;
  } finally { clearTimeout(t); }
}

function truncated(text, who) {
  const e = new Error(`${who}: the answer was cut off (too long).`);
  e.code = 'truncated'; e.partial = text || ''; e.status = 502;
  return e;
}
const AZURE_ROUTE = new Map(); // endpoint+deployment -> the API style that worked (kept while the server is warm)
const CLAUDE_NO_TOOL = new Set(); // models that rejected a forced tool call (remembered while the server is warm)
const isReasoningOpenAI = (m) => /^(gpt-5|o\d)/i.test(m || '');

export async function callVision(cfg, { system, text, images = [], docs = [], maxTokens = 4000, json = true, timeoutMs = 55000 }) {
  const p = cfg.provider;
  if (docs.length && p === 'azure') { const e = new Error('It cannot read PDF files directly. Use a PDF with selectable text, or paste the text into the description.'); e.status = 400; throw e; }
  if (p === 'gemini') {
    const model = cfg.model || PROVIDERS.gemini.defaultModel;
    const parts = [...docs.map((d) => ({ inline_data: { mime_type: d.mime, data: d.data } })), ...images.map((im) => ({ inline_data: { mime_type: mime(im), data: b64(im) } })), { text }];
    const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': cfg.apiKey },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: Math.max(maxTokens * 2, 16384), ...(json ? { responseMimeType: 'application/json' } : {}) } }, timeoutMs);
    const out = (j?.candidates?.[0]?.content?.parts || []).filter((x) => !x.thought).map((x) => x.text || '').join('');
    if (j?.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw truncated(out, 'Gemini');
    if (!out) throw new Error(j?.promptFeedback?.blockReason ? `Blocked by Gemini: ${j.promptFeedback.blockReason}` : 'Gemini returned an empty answer.');
    return out;
  }
  if (p === 'anthropic') {
    const model = cfg.model || PROVIDERS.anthropic.defaultModel;
    const content = [...docs.map((d) => ({ type: 'document', source: { type: 'base64', media_type: d.mime, data: d.data } })), ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: mime(im), data: b64(im) } })), { type: 'text', text }];
    const headers = { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' };
    // Claude has no JSON mode. First choice: a forced tool call (always one JSON object).
    // Some models / accounts / settings reject a forced tool -> fall back to plain text asking for JSON only.
    let mode = json && !CLAUDE_NO_TOOL.has(model) ? 'tool' : 'plain';
    let maxTok = Math.max(maxTokens, 4096);
    const send = (m) => {
      const body = { model, max_tokens: maxTok, system: m === 'plain' && json ? `${system}\n\nReply with ONE valid JSON object only – no text before or after it and no markdown fences.` : system, messages: [{ role: 'user', content }] };
      if (m === 'tool') {
        body.tools = [{ name: 'submit_answer', description: 'Submit the complete answer in the JSON structure described in the request.', input_schema: { type: 'object', additionalProperties: true } }];
        body.tool_choice = { type: 'tool', name: 'submit_answer' };
      }
      return postJson('https://api.anthropic.com/v1/messages', headers, body, timeoutMs);
    };
    let j = null;
    for (let attempt = 0; attempt < 4 && !j; attempt++) {
      try { j = await send(mode); }
      catch (e) {
        if (e.status !== 400) throw e;
        const msg = String(e.message || '');
        const lim = msg.match(/max_tokens[^0-9]*\d+\s*>\s*(\d{3,6})/i) || msg.match(/maximum[^0-9]{0,40}(\d{3,6})/i);
        if (/max_tokens/i.test(msg) && lim && +lim[1] < maxTok) { maxTok = +lim[1]; continue; }      // model has a lower output limit
        if (mode === 'tool' && /tool|schema|thinking/i.test(msg)) { CLAUDE_NO_TOOL.add(model); mode = 'plain'; continue; } // forced tool not accepted
        throw e;
      }
      const tool = (j.content || []).find((x) => x.type === 'tool_use');
      // a tool call with an empty answer is useless: ask again for plain JSON
      if (mode === 'tool' && j.stop_reason !== 'max_tokens' && (!tool || !tool.input || !Object.keys(tool.input).length)) { mode = 'plain'; j = null; }
    }
    if (!j) throw Object.assign(new Error('Claude did not return an answer. Try again.'), { status: 502 });
    const tool = (j.content || []).find((x) => x.type === 'tool_use');
    const out = tool ? JSON.stringify(tool.input ?? {}) : (j.content || []).filter((x) => x.type === 'text').map((x) => x.text || '').join('');
    if (j.stop_reason === 'max_tokens') throw truncated(out, 'Claude');
    if (j.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined to answer this request.'), { status: 502 });
    return out;
  }

  // OpenAI and Azure OpenAI share the chat-completions format
  const messages = [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text }, ...docs.map((d) => ({ type: 'file', file: { filename: d.name || 'document.pdf', file_data: `data:${d.mime};base64,${d.data}` } })), ...images.map((im) => ({ type: 'image_url', image_url: { url: im, detail: 'high' } }))] }];
  const reasoning = p === 'openai' && isReasoningOpenAI(cfg.model || PROVIDERS.openai.defaultModel);
  // GPT-5 / o-series spend part of the budget on hidden reasoning: give more room and keep reasoning short
  let url, headers, body = { messages, max_completion_tokens: reasoning ? Math.max(maxTokens * 2, 16000) : maxTokens, ...(reasoning ? { reasoning_effort: 'low' } : {}), ...(json ? { response_format: { type: 'json_object' } } : {}) };
  if (p === 'azure') return callAzure(cfg, body, maxTokens, timeoutMs);
  {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { Authorization: `Bearer ${cfg.apiKey}` };
    body.model = cfg.model || PROVIDERS.openai.defaultModel;
  }
  try {
    const j = await postJson(url, headers, body, timeoutMs);
    const out = j?.choices?.[0]?.message?.content || '';
    if (j?.choices?.[0]?.finish_reason === 'length') throw truncated(out, p === 'azure' ? 'Azure OpenAI' : 'OpenAI');
    return out;
  } catch (e) {
    if (e.code === 'truncated') throw e;
    // older models / API versions: retry with max_tokens instead of max_completion_tokens
    let retry = null;
    if (e.status === 400 && /reasoning_effort/i.test(e.message)) { const { reasoning_effort, ...rest } = body; retry = rest; }
    else if (e.status === 400 && /max_completion_tokens/i.test(e.message)) { const { max_completion_tokens, reasoning_effort, ...rest } = body; retry = { ...rest, max_tokens: maxTokens }; }
    if (!retry) throw e;
    const j = await postJson(url, headers, retry, timeoutMs);
    const out = j?.choices?.[0]?.message?.content || '';
    if (j?.choices?.[0]?.finish_reason === 'length') throw truncated(out, p === 'azure' ? 'Azure OpenAI' : 'OpenAI');
    return out;
  }
}

// Parse a model's JSON answer. Handles ```json fences, text around the object, trailing commas,
// and answers that were cut off: everything up to the last complete item is kept.
async function callAzure(cfg, baseBody, maxTokens, timeoutMs) {
  const z = parseAzureEndpoint(cfg.endpoint, cfg.deployment, cfg.apiVersion);
  if (!z || !z.deployment) { const e = new Error('Azure / Foundry endpoint or deployment name is missing.'); e.status = 400; throw e; }
  const dep = encodeURIComponent(z.deployment);
  const ver = z.apiVersion || '2024-10-21';
  const routes = {
    deployments: (v = ver) => ({ url: `${z.origin}/openai/deployments/${dep}/chat/completions?api-version=${encodeURIComponent(v)}`, body: { ...baseBody } }),
    v1: () => ({ url: `${z.origin}/openai/v1/chat/completions`, body: { ...baseBody, model: z.deployment } }),
    inference: () => ({ url: `${z.origin}/models/chat/completions?api-version=2024-05-01-preview`, body: { ...baseBody, model: z.deployment } }),
  };
  const key = `${z.origin}|${z.deployment}`;
  const order = [...new Set([AZURE_ROUTE.get(key), z.hint, 'deployments', 'v1', 'inference'].filter(Boolean))];
  // reasoning deployments (gpt-5, o-series) use part of the budget for thinking: give room (it is a cap, not a cost)
  const headers = { 'api-key': cfg.apiKey };
  let lastErr = null;
  for (const style of order) {
    let { url, body } = routes[style]();
    body.max_completion_tokens = Math.max(maxTokens * 2, 16000);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const j = await postJson(url, headers, body, timeoutMs);
        AZURE_ROUTE.set(key, style);
        const out = j?.choices?.[0]?.message?.content || '';
        if (j?.choices?.[0]?.finish_reason === 'length') throw truncated(out, 'Azure OpenAI');
        return out;
      } catch (e) {
        if (e.code === 'truncated') throw e;
        lastErr = e;
        const m = String(e.message || '');
        if (e.status === 401 || e.status === 403 || e.status === 429) throw e;          // key / quota: no point trying other styles
        if (e.status === 400 && /api[-_ ]?version/i.test(m) && style === 'deployments' && !url.includes('2025-04-01-preview')) { ({ url } = routes.deployments('2025-04-01-preview')); continue; }
        if (e.status === 400 && /reasoning_effort/i.test(m)) { delete body.reasoning_effort; continue; }
        if (e.status === 400 && /max_completion_tokens/i.test(m)) { const { max_completion_tokens, ...rest } = body; body = { ...rest, max_tokens: Math.min(maxTokens, 16000) }; continue; }
        if (e.status === 400 && /response_format/i.test(m)) { delete body.response_format; continue; }
        break;                                                                          // 404 / other: try the next endpoint style
      }
    }
    if (lastErr && lastErr.status !== 404 && lastErr.status !== 400) break;
  }
  if (lastErr?.status === 404) {
    const e = new Error(`deployment "${z.deployment}" was not found at ${z.origin}. In Microsoft Foundry open Models + endpoints and use the deployment NAME (Name column), not the model name.`);
    e.status = 404; e.azure = true; throw e;
  }
  throw lastErr || new Error('Azure request failed.');
}

export function parseJson(text, { allowPartial = true } = {}) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const tryParse = (s) => { try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { return undefined; } } };
  let v = tryParse(t);
  if (v !== undefined) return v;
  const start = t.indexOf('{');
  if (start < 0) throw new Error('The AI answer was not valid JSON. Try again.');
  t = t.slice(start);
  const end = t.lastIndexOf('}');
  if (end > 0) { v = tryParse(t.slice(0, end + 1)); if (v !== undefined) return v; }
  if (allowPartial) { v = repairCut(t); if (v !== undefined) { v.__partial = true; return v; } }
  throw new Error('The AI answer was not valid JSON. Try again.');
}
function repairCut(t) {
  // walk the text; at every point where a value has just closed, remember how to close the open brackets
  const cuts = [];
  const stack = []; let inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') { stack.pop(); cuts.push([i + 1, stack.slice()]); }
  }
  for (let k = cuts.length - 1; k >= 0 && k >= cuts.length - 400; k--) {
    const [pos, st] = cuts[k];
    const close = st.slice().reverse().map((c) => (c === '{' ? '}' : ']')).join('');
    try { return JSON.parse(t.slice(0, pos).replace(/,\s*$/, '') + close); } catch { /* try an earlier cut */ }
  }
  return undefined;
}

export function friendlyError(e, cfg) {
  const s = e.status || 0;
  const who = PROVIDERS[cfg?.provider]?.label || 'AI provider';
  if (s === 401 || s === 403) return `${who} rejected the API key (${s}). Check the key in Settings → AI engine.`;
  if (s === 404) return e.azure ? `${who}: ${e.message}` : `${who}: model or deployment not found (404). Check the model / deployment name.`;
  if (s === 429) return `${who} rate limit or quota reached (429). Wait a minute or check billing.`;
  if (s === 504) return e.message;
  return `${who}: ${String(e.message || 'request failed').slice(0, 240)}`;
}

// ---------- tiny per-IP rate limit (only when Redis is connected) ----------
export async function rateLimit(ip, limit = 240) {
  if (!redisReady() || !ip) return true;
  try {
    const k = `rl:ai:${ip}:${new Date().toISOString().slice(0, 13)}`;
    const n = await redis(['INCR', k]);
    if (n === 1) await redis(['EXPIRE', k, 3700]);
    return n <= limit;
  } catch { return true; }
}

// ---------- box formats: ask each model in the format it was trained on ----------
// Gemini: "box_2d": [ymin, xmin, ymax, xmax] on a 0-1000 scale (its native object-detection format).
// OpenAI / Azure / Claude: "box": [xmin, ymin, xmax, ymax] on a 0-1000 scale (corners are far more reliable than width/height).
export function boxSpec(provider) {
  if (provider === 'gemini') return { key: 'box_2d', shape: '[ymin, xmin, ymax, xmax]', text: '"box_2d": [ymin, xmin, ymax, xmax] as integers from 0 to 1000 (0,0 = top-left of the photo, 1000,1000 = bottom-right)' };
  return { key: 'box', shape: '[xmin, ymin, xmax, ymax]', text: '"box": [xmin, ymin, xmax, ymax] as integers from 0 to 1000 (0,0 = top-left of the photo, 1000,1000 = bottom-right)' };
}
// -> [x, y, w, h] fractions, or null when the box is unusable
export function readBox(obj, provider) {
  if (!obj) return null;
  // Gemini order [ymin, xmin, ymax, xmax] when the answer uses "box_2d"; corner order [xmin, ymin, xmax, ymax] for "box"
  const useB2d = obj.box_2d !== undefined && obj.box_2d !== null && (boxSpec(provider).key === 'box_2d' || obj.box === undefined || obj.box === null);
  let b = useB2d ? obj.box_2d : obj.box;
  if (!Array.isArray(b) || b.length !== 4) return null;
  b = b.map(Number);
  if (b.some((v) => !Number.isFinite(v))) return null;
  const scale = b.every((v) => Math.abs(v) <= 1.0001) ? 1 : 1000; // some models answer 0-1 fractions anyway
  let [x1, y1, x2, y2] = useB2d ? [b[1], b[0], b[3], b[2]] : b;
  [x1, y1, x2, y2] = [x1, y1, x2, y2].map((v) => Math.min(1, Math.max(0, v / scale)));
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  const w = x2 - x1, h = y2 - y1;
  if (w < 0.015 || h < 0.015) return null;      // too small to see
  if (w * h > 0.82) return null;                 // covers the whole photo – marks nothing
  return [+x1.toFixed(4), +y1.toFixed(4), +w.toFixed(4), +h.toFixed(4)];
}

// ---------- prompts ----------
export const SYSTEM_INSPECTOR = `You are an experienced, certified site safety inspector (scaffolding, access equipment, fire, electrical, food safety).
You assess inspection photos against a checklist. Work in two steps for EVERY check, and never guess:
STEP 1 – EXISTENCE. Is the component / thing the check is about actually in the photos?
  "yes" = you can see it (say where) · "no" = the place where it would be is clearly visible and it is not there ·
  "not_visible" = that part of the scaffold / area is out of frame, hidden, blurry or too dark ·
  "not_applicable" = it is not needed for this item (e.g. platform checks when there is no working platform at all).
  For condition checks (e.g. "standards plumb", "platform clear", "member condition") "exists" = yes when the area is visible.
STEP 2 – COMPLIANCE, only when exists = "yes": "ok" when the photos clearly show the requirement is met, otherwise "defect".
Do NOT report a defect for something that does not exist (no ladder = exists "no", never "ladder not tied").
Do NOT report "ok" unless you can point to the component in a photo.
Use short, plain-English evidence a site supervisor understands, describing what is actually visible.
Boxes mark WHERE the evidence is in the photo, using the coordinate format given in the request. Use null when no single area applies.`;

// Visual guide for scaffold inspections: system recognition, component definitions and the usual look-alikes
export const SCAFFOLD_SYSTEMS = { tube: 'Tube & coupler', cuplock: 'Cup-lock', ringlock: 'Ring-lock', mobile: 'Mobile tower', frame: 'Frame (H-frame)' };
export function scaffoldGuide(type) {
  const sys = SCAFFOLD_SYSTEMS[type] ? `This scaffold is a ${SCAFFOLD_SYSTEMS[type]} system.` : 'The scaffold system is not known – identify it from the photos.';
  return `
SCAFFOLD GUIDE – read before judging. ${sys}
Systems: Tube & coupler = loose tubes joined by couplers/clamps (bolted fittings at joints) · Cup-lock = standards with cup joints
every ~0.5 m; ledger blades sit in a bottom cup and are locked by a top cup; NO couplers at node points ·
Ring-lock = standards with round rosettes (plates with holes); ledgers/braces fixed with wedge heads; NO couplers ·
Mobile tower = fabricated / aluminium frames on castor wheels; NO base plates, sole boards or ties · Frame = prefabricated H-frames with cross braces.
Components and their look-alikes:
- Standard = vertical member. Ledger = horizontal member along the length. Transom = horizontal member across the width under the boards.
- BRACING = a diagonal tube or brace FIXED between standards inside the scaffold (zig-zag or single diagonals along the face).
  NOT bracing: raking props / shores leaning against the scaffold from outside, wire ropes, cables, slings, building members, shadows.
  If you cannot see a diagonal member clearly connected between two standards, bracing exists = "no" or "not_visible".
- TIE = a tube, anchor or bracket that physically connects the scaffold to the building wall / slab. Being close to a wall is NOT a tie.
- ACCESS LADDER = a ladder or stair tower serving the platform. Vertical standards or ledgers are NOT a ladder.
- SCAFFOLD TAG = a card / board fixed at the access point showing inspection status. Signage on the building is NOT a scaffold tag.
- COUPLERS / CLAMPS exist only on tube & coupler scaffolds (and as extra bracing fittings). Cup joints, rosettes and frame pins are NOT couplers.
- BASE JACKS = threaded adjustable jacks at the foot of standards. Plain tube ends are NOT base jacks.
- WORKING PLATFORM = boards / decks a person stands on. If there is no working platform at all, every platform, top rail, mid rail,
  toe board and "platform clear" check is "not_applicable".
GROUND: first identify the surface. A level concrete slab, floor or terrace is FIRM ground: base plates directly on it are acceptable,
  sole boards are NOT required. Sole boards are required on soil, gravel or soft ground. Bricks, blocks or loose packing under a base = defect.
RUST: light surface rust / discolouration = ok. Heavy rust with flaking, pitting or visible loss of section = defect.
`;
}

export function evaluatePrompt(p) {
  const photos = p.photos.map((ph, i) => `Photo ${i + 1}: view "${ph.view}"`).join('\n');
  const checks = p.checks.map((c) => `${c.id} | view: ${c.view} | ${c.critical ? 'CRITICAL | ' : ''}${c.optional ? 'OPTIONAL | ' : ''}${c.name}${c.rule ? ' — must be: ' + c.rule : ''}`).join('\n');
  return `Inspection: ${p.item}${p.description ? ` (${p.description})` : ''}${p.scaffold ? scaffoldGuide(p.scaffoldType) : ''}
Asset: ${p.assetId || '-'} at ${p.location || '-'}

Photos (in order):
${photos}

A view can have several photos (same view name): judge each check using ALL photos of its view and pick the one that shows it best.
Checklist (id | view | requirement). A check with view "Any view" may be judged from any photo:
${checks}

Return JSON:
{
  "item_identified": "what the photos show",
  "item_matches": true or false (do the photos show a ${p.item}?),
  "photo_quality": [{ "photo": 1, "ok": true, "issue": "" }],
  "checks": [{ "id": "c1", "exists": "yes" | "no" | "not_visible" | "not_applicable", "status": "ok" | "defect" (only when exists = yes), "evidence": "what you see and where", "photo": 1, "${p.box.key}": ${p.box.shape} or null }],
  "defects": [{ "photo": 1, "description": "damage or hazard not covered by the checklist", "severity": "high" | "medium" | "low", "${p.box.key}": ${p.box.shape} or null }],
  "summary": "2-3 sentence overall assessment",
  "recommendations": ["short corrective or next actions"]
}
Coordinates: ${p.box.text}, measured on the photo named in "photo".
"photo" = the number of the photo that shows the evidence best.
Boxes: only when exists = "yes" – around the component itself. Never draw a box for something that is not there.
Return every checklist id exactly once.`;
}

// exists/status from the model -> the app's result types
// present = OK · missing = Not OK (defect) · absent = Not provided · unclear = Not visible · na = Not applicable
export function mapOutcome(r, optional) {
  const ex = String(r?.exists || '').toLowerCase().replace(/[\s-]+/g, '_');
  const st = String(r?.status || '').toLowerCase();
  if (ex === 'yes') return st === 'ok' || st === 'present' ? 'present' : st === 'defect' || st === 'missing' || st === 'not_ok' ? 'missing' : 'unclear';
  if (ex === 'no') return optional ? 'na' : 'absent';
  if (ex === 'not_visible') return 'unclear';
  if (ex === 'not_applicable' || ex === 'na') return 'na';
  // older answer format
  return { present: 'present', ok: 'present', missing: 'missing', defect: 'missing', unclear: 'unclear', not_visible: 'unclear', absent: 'absent', na: 'na', not_applicable: 'na' }[st] || 'unclear';
}

export function verifyPrompt(p) {
  const list = p.checks.map((c) => `${c.id} | ${c.name}${c.rule ? ' — must be: ' + c.rule : ''} | first reviewer said: "${c.evidence}"`).join('\n');
  const photos = p.photos.map((ph, i) => `Photo ${i + 1}: view "${ph.view}"`).join('\n');
  return `Second, independent check of a ${p.item} inspection. A first reviewer marked these checks as OK.
Confirm each one ONLY if the photos clearly prove the requirement is met.
Photos:
${photos}

Checks:
${list}

Return JSON: { "results": [{ "id": "c1", "confirmed": true or false, "reason": "short reason if not confirmed" }] }`;
}

export function framePrompt(p) {
  const checks = p.checks.map((c) => `${c.id} | ${c.critical ? 'CRITICAL | ' : ''}${c.name}${c.rule ? ' — must be: ' + c.rule : ''}`).join('\n');
  return `Live camera frame from an inspector walking around a ${p.item}${p.assetId ? ` (${p.assetId})` : ''}.
Views of this inspection: ${p.views.join(', ')}. The inspector says they are on: "${p.view || 'not sure'}".

Checks still open (id | requirement):
${checks}

Judge ONLY checks you can clearly see in THIS frame. Skip anything not visible.${p.scaffold ? scaffoldGuide(p.scaffoldType) : ''}
Never mark something "present" unless you can point to it; never mark a defect for a component that is not there.
Coordinates: ${p.box.text}. Box tightly around the part that proves the result.
Return JSON:
{
  "view_guess": "which view this frame shows (one of the list) or \\"\\"",
  "frame_ok": true or false (sharp and bright enough),
  "checks": [{ "id": "c1", "status": "present" | "missing", "evidence": "what you see", "${p.box.key}": ${p.box.shape} or null }],
  "defects": [{ "description": "", "severity": "high" | "medium" | "low", "${p.box.key}": ${p.box.shape} or null }],
  "hint": "one short instruction for what to point the camera at next (max 8 words)"
}`;
}

export const SYSTEM_CHECKLIST = `You are a senior audit and inspection specialist who designs practical checklists for ANY industry:
food safety and hygiene (FSSAI, HACCP, kitchens, restaurants, food factories), fire safety, electrical, construction and scaffolding,
manufacturing, warehouses, vehicles and fleets, hotels, hospitals, offices, retail, utilities and more.
Always build the checklist for the subject the user names and describes. Never fall back to scaffolding or any other topic
unless the user asks for it. When documents are attached, take the requirements from them (clauses, schedules, standards)
and turn them into checks; keep the clause or section number in the rule when there is one.`;

export function suggestPrompt({ name, description, documentText, fileNames = [], imageCount = 0, docCount = 0 }) {
  const attached = [
    fileNames.length ? `Attached files: ${fileNames.join(', ')}.` : '',
    docCount ? `${docCount} PDF document(s) are attached – read them.` : '',
    imageCount ? `${imageCount} reference photo(s) are attached – use them to understand the item / place being inspected.` : '',
  ].filter(Boolean).join('\n');
  return `Create an inspection checklist.
Inspection name: "${name}"
${description ? `Description from the user: ${description}` : ''}
${attached}
${documentText ? `\nText of the attached document(s) (may be cut short):\n"""\n${documentText}\n"""\n` : ''}
Rules:
- The inspector uses a phone camera. Group checks into 2-8 "views" = places or angles to photograph (e.g. for an FSSAI kitchen audit:
  "Food storage area", "Cooking area", "Wash area", "Staff & hygiene", "Licence & records display").
- 2-8 checks per view. Each check must be something a photo can show. If a requirement cannot be seen in a photo
  (e.g. a register or certificate), make the check about photographing that document or notice.
- "rule" = what must be visibly true, in plain English (add the clause / section from the document when known).
- Mark checks critical when failing them is a serious safety, hygiene or legal risk.
- "general" = checks that can be seen in any view (0-4 checks).
- Keep it compact so the answer is never cut off: at most 8 views, at most 8 checks per view, names under 8 words,
  rules under 25 words. For a long document, pick the requirements that matter most and can be photographed.

Return JSON:
{ "description": "one line describing this inspection", "idLabel": "name of the ID field (e.g. FSSAI licence no., Asset ID)",
  "safety": true or false (true = life-safety equipment, result words Safe to use / Do not use),
  "angles": [{ "name": "view name", "guidance": "how to frame the photo", "checks": [{ "name": "short name", "rule": "what must be visibly true", "critical": true or false }] }],
  "general": [{ "name": "", "rule": "", "critical": false }],
  "basedOn": "one short sentence: what you based the checklist on" }`;
}


// Second pass, ONE photo at a time: only WHERE is each finding. Much more accurate than boxes from a multi-photo request.
export const SYSTEM_LOCATE = `You are a precise visual annotator for site inspection photos. You draw bounding boxes around exactly the
part of the photo a finding refers to. Precision matters more than coverage: when you cannot find the item clearly, return null.`;
export function locatePrompt(p) {
  const list = p.items.map((t) => `${t.id} | ${t.result} | ${t.name}${t.rule ? ' — requirement: ' + t.rule : ''}${t.evidence ? ' | inspector note: ' + t.evidence : ''}`).join('\n');
  return `Photo: ${p.view ? `"${p.view}" view of ` : ''}a ${p.item}.
${p.grid ? 'A light grid is drawn on the photo with labels every 100 units (0-1000) along the top and left edges – use it to read positions accurately.\n' : ''}
${p.scaffold ? scaffoldGuide(p.scaffoldType) : ''}
Mark each finding below on THIS photo.
- OK findings: box the object that proves the requirement is met (e.g. the base plate, the guardrail, the tag).
- NOT OK findings: box the exact problem area. If something is missing, box the place where it should be
  (e.g. the open platform edge with no toe board, the bare ground under a standard with no sole board).
- Make each box tight around that object or area only, not the whole structure.
- If the finding cannot be located confidently in this photo, give null.

Findings (id | result | requirement):
${list}

Coordinates: ${p.box.text}.
Return JSON: { "items": [{ "id": "c1", "${p.box.key}": ${p.box.shape} or null }] }`;
}


// Convert ONE section of an existing checklist (spreadsheet rows) into one photo view – every row becomes one check.
export const SYSTEM_CONVERT = `You convert existing inspection / audit checklists into checks an inspector can verify with phone photos.
You never drop, merge or add rows: exactly one check per row, keeping the row reference.`;
export function convertPrompt({ name, description, header, rows, sectionKey }) {
  const list = rows.map((r) => `${r.ref} | ${r.cells.join(' | ')}`).join('\n');
  return `Inspection: "${name}"${description ? ` – ${description}` : ''}
Section ${sectionKey} of the checklist. ${header ? `Column headings (may be shifted by one column): ${header}` : ''}
Rows (ref | cells):
${list}

For EACH row write one check:
- "ref": the row reference exactly as given
- "name": short check name, max 8 words
- "rule": what must be visibly true, max 30 words, in plain English, keeping key limits (temperatures, distances, dates).
  If the row is about documents, records, licences or training, the rule says what the photographed document / notice must show.
- "critical": true only when the row's risk is Critical, or failing it is an immediate food-safety / life-safety risk.
Also name this section as a photo view (2-4 words, e.g. "Cold storage", "Licence & records") with a one-line photo guidance.

Return JSON: { "view": "", "guidance": "", "checks": [{ "ref": "A01", "name": "", "rule": "", "critical": false }] }
Return exactly ${rows.length} checks, one per row, same order.`;
}


// Group a flat checklist (no sections) into photo views: every row goes into exactly one view.
export const SYSTEM_GROUP = `You organise inspection checklists into the places an inspector walks to and photographs.
You never drop or duplicate rows: every row reference appears in exactly one view.`;
export function groupPrompt({ name, description, rows }) {
  const list = rows.map((r) => `${r.ref} | ${r.text}`).join('\n');
  return `Inspection: "${name}"${description ? ` – ${description}` : ''}
The checklist below has no sections. Group the rows into photo "views": places or areas the inspector photographs
(e.g. for a kitchen audit: "Licence & records", "Receiving area", "Cold storage", "Cooking area", "Staff hygiene", "Wash & waste area").
- Between 2 and 14 views, each with 2 to 15 rows. Group by where the evidence is photographed, not by topic words alone.
- Rows about documents, registers, licences or training go into one or two "records" views.
- Keep the rows' original order inside each view.
- View name: 2-4 words. Guidance: one line on what to photograph.

Rows (ref | question):
${list}

Return JSON: { "views": [{ "name": "", "guidance": "", "refs": ["ref1", "ref2"] }] }
Every one of the ${rows.length} refs must appear exactly once.`;
}


// Identify the scaffold system from photos (asked before the inspection)
export const SYSTEM_IDENTIFY = 'You are a scaffolding expert. You identify scaffold systems from photos by their joints and components.';
export function identifyPrompt() {
  return `Which scaffold system do these photos show?
- tube: tube & coupler – loose tubes joined by bolted couplers / clamps at the joints
- cuplock: cup-lock – standards with cup joints at regular intervals, ledger blades locked by a top cup
- ringlock: ring-lock – standards with round rosettes (plates with holes), wedge-head ledgers and braces
- mobile: mobile tower – fabricated / aluminium frames standing on castor wheels
- frame: frame / H-frame – prefabricated H-shaped frames with cross braces
- unknown: not a scaffold, or the joints cannot be seen
Return JSON: { "type": "tube" | "cuplock" | "ringlock" | "mobile" | "frame" | "unknown", "confidence": 0 to 1, "evidence": "the joints / features you saw" }`;
}
