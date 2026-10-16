export function createMemoryBucket() {
  const objects = new Map();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ method: init.method || 'GET', url: String(url) });
    if (parsed.hostname === 'metadata.google.internal') return new Response(JSON.stringify({ access_token: 'metadata-token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (!/^Bearer metadata-token$/.test(init.headers?.authorization || '')) return new Response('no token', { status: 401 });
    if (parsed.pathname.startsWith('/upload/storage/v1/')) {
      const name = parsed.searchParams.get('name');
      if (objects.has(name) && parsed.searchParams.get('ifGenerationMatch') === '0') return new Response('exists', { status: 412 });
      objects.set(name, String(init.body));
      return new Response(JSON.stringify({ name }), { status: 200 });
    }
    const match = /^\/storage\/v1\/b\/[^/]+\/o\/(.+)$/.exec(parsed.pathname);
    if (match) {
      const name = decodeURIComponent(match[1]);
      if (!objects.has(name)) return new Response('missing', { status: 404 });
      return new Response(objects.get(name), { status: 200 });
    }
    return new Response('unknown', { status: 400 });
  };
  return { objects, calls, fetchImpl };
}
