// POST /api/checkout  { kind: "plan", plan } | { kind: "bundle", plans: [5 slugs] } | { kind: "changes", plan? }
// Creates a Stripe Checkout Session and returns its URL.
import { PLANS, PRICES, BUNDLE_SIZE, siteUrl, stripe, json } from './_lib.js';

const WAIVER_ID = 'instant-download-waiver-v1';
const WAIVER_TEXT = 'Digital download. You agreed that delivery starts immediately after payment and that your right of withdrawal ends once the download is available.';
const KIT = 'Full plan set in 11×17 + 24×36 + reverse, CAD (DXF) of every drawing, Excel cost-to-build workbook, lender sheet and checklists. Instant download. One build per plan.';

export async function POST(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const kind = input?.kind;
  // EU digital-content rule: the buyer must agree that delivery starts now (ends the withdrawal right)
  if (input?.consent !== true) return json({ error: 'Please confirm the instant-download agreement first.' }, 400);
  const site = siteUrl();
  let from = site;
  try {
    const ref = new URL(request.headers.get('referer') || '');
    if (ref.origin === new URL(site).origin) from = ref.origin + ref.pathname;
  } catch {}

  const session = {
    mode: 'payment',
    success_url: `${site}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: from,
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    customer_creation: 'if_required',
    metadata: { kind, consent: WAIVER_ID, consent_at: new Date().toISOString() },
    payment_intent_data: { metadata: { kind, consent: WAIVER_ID } },
    custom_text: { submit: { message: WAIVER_TEXT } },
  };

  if (kind === 'plan') {
    const plan = input.plan;
    if (!PLANS[plan]) return json({ error: 'Unknown plan' }, 400);
    session.line_items = [{ quantity: 1, price_data: { currency: 'usd', unit_amount: PRICES.plan,
      product_data: { name: `${PLANS[plan]} · Plan + cost kit`, description: KIT } } }];
    session.metadata.plans = plan;
  } else if (kind === 'bundle') {
    const plans = [...new Set(Array.isArray(input.plans) ? input.plans : [])];
    if (plans.length !== BUNDLE_SIZE || !plans.every((p) => PLANS[p])) return json({ error: `Choose ${BUNDLE_SIZE} different plans` }, 400);
    session.line_items = [{ quantity: 1, price_data: { currency: 'usd', unit_amount: PRICES.bundle,
      product_data: { name: 'Bundle of 5 plans', description: `${plans.map((p) => PLANS[p]).join(', ')}. Five complete kits, instant download. One build per plan.` } } }];
    session.metadata.plans = plans.join(',');
  } else if (kind === 'changes') {
    const options = Object.entries(PLANS).map(([slug, name]) => ({ label: name, value: slug.replace(/-/g, '_') }));
    session.line_items = [{ quantity: 1, price_data: { currency: 'usd', unit_amount: PRICES.changes,
      product_data: { name: 'Plan + Changes', description: 'One plan kit plus one round of edits: rooms, sizes, windows, garage side. Updated drawings and CAD. The kit downloads right away; we email to confirm your changes.' } } }];
    const pre = PLANS[input.plan] ? input.plan.replace(/-/g, '_') : undefined;
    session.custom_fields = [
      { key: 'plan', type: 'dropdown', label: { type: 'custom', custom: 'Which plan?' }, dropdown: { options, default_value: pre } },
      { key: 'changes', type: 'text', label: { type: 'custom', custom: 'What should change?' }, text: { maximum_length: 255 } },
    ];
  } else {
    return json({ error: 'Unknown item' }, 400);
  }
  session.payment_intent_data.metadata.plans = session.metadata.plans;

  try {
    const s = await stripe('checkout/sessions', { method: 'POST', body: session });
    return json({ url: s.url });
  } catch (e) {
    console.error('checkout failed', e.message);
    return json({ error: 'Checkout could not start. Please try again in a moment.' }, 502);
  }
}
