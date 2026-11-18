// Temporary: checks that a function can stream a ~70 MB response. Removed after the test.
export async function GET(request) {
  if (new URL(request.url).searchParams.get('k') !== '45192f7104440fad5e') return new Response('no', { status: 404 });
  const total = 70 * 1024 * 1024, chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const stream = new ReadableStream({ pull(c) { if (sent >= total) return c.close(); c.enqueue(chunk); sent += chunk.length; } });
  return new Response(stream, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(total) } });
}
