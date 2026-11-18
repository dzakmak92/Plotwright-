// GET /api/order?session_id=cs_...  → what a paid order contains (for the thank-you page)
import { PLANS, paidOrder, findKit, json } from './_lib.js';

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('session_id');
  try {
    const o = await paidOrder(id);
    if (!o) return json({ error: 'Order not found' }, 404);
    if (!o.paid) return json({ paid: false });
    const items = await Promise.all(o.plans.map(async (slug) => {
      const kit = await findKit(slug);
      return { slug, name: PLANS[slug], ready: !!kit, size: kit?.size || null };
    }));
    return json({ paid: true, kind: o.kind, email: o.email, items });
  } catch (e) {
    console.error('order lookup failed', e.message);
    return json({ error: 'Could not load the order. Please refresh in a moment.' }, 502);
  }
}
