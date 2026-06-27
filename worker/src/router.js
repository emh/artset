// Tiny method+path router. Patterns use :param segments, e.g. "/api/projects/:id".

import { error } from "./json.js";

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const parts = pattern.split("/").filter(Boolean);
    this.routes.push({ method, parts, handler });
    return this;
  }

  get(p, h) { return this.add("GET", p, h); }
  post(p, h) { return this.add("POST", p, h); }
  patch(p, h) { return this.add("PATCH", p, h); }
  put(p, h) { return this.add("PUT", p, h); }
  delete(p, h) { return this.add("DELETE", p, h); }

  match(method, pathname) {
    const segs = pathname.split("/").filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method) continue;
      if (r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  // ctx is built by the caller (env, request, session, etc.). We add params.
  async handle(request, env, ctx) {
    const url = new URL(request.url);
    const m = this.match(request.method, url.pathname);
    if (!m) return error(404, "Not found");
    return m.handler({ ...ctx, request, env, url, params: m.params });
  }
}
