import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { crumbs } from "../store.js";
import { PlanUploader } from "../components/plan-uploader.js";
import { RoomEditor } from "../components/room-editor.js";

function planImageUrl(projectId, fp) {
  return `/api/projects/${projectId}/floorplans/${fp.id}/image?v=${encodeURIComponent(fp.image_key || fp.id)}`;
}

function roomsByFloorplan(rooms) {
  const map = new Map();
  for (const room of rooms || []) {
    const key = room.floorplan_id || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(room);
  }
  return map;
}

export function ProjectView({ id }) {
  const [project, setProject] = useState(null);
  const [floorplans, setFloorplans] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    Promise.all([
      api.get(`/api/projects/${id}`),
      api.get(`/api/projects/${id}/rooms`),
    ])
      .then(([p, r]) => {
        if (!alive) return;
        setProject(p.project);
        setFloorplans(p.floorplans || []);
        setRooms(r.rooms || []);
        setLoaded(true);
        crumbs.value = [{ label: p.project.name, href: `/projects/${id}` }];
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [id]);

  if (err) return html`<main><div class="wrap"><div class="empty">
    <p>${err}</p><p class="mt-md"><a class="linkbtn" href="/" data-link>Back to projects</a></p>
  </div></div></main>`;

  if (!loaded) return html`<main><div class="wrap"><p class="spinner">Loading…</p></div></main>`;

  const grouped = roomsByFloorplan(rooms);

  return html`
    <main>
      <div class="wrap">
        <div class="floorplan-index">
          <div class="floorplan-list">
            ${floorplans.map((fp, index) => {
              const planRooms = grouped.get(fp.id) || [];
              return html`
                <div class="floorplan-row" key=${fp.id}>
                  <a class="floorplan-thumb" href=${`/projects/${id}/floorplans/${fp.id}`} data-link>
                    <img src=${planImageUrl(id, fp)} alt=${fp.name || `Floor plan ${index + 1}`} />
                  </a>
                  <div class="floorplan-row-main">
                    <a class="floorplan-name" href=${`/projects/${id}/floorplans/${fp.id}`} data-link>${fp.name || `Floor plan ${index + 1}`}</a>
                    ${planRooms.length === 0 && html`<p class="swatch-no">No rooms yet.</p>`}
                    ${planRooms.length > 0 && html`
                      <ol class="floorplan-room-list">
                        ${planRooms.map((room) => html`
                          <li key=${room.id}>
                            <a href=${`/projects/${id}/rooms/${room.id}`} data-link>${room.name}</a>
                          </li>`)}
                      </ol>`}
                  </div>
                </div>`;
            })}
            <${PlanUploader} compact=${true} projectId=${id} onUploaded=${(fp) => setFloorplans((list) => [...list, fp])} />
          </div>
        </div>
      </div>
    </main>
  `;
}

export function FloorplanView({ projectId, floorplanId }) {
  const [project, setProject] = useState(null);
  const [floorplan, setFloorplan] = useState(null);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    Promise.all([
      api.get(`/api/projects/${projectId}`),
      api.get(`/api/projects/${projectId}/floorplans/${floorplanId}`),
    ])
      .then(([p, f]) => {
        if (!alive) return;
        setProject(p.project);
        setFloorplan(f.floorplan);
        setName(f.floorplan.name || "");
        setLoaded(true);
        crumbs.value = [
          { label: p.project.name, href: `/projects/${projectId}` },
          { label: f.floorplan.name || "Floor plan", href: `/projects/${projectId}/floorplans/${floorplanId}` },
        ];
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [projectId, floorplanId]);

  async function saveName() {
    const next = name.trim();
    if (!next || !floorplan || next === floorplan.name) {
      setName(floorplan ? floorplan.name : "");
      return;
    }
    const { floorplan: updated } = await api.patch(`/api/projects/${projectId}/floorplans/${floorplanId}`, { name: next });
    setFloorplan(updated);
    setName(updated.name);
    crumbs.value = crumbs.value.map((c, i) => (i === 1 ? { ...c, label: updated.name } : c));
  }

  if (err) return html`<main><div class="wrap"><div class="empty"><p>${err}</p></div></div></main>`;
  if (!loaded || !project || !floorplan) return html`<main><div class="wrap"><p class="spinner">Loading…</p></div></main>`;

  return html`
    <main>
      <div class="wrap">
        <${RoomEditor}
          projectId=${projectId}
          floorplan=${floorplan}
          onDeletePlan=${() => navigate(`/projects/${projectId}`)}
          sidebarTop=${html`
            <div class="floorplan-sidebar-fields">
              <div class="eyebrow">Floor plan</div>
              <label class="field">
                <span class="label">Name</span>
                <input class="input" name="floorplan-name" autocomplete="off" value=${name}
                  onInput=${(e) => setName(e.target.value)}
                  onBlur=${saveName}
                  onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} />
              </label>
            </div>
          `}
        />
      </div>
    </main>
  `;
}
