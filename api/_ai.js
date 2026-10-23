// Shared AI helpers for the serverless functions (Vercel / local Express).
// Providers: Azure OpenAI, OpenAI, Google Gemini, Anthropic Claude. No npm packages needed.
import crypto from 'node:crypto';
import { configured as redisReady, redis } from './_store.js';

export const PROVIDERS = {
  azure: { label: 'Azure OpenAI', defaultModel: '' },
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
export function clean(c = {}) {
  const t = (v, n = 300) => String(v ?? '').trim().slice(0, n);
  const provider = PROVIDERS[c.provider] ? c.provider : '';
  return {
    provider, apiKey: t(c.apiKey, 400), model: t(c.model, 120), endpoint: t(c.endpoint, 300).replace(/\/+$/, ''),
    deployment: t(c.deployment, 120), apiVersion: t(c.apiVersion, 40),
  };
}
export function validate(c) {
  if (!c.provider) return 'Choose an AI provider.';
  if (!c.apiKey) return 'Enter the API key.';
  if (c.provider === 'azure') {
    if (!/^https:\/\/[^\s/]+/.test(c.endpoint || '')) return 'Enter the Azure endpoint, e.g. https://your-resource.openai.azure.com';
    if (!c.deployment) return 'Enter the Azure deployment name.';
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

export async function callVision(cfg, { system, text, images = [], maxTokens = 4000, json = true, timeoutMs = 55000 }) {
  const p = cfg.provider;
  if (p === 'gemini') {
    const model = cfg.model || PROVIDERS.gemini.defaultModel;
    const parts = [...images.map((im) => ({ inline_data: { mime_type: mime(im), data: b64(im) } })), { text }];
    const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': cfg.apiKey },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: Math.max(maxTokens, 8192), ...(json ? { responseMimeType: 'application/json' } : {}) } }, timeoutMs);
    const out = (j?.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    if (!out) throw new Error(j?.promptFeedback?.blockReason ? `Blocked by Gemini: ${j.promptFeedback.blockReason}` : 'Gemini returned an empty answer.');
    return out;
  }
  if (p === 'anthropic') {
    const model = cfg.model || PROVIDERS.anthropic.defaultModel;
    const content = [...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: mime(im), data: b64(im) } })), { type: 'text', text }];
    const j = await postJson('https://api.anthropic.com/v1/messages', { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: maxTokens, system: system + (json ? '\nReply with one JSON object only, no other text.' : ''), messages: [{ role: 'user', content }] }, timeoutMs);
    return (j?.content || []).map((x) => x.text || '').join('');
  }
  // OpenAI and Azure OpenAI share the chat-completions format
  const messages = [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text }, ...images.map((im) => ({ type: 'image_url', image_url: { url: im, detail: 'high' } }))] }];
  let url, headers, body = { messages, max_completion_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}) };
  if (p === 'azure') {
    url = `${cfg.endpoint}/openai/deployments/${encodeURIComponent(cfg.deployment)}/chat/completions?api-version=${encodeURIComponent(cfg.apiVersion || '2024-10-21')}`;
    headers = { 'api-key': cfg.apiKey };
  } else {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { Authorization: `Bearer ${cfg.apiKey}` };
    body.model = cfg.model || PROVIDERS.openai.defaultModel;
  }
  try {
    const j = await postJson(url, headers, body, timeoutMs);
    return j?.choices?.[0]?.message?.content || '';
  } catch (e) {
    // older models / API versions: retry with max_tokens instead of max_completion_tokens
    if (e.status === 400 && /max_completion_tokens/i.test(e.message)) {
      const { max_completion_tokens, ...rest } = body;
      const j = await postJson(url, headers, { ...rest, max_tokens: maxTokens }, timeoutMs);
      return j?.choices?.[0]?.message?.content || '';
    }
    throw e;
  }
}

export function parseJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error('The AI answer was not valid JSON. Try again.');
}

export function friendlyError(e, cfg) {
  const s = e.status || 0;
  const who = PROVIDERS[cfg?.provider]?.label || 'AI provider';
  if (s === 401 || s === 403) return `${who} rejected the API key (${s}). Check the key in Settings → AI engine.`;
  if (s === 404) return `${who}: model or deployment not found (404). Check the model / deployment name.`;
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

// ---------- prompts ----------
export const SYSTEM_INSPECTOR = `You are an experienced, certified site safety inspector (scaffolding, access equipment, fire and electrical equipment).
You assess inspection photos against a checklist. Be strict and evidence based:
- "present" (OK) only when the photo clearly shows the requirement is met.
- "missing" (Not OK) when the photo clearly shows it is not met, or the item is absent where it should be visible.
- "unclear" when it cannot be judged from the photos (hidden, out of frame, blurry, too dark).
Never guess. Use short, plain-English evidence a site supervisor understands, describing what is actually visible.
Boxes are [x, y, width, height] as fractions (0 to 1) of the photo they refer to, top-left origin, tight around the evidence. Use null when no single area applies.`;

export function evaluatePrompt(p) {
  const photos = p.photos.map((ph, i) => `Photo ${i + 1}: view "${ph.view}"`).join('\n');
  const checks = p.checks.map((c) => `${c.id} | view: ${c.view} | ${c.critical ? 'CRITICAL | ' : ''}${c.name}${c.rule ? ' — must be: ' + c.rule : ''}`).join('\n');
  return `Inspection: ${p.item}${p.description ? ` (${p.description})` : ''}
Asset: ${p.assetId || '-'} at ${p.location || '-'}

Photos (in order):
${photos}

Checklist (id | view | requirement). A check with view "Any view" may be judged from any photo:
${checks}

Return JSON:
{
  "item_identified": "what the photos show",
  "item_matches": true or false (do the photos show a ${p.item}?),
  "photo_quality": [{ "photo": 1, "ok": true, "issue": "" }],
  "checks": [{ "id": "c1", "status": "present" | "missing" | "unclear", "evidence": "what you see", "photo": 1, "box": [x, y, w, h] or null }],
  "defects": [{ "photo": 1, "description": "damage or hazard not covered by the checklist", "severity": "high" | "medium" | "low", "box": [x, y, w, h] or null }],
  "summary": "2-3 sentence overall assessment",
  "recommendations": ["short corrective or next actions"]
}
Return every checklist id exactly once.`;
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

Judge ONLY checks you can clearly see in THIS frame. Skip anything not visible.
Return JSON:
{
  "view_guess": "which view this frame shows (one of the list) or \\"\\"",
  "frame_ok": true or false (sharp and bright enough),
  "checks": [{ "id": "c1", "status": "present" | "missing", "evidence": "what you see", "box": [x, y, w, h] or null }],
  "defects": [{ "description": "", "severity": "high" | "medium" | "low", "box": [x, y, w, h] or null }],
  "hint": "one short instruction for what to point the camera at next (max 8 words)"
}`;
}

export function suggestPrompt(name, description) {
  return `Create a visual inspection checklist for: "${name}"${description ? ` (${description})` : ''}.
Design 2-6 camera views (photo angles) and 1-5 checks per view that can be judged from a photo.
Mark life-safety checks as critical. Return JSON:
{ "description": "one line", "idLabel": "name of the ID field", "safety": true or false,
  "angles": [{ "name": "view name", "guidance": "how to frame the photo", "checks": [{ "name": "short name", "rule": "what must be visibly true", "critical": true or false }] }],
  "general": [{ "name": "", "rule": "", "critical": false }] }`;
}
