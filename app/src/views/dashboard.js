import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { crumbs } from "../store.js";
import { navigate } from "../router.js";

function fmtDate(ms) {
  try { return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
}

export function Dashboard() {
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function rename(p) {
    const next = prompt("Rename project", p.name);
    if (next == null || !next.trim() || next.trim() === p.name) return;
    await api.patch(`/api/projects/${p.id}`, { name: next.trim() });
    refresh();
  }

  async function remove(p) {
    if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    await api.del(`/api/projects/${p.id}`);
    refresh();
  }

  return html`
    <main>
      <div class="wrap">
        <div class="page-head flex between items-center">
          <h1 class="display" style="font-size:40px">Projects</h1>
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
              <div class="row" key=${p.id}>
                <div class="grow" style="cursor:pointer" onClick=${() => navigate(`/projects/${p.id}`)}>
                  <h3>${p.name}</h3>
                  <span class="mono muted">updated ${fmtDate(p.updated_at)}</span>
                </div>
                <button class="linkbtn muted" onClick=${() => rename(p)}>Rename</button>
                <button class="linkbtn muted" onClick=${() => remove(p)}>Delete</button>
                <button class="linkbtn" onClick=${() => navigate(`/projects/${p.id}`)}>Open</button>
              </div>
            `)}
          </div>
        `}
      </div>
    </main>
  `;
}
