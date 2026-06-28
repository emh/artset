import { json, error, readJson, randomId, nowMs } from "./json.js";
import { roomScoped } from "./routes_rooms.js";

const id = (p) => `${p}_${randomId(12)}`;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

export async function wallScoped(env, session, wallId) {
  return env.DB.prepare(
    `SELECT w.* FROM walls w
       JOIN rooms r ON r.id = w.room_id
       JOIN projects p ON p.id = r.project_id
      WHERE w.id = ? AND p.studio_id = ?`
  ).bind(wallId, session.studioId).first();
}

function parseSegments(s) {
  try {
    const arr = JSON.parse(s || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({ start: Number(x.start), end: Number(x.end) }))
      .filter((x) => isFinite(x.start) && isFinite(x.end) && x.end > x.start);
  } catch { return []; }
}

const shapeWall = (w) => ({
  id: w.id, room_id: w.room_id, name: w.name,
  length_inches: w.length_inches, height_inches: w.height_inches,
  ax: w.ax, ay: w.ay, bx: w.bx, by: w.by,
  segments: parseSegments(w.segments), sort: w.sort,
});

// GET /api/rooms/:id/walls
export async function listWalls({ env, session, params }) {
  const room = await roomScoped(env, session, params.id);
  if (!room) return error(404, "Room not found");
  const { results } = await env.DB.prepare(
    "SELECT * FROM walls WHERE room_id = ? ORDER BY sort ASC"
  ).bind(room.id).all();
  return json({ walls: results.map(shapeWall) });
}

// POST /api/rooms/:id/walls  { name, length_inches, height_inches?, ax, ay, bx, by }
export async function createWall({ env, session, params, request }) {
  const room = await roomScoped(env, session, params.id);
  if (!room) return error(404, "Room not found");
  const b = (await readJson(request)) || {};
  const name = String(b.name || "").trim();
  const length = num(b.length_inches);
  const height = num(b.height_inches) || 108;
  const ax = num(b.ax), ay = num(b.ay), bx = num(b.bx), by = num(b.by);
  if (!name) return error(400, "Wall name is required");
  if (!(length > 0)) return error(400, "Wall length must be greater than 0");
  if (ax == null || ay == null || bx == null || by == null) return error(400, "Invalid wall line");

  const wid = id("wall");
  const sort = nowMs();
  await env.DB.prepare(
    `INSERT INTO walls (id, room_id, name, length_inches, height_inches, ax, ay, bx, by, segments, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`
  ).bind(wid, room.id, name, length, height, ax, ay, bx, by, sort).run();
  return json({ wall: shapeWall({ id: wid, room_id: room.id, name, length_inches: length, height_inches: height, ax, ay, bx, by, segments: "[]", sort }) });
}

// GET /api/walls/:id
export async function getWall({ env, session, params }) {
  const w = await wallScoped(env, session, params.id);
  if (!w) return error(404, "Wall not found");
  const ctx = await env.DB.prepare(
    `SELECT r.name AS room_name, r.project_id, r.floorplan_id,
            p.name AS project_name, fp.name AS floorplan_name
       FROM rooms r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN floorplans fp ON fp.id = r.floorplan_id
      WHERE r.id = ?`
  ).bind(w.room_id).first();
  return json({
    wall: {
      ...shapeWall(w),
      room_name: ctx && ctx.room_name,
      project_id: ctx && ctx.project_id,
      project_name: ctx && ctx.project_name,
      floorplan_id: ctx && ctx.floorplan_id,
      floorplan_name: ctx && ctx.floorplan_name,
    },
  });
}

// PATCH /api/walls/:id  { name?, length_inches?, height_inches?, ax?,ay?,bx?,by?, segments? }
export async function updateWall({ env, session, params, request }) {
  const w = await wallScoped(env, session, params.id);
  if (!w) return error(404, "Wall not found");
  const b = (await readJson(request)) || {};

  const name = b.name !== undefined ? String(b.name).trim() : w.name;
  if (!name) return error(400, "Wall name cannot be empty");
  const length = b.length_inches !== undefined ? num(b.length_inches) : w.length_inches;
  if (!(length > 0)) return error(400, "Wall length must be greater than 0");
  const height = b.height_inches !== undefined ? (num(b.height_inches) || w.height_inches) : w.height_inches;
  const ax = b.ax !== undefined ? num(b.ax) : w.ax;
  const ay = b.ay !== undefined ? num(b.ay) : w.ay;
  const bx = b.bx !== undefined ? num(b.bx) : w.bx;
  const by = b.by !== undefined ? num(b.by) : w.by;

  let segments = w.segments;
  if (b.segments !== undefined) {
    const clean = parseSegments(JSON.stringify(b.segments))
      .map((s) => ({ start: Math.max(0, Math.min(length, s.start)), end: Math.max(0, Math.min(length, s.end)) }))
      .filter((s) => s.end - s.start > 0.01)
      .sort((a, c) => a.start - c.start);
    segments = JSON.stringify(clean);
  }

  await env.DB.prepare(
    `UPDATE walls SET name=?, length_inches=?, height_inches=?, ax=?, ay=?, bx=?, by=?, segments=? WHERE id=?`
  ).bind(name, length, height, ax, ay, bx, by, segments, w.id).run();

  return json({ wall: shapeWall({ ...w, name, length_inches: length, height_inches: height, ax, ay, bx, by, segments }) });
}

// DELETE /api/walls/:id
export async function deleteWall({ env, session, params }) {
  const w = await wallScoped(env, session, params.id);
  if (!w) return error(404, "Wall not found");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM placements WHERE wall_id = ?").bind(w.id),
    env.DB.prepare("DELETE FROM walls WHERE id = ?").bind(w.id),
  ]);
  return json({ ok: true });
}
