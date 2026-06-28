import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { crumbs } from "../store.js";
import { navigate } from "../router.js";

const projectStats = (p) => [
  countLabel(p.plan_count, "plan"),
  countLabel(p.room_count, "room"),
  countLabel(p.wall_count, "wall"),
  countLabel(p.art_count, "art piece"),
];

function fmtDate(ms) {
  try { return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
}

function countLabel(n, singular, plural = `${singular}s`) {
  const value = Number(n) || 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

export function Dashboard() {
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);

  async function refresh() {
    const { projects } = await api.get("/api/projects");
    setProjects(projects);
  }
  useEffect(() => { crumbs.value = []; refresh(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { project } = await api.post("/api/projects", { name: name.trim() });
      navigate(`/projects/${project.id}`);
    } finally { setBusy(false); }
  }

  function openRename(p) {
    setRenameName(p.name);
    setDialog({ type: "rename", project: p });
  }

  function closeDialog() {
    if (dialogBusy) return;
    setDialog(null);
    setRenameName("");
  }

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog, dialogBusy]);

  async function submitRename(e) {
    e.preventDefault();
    if (!dialog || dialog.type !== "rename") return;
    const next = renameName.trim();
    if (!next || next === dialog.project.name) return closeDialog();
    setDialogBusy(true);
    try {
      await api.patch(`/api/projects/${dialog.project.id}`, { name: next });
      await refresh();
      setDialog(null);
      setRenameName("");
    } finally { setDialogBusy(false); }
  }

  async function confirmDelete() {
    if (!dialog || dialog.type !== "delete") return;
    setDialogBusy(true);
    try {
      await api.del(`/api/projects/${dialog.project.id}`);
      await refresh();
      setDialog(null);
      setRenameName("");
    } finally { setDialogBusy(false); }
  }

  return html`
    <main>
      <div class="wrap">
        <div class="page-head flex items-center" style="justify-content:flex-end">
          ${!creating && html`<button class="btn" onClick=${() => setCreating(true)}>New project</button>`}
        </div>

        ${creating && html`
          <form class="card" style="margin-bottom:36px" onSubmit=${create}>
            <label class="field" style="margin-bottom:20px">
              <span class="label">Project name</span>
              <input class="input" name="project-name" autocomplete="off" autofocus value=${name} onInput=${(e) => setName(e.target.value)} placeholder="West Point Grey Residence" />
            </label>
            <div class="flex gap-sm">
              <button class="btn" type="submit" disabled=${busy || !name.trim()}>Create</button>
              <button class="btn btn--ghost" type="button" onClick=${() => { setCreating(false); setName(""); }}>Cancel</button>
            </div>
          </form>
        `}

        ${projects === null && html`<p class="spinner">Loading…</p>`}
        ${projects && projects.length === 0 && !creating && html`
          <div class="empty">
            <p>No projects yet.</p>
            <p class="mt-md"><button class="linkbtn" onClick=${() => setCreating(true)}>Create your first project</button></p>
          </div>
        `}

        ${projects && projects.length > 0 && html`
          <div class="rows">
            ${projects.map((p) => html`
              <div class="row project-row" key=${p.id}>
                <div class="grow" style="cursor:pointer" onClick=${() => navigate(`/projects/${p.id}`)}>
                  <h3>${p.name}</h3>
                  <span class="project-stats mono muted">
                    ${projectStats(p).map((stat, i) => html`
                      ${i > 0 && html`<span class="stat-sep">·</span>`}
                      <span>${stat}</span>
                    `)}
                    <span class="stat-sep">·</span>
                    <span>updated ${fmtDate(p.updated_at)}</span>
                  </span>
                </div>
                <button class="linkbtn muted" onClick=${() => openRename(p)}>Rename</button>
                <button class="linkbtn muted" onClick=${() => setDialog({ type: "delete", project: p })}>Delete</button>
                <button class="linkbtn" onClick=${() => navigate(`/projects/${p.id}`)}>Open</button>
              </div>
            `)}
          </div>
        `}
      </div>

      ${dialog && html`
        <div class="modal-backdrop" role="presentation" onClick=${closeDialog}>
          <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" onClick=${(e) => e.stopPropagation()}>
            ${dialog.type === "rename" && html`
              <form onSubmit=${submitRename}>
                <div class="eyebrow">Project</div>
                <h2 id="project-dialog-title">Rename project</h2>
                <label class="field" style="margin-top:24px">
                  <span class="label">Project name</span>
                  <input class="input" name="rename-project" autocomplete="off" autofocus value=${renameName} onInput=${(e) => setRenameName(e.target.value)} />
                </label>
                <div class="modal-actions">
                  <button class="btn" type="submit" disabled=${dialogBusy || !renameName.trim()}>Save</button>
                  <button class="btn btn--ghost" type="button" disabled=${dialogBusy} onClick=${closeDialog}>Cancel</button>
                </div>
              </form>
            `}
            ${dialog.type === "delete" && html`
              <div>
                <div class="eyebrow">Project</div>
                <h2 id="project-dialog-title">Delete project</h2>
                <p class="modal-copy">Delete “${dialog.project.name}”? This will remove its floor plan, rooms, walls, art, placements, and share link.</p>
                <div class="modal-actions">
                  <button class="btn btn--danger" type="button" disabled=${dialogBusy} onClick=${confirmDelete}>Delete</button>
                  <button class="btn btn--ghost" type="button" disabled=${dialogBusy} onClick=${closeDialog}>Cancel</button>
                </div>
              </div>
            `}
          </div>
        </div>
      `}
    </main>
  `;
}
