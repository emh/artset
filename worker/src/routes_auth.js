import { json, error, readJson, randomId, nowMs } from "./json.js";
import { hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearCookie } from "./auth.js";

const id = (prefix) => `${prefix}_${randomId(12)}`;
const normEmail = (e) => String(e || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup  { studioName, name, email, password }
export async function signup({ env, request, url }) {
  const body = await readJson(request);
  if (!body) return error(400, "Invalid request");
  const studioName = String(body.studioName || "").trim();
  const name = String(body.name || "").trim();
  const email = normEmail(body.email);
  const password = String(body.password || "");

  if (!studioName) return error(400, "Studio name is required");
  if (!name) return error(400, "Your name is required");
  if (!EMAIL_RE.test(email)) return error(400, "A valid email is required");
  if (password.length < 8) return error(400, "Password must be at least 8 characters");

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return error(409, "An account with that email already exists");

  const studioId = id("studio");
  const userId = id("user");
  const now = nowMs();
  const pw = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare("INSERT INTO studios (id, name, created_at) VALUES (?, ?, ?)").bind(studioId, studioName, now),
    env.DB.prepare("INSERT INTO users (id, studio_id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(userId, studioId, email, pw, name, now),
  ]);

  const sid = await createSession(env, { id: userId, studio_id: studioId, email, name });
  return json(
    { user: { id: userId, email, name }, studio: { id: studioId, name: studioName } },
    { headers: { "set-cookie": sessionCookie(sid, url) } }
  );
}

// POST /api/auth/login  { email, password }
export async function login({ env, request, url }) {
  const body = await readJson(request);
  if (!body) return error(400, "Invalid request");
  const email = normEmail(body.email);
  const password = String(body.password || "");

  const user = await env.DB.prepare(
    "SELECT u.id, u.studio_id, u.email, u.name, u.password_hash, s.name AS studio_name FROM users u JOIN studios s ON s.id = u.studio_id WHERE u.email = ?"
  ).bind(email).first();

  const ok = user && (await verifyPassword(password, user.password_hash));
  if (!ok) return error(401, "Incorrect email or password");

  const sid = await createSession(env, user);
  return json(
    { user: { id: user.id, email: user.email, name: user.name }, studio: { id: user.studio_id, name: user.studio_name } },
    { headers: { "set-cookie": sessionCookie(sid, url) } }
  );
}

// POST /api/auth/logout
export async function logout({ env, request, url }) {
  await destroySession(env, request);
  return json({ ok: true }, { headers: { "set-cookie": clearCookie(url) } });
}

// GET /api/auth/me
export async function me({ env, session }) {
  if (!session) return error(401, "Not authenticated");
  const studio = await env.DB.prepare("SELECT id, name FROM studios WHERE id = ?").bind(session.studioId).first();
  return json({
    user: { id: session.userId, email: session.email, name: session.name },
    studio: studio || { id: session.studioId, name: "" },
  });
}
