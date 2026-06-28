// Auth: PBKDF2 password hashing (WebCrypto), KV-backed sessions, cookie helpers.

const enc = new TextEncoder();
const PBKDF2_ITERS = 100000;
const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 days
const COOKIE = "artset_session";

function b64e(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64d(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    key, 256
  );
  return `pbkdf2$${PBKDF2_ITERS}$${b64e(salt)}$${b64e(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, itersStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iters = parseInt(itersStr, 10);
    const salt = b64d(saltB64);
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" },
      key, 256
    );
    const a = new Uint8Array(bits);
    const b = b64d(hashB64);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch {
    return false;
  }
}

function randomToken(bytes = 24) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return s;
}

// --- sessions (KV) ---
export async function createSession(env, user) {
  const id = randomToken();
  const payload = { userId: user.id, studioId: user.studio_id, username: user.username, name: user.name };
  await env.KV.put(`sess:${id}`, JSON.stringify(payload), { expirationTtl: SESSION_TTL_S });
  return id;
}

export async function getSession(env, request) {
  const id = readCookie(request, COOKIE);
  if (!id) return null;
  const raw = await env.KV.get(`sess:${id}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const user = await env.DB.prepare(
      `SELECT u.id, u.studio_id, u.username, u.name
       FROM users u
       JOIN studios s ON s.id = u.studio_id
       WHERE u.id = ?`
    ).bind(data.userId).first();
    if (!user) {
      await env.KV.delete(`sess:${id}`);
      return null;
    }
    return {
      sessionId: id,
      userId: user.id,
      studioId: user.studio_id,
      username: user.username,
      name: user.name,
    };
  } catch {
    return null;
  }
}

export async function destroySession(env, request) {
  const id = readCookie(request, COOKIE);
  if (id) await env.KV.delete(`sess:${id}`);
}

// --- cookies ---
function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function isLocal(url) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function sessionCookie(id, url) {
  const secure = isLocal(url) ? "" : " Secure;";
  return `${COOKIE}=${id}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_S}`;
}

export function clearCookie(url) {
  const secure = isLocal(url) ? "" : " Secure;";
  return `${COOKIE}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`;
}
