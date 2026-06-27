import { json, error, randomId } from "./json.js";
import { loadProject } from "./routes_projects.js";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// POST /api/projects/:id/floorplan   (multipart: image, width, height)
export async function uploadFloorplan({ env, session, params, request }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");

  const form = await request.formData().catch(() => null);
  if (!form) return error(400, "Expected multipart form data");
  const file = form.get("image");
  const width = parseInt(form.get("width"), 10);
  const height = parseInt(form.get("height"), 10);

  if (!file || typeof file === "string") return error(400, "No image file");
  if (!String(file.type || "").startsWith("image/")) return error(400, "File must be an image");
  if (file.size > MAX_BYTES) return error(413, "Image is too large (max 15 MB)");
  if (!(width > 0) || !(height > 0)) return error(400, "Missing image dimensions");

  const key = `floorplans/${project.id}/${randomId(8)}`;
  const buf = await file.arrayBuffer();

  // One plan per project: remove any existing one first.
  const old = await env.DB.prepare("SELECT id, image_key FROM floorplans WHERE project_id = ?")
    .bind(project.id).first();
  if (old) {
    await env.BUCKET.delete(old.image_key).catch(() => {});
    await env.DB.prepare("DELETE FROM floorplans WHERE id = ?").bind(old.id).run();
  }

  await env.BUCKET.put(key, buf, { httpMetadata: { contentType: file.type } });
  const fpId = `fp_${randomId(10)}`;
  await env.DB.prepare(
    "INSERT INTO floorplans (id, project_id, image_key, width_px, height_px) VALUES (?, ?, ?, ?, ?)"
  ).bind(fpId, project.id, key, width, height).run();

  return json({ floorplan: { id: fpId, image_key: key, width_px: width, height_px: height } });
}

// GET /api/projects/:id/plan-image  -> streams the plan image from R2
export async function getPlanImage({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const fp = await env.DB.prepare("SELECT image_key FROM floorplans WHERE project_id = ?")
    .bind(project.id).first();
  if (!fp) return error(404, "No floor plan");
  const obj = await env.BUCKET.get(fp.image_key);
  if (!obj) return error(404, "Image missing");
  return new Response(obj.body, {
    headers: {
      "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}

// DELETE /api/projects/:id/floorplan
// Removes the uploaded plan and all plan-derived room/wall/placement data.
export async function deleteFloorplan({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");

  const fp = await env.DB.prepare("SELECT id, image_key FROM floorplans WHERE project_id = ?")
    .bind(project.id).first();
  if (fp) await env.BUCKET.delete(fp.image_key).catch(() => {});

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
