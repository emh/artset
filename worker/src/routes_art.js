import { json, error, readJson, randomId, nowMs } from "./json.js";
import { loadProject } from "./routes_projects.js";

const id = (p) => `${p}_${randomId(12)}`;
const num = (v) => (v === null || v === undefined || v === "" ? null : (isFinite(Number(v)) ? Number(v) : null));
const MAX_BYTES = 15 * 1024 * 1024;

async function artScoped(env, session, artId) {
  return env.DB.prepare(
    "SELECT a.* FROM art_pieces a JOIN projects p ON p.id = a.project_id WHERE a.id = ? AND p.studio_id = ?"
  ).bind(artId, session.studioId).first();
}

function cleanSizes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({ width_inches: num(s.width_inches ?? s.width), height_inches: num(s.height_inches ?? s.height), label: (s.label || "").toString().trim() || null }))
    .filter((s) => s.width_inches > 0 && s.height_inches > 0);
}

const shapeArt = (a, sizes, placed) => ({
  id: a.id, project_id: a.project_id, title: a.title, artist: a.artist, medium: a.medium,
  price: a.price, status: a.status, has_image: !!a.image_key, image_v: a.image_key || null, created_at: a.created_at,
  sizes: sizes || [],
  placed: placed || null,   // { wall_id, wall_name, room_name } when placed, else null
});

async function sizesFor(env, artIds) {
  if (!artIds.length) return new Map();
  const placeholders = artIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, art_piece_id, width_inches, height_inches, label FROM art_sizes WHERE art_piece_id IN (${placeholders}) ORDER BY rowid ASC`
  ).bind(...artIds).all();
  const map = new Map();
  for (const s of results) {
    if (!map.has(s.art_piece_id)) map.set(s.art_piece_id, []);
    map.get(s.art_piece_id).push({ id: s.id, width_inches: s.width_inches, height_inches: s.height_inches, label: s.label });
  }
  return map;
}

// GET /api/projects/:id/art
export async function listArt({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const { results } = await env.DB.prepare(
    "SELECT * FROM art_pieces WHERE project_id = ? ORDER BY created_at DESC"
  ).bind(project.id).all();
  const sizeMap = await sizesFor(env, results.map((a) => a.id));
  const placedRows = (await env.DB.prepare(
    `SELECT pl.art_piece_id, pl.wall_id, w.name AS wall_name, r.name AS room_name
       FROM placements pl JOIN walls w ON w.id = pl.wall_id JOIN rooms r ON r.id = w.room_id
      WHERE r.project_id = ?`
  ).bind(project.id).all()).results;
  const placedMap = new Map(placedRows.map((p) => [p.art_piece_id, { wall_id: p.wall_id, wall_name: p.wall_name, room_name: p.room_name }]));
  return json({ art: results.map((a) => shapeArt(a, sizeMap.get(a.id), placedMap.get(a.id))) });
}

// POST /api/projects/:id/art  { title, artist, medium, price, sizes:[{width,height,label}] }
export async function createArt({ env, session, params, request }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const b = (await readJson(request)) || {};
  const title = String(b.title || "").trim();
  if (!title) return error(400, "Title is required");
  const sizes = cleanSizes(b.sizes);
  if (!sizes.length) return error(400, "Add at least one size (width × height)");

  const aid = id("art");
  const now = nowMs();
  const stmts = [
    env.DB.prepare(
      "INSERT INTO art_pieces (id, project_id, title, artist, medium, image_key, price, status, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)"
    ).bind(aid, project.id, title, String(b.artist || "").trim() || null, String(b.medium || "").trim() || null,
      num(b.price), String(b.status || "Selected"), now),
  ];
  const outSizes = [];
  for (const s of sizes) {
    const sid = id("size");
    outSizes.push({ id: sid, ...s });
    stmts.push(env.DB.prepare(
      "INSERT INTO art_sizes (id, art_piece_id, width_inches, height_inches, label) VALUES (?, ?, ?, ?, ?)"
    ).bind(sid, aid, s.width_inches, s.height_inches, s.label));
  }
  await env.DB.batch(stmts);
  return json({ art: shapeArt({ id: aid, project_id: project.id, title, artist: b.artist || null, medium: b.medium || null, price: num(b.price), status: "Selected", image_key: null, created_at: now }, outSizes) });
}

// GET /api/art/:id
export async function getArt({ env, session, params }) {
  const a = await artScoped(env, session, params.id);
  if (!a) return error(404, "Art piece not found");
  const sizeMap = await sizesFor(env, [a.id]);
  return json({ art: shapeArt(a, sizeMap.get(a.id)) });
}

// PATCH /api/art/:id  { title?, artist?, medium?, price?, status?, sizes? }
export async function updateArt({ env, session, params, request }) {
  const a = await artScoped(env, session, params.id);
  if (!a) return error(404, "Art piece not found");
  const b = (await readJson(request)) || {};
  const title = b.title !== undefined ? String(b.title).trim() : a.title;
  if (!title) return error(400, "Title cannot be empty");
  const artist = b.artist !== undefined ? (String(b.artist).trim() || null) : a.artist;
  const medium = b.medium !== undefined ? (String(b.medium).trim() || null) : a.medium;
  const price = b.price !== undefined ? num(b.price) : a.price;
  const status = b.status !== undefined ? String(b.status) : a.status;

  const stmts = [
    env.DB.prepare("UPDATE art_pieces SET title=?, artist=?, medium=?, price=?, status=? WHERE id=?")
      .bind(title, artist, medium, price, status, a.id),
  ];
  let outSizes = null;
  if (b.sizes !== undefined) {
    const sizes = cleanSizes(b.sizes);
    if (!sizes.length) return error(400, "Add at least one size");
    stmts.push(env.DB.prepare("DELETE FROM art_sizes WHERE art_piece_id = ?").bind(a.id));
    outSizes = [];
    for (const s of sizes) {
      const sid = id("size");
      outSizes.push({ id: sid, ...s });
      stmts.push(env.DB.prepare("INSERT INTO art_sizes (id, art_piece_id, width_inches, height_inches, label) VALUES (?, ?, ?, ?, ?)")
        .bind(sid, a.id, s.width_inches, s.height_inches, s.label));
    }
  }
  await env.DB.batch(stmts);
  if (!outSizes) outSizes = (await sizesFor(env, [a.id])).get(a.id) || [];
  return json({ art: shapeArt({ ...a, title, artist, medium, price, status }, outSizes) });
}

// DELETE /api/art/:id
export async function deleteArt({ env, session, params }) {
  const a = await artScoped(env, session, params.id);
  if (!a) return error(404, "Art piece not found");
  if (a.image_key) await env.BUCKET.delete(a.image_key).catch(() => {});
  await env.DB.batch([
    env.DB.prepare("DELETE FROM placements WHERE art_piece_id = ?").bind(a.id),
    env.DB.prepare("DELETE FROM art_sizes WHERE art_piece_id = ?").bind(a.id),
    env.DB.prepare("DELETE FROM art_pieces WHERE id = ?").bind(a.id),
  ]);
  return json({ ok: true });
}

// POST /api/art/:id/image  (multipart: image)
export async function uploadArtImage({ env, session, params, request }) {
  const a = await artScoped(env, session, params.id);
  if (!a) return error(404, "Art piece not found");
  const form = await request.formData().catch(() => null);
  if (!form) return error(400, "Expected multipart form data");
  const file = form.get("image");
  if (!file || typeof file === "string") return error(400, "No image file");
  if (!String(file.type || "").startsWith("image/")) return error(400, "File must be an image");
  if (file.size > MAX_BYTES) return error(413, "Image is too large (max 15 MB)");

  const key = `art/${a.project_id}/${a.id}/${randomId(8)}`;
  if (a.image_key) await env.BUCKET.delete(a.image_key).catch(() => {});
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await env.DB.prepare("UPDATE art_pieces SET image_key = ? WHERE id = ?").bind(key, a.id).run();
  return json({ ok: true, has_image: true });
}

// GET /api/art/:id/image
export async function getArtImage({ env, session, params }) {
  const a = await artScoped(env, session, params.id);
  if (!a) return error(404, "Art piece not found");
  if (!a.image_key) return error(404, "No image");
  const obj = await env.BUCKET.get(a.image_key);
  if (!obj) return error(404, "Image missing");
  return new Response(obj.body, {
    headers: {
      "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}
