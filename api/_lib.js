// Shared server code for checkout and downloads. Prices live here, never in the browser.
import { list, get } from '@vercel/blob';

export const PRICES = { plan: 17900, bundle: 39900, changes: 44900 }; // US cents
export const BUNDLE_SIZE = 5;

// Every plan that can be sold. Add a line here (and its kit file in the Blob store) for a new plan.
export const PLANS = {
  tee: 'The Tee',
  line: 'The Line',
  ell: 'The Ell',
  telescope: 'The Telescope',
  'entry-court': 'The Entry Court',
  offset: 'The Offset',
  prairie: 'The Prairie',
};

export const siteUrl = () => (process.env.SITE_URL || 'https://plotwright.vortexunit.de').replace(/\/$/, '');

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Stripe REST call with form encoding (no SDK needed)
const encode = (obj, prefix, out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') encode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
};

export async function stripe(path, { method = 'GET', body } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: body ? encode(body).join('&') : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Which plans a paid Checkout Session entitles the buyer to
export async function paidOrder(sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId || '')) return null;
  let s;
  try {
    s = await stripe(`checkout/sessions/${sessionId}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
  if (s.payment_status !== 'paid') return { paid: false, kind: s.metadata?.kind };
  let plans = (s.metadata?.plans || '').split(',').filter((p) => PLANS[p]);
  if (s.metadata?.kind === 'changes') {
    const pick = (s.custom_fields || []).find((f) => f.key === 'plan');
    const slug = pick?.dropdown?.value?.replace(/_/g, '-');
    if (slug && PLANS[slug]) plans = [slug];
  }
  return { paid: true, kind: s.metadata?.kind, email: s.customer_details?.email || '', plans };
}

// Find the kit file for a plan in the private Blob store (matches the slug in the file name)
let kitCache = null;
export async function kitFiles() {
  if (kitCache && Date.now() - kitCache.t < 60_000) return kitCache.blobs;
  const blobs = [];
  let cursor;
  do {
    const r = await list({ cursor, limit: 1000 });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  kitCache = { t: Date.now(), blobs };
  return blobs;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export async function findKit(slug) {
  const blobs = await kitFiles();
  const scored = blobs
    .map((b) => {
      const parts = b.pathname.split('/');
      const base = norm(parts.pop().replace(/\.[^.]+$/, ''));
      const dirs = parts.map(norm);
      let score = 0;
      if (base === slug) score = 5;
      else if (dirs.includes(slug)) score = 4;
      else if (base.startsWith(slug + '-') || base.endsWith('-' + slug) || base.includes('-' + slug + '-')) score = 3;
      if (score && /\.zip$/i.test(b.pathname)) score += 0.5;
      return { b, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.b || null;
}

export { get };
