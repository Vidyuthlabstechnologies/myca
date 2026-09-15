export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const asset = await env.ASSETS.fetch(request);
      return asset;
    }
    return env.ASSETS.fetch(request);
  },
};
