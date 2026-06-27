import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../api.js";

const MINW = 2; // min usable span width, inches

function mergeSpans(spans, length) {
  const s = spans
    .map((x) => ({ start: Math.max(0, Math.min(length, x.start)), end: Math.max(0, Math.min(length, x.end)) }))
    .filter((x) => x.end - x.start >= 0.5)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const sp of s) {
    const last = out[out.length - 1];
    if (last && sp.start <= last.end + 0.5) last.end = Math.max(last.end, sp.end);
    else out.push({ ...sp });
  }
  return out;
}

function svgX(svg, clientX) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = 0;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}

// a piece fits if its horizontal span sits entirely within one usable span
function fitsAt(start, width, segments) {
  return segments.some((s) => start >= s.start - 0.01 && start + width <= s.end + 0.01);
}

export function WallSpecEditor({ wall, projectId, placeArtId, onChange }) {
  const [name, setName] = useState(wall.name);
  const [length, setLength] = useState(wall.length_inches);
  const [height, setHeight] = useState(wall.height_inches);
  const [segments, setSegments] = useState(wall.segments || []);
  const [draft, setDraft] = useState(null);
  const [live, setLive] = useState(null);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState(placeArtId ? "place" : "usable");
  const [placements, setPlacements] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [selPlace, setSelPlace] = useState(null);
  const [picking, setPicking] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [hoverSpan, setHoverSpan] = useState(null);

  const svgRef = useRef(null);
  const viewportRef = useRef(null);
  const interact = useRef(null);
  const anchorRef = useRef(0);
  const draftRef = useRef(null);
  const segsRef = useRef(segments);
  const placeRef = useRef([]);
  const artDrag = useRef(null);
  const didAutoPlace = useRef(false);
  const pointers = useRef(new Map());
  const panPoint = useRef(null);

  const L = Number(length) || 1;
  const bandH = Number(height) || 108;
  const fontR = Math.min(Math.max(L * 0.022, bandH * 0.05), bandH * 0.14);
  const grabW = Math.max(L * 0.02, 2);
  const rulerH = 24;
  const rulerTickLen = 5;
  const rulerLabelSize = 10;
  const rulerLabelY = 12;
  const canPan = zoom > 1.01;
  const maxRendererH = Math.max(120, Math.min(640, (viewport.windowH || 720) - 330));
  const baseScale = viewport.w ? Math.min(viewport.w / L, maxRendererH / bandH) : 0;
  const baseWallW = L * baseScale;
  const baseWallH = bandH * baseScale;
  const renderedWallW = baseWallW * zoom;
  const renderedWallH = baseWallH * zoom;
  const rendererH = renderedWallH ? Math.min(renderedWallH, maxRendererH) : 0;
  const maxPanX = Math.max(0, (renderedWallW - (viewport.w || 0)) / 2);
  const maxPanY = Math.max(0, (renderedWallH - rendererH) / 2);
  const clampPan = (next) => ({
    x: Math.max(-maxPanX, Math.min(maxPanX, next.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, next.y)),
  });
  const wallLeft = ((viewport.w || 0) - renderedWallW) / 2 + pan.x;
  const wallTop = (rendererH - renderedWallH) / 2 + pan.y;
  const visibleStartX = renderedWallW ? Math.max(0, -wallLeft) : 0;
  const visibleEndX = renderedWallW ? Math.min(renderedWallW, (viewport.w || 0) - wallLeft) : 0;
  const visibleStartY = renderedWallH ? Math.max(0, -wallTop) : 0;
  const visibleEndY = renderedWallH ? Math.min(renderedWallH, rendererH - wallTop) : 0;
  const visibleW = renderedWallW ? Math.min(1, Math.max(0, (visibleEndX - visibleStartX) / renderedWallW)) : 1;
  const visibleH = renderedWallH ? Math.min(1, Math.max(0, (visibleEndY - visibleStartY) / renderedWallH)) : 1;
  const rulerWidth = renderedWallW;
  const wallPixelLeft = viewport.w ? (viewport.w - rulerWidth) / 2 + pan.x : 0;
  const rulerTrackWidth = rulerWidth;
  const rulerLeft = wallPixelLeft + 1;
  const xToPx = (x) => Math.max(0, Math.min(viewport.w || 0, wallPixelLeft + (rulerTrackWidth * x) / L));
  const liveMeasures = live
    ? live.measures || [{ x: live.x, text: live.text }]
    : [];
  const liveSpan = live && live.span;
  const miniRect = {
    x: renderedWallW ? (visibleStartX / renderedWallW) * L : 0,
    y: renderedWallH ? (visibleStartY / renderedWallH) * bandH : 0,
    w: visibleW * L,
    h: visibleH * bandH,
  };

  function setPlace(next) { placeRef.current = next; setPlacements(next); }

  useEffect(() => {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    const measure = () => {
      setViewport({ w: el.clientWidth, h: el.clientHeight, windowH: window.innerHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => {
    setPan((p) => clampPan(p));
  }, [zoom, viewport.w, viewport.h, viewport.windowH, L, bandH]);

  useEffect(() => {
    api.get(`/api/walls/${wall.id}/placements`).then((d) => setPlace(d.placements)).catch(() => {});
  }, [wall.id]);
  useEffect(() => {
    if (!projectId) return;
    api.get(`/api/projects/${projectId}/art`).then((d) => setInventory(d.art)).catch(() => {});
  }, [projectId]);

  // entry from inventory "Place": auto-add the chosen piece once inventory is ready
  useEffect(() => {
    if (!placeArtId || didAutoPlace.current || !inventory.length) return;
    const piece = inventory.find((p) => p.id === placeArtId);
    if (piece && piece.sizes.length) { didAutoPlace.current = true; addPlacement(piece, piece.sizes[0]); }
  }, [placeArtId, inventory]);

  // ---------- persistence ----------
  function setSegs(next) { segsRef.current = next; setSegments(next); }
  async function persist(patch) {
    setSaving(true);
    try {
      const { wall: w } = await api.patch(`/api/walls/${wall.id}`, patch);
      if (onChange) onChange(w);
      setSegs(w.segments || []);
    } finally { setSaving(false); }
  }
  function commitSegments(spans) { const m = mergeSpans(spans, L); setSegs(m); persist({ segments: m }); }

  const clampX = (x) => Math.max(0, Math.min(L, x));
  function cancelActiveGesture() {
    interact.current = null;
    artDrag.current = null;
    draftRef.current = null;
    setDraft(null);
    setLive(null);
  }
  function zoomBy(delta) {
    setZoom((z) => {
      const next = Math.max(1, Math.min(3, Math.round((z + delta) * 100) / 100));
      if (next <= 1.01) setPan({ x: 0, y: 0 });
      return next;
    });
  }
  function panBy(dx, dy) {
    if (!canPan) return;
    setPan((p) => clampPan({ x: p.x + dx, y: p.y + dy }));
  }
  function midpoint() {
    const pts = Array.from(pointers.current.values());
    if (pts.length < 2) return null;
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }
  function onViewportWheel(e) {
    if (!canPan) return;
    e.preventDefault();
    panBy(-e.deltaX, -e.deltaY);
  }
  function onViewportPointerDown(e) {
    if (e.pointerType !== "touch") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && canPan) {
      cancelActiveGesture();
      panPoint.current = midpoint();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function onViewportPointerMove(e) {
    if (e.pointerType !== "touch" || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size < 2 || !canPan) return;
    const next = midpoint();
    if (next && panPoint.current) panBy(next.x - panPoint.current.x, next.y - panPoint.current.y);
    panPoint.current = next;
    e.preventDefault();
    e.stopPropagation();
  }
  function onViewportPointerEnd(e) {
    pointers.current.delete(e.pointerId);
    panPoint.current = midpoint();
  }

  // ---------- usable-space interactions (usable mode) ----------
  function onDownNew(e) {
    if (pointers.current.size >= 2) return;
    if (mode !== "usable") return;
    e.preventDefault(); e.stopPropagation();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const x = clampX(svgX(svgRef.current, e.clientX));
    interact.current = { type: "new" };
    anchorRef.current = x;
    draftRef.current = { start: x, end: x };
    setDraft({ start: x, end: x });
    setLive({ measures: [{ x, text: `${Math.round(x)}″` }] });
  }
  function onDownHandle(e, index, edge) {
    if (pointers.current.size >= 2) return;
    e.preventDefault(); e.stopPropagation();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    interact.current = { type: "handle", index, edge };
    const v = segsRef.current[index][edge];
    setLive({ x: v, text: `${Math.round(v)}″` });
  }
  // ---------- art placement interactions (place mode) ----------
  function onArtDown(e, p) {
    if (pointers.current.size >= 2) return;
    if (mode !== "place") return;
    e.preventDefault(); e.stopPropagation();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const x = clampX(svgX(svgRef.current, e.clientX));
    artDrag.current = { id: p.id, grab: x - p.start_inches };
    setSelPlace(p.id);
    setLive({ x: p.start_inches + p.width_inches / 2, text: `${Math.round(p.start_inches)}″` });
  }

  function onMove(e) {
    if (artDrag.current) {
      const x = clampX(svgX(svgRef.current, e.clientX));
      const id = artDrag.current.id;
      const p = placeRef.current.find((q) => q.id === id);
      if (!p) return;
      const ns = Math.max(0, Math.min(L - p.width_inches, x - artDrag.current.grab));
      setPlace(placeRef.current.map((q) => (q.id === id ? { ...q, start_inches: ns } : q)));
      setLive({ x: ns + p.width_inches / 2, text: `${Math.round(ns)}″` });
      return;
    }
    const it = interact.current;
    if (!it) return;
    const x = clampX(svgX(svgRef.current, e.clientX));
    if (it.type === "new") {
      const d = { start: Math.min(anchorRef.current, x), end: Math.max(anchorRef.current, x) };
      draftRef.current = d; setDraft(d);
      setLive({
        measures: [
          { x: d.start, text: `${Math.round(d.start)}″` },
          { x: d.end, text: `${Math.round(d.end)}″` },
        ],
        span: d.end - d.start >= 1 ? d : null,
      });
    } else {
      const next = segsRef.current.map((s, i) => {
        if (i !== it.index) return s;
        if (it.edge === "start") return { ...s, start: Math.min(x, s.end - MINW) };
        return { ...s, end: Math.max(x, s.start + MINW) };
      });
      setSegs(next);
      const v = next[it.index][it.edge];
      setLive({ x: v, text: `${Math.round(v)}″` });
    }
  }
  function onUp() {
    setLive(null);
    if (artDrag.current) {
      const id = artDrag.current.id; artDrag.current = null;
      const p = placeRef.current.find((q) => q.id === id);
      if (p) api.patch(`/api/placements/${id}`, { start_inches: p.start_inches }).catch(() => {});
      return;
    }
    const it = interact.current;
    interact.current = null;
    if (!it) return;
    if (it.type === "new") {
      const d = draftRef.current; draftRef.current = null; setDraft(null);
      if (d && d.end - d.start >= MINW) commitSegments([...segsRef.current, d]);
    } else {
      commitSegments(segsRef.current);
    }
  }

  function removeSpan(i) { commitSegments(segsRef.current.filter((_, k) => k !== i)); }

  function saveMeta() {
    const len = parseFloat(length), h = parseFloat(height);
    const patch = { name: name.trim() || wall.name };
    if (len > 0) patch.length_inches = len;
    if (h > 0) patch.height_inches = h;
    persist(patch);
  }

  // ---------- placement ops ----------
  async function refreshInventory() {
    if (projectId) api.get(`/api/projects/${projectId}/art`).then((d) => setInventory(d.art)).catch(() => {});
  }
  async function addPlacement(piece, size) {
    const span = segments.find((s) => s.end - s.start >= size.width_inches);
    const start = span ? span.start : 0;
    const { placement } = await api.post(`/api/walls/${wall.id}/placements`, {
      art_piece_id: piece.id, art_size_id: size.id, start_inches: start,
    });
    // placing moves the piece, so re-sync this wall's placements rather than appending
    const { placements } = await api.get(`/api/walls/${wall.id}/placements`);
    setPlace(placements);
    setSelPlace(placement.id);
    setPicking(false);
    setMode("place");
    refreshInventory();
  }
  async function removePlacement(id) {
    await api.del(`/api/placements/${id}`);
    setPlace(placeRef.current.filter((p) => p.id !== id));
    if (selPlace === id) setSelPlace(null);
    refreshInventory();
  }

  // ---------- geometry helpers ----------
  const usableTotal = segments.reduce((a, s) => a + (s.end - s.start), 0);
  const ticks = [];
  const step = L > 180 ? 24 : L > 60 ? 12 : 6;
  for (let i = 0; i <= L + 0.01; i += step) ticks.push(Math.min(i, L));
  if (ticks[ticks.length - 1] < L - step * 0.4) ticks.push(L);
  const artTop = (p) => (bandH - (p.center_height_inches ?? bandH * 0.5)) - p.height_inches / 2;

  return html`
    <div class="workspace">
      <div>
        <div class="mode-tabs">
          <button class=${"mode-tab" + (mode === "usable" ? " is-active" : "")} onClick=${() => { setMode("usable"); setSelPlace(null); }}>Usable space</button>
          <button class=${"mode-tab" + (mode === "place" ? " is-active" : "")} onClick=${() => setMode("place")}>Place art</button>
        </div>

        <div class="wall-render-head">
          <div class="zoom-controls" aria-label="Zoom controls">
            <button class="iconbtn" type="button" title="Zoom out" aria-label="Zoom out" disabled=${zoom <= 1.01} onClick=${() => zoomBy(-0.25)}>-</button>
            <button class="iconbtn" type="button" title="Zoom in" aria-label="Zoom in" disabled=${zoom >= 2.99} onClick=${() => zoomBy(0.25)}>+</button>
          </div>
        </div>
        <div ref=${viewportRef} class=${"wall-renderer" + (canPan ? " can-pan" : "")}
          style=${rendererH ? `height:${rendererH}px` : ""}
          onWheel=${onViewportWheel}
          onPointerDownCapture=${onViewportPointerDown}
          onPointerMoveCapture=${onViewportPointerMove}
          onPointerUpCapture=${onViewportPointerEnd}
          onPointerCancelCapture=${onViewportPointerEnd}>
          <svg ref=${svgRef} class="elevation wall-render-svg" style=${renderedWallW && renderedWallH ? `width:${renderedWallW}px;height:${renderedWallH}px;transform:translate(${pan.x}px, ${pan.y}px)` : ""}
            viewBox=${`0 0 ${L} ${bandH}`}
            preserveAspectRatio="xMidYMid meet" onPointerMove=${onMove} onPointerUp=${onUp}>
            <rect class="ev-band" x="0" y="0" width=${L} height=${bandH} onPointerDown=${mode === "usable" ? onDownNew : undefined} />
            ${segments.map((s, i) => html`
              <g key=${i}>
                <rect class=${"ev-usable" + (hoverSpan === i ? " is-hover" : "")} x=${s.start} y="0" width=${Math.max(0, s.end - s.start)} height=${bandH}
                  onPointerDown=${mode === "usable" ? onDownNew : undefined} />
                ${mode === "usable" && ["start", "end"].map((edge) => html`
                  <g key=${edge}>
                    <line class="ev-handle" x1=${s[edge]} y1="0" x2=${s[edge]} y2=${bandH} />
                    <rect class="ev-grab" x=${s[edge] - grabW / 2} y="0" width=${grabW} height=${bandH}
                      onPointerDown=${(e) => onDownHandle(e, i, edge)} />
                  </g>
                `)}
              </g>
            `)}
            ${draft && html`<rect class="ev-usable is-draft" x=${draft.start} y="0" width=${Math.max(0, draft.end - draft.start)} height=${bandH} />`}

            <!-- placed art -->
            ${placements.map((p) => {
              const ok = fitsAt(p.start_inches, p.width_inches, segments);
              const sel = selPlace === p.id;
              const y = artTop(p);
              return html`
                <g key=${p.id} class=${"ev-art" + (mode === "place" ? " is-live" : "")} onPointerDown=${(e) => onArtDown(e, p)}>
                  ${p.has_image
                    ? html`<image href=${`/api/art/${p.art_piece_id}/image?v=${encodeURIComponent(p.image_v || "")}`} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} preserveAspectRatio="xMidYMid slice" />`
                    : html`<rect x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} fill="#fff" />`}
                  <rect class=${"ev-art-frame" + (ok ? "" : " no-fit") + (sel ? " is-sel" : "")} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} />
                </g>`;
            })}
          </svg>
          ${mode === "usable" && segments.map((s, i) => {
            const startPx = wallPixelLeft + (rulerTrackWidth * s.start) / L;
            const endPx = wallPixelLeft + (rulerTrackWidth * s.end) / L;
            const visibleStart = Math.max(0, startPx);
            const visibleEnd = Math.min(viewport.w || 0, endPx);
            if (visibleEnd - visibleStart < 24) return null;
            const x = (visibleStart + visibleEnd) / 2;
            return html`
              <div class=${"wall-span-control" + (hoverSpan === i ? " is-hover" : "")} key=${i} style=${`left:${x}px`}
                onMouseEnter=${() => setHoverSpan(i)}
                onMouseLeave=${() => setHoverSpan(null)}
                onPointerEnter=${() => setHoverSpan(i)}
                onPointerLeave=${() => setHoverSpan(null)}
                onFocusIn=${() => setHoverSpan(i)}
                onFocusOut=${() => setHoverSpan(null)}>
                <button class="wall-span-delete" type="button"
                  aria-label=${`Delete ${Math.round(s.end - s.start)} inch usable span`}
                  onPointerDown=${(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick=${(e) => { e.stopPropagation(); removeSpan(i); }}>
                  X
                </button>
                <span class="wall-span-label">
                  ${Math.round(s.end - s.start)}″
                </span>
              </div>`;
          })}
          ${mode === "usable" && liveSpan && (() => {
            const startPx = wallPixelLeft + (rulerTrackWidth * liveSpan.start) / L;
            const endPx = wallPixelLeft + (rulerTrackWidth * liveSpan.end) / L;
            const visibleStart = Math.max(0, startPx);
            const visibleEnd = Math.min(viewport.w || 0, endPx);
            if (visibleEnd - visibleStart < 24) return null;
            const x = (visibleStart + visibleEnd) / 2;
            return html`
              <span class="wall-span-label wall-span-label--live" style=${`left:${x}px`}>
                ${Math.round(liveSpan.end - liveSpan.start)}″
              </span>`;
          })()}
        </div>
        <div class="wall-ruler-viewport">
          ${liveMeasures.map((m, i) => html`
            <div class="wall-live-measure" key=${i} style=${`left:${xToPx(m.x)}px`}>
              <span>${m.text}</span>
            </div>
          `)}
          <svg class="wall-ruler" style=${rulerTrackWidth ? `left:${rulerLeft}px;width:${rulerTrackWidth}px` : ""}
            viewBox=${`0 0 ${L} ${rulerH}`} preserveAspectRatio="none" aria-label="Wall ruler">
            <line class="ev-ruleline" x1="0" y1="0.5" x2=${L} y2="0.5" />
            ${ticks.map((t, i) => {
              const isLast = i === ticks.length - 1;
              return html`
              <g key=${i}>
                <line class="ev-tick" x1=${t} y1="0.5" x2=${t} y2=${rulerTickLen + 0.5} />
              </g>`;
            })}
          </svg>
          ${ticks.map((t, i) => {
            const isLast = i === ticks.length - 1;
            const x = rulerLeft + (rulerTrackWidth * t) / L;
            return html`
              <span class=${"wall-ruler-label" + (i === 0 ? " is-start" : isLast ? " is-end" : "")}
                style=${`left:${x}px;top:${rulerLabelY}px;font-size:${rulerLabelSize}px`}>
                ${Math.round(t)}″
              </span>`;
          })}
        </div>
        ${canPan && html`
          <svg class="wall-minimap" viewBox=${`0 0 ${L} ${bandH}`} preserveAspectRatio="xMidYMid meet" aria-label="Wall minimap">
            <rect class="ev-band" x="0" y="0" width=${L} height=${bandH} />
            ${segments.map((s, i) => html`<rect key=${i} class="ev-usable" x=${s.start} y="0" width=${Math.max(0, s.end - s.start)} height=${bandH} />`)}
            ${placements.map((p) => html`<rect key=${p.id} class="mini-art" x=${p.start_inches} y=${artTop(p)} width=${p.width_inches} height=${p.height_inches} />`)}
            <rect class="mini-window" x=${miniRect.x} y=${miniRect.y} width=${miniRect.w} height=${miniRect.h} />
          </svg>
        `}
        <p class="mono muted" style="margin-top:12px">
          ${mode === "usable"
            ? html`Drag across the wall to mark usable space. Drag the edges to adjust. ${saving ? "· saving…" : ""}`
            : html`Drag a piece to position it. Pieces outlined in rust don’t fit the usable space.`}
        </p>
      </div>

      ${mode === "usable" ? usableSidebar() : placeSidebar()}
    </div>
  `;

  function usableSidebar() {
    return html`
      <aside class="sidebar">
        <div class="eyebrow">Wall</div>
        <label class="field"><span class="label">Name</span>
          <input class="input" name="wall-name" autocomplete="off" value=${name} onInput=${(e) => setName(e.target.value)} onBlur=${saveMeta}
            onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} /></label>
        <div class="flex gap-md">
          <label class="field" style="flex:1"><span class="label">Length ″</span>
            <input class="input" name="wall-length" inputmode="decimal" autocomplete="off" value=${length} onInput=${(e) => setLength(e.target.value)} onBlur=${saveMeta}
              onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} /></label>
          <label class="field" style="flex:1"><span class="label">Height ″</span>
            <input class="input" name="wall-height" inputmode="decimal" autocomplete="off" value=${height} onInput=${(e) => setHeight(e.target.value)} onBlur=${saveMeta}
              onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} /></label>
        </div>
        <div class="eyebrow" style="margin-top:24px;margin-bottom:12px">Usable spans</div>
        ${segments.length === 0 && html`<p class="swatch-no">None yet — drag on the wall.</p>`}
        ${segments.length > 0 && html`
          <div class="wall-span-list">
            ${segments.map((s, i) => html`
              <div class=${"roomrow wall-span-row" + (hoverSpan === i ? " is-hover" : "")} key=${i}
                onMouseEnter=${() => setHoverSpan(i)}
                onMouseLeave=${() => setHoverSpan(null)}
                onPointerEnter=${() => setHoverSpan(i)}
                onPointerLeave=${() => setHoverSpan(null)}
                onFocusIn=${() => setHoverSpan(i)}
                onFocusOut=${() => setHoverSpan(null)}>
                <span class="grow mono">${Math.round(s.start)}″ – ${Math.round(s.end)}″ <span class="muted">· ${Math.round(s.end - s.start)}″</span></span>
                <button class="linkbtn muted" onClick=${() => removeSpan(i)}>Delete</button>
              </div>`)}
          </div>`}
        <p class="count" style="margin-top:18px">${Math.round(usableTotal)}″ usable of ${Math.round(L)}″</p>
      </aside>`;
  }

  function placeSidebar() {
    return html`
      <aside class="sidebar">
        <div class="flex between items-center" style="margin-bottom:14px">
          <div class="eyebrow" style="margin:0">Placed art</div>
          ${!picking && html`<button class="linkbtn" onClick=${() => setPicking(true)}>+ Add art</button>`}
        </div>

        ${picking && html`
          <div class="card" style="padding:16px;margin-bottom:18px">
            <div class="label" style="margin-bottom:10px">Choose a piece</div>
            ${inventory.length === 0 && html`<p class="swatch-no">No art in inventory yet.</p>`}
            ${inventory.map((piece) => html`
              <div class="pick-piece" key=${piece.id}>
                <div class="grow"><div class="rname">${piece.title}</div>
                  ${piece.placed
                    ? html`<div class="muted" style="font-size:12px">Placed · ${piece.placed.wall_id === wall.id ? "this wall" : `${piece.placed.room_name} · ${piece.placed.wall_name}`}</div>`
                    : piece.artist && html`<div class="muted" style="font-size:12px">${piece.artist}</div>`}</div>
                <div class="flex gap-sm" style="flex-wrap:wrap;justify-content:flex-end">
                  ${piece.sizes.map((s) => html`<button class="chip pick-size" key=${s.id} onClick=${() => addPlacement(piece, s)} title=${piece.placed ? "Move here" : "Place"}>${+s.width_inches}×${+s.height_inches}″</button>`)}
                </div>
              </div>`)}
            <p style="margin-top:10px"><button class="linkbtn muted" onClick=${() => setPicking(false)}>Cancel</button></p>
          </div>`}

        ${placements.length === 0 && !picking && html`<p class="swatch-no">No art placed on this wall.</p>`}
        ${placements.map((p) => {
          const ok = fitsAt(p.start_inches, p.width_inches, segments);
          return html`
          <div class=${"roomrow" + (selPlace === p.id ? " is-hover" : "")} key=${p.id} onClick=${() => setSelPlace(p.id)}>
            <span class="grow"><span class="rname">${p.title}</span>
              <span class="mono muted" style="display:block;font-size:12px">${+p.width_inches}×${+p.height_inches}″ · at ${Math.round(p.start_inches)}″ · ${ok ? "fits" : "doesn’t fit"}</span></span>
            <button class="linkbtn muted" onClick=${(e) => { e.stopPropagation(); removePlacement(p.id); }}>Remove</button>
          </div>`;
        })}
        ${placements.length > 0 && html`<p class="count" style="margin-top:18px">${placements.length} placed</p>`}
      </aside>`;
  }
}
