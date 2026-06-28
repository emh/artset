import { json, error, readJson, randomId } from "./json.js";
import { loadProject } from "./routes_projects.js";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function loadFloorplan(env, session, projectId, floorplanId) {
  const project = await loadProject(env, session, projectId);
  if (!project) return null;
  const floorplan = await env.DB.prepare(
    "SELECT id, project_id, name, image_key, width_px, height_px FROM floorplans WHERE id = ? AND project_id = ?"
  ).bind(floorplanId, project.id).first();
  return floorplan ? { project, floorplan } : null;
}

function shapeFloorplan(fp) {
  return {
    id: fp.id,
    name: fp.name || "Floor plan",
    image_key: fp.image_key,
    width_px: fp.width_px,
    height_px: fp.height_px,
    room_count: fp.room_count || 0,
  };
}

// GET /api/projects/:id/floorplans
export async function listFloorplans({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const { results } = await env.DB.prepare(
    `SELECT fp.id, fp.name, fp.image_key, fp.width_px, fp.height_px,
            (SELECT COUNT(*) FROM rooms r WHERE r.floorplan_id = fp.id) AS room_count
       FROM floorplans fp
      WHERE fp.project_id = ?
      ORDER BY fp.rowid ASC`
  ).bind(project.id).all();
  return json({ floorplans: results.map(shapeFloorplan) });
}

// GET /api/projects/:id/floorplans/:floorplanId
export async function getFloorplan({ env, session, params }) {
  const loaded = await loadFloorplan(env, session, params.id, params.floorplanId);
  if (!loaded) return error(404, "Floor plan not found");
  return json({ floorplan: shapeFloorplan(loaded.floorplan) });
}

// PATCH /api/projects/:id/floorplans/:floorplanId  { name }
export async function updateFloorplan({ env, session, params, request }) {
  const loaded = await loadFloorplan(env, session, params.id, params.floorplanId);
  if (!loaded) return error(404, "Floor plan not found");
  const body = (await readJson(request)) || {};
  const name = String(body.name || "").trim();
  if (!name) return error(400, "Floor plan name is required");
  await env.DB.prepare("UPDATE floorplans SET name = ? WHERE id = ?").bind(name, loaded.floorplan.id).run();
  return json({ floorplan: shapeFloorplan({ ...loaded.floorplan, name }) });
}

// POST /api/projects/:id/floorplans   (multipart: image, width, height)
export async function uploadFloorplan({ env, session, params, request }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");

  const form = await request.formData().catch(() => null);
  if (!form) return error(400, "Expected multipart form data");
  const file = form.get("image");
  const width = parseInt(form.get("width"), 10);
  const height = parseInt(form.get("height"), 10);
  const name = String(form.get("name") || "").trim() || "Floor plan";

  if (!file || typeof file === "string") return error(400, "No image file");
  if (!String(file.type || "").startsWith("image/")) return error(400, "File must be an image");
  if (file.size > MAX_BYTES) return error(413, "Image is too large (max 15 MB)");
  if (!(width > 0) || !(height > 0)) return error(400, "Missing image dimensions");

  const key = `floorplans/${project.id}/${randomId(8)}`;
  const buf = await file.arrayBuffer();

  await env.BUCKET.put(key, buf, { httpMetadata: { contentType: file.type } });
  const fpId = `fp_${randomId(10)}`;
  await env.DB.prepare(
    "INSERT INTO floorplans (id, project_id, name, image_key, width_px, height_px) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(fpId, project.id, name, key, width, height).run();

  return json({ floorplan: { id: fpId, name, image_key: key, width_px: width, height_px: height, room_count: 0 } });
}

async function streamImage(env, imageKey, cacheControl = "private, max-age=3600") {
  const obj = await env.BUCKET.get(imageKey);
  if (!obj) return error(404, "Image missing");
  return new Response(obj.body, {
    headers: {
      "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      "cache-control": cacheControl,
    },
  });
}

// GET /api/projects/:id/floorplans/:floorplanId/image
export async function getFloorplanImage({ env, session, params }) {
  const loaded = await loadFloorplan(env, session, params.id, params.floorplanId);
  if (!loaded) return error(404, "Floor plan not found");
  return streamImage(env, loaded.floorplan.image_key);
}

// GET /api/projects/:id/plan-image  -> streams the first plan image from R2 (legacy/compat)
export async function getPlanImage({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const fp = await env.DB.prepare("SELECT image_key FROM floorplans WHERE project_id = ?")
    .bind(project.id).first();
  if (!fp) return error(404, "No floor plan");
  return streamImage(env, fp.image_key);
}

// DELETE /api/projects/:id/floorplans/:floorplanId
// Removes one uploaded plan and the rooms/walls/placements drawn on that plan.
export async function deleteFloorplan({ env, session, params }) {
  const loaded = await loadFloorplan(env, session, params.id, params.floorplanId);
  if (!loaded) return error(404, "Floor plan not found");
  const { floorplan } = loaded;
  await env.BUCKET.delete(floorplan.image_key).catch(() => {});

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM placements
        WHERE wall_id IN (
          SELECT w.id FROM walls w JOIN rooms r ON r.id = w.room_id WHERE r.floorplan_id = ?
        )`
    ).bind(floorplan.id),
    env.DB.prepare("DELETE FROM walls WHERE room_id IN (SELECT id FROM rooms WHERE floorplan_id = ?)").bind(floorplan.id),
    env.DB.prepare("DELETE FROM rooms WHERE floorplan_id = ?").bind(floorplan.id),
    env.DB.prepare("DELETE FROM floorplans WHERE id = ?").bind(floorplan.id),
  ]);

  return json({ ok: true });
}

// DELETE /api/projects/:id/floorplan (legacy) removes all plans for the project.
export async function deleteProjectFloorplans({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");

  const { results } = await env.DB.prepare("SELECT id, image_key FROM floorplans WHERE project_id = ?")
    .bind(project.id).all();
  for (const fp of results) await env.BUCKET.delete(fp.image_key).catch(() => {});

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM placements
        WHERE wall_id IN (
          SELECT w.id FROM walls w JOIN rooms r ON r.id = w.room_id WHERE r.project_id = ?
        )`
    ).bind(project.id),
    env.DB.prepare("DELETE FROM walls WHERE room_id IN (SELECT id FROM rooms WHERE project_id = ?)").bind(project.id),
    env.DB.prepare("DELETE FROM rooms WHERE project_id = ?").bind(project.id),
    env.DB.prepare("DELETE FROM floorplans WHERE project_id = ?").bind(project.id),
  ]);

  return json({ ok: true });
}
