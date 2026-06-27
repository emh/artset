import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { crumbs } from "../store.js";
import { PlanUploader } from "../components/plan-uploader.js";
import { RoomEditor } from "../components/room-editor.js";
import { ProjectNav } from "../components/project-nav.js";

export function ProjectView({ id }) {
  const [project, setProject] = useState(null);
  const [floorplan, setFloorplan] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    api.get(`/api/projects/${id}`)
      .then((d) => { if (!alive) return; setProject(d.project); setFloorplan(d.floorplan); setLoaded(true);
        crumbs.value = [{ label: d.project.name, href: `/projects/${id}` }]; })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [id]);

  if (err) return html`<main><div class="wrap"><div class="empty">
    <p>${err}</p><p class="mt-md"><a class="linkbtn" href="/" data-link>Back to projects</a></p>
  </div></div></main>`;

  if (!loaded) return html`<main><div class="wrap"><p class="spinner">Loading…</p></div></main>`;

  const showUploader = !floorplan || replacing;

  return html`
    <main>
      <div class="wrap">
        <${ProjectNav} projectId=${id} projectName=${project.name} active="plan" />
        <hr class="rule" />
        <div class="mt-lg">
          ${showUploader && html`
            <div style="max-width:620px">
              <div class="eyebrow" style="margin-bottom:16px">${floorplan ? "Replace floor plan" : "Upload floor plan"}</div>
              <${PlanUploader} projectId=${id} onUploaded=${(fp) => { setFloorplan(fp); setReplacing(false); }} />
              ${replacing && html`<p style="margin-top:14px"><button class="linkbtn muted" onClick=${() => setReplacing(false)}>Cancel</button></p>`}
            </div>
          `}
          ${!showUploader && html`
            <${RoomEditor} projectId=${id} floorplan=${floorplan} onReplacePlan=${() => setReplacing(true)} />
          `}
        </div>
      </div>
    </main>
  `;
}
