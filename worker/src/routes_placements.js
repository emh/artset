import { json, error, readJson, randomId } from "./json.js";
import { wallScoped } from "./routes_walls.js";

const id = (p) => `${p}_${randomId(12)}`;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

async function placementScoped(env, session, placementId) {
  return env.DB.prepare(
    `SELECT pl.* FROM placements pl
       JOIN walls w ON w.id = pl.wall_id
       JOIN rooms r ON r.id = w.room_id
       JOIN projects p ON p.id = r.project_id
      WHERE pl.id = ? AND p.studio_id = ?`
  ).bind(placementId, session.studioId).first();
}

const shape = (p) => ({
  id: p.id, art_piece_id: p.art_piece_id, art_size_id: p.art_size_id, wall_id: p.wall_id,
  start_inches: p.start_inches, center_height_inches: p.center_height_inches,
  title: p.title, status: p.status, price: p.price,
  has_image: !!p.art_image_key, image_v: p.art_image_key || null,
  width_inches: p.width_inches, height_inches: p.height_inches, size_label: p.size_label,
});

const PLACEMENT_SELECT = `
  SELECT pl.*, a.title, a.image_key AS art_image_key, a.status, a.price,
         sz.width_inches, sz.height_inches, sz.label AS size_label
    FROM placements pl
    JOIN art_pieces a ON a.id = pl.art_piece_id
    JOIN art_sizes sz ON sz.id = pl.art_size_id`;

export async function listPlacementsForWall(env, wallId) {
  const { results } = await env.DB.prepare(`${PLACEMENT_SELECT} WHERE pl.wall_id = ? ORDER BY pl.start_inches`).bind(wallId).all();
  return results.map(shape);
}

// GET /api/walls/:id/placements
export async function listPlacements({ env, session, params }) {
  const wall = await wallScoped(env, session, params.id);
  if (!wall) return error(404, "Wall not found");
  return json({ placements: await listPlacementsForWall(env, wall.id) });
}

// POST /api/walls/:id/placements  { art_piece_id, art_size_id, start_inches, center_height_inches }
export async function createPlacement({ env, session, params, request }) {
  const wall = await wallScoped(env, session, params.id);
  if (!wall) return error(404, "Wall not found");
  const b = (await readJson(request)) || {};

  // verify the size belongs to a piece in the same project as the wall
  const size = await env.DB.prepare(
    `SELECT sz.id, sz.art_piece_id, sz.width_inches, sz.height_inches
       FROM art_sizes sz JOIN art_pieces a ON a.id = sz.art_piece_id
       JOIN rooms r ON r.project_id = a.project_id
      WHERE sz.id = ? AND a.id = ? AND r.id = ?`
  ).bind(b.art_size_id, b.art_piece_id, wall.room_id).first();
  if (!size) return error(400, "Invalid art piece or size for this project");

  const start = num(b.start_inches);
  if (start == null) return error(400, "Missing placement position");
  const center = num(b.center_height_inches) ?? Math.min(60, wall.height_inches * 0.55);

  // A piece can only live in one place — placing it again moves it.
  const pid = id("place");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM placements WHERE art_piece_id = ?").bind(b.art_piece_id),
    env.DB.prepare(
      `INSERT INTO placements (id, art_piece_id, art_size_id, wall_id, start_inches, center_height_inches)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(pid, b.art_piece_id, b.art_size_id, wall.id, start, center),
  ]);

  const row = await env.DB.prepare(`${PLACEMENT_SELECT} WHERE pl.id = ?`).bind(pid).first();
  return json({ placement: shape(row) });
}

// PATCH /api/placements/:id  { start_inches?, center_height_inches?, art_size_id? }
export async function updatePlacement({ env, session, params, request }) {
  const pl = await placementScoped(env, session, params.id);
  if (!pl) return error(404, "Placement not found");
  const b = (await readJson(request)) || {};
  const start = b.start_inches !== undefined ? num(b.start_inches) : pl.start_inches;
  const center = b.center_height_inches !== undefined ? num(b.center_height_inches) : pl.center_height_inches;
  let sizeId = pl.art_size_id;
  if (b.art_size_id !== undefined) {
    const ok = await env.DB.prepare("SELECT id FROM art_sizes WHERE id = ? AND art_piece_id = ?")
      .bind(b.art_size_id, pl.art_piece_id).first();
    if (!ok) return error(400, "Invalid size");
    sizeId = b.art_size_id;
  }
  await env.DB.prepare("UPDATE placements SET start_inches = ?, center_height_inches = ?, art_size_id = ? WHERE id = ?")
    .bind(start, center, sizeId, pl.id).run();
  const row = await env.DB.prepare(`${PLACEMENT_SELECT} WHERE pl.id = ?`).bind(pl.id).first();
  return json({ placement: shape(row) });
}

// DELETE /api/placements/:id
export async function deletePlacement({ env, session, params }) {
  const pl = await placementScoped(env, session, params.id);
  if (!pl) return error(404, "Placement not found");
  await env.DB.prepare("DELETE FROM placements WHERE id = ?").bind(pl.id).run();
  return json({ ok: true });
}
