import { json, error, randomId, nowMs } from "./json.js";
import { loadProject } from "./routes_projects.js";

function parseSegments(s) {
  try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}

const PLACEMENT_COLS = `pl.id, pl.art_piece_id, pl.art_size_id, pl.wall_id, pl.start_inches, pl.center_height_inches,
  a.title, a.image_key AS art_image_key, a.status, a.price, sz.width_inches, sz.height_inches, sz.label AS size_label`;

// Assemble the full read-only project tree (used by both authed review and public share).
export async function buildReview(env, project) {
  const studio = await env.DB.prepare("SELECT name FROM studios WHERE id = ?").bind(project.studio_id).first();
  const floorplans = (await env.DB.prepare(
    "SELECT id, name, image_key, width_px, height_px FROM floorplans WHERE project_id = ? ORDER BY rowid"
  ).bind(project.id).all()).results;
  const floorplan = floorplans[0] || null;
  const rooms = (await env.DB.prepare("SELECT * FROM rooms WHERE project_id = ? ORDER BY sort").bind(project.id).all()).results;
  const walls = (await env.DB.prepare(
    "SELECT w.* FROM walls w JOIN rooms r ON r.id = w.room_id WHERE r.project_id = ? ORDER BY w.sort"
  ).bind(project.id).all()).results;
  const placements = (await env.DB.prepare(
    `SELECT ${PLACEMENT_COLS} FROM placements pl
       JOIN art_pieces a ON a.id = pl.art_piece_id
       JOIN art_sizes sz ON sz.id = pl.art_size_id
       JOIN walls w ON w.id = pl.wall_id
       JOIN rooms r ON r.id = w.room_id
      WHERE r.project_id = ? ORDER BY pl.start_inches`
  ).bind(project.id).all()).results;
  const pieces = (await env.DB.prepare("SELECT * FROM art_pieces WHERE project_id = ? ORDER BY created_at DESC").bind(project.id).all()).results;
  const sizes = (await env.DB.prepare(
    "SELECT s.* FROM art_sizes s JOIN art_pieces a ON a.id = s.art_piece_id WHERE a.project_id = ? ORDER BY s.rowid"
  ).bind(project.id).all()).results;

  const placeByWall = new Map();
  for (const p of placements) {
    if (!placeByWall.has(p.wall_id)) placeByWall.set(p.wall_id, []);
    placeByWall.get(p.wall_id).push({
      id: p.id, art_piece_id: p.art_piece_id, title: p.title, status: p.status, price: p.price,
      has_image: !!p.art_image_key, image_v: p.art_image_key || null,
      start_inches: p.start_inches, center_height_inches: p.center_height_inches,
      width_inches: p.width_inches, height_inches: p.height_inches, size_label: p.size_label,
    });
  }
  const wallsByRoom = new Map();
  for (const w of walls) {
    if (!wallsByRoom.has(w.room_id)) wallsByRoom.set(w.room_id, []);
    wallsByRoom.get(w.room_id).push({
      id: w.id, name: w.name, length_inches: w.length_inches, height_inches: w.height_inches,
      ax: w.ax, ay: w.ay, bx: w.bx, by: w.by, segments: parseSegments(w.segments),
      placements: placeByWall.get(w.id) || [],
    });
  }
  const sizeByPiece = new Map();
  for (const s of sizes) {
    if (!sizeByPiece.has(s.art_piece_id)) sizeByPiece.set(s.art_piece_id, []);
    sizeByPiece.get(s.art_piece_id).push({ id: s.id, width_inches: s.width_inches, height_inches: s.height_inches, label: s.label });
  }

  const roomTree = rooms.map((r) => ({
    id: r.id, floorplan_id: r.floorplan_id, name: r.name, rect_x: r.rect_x, rect_y: r.rect_y, rect_w: r.rect_w, rect_h: r.rect_h,
    walls: wallsByRoom.get(r.id) || [],
  }));
  const art = pieces.map((a) => ({
    id: a.id, title: a.title, artist: a.artist, medium: a.medium, price: a.price, status: a.status,
    has_image: !!a.image_key, image_v: a.image_key || null, sizes: sizeByPiece.get(a.id) || [],
  }));

  const placedValue = placements.reduce((s, p) => s + (p.price || 0), 0);
  const summary = {
    rooms: rooms.length,
    walls: walls.length,
    pieces: pieces.length,
    placed: placements.length,
    pendingApproval: pieces.filter((p) => p.status === "Pending approval").length,
    placedValue,
  };

  return {
    project: { id: project.id, name: project.name },
    studio: { name: studio ? studio.name : "" },
    floorplan: floorplan ? {
      id: floorplan.id, name: floorplan.name, width_px: floorplan.width_px, height_px: floorplan.height_px,
      image_key: floorplan.image_key, v: floorplan.image_key,
    } : null,
    floorplans: floorplans.map((fp) => ({
      id: fp.id, name: fp.name, width_px: fp.width_px, height_px: fp.height_px,
      image_key: fp.image_key, v: fp.image_key,
    })),
    rooms: roomTree, art, summary,
  };
}

// GET /api/projects/:id/review
export async function getReview({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const data = await buildReview(env, project);
  const share = await env.DB.prepare("SELECT token FROM share_links WHERE project_id = ? LIMIT 1").bind(project.id).first();
  return json({ ...data, share: share ? share.token : null });
}

// POST /api/projects/:id/share  -> mint (or return existing) token
export async function createShare({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  let row = await env.DB.prepare("SELECT token FROM share_links WHERE project_id = ? LIMIT 1").bind(project.id).first();
  if (!row) {
    const token = randomId(16);
    await env.DB.prepare("INSERT INTO share_links (id, project_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, NULL)")
      .bind(`share_${randomId(8)}`, project.id, token, nowMs()).run();
    row = { token };
  }
  return json({ token: row.token });
}

// DELETE /api/projects/:id/share  -> revoke
export async function deleteShare({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  await env.DB.prepare("DELETE FROM share_links WHERE project_id = ?").bind(project.id).run();
  return json({ ok: true });
}

// --- public (no auth) via share token ---
async function projectForToken(env, token) {
  return env.DB.prepare(
    "SELECT p.* FROM projects p JOIN share_links s ON s.project_id = p.id WHERE s.token = ?"
  ).bind(token).first();
}

// GET /api/public/:token
export async function getPublicReview({ env, params }) {
  const project = await projectForToken(env, params.token);
  if (!project) return error(404, "Not found");
  return json(await buildReview(env, project));
}

// GET /api/public/:token/plan-image
export async function getPublicPlanImage({ env, params }) {
  const project = await projectForToken(env, params.token);
  if (!project) return error(404, "Not found");
  const fp = await env.DB.prepare("SELECT image_key FROM floorplans WHERE project_id = ? ORDER BY rowid").bind(project.id).first();
  if (!fp) return error(404, "No floor plan");
  const obj = await env.BUCKET.get(fp.image_key);
  if (!obj) return error(404, "Image missing");
  return new Response(obj.body, { headers: { "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream", "cache-control": "public, max-age=3600" } });
}

// GET /api/public/:token/floorplans/:floorplanId/image
export async function getPublicFloorplanImage({ env, params }) {
  const project = await projectForToken(env, params.token);
  if (!project) return error(404, "Not found");
  const fp = await env.DB.prepare("SELECT image_key FROM floorplans WHERE id = ? AND project_id = ?")
    .bind(params.floorplanId, project.id).first();
  if (!fp) return error(404, "No floor plan");
  const obj = await env.BUCKET.get(fp.image_key);
  if (!obj) return error(404, "Image missing");
  return new Response(obj.body, { headers: { "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream", "cache-control": "public, max-age=3600" } });
}

// GET /api/public/:token/art/:artId/image
export async function getPublicArtImage({ env, params }) {
  const project = await projectForToken(env, params.token);
  if (!project) return error(404, "Not found");
  const a = await env.DB.prepare("SELECT image_key FROM art_pieces WHERE id = ? AND project_id = ?")
    .bind(params.artId, project.id).first();
  if (!a || !a.image_key) return error(404, "No image");
  const obj = await env.BUCKET.get(a.image_key);
  if (!obj) return error(404, "Image missing");
  return new Response(obj.body, { headers: { "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream", "cache-control": "public, max-age=3600" } });
}
