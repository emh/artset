import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { crumbs } from "../store.js";

function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: p.x, y: p.y };
}

export function RoomView({ projectId, roomId }) {
  const [floorplan, setFloorplan] = useState(null);
  const [room, setRoom] = useState(null);
  const [walls, setWalls] = useState(null);
  const [err, setErr] = useState(null);

  const [draft, setDraft] = useState(null);     // {ax,ay,bx,by} being drawn
  const [pending, setPending] = useState(null); // finalized line awaiting name/length
  const [nameVal, setNameVal] = useState("");
  const [lenVal, setLenVal] = useState("");
  const [pop, setPop] = useState(null);         // {left, top} container-relative
  const [hoverId, setHoverId] = useState(null);

  const svgRef = useRef(null);
  const wrapRef = useRef(null);
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
      if (!p.floorplan) { setErr("This project has no floor plan yet."); return; }
      setFloorplan(p.floorplan); setRoom(r.room); setWalls(w.walls);
      crumbs.value = [
        { label: p.project.name, href: `/projects/${projectId}` },
        { label: r.room.name, href: `/projects/${projectId}/rooms/${roomId}` },
      ];
    }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [projectId, roomId]);

  useEffect(() => { if (pending && nameRef.current) nameRef.current.focus(); }, [pending]);

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
    const wr = wrapRef.current.getBoundingClientRect();
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

  async function removeWall(id) {
    if (!confirm("Delete this wall?")) return;
    await api.del(`/api/walls/${id}`);
    setWalls((ws) => ws.filter((w) => w.id !== id));
  }

  const stage = html`
    <div ref=${wrapRef} class="stage tool-draw" style="position:relative">
      <svg ref=${svgRef} style="display:block;width:100%;max-height:72vh" viewBox=${`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp}>
        <image href=${`/api/projects/${projectId}/plan-image?v=${floorplan.id}`} x="0" y="0" width=${W} height=${H} preserveAspectRatio="none" />
        <rect class="room-rect" x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} fill="none" />
        ${(walls || []).map((w) => html`
          <g key=${w.id} onMouseEnter=${() => setHoverId(w.id)} onMouseLeave=${() => setHoverId(null)} style="cursor:pointer"
             onClick=${() => navigate(`/projects/${projectId}/rooms/${roomId}/walls/${w.id}`)}>
            <line class=${"wall-line" + (hoverId === w.id ? " is-hover" : "")} x1=${w.ax} y1=${w.ay} x2=${w.bx} y2=${w.by}
              stroke-width=${stroke} />
            <text class="wall-label" font-size=${fs} x=${(w.ax + w.bx) / 2} y=${(w.ay + w.by) / 2 - stroke}>${w.name.toUpperCase()}</text>
          </g>
        `)}
        ${draft && html`<line class="wall-draft" x1=${draft.ax} y1=${draft.ay} x2=${draft.bx} y2=${draft.by} stroke-width=${stroke} />`}
        ${pending && html`<line class="wall-draft" x1=${pending.ax} y1=${pending.ay} x2=${pending.bx} y2=${pending.by} stroke-width=${stroke} />`}
      </svg>
      ${pop && html`
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
      `}
    </div>`;

  const sidebar = html`
    <aside class="sidebar">
      <div class="eyebrow">Walls</div>
      <p class="muted" style="font-size:13px;margin-top:-8px;margin-bottom:18px">Drag a line along each wall, then name it and enter its length.</p>
      ${walls === null && html`<p class="spinner">Loading…</p>`}
      ${walls && walls.length === 0 && html`<p class="swatch-no">No walls yet.</p>`}
      ${walls && walls.map((w) => html`
        <div class=${"roomrow" + (hoverId === w.id ? " is-hover" : "")} key=${w.id}
          onMouseEnter=${() => setHoverId(w.id)} onMouseLeave=${() => setHoverId(null)}>
          <span class="grow rname" style="cursor:pointer" onClick=${() => navigate(`/projects/${projectId}/rooms/${roomId}/walls/${w.id}`)}>
            ${w.name} <span class="mono muted">${w.length_inches}″</span>
          </span>
          <button class="linkbtn muted" onClick=${() => removeWall(w.id)}>Delete</button>
          <button class="linkbtn" onClick=${() => navigate(`/projects/${projectId}/rooms/${roomId}/walls/${w.id}`)}>Spec →</button>
        </div>
      `)}
      ${walls && walls.length > 0 && html`<p class="count" style="margin-top:18px">${walls.length} wall${walls.length === 1 ? "" : "s"}</p>`}
    </aside>`;

  return shell(projectId, room.name, html`<div class="workspace">${stage}${sidebar}</div>`);
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
