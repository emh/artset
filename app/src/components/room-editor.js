import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { FloorplanLabel } from "./floorplan-label.js";

function normalize(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function RoomEditor({ projectId, floorplan, onDeletePlan }) {
  const W = floorplan.width_px, H = floorplan.height_px;
  const fs = Math.max(10, Math.round(W * 0.013)); // label size in image units
  const [rooms, setRooms] = useState(null);
  const [draft, setDraft] = useState(null);      // rect being dragged
  const [pending, setPending] = useState(null);  // finalized rect awaiting a name
  const [nameVal, setNameVal] = useState("");
  const [hoverId, setHoverId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
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

  function closeDialog() {
    if (dialogBusy) return;
    setDialog(null);
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

  async function confirmDelete() {
    if (!dialog || dialog.type !== "delete") return;
    setDialogBusy(true);
    try {
      await api.del(`/api/rooms/${dialog.room.id}`);
      setRooms((rs) => rs.filter((r) => r.id !== dialog.room.id));
      setDialog(null);
    } finally { setDialogBusy(false); }
  }

  async function confirmDeletePlan() {
    if (!dialog || dialog.type !== "delete-plan") return;
    setDialogBusy(true);
    try {
      await api.del(`/api/projects/${projectId}/floorplan`);
      setDialog(null);
      if (onDeletePlan) onDeletePlan();
    } finally { setDialogBusy(false); }
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
                <${FloorplanLabel} text=${r.name} fontSize=${fs} x=${r.rect_x + fs * 0.5} y=${r.rect_y + fs * 1.5} />
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
        <p style="margin-top:12px"><button class="linkbtn muted" onClick=${() => setDialog({ type: "delete-plan" })}>Delete plan</button></p>
      </div>

      <aside class="sidebar">
        <div class="eyebrow">Rooms</div>
        <p class="muted" style="font-size:13px;margin-top:-8px;margin-bottom:18px">Drag a rectangle around each room, then name it.</p>
        ${rooms === null && html`<p class="spinner">Loading…</p>`}
        ${rooms && rooms.length === 0 && html`<p class="swatch-no">No rooms yet.</p>`}
        ${rooms && rooms.length > 0 && html`
          <div class="room-list">
            ${rooms.map((r) => html`
              <div class=${"roomrow plan-room-row" + (hoverId === r.id ? " is-hover" : "")} key=${r.id}
                onMouseEnter=${() => setHoverId(r.id)} onMouseLeave=${() => setHoverId(null)}
                onClick=${() => navigate(`/projects/${projectId}/rooms/${r.id}`)}>
                <span class="grow rname">${r.name}</span>
                <button class="linkbtn muted" onClick=${(e) => { e.stopPropagation(); setDialog({ type: "delete", room: r }); }}>Delete</button>
              </div>
            `)}
          </div>
        `}
      </aside>

      ${dialog && html`
        <div class="modal-backdrop" role="presentation" onClick=${closeDialog}>
          <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="room-dialog-title" onClick=${(e) => e.stopPropagation()}>
            ${dialog.type === "delete" && html`
              <div>
                <div class="eyebrow">Room</div>
                <h2 id="room-dialog-title">Delete room</h2>
                <p class="modal-copy">Delete “${dialog.room.name}”? This will remove its walls and any placements on those walls.</p>
                <div class="modal-actions">
                  <button class="btn btn--danger" type="button" disabled=${dialogBusy} onClick=${confirmDelete}>Delete</button>
                  <button class="btn btn--ghost" type="button" disabled=${dialogBusy} onClick=${closeDialog}>Cancel</button>
                </div>
              </div>
            `}
            ${dialog.type === "delete-plan" && html`
              <div>
                <div class="eyebrow">Floor plan</div>
                <h2 id="room-dialog-title">Delete plan</h2>
                <p class="modal-copy">Delete this floor plan? This will remove the plan image, all rooms, all walls, and any placements on those walls.</p>
                <div class="modal-actions">
                  <button class="btn btn--danger" type="button" disabled=${dialogBusy} onClick=${confirmDeletePlan}>Delete</button>
                  <button class="btn btn--ghost" type="button" disabled=${dialogBusy} onClick=${closeDialog}>Cancel</button>
                </div>
              </div>
            `}
          </div>
        </div>
      `}
    </div>
  `;
}
