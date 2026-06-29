import { json, error, readJson, randomId, nowMs } from "./json.js";
import { hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearCookie } from "./auth.js";

const id = (prefix) => `${prefix}_${randomId(12)}`;

function loginParts(body) {
  const studioName = String(body.login || body.studioName || "");
  return { loginKey: studioName, username: studioName };
}

function userJson(user) {
  return { id: user.id, username: user.username, name: user.name };
}

// POST /api/auth/signup  { studioName, password }
export async function signup({ env, request, url }) {
  const body = await readJson(request);
  if (!body) return error(400, "Invalid request");
  const studioName = String(body.studioName || "");
  const loginKey = studioName;
  const name = studioName;
  const username = studioName;
  const password = String(body.password || "");

  if (!studioName.trim()) return error(400, "Studio name is required");
  if (password.length < 8) return error(400, "Password must be at least 8 characters");

  const existingStudio = await env.DB.prepare("SELECT id FROM studios WHERE login_key = ?").bind(loginKey).first();
  if (existingStudio) return error(409, "A studio with that login already exists");

  const studioId = id("studio");
  const userId = id("user");
  const now = nowMs();
  const pw = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare("INSERT INTO studios (id, name, login_key, created_at) VALUES (?, ?, ?, ?)").bind(studioId, studioName, loginKey, now),
    env.DB.prepare("INSERT INTO users (id, studio_id, username, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(userId, studioId, username, pw, name, now),
  ]);

  const sid = await createSession(env, { id: userId, studio_id: studioId, username, name });
  return json(
    { user: { id: userId, username, name }, studio: { id: studioId, name: studioName, loginKey } },
    { headers: { "set-cookie": sessionCookie(sid, url) } }
  );
}

// POST /api/auth/login  { login, password } where login is a studio name/key
export async function login({ env, request, url }) {
  const body = await readJson(request);
  if (!body) return error(400, "Invalid request");
  const { loginKey, username } = loginParts(body);
  const password = String(body.password || "");

  if (!loginKey || !username) return error(400, "Studio is required");

  const user = await env.DB.prepare(
    `SELECT u.id, u.studio_id, u.username, u.name, u.password_hash,
      s.name AS studio_name, s.login_key AS studio_login_key
     FROM users u
     JOIN studios s ON s.id = u.studio_id
     WHERE s.login_key = ? AND u.username = ?`
  ).bind(loginKey, username).first();

  const ok = user && (await verifyPassword(password, user.password_hash));
  if (!ok) return error(401, "Incorrect studio or password");

  const sid = await createSession(env, user);
  return json(
    { user: userJson(user), studio: { id: user.studio_id, name: user.studio_name, loginKey: user.studio_login_key } },
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
  const studio = await env.DB.prepare("SELECT id, name, login_key AS loginKey FROM studios WHERE id = ?").bind(session.studioId).first();
  return json({
    user: { id: session.userId, username: session.username, name: session.name },
    studio: studio || { id: session.studioId, name: "" },
  });
}
