// GET /api/download?session_id=cs_...&plan=tee → streams that plan's kit, only for a paid order that includes it
import { PLANS, paidOrder, findKit, get } from './_lib.js';

const text = (msg, status) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const plan = q.get('plan');
  try {
    const o = await paidOrder(q.get('session_id'));
    if (!o || !o.paid) return text('This download link is not valid.', 403);
    if (!o.plans.includes(plan)) return text('This plan is not part of your order.', 403);
    const kit = await findKit(plan);
    if (!kit) return text('This kit is being prepared. Please try again shortly or reply to your receipt email.', 404);
    const r = await get(kit.pathname, { access: 'private' });
    if (!r || r.statusCode !== 200) return text('File not found.', 404);
    const ext = (kit.pathname.match(/\.[a-z0-9]+$/i) || ['.zip'])[0];
    const name = `Plotwright-${PLANS[plan].replace(/^The /, '').replace(/\s+/g, '-')}-kit${ext}`;
    const headers = {
      'Content-Type': r.blob.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (r.blob.size) headers['Content-Length'] = String(r.blob.size);
    return new Response(r.stream, { headers });
  } catch (e) {
    console.error('download failed', e.message);
    return text('Download failed. Please try again in a moment.', 502);
  }
}
