import { json, error, readJson, randomId, nowMs } from "./json.js";
import { hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearCookie } from "./auth.js";

const id = (prefix) => `${prefix}_${randomId(12)}`;
const normUsername = (u) => String(u || "").trim().toLowerCase();
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

function studioKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loginParts(body) {
  const raw = String(body.login || "").trim();
  if (raw.includes("/")) {
    const [studio, ...rest] = raw.split("/");
    return { loginKey: studioKey(studio), username: normUsername(rest.join("/")) };
  }
  return {
    loginKey: studioKey(body.studioKey || body.studioName),
    username: normUsername(body.username),
  };
}

function userJson(user) {
  return { id: user.id, username: user.username, name: user.name };
}

// POST /api/auth/signup  { studioName, name, username, password }
export async function signup({ env, request, url }) {
  const body = await readJson(request);
  if (!body) return error(400, "Invalid request");
  const studioName = String(body.studioName || "").trim();
  const loginKey = studioKey(body.studioKey || studioName);
  const name = String(body.name || "").trim();
  const username = normUsername(body.username);
  const password = String(body.password || "");

  if (!studioName) return error(400, "Studio name is required");
  if (!loginKey) return error(400, "Studio login is required");
  if (!name) return error(400, "Your name is required");
  if (!USERNAME_RE.test(username)) return error(400, "Username must be 2-32 letters, numbers, dots, dashes, or underscores");
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

// POST /api/auth/login  { login, password } where login is "studio/username"
export async function login({ env, request, url }) {
  const body = await readJson(request);
  if (!body) return error(400, "Invalid request");
  const { loginKey, username } = loginParts(body);
  const password = String(body.password || "");

  if (!loginKey || !username) return error(400, "Studio and username are required");

  const user = await env.DB.prepare(
    `SELECT u.id, u.studio_id, u.username, u.name, u.password_hash,
      s.name AS studio_name, s.login_key AS studio_login_key
     FROM users u
     JOIN studios s ON s.id = u.studio_id
     WHERE s.login_key = ? AND u.username = ?`
  ).bind(loginKey, username).first();

  const ok = user && (await verifyPassword(password, user.password_hash));
  if (!ok) return error(401, "Incorrect studio, username, or password");

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
