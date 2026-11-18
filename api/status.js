// GET /api/status → is checkout configured, and is there a kit file for every plan (no file contents or links)
import { PLANS, kitFiles, findKit, json } from './_lib.js';

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  const mode = key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'live' : key ? 'test' : 'missing';
  try {
    const blobs = await kitFiles();
    const plans = {};
    const used = new Set();
    for (const slug of Object.keys(PLANS)) {
      const k = await findKit(slug);
      plans[slug] = k ? { ready: true, file: k.pathname.split('/').pop(), mb: Math.round(k.size / 1e5) / 10 } : { ready: false };
      if (k) used.add(k.pathname);
    }
    const other = blobs.filter((b) => !used.has(b.pathname)).map((b) => b.pathname.split('/').pop());
    return json({ stripe: mode, plans, otherFiles: other });
  } catch (e) {
    return json({ stripe: mode, error: e.message }, 500);
  }
}
