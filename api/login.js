import { getBody, sendError, verifyPassword, PASSWORD_CONFIGURED } from '../lib/common.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST for this endpoint.' });
  try {
    if (!PASSWORD_CONFIGURED) {
      return res.status(503).json({ code: 'NO_PASSWORD', error: 'APP_PASSWORD is not set on the server. Add it in Vercel, then Redeploy.' });
    }
    const { password } = getBody(req);
    if (verifyPassword(password)) return res.status(200).json({ ok: true });
    await new Promise((r) => setTimeout(r, 700)); // slows down password guessing
    res.status(401).json({ code: 'BAD_PASSWORD', error: 'Wrong password.' });
  } catch (err) {
    sendError(res, err);
  }
}
