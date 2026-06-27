// Thin fetch wrapper for the JSON API. Cookies (session) ride along automatically.

async function req(method, url, body) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body; // browser sets multipart boundary
    } else {
      opts.headers["content-type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, opts);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "Request failed";
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (u) => req("GET", u),
  post: (u, b) => req("POST", u, b),
  patch: (u, b) => req("PATCH", u, b),
  put: (u, b) => req("PUT", u, b),
  del: (u) => req("DELETE", u),
  health: () => req("GET", "/api/health"),
};
