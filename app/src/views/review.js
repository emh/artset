import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { FloorplanLabel } from "../components/floorplan-label.js";
import { FloorplanViewport } from "../components/floorplan-viewport.js";
import { ReviewElevation } from "../components/review-elevation.js";
import { crumbs } from "../store.js";

const money = (n) => (n == null ? "-" : "$" + Number(n).toLocaleString());
const inch = (n) => `${Math.round(Number(n) || 0)}"`;
const sizeText = (p) => `${+p.width_inches}x${+p.height_inches}"`;

function wallUsable(w) {
  return (w.segments || []).reduce((a, s) => a + (s.end - s.start), 0);
}

function roomPlacementCount(room) {
  return (room.walls || []).reduce((sum, wall) => sum + (wall.placements || []).length, 0);
}

function roomsForFloorplan(rooms, floorplan) {
  if (!floorplan) return [];
  return (rooms || []).filter((room) => room.floorplan_id === floorplan.id);
}

function floorplanPlacementCount(rooms, floorplan) {
  return roomsForFloorplan(rooms, floorplan).reduce((sum, room) => sum + roomPlacementCount(room), 0);
}

function findSelection(floorplans, rooms, selection) {
  if (!selection || selection.type === "project") return { type: "project" };
  for (const floorplan of floorplans) {
    if (selection.type === "floorplan" && floorplan.id === selection.id) return { type: "floorplan", floorplan };
    for (const room of roomsForFloorplan(rooms, floorplan)) {
      if (selection.type === "room" && room.id === selection.id) return { type: "room", floorplan, room };
      for (const wall of room.walls || []) {
        if (selection.type === "wall" && wall.id === selection.id) return { type: "wall", floorplan, room, wall };
        for (const placement of wall.placements || []) {
          if (selection.type === "placement" && placement.id === selection.id) return { type: "placement", floorplan, room, wall, placement };
        }
      }
    }
  }
  return { type: "project" };
}

export function ReviewView({ projectId, token }) {
  const isPublic = !!token;
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [selection, setSelection] = useState({ type: "project" });
  const [hoverKey, setHoverKey] = useState(null);

  useEffect(() => {
    const url = isPublic ? `/api/public/${token}` : `/api/projects/${projectId}/review`;
    api.get(url).then((d) => {
      setData(d);
      if (!isPublic) crumbs.value = [{ label: d.project.name, href: `/projects/${projectId}` }];
    }).catch((e) => setErr(e.message));
  }, [projectId, token]);

  if (err) return html`<main><div class="wrap"><div class="empty"><p>${err}</p>
    ${!isPublic && html`<p class="mt-md"><a class="linkbtn" href="/" data-link>Back to projects</a></p>`}</div></div></main>`;
  if (!data) return html`<main><div class="wrap"><p class="spinner">Loading...</p></div></main>`;

  const { project, studio, floorplan, rooms, summary } = data;
  const floorplans = data.floorplans || (floorplan ? [floorplan] : []);
  const selected = findSelection(floorplans, rooms, selection);
  const planImageUrl = (fp) => {
    const v = fp && (fp.image_key || fp.v);
    const base = isPublic
      ? (fp && fp.id ? `/api/public/${token}/floorplans/${fp.id}/image` : `/api/public/${token}/plan-image`)
      : (fp && fp.id ? `/api/projects/${projectId}/floorplans/${fp.id}/image` : `/api/projects/${projectId}/plan-image`);
    return base + (v ? `?v=${encodeURIComponent(v)}` : "");
  };
  const artImageUrl = (aid, v) => (isPublic ? `/api/public/${token}/art/${aid}/image` : `/api/art/${aid}/image`) + (v ? `?v=${encodeURIComponent(v)}` : "");

  function select(next) { setSelection(next); setHoverKey(null); }
  function nodeClass(type, id) {
    const active = selected.type === type && (!id || (selected[type] && selected[type].id === id) || selection.id === id);
    return "review-tree-node" + (active ? " is-active" : "");
  }

  function tree() {
    return html`
      <aside class="review-tree" aria-label="Review navigation">
        <button class=${nodeClass("project")} type="button" onClick=${() => select({ type: "project" })}>
          <span class="review-tree-name">${project.name}</span>
          <span class="review-tree-meta">${summary.placed} placed</span>
        </button>
        <div class="review-tree-list">
          ${floorplans.map((fp, index) => {
            const fpRooms = roomsForFloorplan(rooms, fp);
            const count = floorplanPlacementCount(rooms, fp);
            return html`
              <div class="review-tree-group" key=${fp.id}>
                <button class=${nodeClass("floorplan", fp.id)} type="button" onClick=${() => select({ type: "floorplan", id: fp.id })}>
                  <span class="review-tree-name">${fp.name || `Floor plan ${index + 1}`}</span>
                  <span class="review-tree-meta">${count} placed</span>
                </button>
                <div class="review-tree-branch review-tree-branch--rooms">
                  ${fpRooms.map((room) => html`
                    <button class=${nodeClass("room", room.id)} key=${room.id} type="button" onClick=${() => select({ type: "room", id: room.id })}>
                      <span class="review-tree-name">${room.name}</span>
                      <span class="review-tree-meta">${roomPlacementCount(room)} placed</span>
                    </button>
                    ${(room.walls || []).map((wall) => html`
                      <div class="review-tree-branch review-tree-branch--walls" key=${wall.id}>
                        <button class=${nodeClass("wall", wall.id)} type="button" onClick=${() => select({ type: "wall", id: wall.id })}>
                          <span class="review-tree-name">${wall.name}</span>
                          <span class="review-tree-meta">${(wall.placements || []).length}</span>
                        </button>
                        ${(wall.placements || []).map((p) => html`
                          <button class=${nodeClass("placement", p.id)} key=${p.id} type="button" onClick=${() => select({ type: "placement", id: p.id })}>
                            <span class="review-tree-name">${p.title}</span>
                            <span class="review-tree-meta">${sizeText(p)}</span>
                          </button>`)}
                      </div>`)}
                  `)}
                </div>
              </div>`;
          })}
        </div>
      </aside>`;
  }

  function projectPanel() {
    if (!floorplans.length) return html`<div class="empty"><p>No floor plan uploaded.</p></div>`;
    return html`
      <section class="review-panel">
        <div class="review-panel-head">
          <div>
            <div class="eyebrow">Project</div>
            <h1>${project.name}</h1>
          </div>
        </div>
        <div class="review-floorplan-grid">
          ${floorplans.map((fp, index) => {
            const fpRooms = roomsForFloorplan(rooms, fp);
            return html`
              <button class="review-floorplan-card" key=${fp.id} type="button" onClick=${() => select({ type: "floorplan", id: fp.id })}>
                <img src=${planImageUrl(fp)} alt="" />
                <span class="review-tree-name">${fp.name || `Floor plan ${index + 1}`}</span>
                <span class="review-tree-meta">${fpRooms.length} rooms · ${floorplanPlacementCount(rooms, fp)} placed</span>
              </button>`;
          })}
        </div>
      </section>`;
  }

  function floorplanPanel(floorplan) {
    if (!floorplan) return html`<div class="empty"><p>No floor plan uploaded.</p></div>`;
    const fpRooms = roomsForFloorplan(rooms, floorplan);
    const W = floorplan.width_px, H = floorplan.height_px;
    const labelSize = 10;
    return html`
      <section class="review-panel">
        <div class="review-panel-head">
          <div>
            <div class="eyebrow">Floor plan</div>
            <h1>${floorplan.name || project.name}</h1>
          </div>
        </div>
        <${FloorplanViewport}
          width=${W}
          height=${H}
          viewBox=${{ x: 0, y: 0, w: W, h: H }}
          imageHref=${planImageUrl(floorplan)}
          ariaLabel="Project rooms"
          title=${floorplan.name || project.name}
          renderMiniContent=${() => html`
            ${fpRooms.map((room) => html`
              <rect class="room-rect" x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} />
            `)}
          `}>
          ${({ displayScale }) => html`
            ${fpRooms.map((room) => {
              const key = `room:${room.id}`;
              return html`
                <g key=${room.id} class="review-click-target"
                  onMouseEnter=${() => setHoverKey(key)}
                  onMouseLeave=${() => setHoverKey(null)}
                  onClick=${() => select({ type: "room", id: room.id })}>
                  <rect class=${"room-rect" + (hoverKey === key ? " is-hover" : "")}
                    x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} />
                  <${FloorplanLabel}
                    text=${room.name}
                    fontSize=${labelSize}
                    displayScale=${displayScale}
                    x=${room.rect_x + (labelSize * 0.5) / displayScale}
                    y=${room.rect_y + (labelSize * 1.5) / displayScale}
                  />
                </g>`;
            })}
          `}
        <//>
      </section>`;
  }

  function roomPanel(room, floorplan) {
    if (!floorplan) return null;
    const pad = 0.08 * Math.max(room.rect_w, room.rect_h);
    const vb = { x: room.rect_x - pad, y: room.rect_y - pad, w: room.rect_w + 2 * pad, h: room.rect_h + 2 * pad };
    const stroke = Math.max(4, Math.min(room.rect_w, room.rect_h) * 0.02);
    const labelSize = 10;
    return html`
      <section class="review-panel">
        <div class="review-panel-head">
          <div>
            <div class="eyebrow">Room</div>
            <h1>${room.name}</h1>
          </div>
        </div>
        <${FloorplanViewport}
          width=${floorplan.width_px}
          height=${floorplan.height_px}
          viewBox=${vb}
          imageHref=${planImageUrl(floorplan)}
          ariaLabel=${`${room.name} walls`}
          title=${room.name}
          renderMiniContent=${() => html`
            <rect class="room-rect is-hover" x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} />
            ${(room.walls || []).map((wall) => html`
              <line class="wall-line" x1=${wall.ax} y1=${wall.ay} x2=${wall.bx} y2=${wall.by} stroke-width=${stroke} />
            `)}
          `}>
          ${({ displayScale }) => html`
            <rect class="room-rect is-hover" x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} />
            <${FloorplanLabel}
              text=${room.name}
              fontSize=${labelSize}
              displayScale=${displayScale}
              x=${room.rect_x + (labelSize * 0.5) / displayScale}
              y=${room.rect_y + (labelSize * 1.5) / displayScale}
            />
            ${(room.walls || []).map((wall) => {
              const key = `wall:${wall.id}`;
              return html`
                <g key=${wall.id} class="review-click-target"
                  onMouseEnter=${() => setHoverKey(key)}
                  onMouseLeave=${() => setHoverKey(null)}
                  onClick=${() => select({ type: "wall", id: wall.id })}>
                  <line class=${"wall-line" + (hoverKey === key ? " is-hover" : "")}
                    x1=${wall.ax} y1=${wall.ay} x2=${wall.bx} y2=${wall.by} stroke-width=${stroke} />
                  ${(() => {
                    const x = (wall.ax + wall.bx) / 2;
                    const y = (wall.ay + wall.by) / 2 - labelSize / displayScale;
                    return html`<${FloorplanLabel}
                      text=${wall.name}
                      fontSize=${labelSize}
                      displayScale=${displayScale}
                      anchor="middle"
                      className="wall-label"
                      x=${x}
                      y=${y}
                    />`;
                  })()}
                </g>`;
            })}
          `}
        <//>
      </section>`;
  }

  function wallPanel(room, wall, placementId) {
    return html`
      <section class="review-panel">
        <div class="review-panel-head">
          <div>
            <div class="eyebrow">${room.name}</div>
            <h1>${wall.name}</h1>
          </div>
        </div>
        <div class="review-wall-meta mono muted">
          ${inch(wall.length_inches)} total · ${inch(wallUsable(wall))} usable · ${(wall.placements || []).length} placed
        </div>
        <${ReviewElevation}
          wall=${wall}
          artImageUrl=${artImageUrl}
          selectedPlacementId=${placementId}
          onPlacementSelect=${(p) => select({ type: "placement", id: p.id })}
        />
        ${(wall.placements || []).length === 0 && html`<p class="swatch-no" style="margin-top:18px">No art placed on this wall.</p>`}
        ${(wall.placements || []).length > 0 && html`
          <div class="review-placement-list">
            ${wall.placements.map((p) => html`
              <button class=${"review-placement-row" + (placementId === p.id ? " is-active" : "")} type="button" key=${p.id}
                onClick=${() => select({ type: "placement", id: p.id })}>
                <span><span class="rname">${p.title}</span>
                  <span class="mono muted">${sizeText(p)} · center at ${inch(p.start_inches + p.width_inches / 2)}</span></span>
                <span class="mono">${money(p.price)}</span>
              </button>`)}
          </div>`}
      </section>`;
  }

  function placementPanel(room, wall, placement) {
    return html`
      <section class="review-panel">
        <div class="review-panel-head">
          <div>
            <div class="eyebrow">${room.name} / ${wall.name}</div>
            <h1>${placement.title}</h1>
          </div>
        </div>
        <div class="review-placement-detail">
          <${ReviewElevation}
            wall=${wall}
            artImageUrl=${artImageUrl}
            selectedPlacementId=${placement.id}
            onPlacementSelect=${(p) => select({ type: "placement", id: p.id })}
          />
          <div class="review-placement-facts">
            <div><span class="label">Size</span><span>${sizeText(placement)}</span></div>
            <div><span class="label">Position</span><span>${inch(placement.start_inches)} from left · center ${inch(placement.start_inches + placement.width_inches / 2)}</span></div>
            <div><span class="label">Price</span><span>${money(placement.price)}</span></div>
            ${placement.status && html`<div><span class="label">Status</span><span>${placement.status}</span></div>`}
          </div>
        </div>
      </section>`;
  }

  function mainPanel() {
    if (selected.type === "floorplan") return floorplanPanel(selected.floorplan);
    if (selected.type === "room") return roomPanel(selected.room, selected.floorplan);
    if (selected.type === "wall") return wallPanel(selected.room, selected.wall);
    if (selected.type === "placement") return placementPanel(selected.room, selected.wall, selected.placement);
    return projectPanel();
  }

  const head = isPublic && html`<div class="page-head">
    <div class="eyebrow">${studio.name}</div>
    <h1 class="display" style="font-size:40px;margin-top:12px">${project.name}</h1>
    <p class="muted" style="margin-top:8px">Art placement review</p>
  </div>`;

  return html`
    <main>
      <div class="wrap">
        ${head}
        ${isPublic && html`<hr class="rule" />`}

        <div class="review-layout">
          ${tree()}
          <div class="review-main">${mainPanel()}</div>
        </div>

        ${isPublic && html`<p class="muted" style="margin-top:64px;text-align:center;font-size:12px">Prepared by ${studio.name} · Artset</p>`}
      </div>
    </main>`;
}
