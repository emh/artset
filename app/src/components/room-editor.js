import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../router.js";

function normalize(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function RoomEditor({ projectId, floorplan, onReplacePlan }) {
  const W = floorplan.width_px, H = floorplan.height_px;
  const fs = Math.max(10, Math.round(W * 0.013)); // label size in image units
  const [rooms, setRooms] = useState(null);
  const [draft, setDraft] = useState(null);      // rect being dragged
  const [pending, setPending] = useState(null);  // finalized rect awaiting a name
  const [nameVal, setNameVal] = useState("");
  const [hoverId, setHoverId] = useState(null);
  const svgRef = useRef(null);
  const startRef = useRef(null);
  const draggingRef = useRef(false);
  const nameRef = useRef(null);

  useEffect(() => {
    api.get(`/api/projects/${projectId}/rooms`).then((d) => setRooms(d.rooms));
  }, [projectId]);

  useEffect(() => { if (pending && nameRef.current) nameRef.current.focus(); }, [pending]);

  function toPx(e) {
    const r = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const y = (e.clientY - r.top) * (H / r.height);
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
  }

  function onDown(e) {
    if (pending) return;            // finish naming first
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    startRef.current = toPx(e);
    draggingRef.current = true;
    setDraft({ ...startRef.current, w: 0, h: 0 });
  }
  function onMove(e) {
    if (!draggingRef.current) return;
    setDraft(normalize(startRef.current, toPx(e)));
  }
  function onUp(e) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const d = normalize(startRef.current, toPx(e));
    setDraft(null);
    if (d.w > W * 0.015 && d.h > H * 0.015) {
      setPending(d);
      setNameVal("");
    }
  }

  async function commit() {
    const name = nameVal.trim();
    if (!name || !pending) return;
    const { room } = await api.post(`/api/projects/${projectId}/rooms`, {
      name, rect_x: pending.x, rect_y: pending.y, rect_w: pending.w, rect_h: pending.h,
    });
    setRooms((rs) => [...(rs || []), room]);
    setPending(null);
    setNameVal("");
  }
  function cancelPending() { setPending(null); setNameVal(""); }

  async function removeRoom(id) {
    if (!confirm("Delete this room?")) return;
    await api.del(`/api/rooms/${id}`);
    setRooms((rs) => rs.filter((r) => r.id !== id));
  }
  async function renameRoom(r) {
    const next = prompt("Rename room", r.name);
    if (next == null || !next.trim() || next.trim() === r.name) return;
    await api.patch(`/api/rooms/${r.id}`, { name: next.trim() });
    setRooms((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: next.trim() } : x)));
  }

  // popover position in display px
  let pop = null;
  if (pending && svgRef.current) {
    const r = svgRef.current.getBoundingClientRect();
    pop = { left: (pending.x / W) * r.width, top: (pending.y / H) * r.height };
  }

  return html`
    <div class="workspace">
      <div>
        <div class=${"stage tool-draw"} style="position:relative">
          <img src=${`/api/projects/${projectId}/plan-image?v=${floorplan.id}`} alt="Floor plan" draggable=${false} />
          <svg class="overlay" ref=${svgRef} viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none"
            onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp}>
            ${(rooms || []).map((r) => html`
              <g key=${r.id} onMouseEnter=${() => setHoverId(r.id)} onMouseLeave=${() => setHoverId(null)}>
                <rect class=${"room-rect" + (hoverId === r.id ? " is-hover" : "")}
                  x=${r.rect_x} y=${r.rect_y} width=${r.rect_w} height=${r.rect_h} />
                <text class="room-label" font-size=${fs} x=${r.rect_x + fs * 0.5} y=${r.rect_y + fs * 1.5}>${r.name.toUpperCase()}</text>
              </g>
            `)}
            ${draft && html`<rect class="room-draft" x=${draft.x} y=${draft.y} width=${draft.w} height=${draft.h} />`}
            ${pending && html`<rect class="room-draft" x=${pending.x} y=${pending.y} width=${pending.w} height=${pending.h} />`}
          </svg>
          ${pop && html`
            <div class="name-pop" style=${`left:${pop.left}px; top:${pop.top}px`}>
              <input ref=${nameRef} value=${nameVal} placeholder="Room name" name="room-name" autocomplete="off"
                onInput=${(e) => setNameVal(e.target.value)}
                onKeyDown=${(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancelPending(); }} />
              <button class="linkbtn" onClick=${commit}>Add</button>
              <button class="linkbtn muted" onClick=${cancelPending}>✕</button>
            </div>
          `}
        </div>
        <p class="mono muted" style="margin-top:12px">${W} × ${H} px · <button class="linkbtn muted" onClick=${onReplacePlan}>Replace plan</button></p>
      </div>

      <aside class="sidebar">
        <div class="eyebrow">Rooms</div>
        <p class="muted" style="font-size:13px;margin-top:-8px;margin-bottom:18px">Drag a rectangle around each room, then name it.</p>
        ${rooms === null && html`<p class="spinner">Loading…</p>`}
        ${rooms && rooms.length === 0 && html`<p class="swatch-no">No rooms yet.</p>`}
        ${rooms && rooms.map((r) => html`
          <div class=${"roomrow" + (hoverId === r.id ? " is-hover" : "")} key=${r.id}
            onMouseEnter=${() => setHoverId(r.id)} onMouseLeave=${() => setHoverId(null)}>
            <span class="grow rname" style="cursor:pointer" onClick=${() => navigate(`/projects/${projectId}/rooms/${r.id}`)}>${r.name}</span>
            <button class="linkbtn muted" onClick=${() => renameRoom(r)}>Rename</button>
            <button class="linkbtn muted" onClick=${() => removeRoom(r.id)}>Delete</button>
            <button class="linkbtn" onClick=${() => navigate(`/projects/${projectId}/rooms/${r.id}`)}>Walls →</button>
          </div>
        `)}
        ${rooms && rooms.length > 0 && html`<p class="count" style="margin-top:18px">${rooms.length} room${rooms.length === 1 ? "" : "s"}</p>`}
      </aside>
    </div>
  `;
}
