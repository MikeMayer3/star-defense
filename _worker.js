// Entry point for the "Workers with static assets" deployment model.
// Static files in public/ are served automatically whenever a request
// matches a real file (see assets.directory in wrangler.jsonc); this script
// only runs for everything else — currently just /api/scores. Route logic
// lives in functions/api/scores.js (Pages-Function exports).
import { onRequestGet, onRequestPost } from './functions/api/scores.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/scores') {
      const context = { request, env, ctx };
      if (request.method === 'GET') return onRequestGet(context);
      if (request.method === 'POST') return onRequestPost(context);
      return new Response('Method not allowed', { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};
