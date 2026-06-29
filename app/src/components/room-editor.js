import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { FloorplanLabel } from "./floorplan-label.js";
import { FloorplanViewport } from "./floorplan-viewport.js";
import { LucideIcon } from "./lucide-icon.js";

function normalize(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function clampRect(rect, W, H) {
  const x = Math.max(0, Math.min(W, rect.x));
  const y = Math.max(0, Math.min(H, rect.y));
  return {
    x,
    y,
    w: Math.max(0, Math.min(W - x, rect.w)),
    h: Math.max(0, Math.min(H - y, rect.h)),
  };
}

function resizeRect(room, corner, point) {
  const x1 = room.rect_x;
  const y1 = room.rect_y;
  const x2 = room.rect_x + room.rect_w;
  const y2 = room.rect_y + room.rect_h;
  const nextA = {
    x: corner.includes("w") ? point.x : x1,
    y: corner.includes("n") ? point.y : y1,
  };
  const nextB = {
    x: corner.includes("e") ? point.x : x2,
    y: corner.includes("s") ? point.y : y2,
  };
  return normalize(nextA, nextB);
}

function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
}

export function RoomEditor({ projectId, floorplan, onDeletePlan, sidebarTop }) {
  const W = floorplan.width_px, H = floorplan.height_px;
  const labelSize = 10;
  const [rooms, setRooms] = useState(null);
  const [draft, setDraft] = useState(null);      // rect being dragged
  const [pending, setPending] = useState(null);  // finalized rect awaiting a name
  const [nameVal, setNameVal] = useState("");
  const [pop, setPop] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const svgRef = useRef(null);
  const startRef = useRef(null);
  const draggingRef = useRef(false);
  const resizeRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    api.get(`/api/projects/${projectId}/floorplans/${floorplan.id}/rooms`).then((d) => setRooms(d.rooms));
  }, [projectId, floorplan.id]);

  useEffect(() => { if (pending && nameRef.current) nameRef.current.focus(); }, [pending]);

  function toPx(e) {
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    const x = p.x;
    const y = p.y;
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
    if (resizeRef.current) {
      const edit = resizeRef.current;
      const next = clampRect(resizeRect(edit.room, edit.corner, toPx(e)), W, H);
      edit.latest = next;
      edit.moved = true;
      setRooms((rs) => (rs || []).map((r) => (
        r.id === edit.room.id
          ? { ...r, rect_x: next.x, rect_y: next.y, rect_w: next.w, rect_h: next.h }
          : r
      )));
      return;
    }
    if (!draggingRef.current) return;
    setDraft(normalize(startRef.current, toPx(e)));
  }
  function onUp(e) {
    if (resizeRef.current) {
      const edit = resizeRef.current;
      resizeRef.current = null;
      if (edit.moved && edit.latest && edit.latest.w > W * 0.015 && edit.latest.h > H * 0.015) {
        api.patch(`/api/rooms/${edit.room.id}`, {
          rect_x: edit.latest.x,
          rect_y: edit.latest.y,
          rect_w: edit.latest.w,
          rect_h: edit.latest.h,
        }).then(({ room }) => {
          setRooms((rs) => (rs || []).map((r) => (r.id === room.id ? room : r)));
        }).catch(() => {
          setRooms((rs) => (rs || []).map((r) => (r.id === edit.room.id ? edit.room : r)));
        });
      } else {
        setRooms((rs) => (rs || []).map((r) => (r.id === edit.room.id ? edit.room : r)));
      }
      return;
    }
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const d = normalize(startRef.current, toPx(e));
    setDraft(null);
    if (d.w > W * 0.015 && d.h > H * 0.015) {
      setPending(d);
      setNameVal("");
      const r = e.currentTarget.closest(".floorplan-viewport-frame").getBoundingClientRect();
      setPop({ left: e.clientX - r.left, top: e.clientY - r.top });
    }
  }

  function onResizeDown(e, room, corner) {
    if (pending) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    resizeRef.current = { room, corner, latest: null, moved: false };
  }

  async function commit() {
    const name = nameVal.trim();
    if (!name || !pending) return;
    const { room } = await api.post(`/api/projects/${projectId}/floorplans/${floorplan.id}/rooms`, {
      name, rect_x: pending.x, rect_y: pending.y, rect_w: pending.w, rect_h: pending.h,
    });
    setRooms((rs) => [...(rs || []), room]);
    setPending(null);
    setPop(null);
    setNameVal("");
  }
  function cancelPending() { setPending(null); setPop(null); setNameVal(""); }

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
      await api.del(`/api/projects/${projectId}/floorplans/${floorplan.id}`);
      setDialog(null);
      if (onDeletePlan) onDeletePlan();
    } finally { setDialogBusy(false); }
  }

  return html`
    <div class="workspace">
      <div>
        <${FloorplanViewport}
          width=${W}
          height=${H}
          viewBox=${{ x: 0, y: 0, w: W, h: H }}
          imageHref=${`/api/projects/${projectId}/floorplans/${floorplan.id}/image?v=${encodeURIComponent(floorplan.image_key || floorplan.id)}`}
          svgRef=${svgRef}
          className="tool-draw"
          ariaLabel="Define rooms on floor plan"
          renderMiniContent=${() => html`
            ${(rooms || []).map((r) => html`
              <rect class=${"room-rect" + (hoverId === r.id ? " is-hover" : "")}
                x=${r.rect_x} y=${r.rect_y} width=${r.rect_w} height=${r.rect_h} />
            `)}
          `}
          overlay=${pop && html`
            <div class="name-pop" style=${`left:${pop.left}px; top:${pop.top}px`}>
              <input ref=${nameRef} value=${nameVal} placeholder="Room name" name="room-name" autocomplete="off"
                onInput=${(e) => setNameVal(e.target.value)}
                onKeyDown=${(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancelPending(); }} />
              <button class="linkbtn" onClick=${commit}>Add</button>
              <button class="iconbtn" type="button" title="Close" aria-label="Cancel room naming" onClick=${cancelPending}>
                <${LucideIcon} name="x" />
              </button>
            </div>
          `}>
          ${({ displayScale }) => html`<g onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp}>
            <rect class="floorplan-hit" x="0" y="0" width=${W} height=${H} />
            ${(rooms || []).map((r) => {
              const handle = Math.max(8 / displayScale, Math.min(r.rect_w, r.rect_h) * 0.04);
              const handles = [
                ["nw", r.rect_x, r.rect_y],
                ["ne", r.rect_x + r.rect_w, r.rect_y],
                ["sw", r.rect_x, r.rect_y + r.rect_h],
                ["se", r.rect_x + r.rect_w, r.rect_y + r.rect_h],
              ];
              return html`
              <g key=${r.id}
                style="cursor:pointer"
                onMouseEnter=${() => setHoverId(r.id)}
                onMouseLeave=${() => setHoverId(null)}
                onPointerDown=${(e) => e.stopPropagation()}
                onClick=${() => navigate(`/projects/${projectId}/rooms/${r.id}`)}>
                <rect class=${"room-rect" + (hoverId === r.id ? " is-hover" : "")}
                  x=${r.rect_x} y=${r.rect_y} width=${r.rect_w} height=${r.rect_h} />
                <${FloorplanLabel}
                  text=${r.name}
                  fontSize=${labelSize}
                  displayScale=${displayScale}
                  x=${r.rect_x + (labelSize * 0.5) / displayScale}
                  y=${r.rect_y + (labelSize * 1.5) / displayScale}
                />
                ${handles.map(([corner, x, y]) => html`
                  <rect class=${`room-resize-handle room-resize-handle--${corner}`}
                    key=${corner}
                    x=${x - handle / 2}
                    y=${y - handle / 2}
                    width=${handle}
                    height=${handle}
                    onPointerDown=${(e) => onResizeDown(e, r, corner)}
                    onClick=${(e) => e.stopPropagation()} />
                `)}
              </g>
            `})}
            ${draft && html`<rect class="room-draft" x=${draft.x} y=${draft.y} width=${draft.w} height=${draft.h} />`}
            ${pending && html`<rect class="room-draft" x=${pending.x} y=${pending.y} width=${pending.w} height=${pending.h} />`}
          </g>`}
        <//>
        <p style="margin-top:12px"><button class="linkbtn muted" onClick=${() => setDialog({ type: "delete-plan" })}>Delete plan</button></p>
      </div>

      <aside class="sidebar">
        ${sidebarTop}
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
