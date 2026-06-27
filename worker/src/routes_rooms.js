import { json, error, readJson, randomId, nowMs } from "./json.js";
import { loadProject } from "./routes_projects.js";

const id = (p) => `${p}_${randomId(12)}`;

// Load a room scoped to the caller's studio (tenancy guard).
export async function roomScoped(env, session, roomId) {
  return env.DB.prepare(
    "SELECT r.* FROM rooms r JOIN projects p ON p.id = r.project_id WHERE r.id = ? AND p.studio_id = ?"
  ).bind(roomId, session.studioId).first();
}

// GET /api/rooms/:id
export async function getRoom({ env, session, params }) {
  const room = await roomScoped(env, session, params.id);
  if (!room) return error(404, "Room not found");
  return json({ room });
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

// GET /api/projects/:id/rooms
export async function listRooms({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const { results } = await env.DB.prepare(
    "SELECT id, name, rect_x, rect_y, rect_w, rect_h, sort FROM rooms WHERE project_id = ? ORDER BY sort ASC"
  ).bind(project.id).all();
  return json({ rooms: results });
}

// POST /api/projects/:id/rooms  { name, rect_x, rect_y, rect_w, rect_h }
export async function createRoom({ env, session, params, request }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const b = (await readJson(request)) || {};
  const name = String(b.name || "").trim();
  const x = num(b.rect_x), y = num(b.rect_y), w = num(b.rect_w), h = num(b.rect_h);
  if (!name) return error(400, "Room name is required");
  if (x == null || y == null || w == null || h == null) return error(400, "Invalid rectangle");

  const rid = id("room");
  const sort = nowMs();
  await env.DB.prepare(
    "INSERT INTO rooms (id, project_id, name, rect_x, rect_y, rect_w, rect_h, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(rid, project.id, name, x, y, w, h, sort).run();
  return json({ room: { id: rid, name, rect_x: x, rect_y: y, rect_w: w, rect_h: h, sort } });
}

// PATCH /api/rooms/:id  { name?, rect_x?, rect_y?, rect_w?, rect_h? }
export async function updateRoom({ env, session, params, request }) {
  const room = await roomScoped(env, session, params.id);
  if (!room) return error(404, "Room not found");
  const b = (await readJson(request)) || {};
  const name = b.name !== undefined ? String(b.name).trim() : room.name;
  if (!name) return error(400, "Room name cannot be empty");
  const rx = b.rect_x !== undefined ? num(b.rect_x) : room.rect_x;
  const ry = b.rect_y !== undefined ? num(b.rect_y) : room.rect_y;
  const rw = b.rect_w !== undefined ? num(b.rect_w) : room.rect_w;
  const rh = b.rect_h !== undefined ? num(b.rect_h) : room.rect_h;
  await env.DB.prepare(
    "UPDATE rooms SET name = ?, rect_x = ?, rect_y = ?, rect_w = ?, rect_h = ? WHERE id = ?"
  ).bind(name, rx, ry, rw, rh, room.id).run();
  return json({ room: { ...room, name, rect_x: rx, rect_y: ry, rect_w: rw, rect_h: rh } });
}

// DELETE /api/rooms/:id
export async function deleteRoom({ env, session, params }) {
  const room = await roomScoped(env, session, params.id);
  if (!room) return error(404, "Room not found");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM walls WHERE room_id = ?").bind(room.id),
    env.DB.prepare("DELETE FROM rooms WHERE id = ?").bind(room.id),
  ]);
  return json({ ok: true });
}
