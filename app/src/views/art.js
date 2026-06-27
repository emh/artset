import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { api } from "../api.js";
import { ProjectNav } from "../components/project-nav.js";
import { navigate } from "../router.js";
import { crumbs } from "../store.js";

const money = (n) => (n == null || n === "" ? "" : "$" + Number(n).toLocaleString());
const sizeLabel = (s) => `${+s.width_inches}″ × ${+s.height_inches}″${s.label ? " · " + s.label : ""}`;

const emptyForm = () => ({ title: "", artist: "", medium: "", price: "", sizes: [{ width: "", height: "", label: "" }] });

export function ArtView({ projectId }) {
  const [project, setProject] = useState(null);
  const [art, setArt] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState(emptyForm());
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  // "Place" flow: pick a room then a wall to jump to with this piece preselected
  const [placing, setPlacing] = useState(null);   // the piece being placed
  const [rooms, setRooms] = useState([]);
  const [placeRoom, setPlaceRoom] = useState("");
  const [walls, setWalls] = useState([]);
  const [placeWall, setPlaceWall] = useState("");

  async function openPlace(p) {
    setPlacing(p); setPlaceRoom(""); setWalls([]); setPlaceWall("");
    const { rooms } = await api.get(`/api/projects/${projectId}/rooms`);
    setRooms(rooms);
  }
  async function chooseRoom(roomId) {
    setPlaceRoom(roomId); setPlaceWall("");
    if (!roomId) { setWalls([]); return; }
    const { walls } = await api.get(`/api/rooms/${roomId}/walls`);
    setWalls(walls);
  }
  function goPlace() {
    if (!placeRoom || !placeWall) return;
    navigate(`/projects/${projectId}/rooms/${placeRoom}/walls/${placeWall}?place=${placing.id}`);
  }

  useEffect(() => {
    api.get(`/api/projects/${projectId}`).then((d) => {
      setProject(d.project);
      crumbs.value = [{ label: d.project.name, href: `/projects/${projectId}` }];
    }).catch(() => {});
    refresh();
  }, [projectId]);

  async function refresh() {
    const { art } = await api.get(`/api/projects/${projectId}/art`);
    setArt(art);
  }

  function openAdd() { setEditing(null); setF(emptyForm()); setFile(null); setErr(null); setOpen(true); }
  function openEdit(p) {
    setEditing(p.id);
    setF({ title: p.title, artist: p.artist || "", medium: p.medium || "", price: p.price ?? "",
      sizes: (p.sizes.length ? p.sizes : [{}]).map((s) => ({ width: s.width_inches ?? "", height: s.height_inches ?? "", label: s.label || "" })) });
    setFile(null); setErr(null); setOpen(true);
  }
  function close() { setOpen(false); setEditing(null); setFile(null); }

  const setField = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setSize = (i, k) => (e) => setF((p) => ({ ...p, sizes: p.sizes.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)) }));
  const addSize = () => setF((p) => ({ ...p, sizes: [...p.sizes, { width: "", height: "", label: "" }] }));
  const removeSize = (i) => setF((p) => ({ ...p, sizes: p.sizes.filter((_, j) => j !== i) }));

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const sizes = f.sizes
      .map((s) => ({ width_inches: parseFloat(s.width), height_inches: parseFloat(s.height), label: s.label.trim() }))
      .filter((s) => s.width_inches > 0 && s.height_inches > 0);
    if (!f.title.trim()) { setErr("Title is required."); return; }
    if (!sizes.length) { setErr("Add at least one size (width × height)."); return; }
    setBusy(true);
    try {
      const payload = { title: f.title.trim(), artist: f.artist.trim(), medium: f.medium.trim(),
        price: f.price === "" ? null : parseFloat(f.price), sizes };
      const res = editing
        ? await api.patch(`/api/art/${editing}`, payload)
        : await api.post(`/api/projects/${projectId}/art`, payload);
      const pieceId = res.art.id;
      if (file) {
        const fd = new FormData(); fd.append("image", file);
        await api.post(`/api/art/${pieceId}/image`, fd);
      }
      await refresh();
      close();
    } catch (ex) {
      setErr(ex.message || "Could not save");
    } finally { setBusy(false); }
  }

  async function remove(p) {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await api.del(`/api/art/${p.id}`);
    refresh();
  }

  return html`
    <main>
      <div class="wrap">
        <${ProjectNav} projectId=${projectId} projectName=${project && project.name} active="art" />
        <hr class="rule" />
        <div class="mt-lg">
          <div class="flex between items-center" style="margin-bottom:28px">
            <div class="eyebrow">Art inventory</div>
            ${!open && html`<button class="btn" onClick=${openAdd}>Add art</button>`}
          </div>

          ${placing && html`
            <div class="card" style="margin-bottom:36px">
              <div class="label" style="margin-bottom:14px">Place “${placing.title}”</div>
              <div class="flex gap-md" style="flex-wrap:wrap;align-items:flex-end">
                <label class="field" style="flex:1;min-width:180px;margin:0"><span class="label">Room</span>
                  <select class="input" value=${placeRoom} onChange=${(e) => chooseRoom(e.target.value)}>
                    <option value="">Select a room…</option>
                    ${rooms.map((r) => html`<option value=${r.id} key=${r.id}>${r.name}</option>`)}
                  </select></label>
                <label class="field" style="flex:1;min-width:180px;margin:0"><span class="label">Wall</span>
                  <select class="input" value=${placeWall} onChange=${(e) => setPlaceWall(e.target.value)} disabled=${!walls.length}>
                    <option value="">${placeRoom ? (walls.length ? "Select a wall…" : "No walls in this room") : "Choose a room first"}</option>
                    ${walls.map((w) => html`<option value=${w.id} key=${w.id}>${w.name}</option>`)}
                  </select></label>
                <div class="flex gap-sm">
                  <button class="btn" onClick=${goPlace} disabled=${!placeWall}>Place on wall →</button>
                  <button class="btn btn--ghost" onClick=${() => setPlacing(null)}>Cancel</button>
                </div>
              </div>
            </div>`}

          ${open && html`
            <form class="card" style="margin-bottom:40px" onSubmit=${submit} autocomplete="off">
              <div class="art-form-grid">
                <div>
                  <label class="field"><span class="label">Title</span>
                    <input class="input" name="art-title" autocomplete="off" value=${f.title} onInput=${setField("title")} placeholder="Blue Fragment Study" autofocus /></label>
                  <div class="flex gap-md">
                    <label class="field" style="flex:1"><span class="label">Artist</span>
                      <input class="input" name="art-artist" autocomplete="off" value=${f.artist} onInput=${setField("artist")} placeholder="Mara Ellison" /></label>
                    <label class="field" style="flex:1"><span class="label">Price</span>
                      <input class="input" name="art-price" inputmode="decimal" autocomplete="off" value=${f.price} onInput=${setField("price")} placeholder="3200" /></label>
                  </div>
                  <label class="field"><span class="label">Medium</span>
                    <input class="input" name="art-medium" autocomplete="off" value=${f.medium} onInput=${setField("medium")} placeholder="Acrylic on canvas" /></label>

                  <div class="label" style="margin:18px 0 10px">Sizes</div>
                  ${f.sizes.map((s, i) => html`
                    <div class="size-row" key=${i}>
                      <input class="input" name=${`art-size-${i}-width`} inputmode="decimal" autocomplete="off" value=${s.width} onInput=${setSize(i, "width")} placeholder="W″" />
                      <span class="muted">×</span>
                      <input class="input" name=${`art-size-${i}-height`} inputmode="decimal" autocomplete="off" value=${s.height} onInput=${setSize(i, "height")} placeholder="H″" />
                      <input class="input" name=${`art-size-${i}-label`} autocomplete="off" value=${s.label} onInput=${setSize(i, "label")} placeholder="label (optional)" />
                      ${f.sizes.length > 1 && html`<button type="button" class="linkbtn muted" onClick=${() => removeSize(i)}>✕</button>`}
                    </div>
                  `)}
                  <button type="button" class="linkbtn" style="margin-top:6px" onClick=${addSize}>+ Add size</button>
                </div>

                <div>
                  <span class="label" style="display:block;margin-bottom:8px">Image</span>
                  <div class="art-drop" onClick=${() => fileRef.current && fileRef.current.click()}>
                    ${file
                      ? html`<img src=${URL.createObjectURL(file)} alt="preview" />`
                      : editing && art && art.find((x) => x.id === editing && x.has_image)
                        ? html`<img src=${`/api/art/${editing}/image?v=${encodeURIComponent((art.find((x) => x.id === editing) || {}).image_v || "")}`} alt="current" />`
                        : html`<span class="muted" style="font-size:13px">Click to add an image</span>`}
                  </div>
                  <input ref=${fileRef} type="file" accept="image/*" style="display:none"
                    onChange=${(e) => setFile(e.target.files[0] || null)} />
                </div>
              </div>

              ${err && html`<p style="color:var(--warn);font-size:13px;margin:6px 0 0">${err}</p>`}
              <div class="flex gap-sm" style="margin-top:22px">
                <button class="btn" type="submit" disabled=${busy}>${busy ? "Saving…" : editing ? "Save changes" : "Add to inventory"}</button>
                <button class="btn btn--ghost" type="button" onClick=${close}>Cancel</button>
              </div>
            </form>
          `}

          ${art === null && html`<p class="spinner">Loading…</p>`}
          ${art && art.length === 0 && !open && html`
            <div class="empty"><p>No art yet.</p>
              <p class="mt-md"><button class="linkbtn" onClick=${openAdd}>Add your first piece</button></p></div>`}

          ${art && art.length > 0 && html`
            <div class="art-grid">
              ${art.map((p) => html`
                <div class="art-card" key=${p.id}>
                  <div class="art-thumb">
                    ${p.has_image
                      ? html`<img src=${`/api/art/${p.id}/image?v=${encodeURIComponent(p.image_v || "")}`} alt=${p.title} loading="lazy" />`
                      : html`<span class="muted mono">no image</span>`}
                  </div>
                  <div class="art-meta">
                    <h3>${p.title}</h3>
                    ${p.artist && html`<div class="muted">${p.artist}</div>`}
                    ${p.medium && html`<div class="mono muted">${p.medium}</div>`}
                    <div class="art-sizes">${p.sizes.map((s) => html`<span class="chip" key=${s.id}>${sizeLabel(s)}</span>`)}</div>
                    ${p.placed && html`<div class="placed-tag">Placed · ${p.placed.room_name} · ${p.placed.wall_name}</div>`}
                    <div class="flex between items-center" style="margin-top:14px">
                      <span class="mono">${money(p.price)}</span>
                      <span class="flex gap-sm">
                        <button class="linkbtn" onClick=${() => openPlace(p)}>${p.placed ? "Move" : "Place"}</button>
                        <button class="linkbtn muted" onClick=${() => openEdit(p)}>Edit</button>
                        <button class="linkbtn muted" onClick=${() => remove(p)}>Delete</button>
                      </span>
                    </div>
                  </div>
                </div>
              `)}
            </div>
          `}
        </div>
      </div>
    </main>
  `;
}
