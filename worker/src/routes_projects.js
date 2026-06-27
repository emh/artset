import { json, error, readJson, randomId, nowMs } from "./json.js";

const id = (prefix) => `${prefix}_${randomId(12)}`;

function parseMeta(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cleanMeta(raw, fallback) {
  const base = fallback ? parseMeta(fallback) : {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  return { ...base, ...raw };
}

function shapeProject(p) {
  return { ...p, metadata: parseMeta(p.metadata_json) };
}

// GET /api/projects  -> studio's projects
export async function listProjects({ env, session }) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.status, p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM rooms r WHERE r.project_id = p.id) AS room_count,
            (SELECT COUNT(*) FROM walls w JOIN rooms r ON r.id = w.room_id WHERE r.project_id = p.id) AS wall_count,
            (SELECT COUNT(*) FROM art_pieces a WHERE a.project_id = p.id) AS art_count
       FROM projects p
      WHERE p.studio_id = ?
      ORDER BY p.updated_at DESC`
  ).bind(session.studioId).all();
  return json({ projects: results });
}

// POST /api/projects  { name }
export async function createProject({ env, session, request }) {
  const body = await readJson(request);
  const name = String((body && body.name) || "").trim();
  if (!name) return error(400, "Project name is required");
  const pid = id("proj");
  const now = nowMs();
  await env.DB.prepare(
    "INSERT INTO projects (id, studio_id, name, status, created_at, updated_at, metadata_json) VALUES (?, ?, ?, 'active', ?, ?, '{}')"
  ).bind(pid, session.studioId, name, now, now).run();
  return json({ project: { id: pid, name, status: "active", created_at: now, updated_at: now, metadata: {} } });
}

// Helper: load a project scoped to the caller's studio (tenancy guard).
export async function loadProject(env, session, pid) {
  return env.DB.prepare(
    "SELECT id, studio_id, name, status, created_at, updated_at, metadata_json FROM projects WHERE id = ? AND studio_id = ?"
  ).bind(pid, session.studioId).first();
}

// GET /api/projects/:id
export async function getProject({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const floorplan = await env.DB.prepare(
    "SELECT id, image_key, width_px, height_px FROM floorplans WHERE project_id = ?"
  ).bind(project.id).first();
  return json({ project: shapeProject(project), floorplan: floorplan || null });
}

// PATCH /api/projects/:id  { name?, status?, metadata? }
export async function updateProject({ env, session, params, request }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  const body = await readJson(request) || {};
  const name = body.name !== undefined ? String(body.name).trim() : project.name;
  const status = body.status !== undefined ? String(body.status) : project.status;
  if (!name) return error(400, "Project name cannot be empty");
  const metadataJson = JSON.stringify(body.metadata !== undefined ? cleanMeta(body.metadata, project.metadata_json) : parseMeta(project.metadata_json));
  const now = nowMs();
  await env.DB.prepare("UPDATE projects SET name = ?, status = ?, metadata_json = ?, updated_at = ? WHERE id = ?")
    .bind(name, status, metadataJson, now, project.id).run();
  return json({ project: shapeProject({ ...project, name, status, metadata_json: metadataJson, updated_at: now }) });
}

// DELETE /api/projects/:id
export async function deleteProject({ env, session, params }) {
  const project = await loadProject(env, session, params.id);
  if (!project) return error(404, "Project not found");
  // children cascade via FK (PRAGMA foreign_keys is ON per-statement in D1? be explicit)
  await env.DB.batch([
    env.DB.prepare("DELETE FROM placements WHERE art_piece_id IN (SELECT id FROM art_pieces WHERE project_id = ?)").bind(project.id),
    env.DB.prepare("DELETE FROM art_sizes WHERE art_piece_id IN (SELECT id FROM art_pieces WHERE project_id = ?)").bind(project.id),
    env.DB.prepare("DELETE FROM art_pieces WHERE project_id = ?").bind(project.id),
    env.DB.prepare("DELETE FROM walls WHERE room_id IN (SELECT id FROM rooms WHERE project_id = ?)").bind(project.id),
    env.DB.prepare("DELETE FROM rooms WHERE project_id = ?").bind(project.id),
    env.DB.prepare("DELETE FROM floorplans WHERE project_id = ?").bind(project.id),
    env.DB.prepare("DELETE FROM share_links WHERE project_id = ?").bind(project.id),
    env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(project.id),
  ]);
  return json({ ok: true });
}
