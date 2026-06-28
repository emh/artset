import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { crumbs } from "../store.js";
import { FloorplanViewport } from "../components/floorplan-viewport.js";

function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
}

export function RoomView({ projectId, roomId }) {
  const [floorplan, setFloorplan] = useState(null);
  const [room, setRoom] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [walls, setWalls] = useState(null);
  const [err, setErr] = useState(null);

  const [draft, setDraft] = useState(null);     // {ax,ay,bx,by} being drawn
  const [pending, setPending] = useState(null); // finalized line awaiting name/length
  const [nameVal, setNameVal] = useState("");
  const [lenVal, setLenVal] = useState("");
  const [pop, setPop] = useState(null);         // {left, top} container-relative
  const [hoverId, setHoverId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);

  const svgRef = useRef(null);
  const startRef = useRef(null);
  const draggingRef = useRef(false);
  const downClientRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get(`/api/projects/${projectId}`),
      api.get(`/api/rooms/${roomId}`),
      api.get(`/api/rooms/${roomId}/walls`),
    ]).then(([p, r, w]) => {
      if (!alive) return;
      if (!r.floorplan) { setErr("This room has no floor plan."); return; }
      setFloorplan(r.floorplan); setRoom(r.room); setRoomName(r.room.name); setWalls(w.walls);
      crumbs.value = [
        { label: p.project.name, href: `/projects/${projectId}` },
        { label: r.floorplan.name || "Floor plan", href: `/projects/${projectId}/floorplans/${r.floorplan.id}` },
        { label: r.room.name, href: `/projects/${projectId}/rooms/${roomId}` },
      ];
    }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [projectId, roomId]);

  useEffect(() => { if (pending && nameRef.current) nameRef.current.focus(); }, [pending]);

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

  if (err) return shell(projectId, null, html`<div class="empty"><p>${err}</p></div>`);
  if (!floorplan || !room) return shell(projectId, null, html`<p class="spinner">Loading…</p>`);

  const W = floorplan.width_px, H = floorplan.height_px;
  const pad = 0.08 * Math.max(room.rect_w, room.rect_h);
  const vb = { x: room.rect_x - pad, y: room.rect_y - pad, w: room.rect_w + 2 * pad, h: room.rect_h + 2 * pad };
  const stroke = Math.max(4, Math.min(room.rect_w, room.rect_h) * 0.02);
  const fs = Math.max(8, vb.w * 0.025);

  function onDown(e) {
    if (pending) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    startRef.current = p;
    downClientRef.current = { x: e.clientX, y: e.clientY };
    draggingRef.current = true;
    setDraft({ ax: p.x, ay: p.y, bx: p.x, by: p.y });
  }
  function onMove(e) {
    if (!draggingRef.current) return;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    setDraft(snap(startRef.current, p));
  }
  function onUp(e) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    const line = snap(startRef.current, p);
    setDraft(null);
    const dispLen = Math.hypot(e.clientX - downClientRef.current.x, e.clientY - downClientRef.current.y);
    if (dispLen < 14) return;
    setPending(line);
    setNameVal(suggestName(line, walls));
    setLenVal("");
    const wr = e.currentTarget.closest(".floorplan-viewport-frame").getBoundingClientRect();
    setPop({ left: ((e.clientX + downClientRef.current.x) / 2) - wr.left, top: ((e.clientY + downClientRef.current.y) / 2) - wr.top });
  }

  async function commit() {
    const name = nameVal.trim();
    const length = parseFloat(lenVal);
    if (!name || !(length > 0) || !pending) return;
    const { wall } = await api.post(`/api/rooms/${roomId}/walls`, {
      name, length_inches: length, ax: pending.ax, ay: pending.ay, bx: pending.bx, by: pending.by,
    });
    setWalls((ws) => [...(ws || []), wall]);
    cancelPending();
  }
  function cancelPending() { setPending(null); setPop(null); setNameVal(""); setLenVal(""); }

  async function saveRoomName() {
    const next = roomName.trim();
    if (!next) { setRoomName(room.name); return; }
    if (next === room.name) return;
    const { room: updated } = await api.patch(`/api/rooms/${roomId}`, { name: next });
    setRoom(updated);
    setRoomName(updated.name);
    crumbs.value = crumbs.value.map((c, i) => (i === 2 ? { ...c, label: updated.name } : c));
  }

  function closeDialog() {
    if (dialogBusy) return;
    setDialog(null);
  }

  async function confirmDeleteWall() {
    if (!dialog || dialog.type !== "delete-wall") return;
    setDialogBusy(true);
    try {
      await api.del(`/api/walls/${dialog.wall.id}`);
      setWalls((ws) => ws.filter((w) => w.id !== dialog.wall.id));
      setDialog(null);
    } finally { setDialogBusy(false); }
  }

  const imageHref = `/api/projects/${projectId}/floorplans/${floorplan.id}/image?v=${encodeURIComponent(floorplan.image_key || floorplan.id)}`;
  const stage = html`
    <${FloorplanViewport}
      width=${W}
      height=${H}
      viewBox=${vb}
      imageHref=${imageHref}
      svgRef=${svgRef}
      className="tool-draw"
      ariaLabel="Define walls in room"
      renderMiniContent=${() => html`
        <rect class="room-rect" x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} fill="none" />
        ${(walls || []).map((w) => html`
          <line class=${"wall-line" + (hoverId === w.id ? " is-hover" : "")} x1=${w.ax} y1=${w.ay} x2=${w.bx} y2=${w.by}
            stroke-width=${stroke} />
        `)}
      `}
      overlay=${pop && html`
        <div class="name-pop" style=${`left:${pop.left}px; top:${pop.top}px`}>
          <input ref=${nameRef} value=${nameVal} placeholder="Wall name" style="width:120px" name="wall-name" autocomplete="off"
            onInput=${(e) => setNameVal(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter") document.getElementById("wall-len").focus(); if (e.key === "Escape") cancelPending(); }} />
          <input id="wall-len" value=${lenVal} placeholder="Length″" style="width:64px" name="wall-length" inputmode="decimal" autocomplete="off"
            onInput=${(e) => setLenVal(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancelPending(); }} />
          <button class="linkbtn" onClick=${commit}>Add</button>
          <button class="linkbtn muted" onClick=${cancelPending}>✕</button>
        </div>
      `}>
      <g onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp}>
        <rect class="floorplan-hit" x=${vb.x} y=${vb.y} width=${vb.w} height=${vb.h} />
        <rect class="room-rect" x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} fill="none" />
        ${(walls || []).map((w) => html`
          <g key=${w.id} onMouseEnter=${() => setHoverId(w.id)} onMouseLeave=${() => setHoverId(null)} style="cursor:pointer"
             onPointerDown=${(e) => e.stopPropagation()}
             onClick=${() => navigate(`/projects/${projectId}/rooms/${roomId}/walls/${w.id}`)}>
            <line class=${"wall-line" + (hoverId === w.id ? " is-hover" : "")} x1=${w.ax} y1=${w.ay} x2=${w.bx} y2=${w.by}
              stroke-width=${stroke} />
            <text class="wall-label" font-size=${fs} x=${(w.ax + w.bx) / 2} y=${(w.ay + w.by) / 2 - stroke}>${w.name.toUpperCase()}</text>
          </g>
        `)}
        ${draft && html`<line class="wall-draft" x1=${draft.ax} y1=${draft.ay} x2=${draft.bx} y2=${draft.by} stroke-width=${stroke} />`}
        ${pending && html`<line class="wall-draft" x1=${pending.ax} y1=${pending.ay} x2=${pending.bx} y2=${pending.by} stroke-width=${stroke} />`}
      </g>
    <//>`;

  const sidebar = html`
    <aside class="sidebar">
      <div class="eyebrow">Room</div>
      <label class="field"><span class="label">Name</span>
        <input class="input" name="room-name" autocomplete="off" value=${roomName}
          onInput=${(e) => setRoomName(e.target.value)} onBlur=${saveRoomName}
          onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} /></label>
      <div class="eyebrow">Walls</div>
      <p class="muted" style="font-size:13px;margin-top:-8px;margin-bottom:18px">Drag a line along each wall, then name it and enter its length.</p>
      ${walls === null && html`<p class="spinner">Loading…</p>`}
      ${walls && walls.length === 0 && html`<p class="swatch-no">No walls yet.</p>`}
      ${walls && walls.length > 0 && html`
        <div class="wall-list">
          ${walls.map((w) => html`
            <div class=${"roomrow plan-wall-row" + (hoverId === w.id ? " is-hover" : "")} key=${w.id}
              onMouseEnter=${() => setHoverId(w.id)} onMouseLeave=${() => setHoverId(null)}
              onClick=${() => navigate(`/projects/${projectId}/rooms/${roomId}/walls/${w.id}`)}>
              <span class="grow rname">
                ${w.name} <span class="mono muted">${w.length_inches}″</span>
              </span>
              <button class="linkbtn muted" onClick=${(e) => { e.stopPropagation(); setDialog({ type: "delete-wall", wall: w }); }}>Delete</button>
            </div>
          `)}
        </div>
      `}
    </aside>`;

  return shell(projectId, room.name, html`
    <div class="workspace">
      ${stage}
      ${sidebar}

      ${dialog && html`
        <div class="modal-backdrop" role="presentation" onClick=${closeDialog}>
          <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="wall-dialog-title" onClick=${(e) => e.stopPropagation()}>
            <div class="eyebrow">Wall</div>
            <h2 id="wall-dialog-title">Delete wall</h2>
            <p class="modal-copy">Delete “${dialog.wall.name}”? This will remove its usable spans and any art placements on this wall.</p>
            <div class="modal-actions">
              <button class="btn btn--danger" type="button" disabled=${dialogBusy} onClick=${confirmDeleteWall}>Delete</button>
              <button class="btn btn--ghost" type="button" disabled=${dialogBusy} onClick=${closeDialog}>Cancel</button>
            </div>
          </div>
        </div>
      `}
    </div>
  `);
}

// snap a drawn line to horizontal/vertical when nearly axis-aligned
function snap(a, p) {
  const dx = p.x - a.x, dy = p.y - a.y;
  if (Math.abs(dx) > Math.abs(dy) * 3) return { ax: a.x, ay: a.y, bx: p.x, by: a.y };
  if (Math.abs(dy) > Math.abs(dx) * 3) return { ax: a.x, ay: a.y, bx: a.x, by: p.y };
  return { ax: a.x, ay: a.y, bx: p.x, by: p.y };
}

// suggest N/E/S/W by orientation
function suggestName(line, walls) {
  const horiz = Math.abs(line.bx - line.ax) >= Math.abs(line.by - line.ay);
  const used = new Set((walls || []).map((w) => w.name));
  const opts = horiz ? ["North Wall", "South Wall"] : ["West Wall", "East Wall"];
  for (const o of opts) if (!used.has(o)) return o;
  return "";
}

function shell(projectId, title, body) {
  return html`
    <main>
      <div class="wrap">${body}</div>
    </main>`;
}
