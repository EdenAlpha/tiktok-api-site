export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function blockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;
  if (h === '::1') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export async function GET(req) {
  const u = new URL(req.url);
  const raw = u.searchParams.get('url');
  const mode = u.searchParams.get('mode') || 'stream';
  if (!raw) return Response.json({ error: 'missing url' }, { status: 400 });

  let target;
  try { target = new URL(raw); } catch { return Response.json({ error: 'invalid url' }, { status: 400 }); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || blockedHost(target.hostname)) {
    return Response.json({ error: 'blocked target' }, { status: 400 });
  }

  const headers = new Headers();
  const range = req.headers.get('range');
  if (range) headers.set('range', range);
  const method = mode === 'head' ? 'HEAD' : 'GET';

  let upstream;
  try {
    upstream = await fetch(target, { method, headers, redirect: 'follow', cache: 'no-store' });
  } catch (e) {
    return Response.json({ error: 'upstream fetch failed', detail: String(e) }, { status: 502 });
  }

  if (mode === 'head') {
    return Response.json({
      ok: upstream.ok,
      status: upstream.status,
      finalUrl: upstream.url,
      contentLength: upstream.headers.get('content-length'),
      contentType: upstream.headers.get('content-type'),
      acceptRanges: upstream.headers.get('accept-ranges'),
      etag: upstream.headers.get('etag'),
      lastModified: upstream.headers.get('last-modified')
    }, { status: upstream.ok ? 200 : upstream.status });
  }

  const out = new Headers();
  for (const k of ['content-type','content-length','content-range','accept-ranges','etag','last-modified','content-disposition']) {
    const v = upstream.headers.get(k); if (v) out.set(k, v);
  }
  out.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
