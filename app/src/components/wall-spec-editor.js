import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { LucideIcon } from "./lucide-icon.js";

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

function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// a piece fits if its horizontal span sits entirely within one usable span
function fitsAt(start, width, segments) {
  return segments.some((s) => start >= s.start - 0.01 && start + width <= s.end + 0.01);
}

function centeredInSpan(start, width, segments) {
  const center = start + width / 2;
  return segments.some((s) => {
    if (start < s.start - 0.01 || start + width > s.end + 0.01) return false;
    return Math.abs(center - (s.start + s.end) / 2) <= 0.5;
  });
}

function defaultSizeForPiece(piece) {
  const sizes = piece.sizes || [];
  if (!sizes.length) return null;
  const selectedIndex = Number(piece.metadata && piece.metadata.selectedSizeIndex);
  if (Number.isInteger(selectedIndex) && sizes[selectedIndex]) return sizes[selectedIndex];
  return sizes[0];
}

export function WallSpecEditor({ wall, projectId, placeArtId, onChange }) {
  const [name, setName] = useState(wall.name);
  const [length, setLength] = useState(wall.length_inches);
  const [height, setHeight] = useState(wall.height_inches);
  const [segments, setSegments] = useState(wall.segments || []);
  const [draft, setDraft] = useState(null);
  const [live, setLive] = useState(null);
  const [saving, setSaving] = useState(false);

  const [placements, setPlacements] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [selPlace, setSelPlace] = useState(null);
  const [hoverPlace, setHoverPlace] = useState(null);
  const [placementDialog, setPlacementDialog] = useState(null);
  const [pickSelection, setPickSelection] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [hoverSpan, setHoverSpan] = useState(null);
  const [maximized, setMaximized] = useState(false);

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
  const maxRendererH = maximized
    ? Math.max(180, (viewport.windowH || 720) - 220)
    : Math.max(120, Math.min(640, (viewport.windowH || 720) - 330));
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
  const wallPixelTop = rendererH ? (rendererH - renderedWallH) / 2 + pan.y : 0;
  const rulerTrackWidth = rulerWidth;
  const rulerLeft = wallPixelLeft + 1;
  const xToPx = (x) => Math.max(0, Math.min(viewport.w || 0, wallPixelLeft + (rulerTrackWidth * x) / L));
  const liveMeasures = live
    ? live.measures || [{ x: live.x, text: live.text, centered: live.centered }]
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
  }, [maximized]);
  useEffect(() => {
    setPan((p) => clampPan(p));
  }, [zoom, viewport.w, viewport.h, viewport.windowH, L, bandH]);

  useEffect(() => {
    if (!maximized) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMaximized(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [maximized]);

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
    const size = piece && defaultSizeForPiece(piece);
    if (piece && size) { didAutoPlace.current = true; addPlacement(piece, size); }
  }, [placeArtId, inventory]);
  useEffect(() => {
    if (!placementDialog) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closePlacementDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [placementDialog]);

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
  function spanIndexAtClient(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    const pt = svgPoint(svg, clientX, clientY);
    if (pt.y < 0 || pt.y > bandH) return null;
    const idx = segsRef.current.findIndex((s) => pt.x >= s.start && pt.x <= s.end);
    return idx >= 0 ? idx : null;
  }
  function updateHoverSpanFromPointer(e) {
    setHoverSpan(spanIndexAtClient(e.clientX, e.clientY));
  }
  function isSamePlacementHover(e, id) {
    const next = e.relatedTarget;
    return !!(next && next.closest && next.closest(`[data-placement-hover="${id}"]`));
  }

  // ---------- usable-space interactions (usable mode) ----------
  function onDownNew(e) {
    if (pointers.current.size >= 2) return;
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
    e.preventDefault(); e.stopPropagation();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const point = svgPoint(svgRef.current, e.clientX, e.clientY);
    const y = artTop(p);
    artDrag.current = { id: p.id, grabX: point.x - p.start_inches, grabY: point.y - y };
    setSelPlace(p.id);
    const centerX = p.start_inches + p.width_inches / 2;
    setLive({ x: centerX, text: `${Math.round(centerX)}″`, centered: centeredInSpan(p.start_inches, p.width_inches, segsRef.current) });
  }

  function onMove(e) {
    if (artDrag.current) {
      const point = svgPoint(svgRef.current, e.clientX, e.clientY);
      const id = artDrag.current.id;
      const p = placeRef.current.find((q) => q.id === id);
      if (!p) return;
      const ns = Math.max(0, Math.min(Math.max(0, L - p.width_inches), point.x - artDrag.current.grabX));
      const ny = Math.max(0, Math.min(Math.max(0, bandH - p.height_inches), point.y - artDrag.current.grabY));
      const centerHeight = bandH - ny - p.height_inches / 2;
      const centerX = ns + p.width_inches / 2;
      setPlace(placeRef.current.map((q) => (q.id === id ? { ...q, start_inches: ns, center_height_inches: centerHeight } : q)));
      setLive({ x: centerX, text: `${Math.round(centerX)}″`, centered: centeredInSpan(ns, p.width_inches, segsRef.current) });
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
      if (p) api.patch(`/api/placements/${id}`, { start_inches: p.start_inches, center_height_inches: p.center_height_inches }).catch(() => {});
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
  function placementStartFor(size, span) {
    const target = span || segments.find((s) => s.end - s.start >= size.width_inches) || segments[0];
    const maxStart = Math.max(0, L - size.width_inches);
    if (!target) return 0;
    const spanStart = Math.max(0, Math.min(maxStart, target.start));
    const spanEnd = Math.max(spanStart, Math.min(L, target.end));
    const centered = spanStart + Math.max(0, (spanEnd - spanStart - size.width_inches) / 2);
    return Math.max(spanStart, Math.min(Math.min(maxStart, Math.max(spanStart, spanEnd - size.width_inches)), centered));
  }
  async function addPlacement(piece, size, span) {
    const start = placementStartFor(size, span);
    const center = bandH / 2;
    const { placement } = await api.post(`/api/walls/${wall.id}/placements`, {
      art_piece_id: piece.id, art_size_id: size.id, start_inches: start, center_height_inches: center,
    });
    // placing moves the piece, so re-sync this wall's placements rather than appending
    const { placements } = await api.get(`/api/walls/${wall.id}/placements`);
    setPlace(placements);
    setSelPlace(placement.id);
    setPlacementDialog(null);
    setPickSelection(null);
    refreshInventory();
  }
  async function removePlacement(id) {
    await api.del(`/api/placements/${id}`);
    setPlace(placeRef.current.filter((p) => p.id !== id));
    if (selPlace === id) setSelPlace(null);
    if (hoverPlace === id) setHoverPlace(null);
    refreshInventory();
  }
  function openPlacementDialog(spanIndex) {
    setPlacementDialog({ spanIndex });
    setPickSelection(null);
  }
  function closePlacementDialog() {
    setPlacementDialog(null);
    setPickSelection(null);
  }
  function defaultSizeFor(piece) {
    const sizes = piece.sizes || [];
    if (!sizes.length) return null;
    if (piece.metadata && piece.metadata.selectedSizeIndex !== undefined) {
      const selected = sizes[Number(piece.metadata.selectedSizeIndex)];
      if (selected) return selected;
    }
    if (piece.placed) {
      const placedSize = sizes.find((s) => s.id === piece.placed.art_size_id);
      if (placedSize) return placedSize;
    }
    return sizes[0];
  }
  function confirmPlacement() {
    if (!placementDialog || !pickSelection) return;
    const piece = inventory.find((p) => p.id === pickSelection.pieceId);
    const size = piece && (piece.sizes || []).find((s) => s.id === pickSelection.sizeId);
    const span = segments[placementDialog.spanIndex];
    if (piece && size && span) addPlacement(piece, size, span);
  }

  // ---------- geometry helpers ----------
  const usableTotal = segments.reduce((a, s) => a + (s.end - s.start), 0);
  const ticks = [];
  const step = L > 180 ? 24 : L > 60 ? 12 : 6;
  for (let i = 0; i <= L + 0.01; i += step) ticks.push(Math.min(i, L));
  if (ticks[ticks.length - 1] < L - step * 0.4) ticks.push(L);
  const artTop = (p) => (bandH - (p.center_height_inches ?? bandH * 0.5)) - p.height_inches / 2;
  const artScreenBox = (p) => {
    const scaleX = L ? rulerTrackWidth / L : 0;
    const scaleY = bandH ? renderedWallH / bandH : 0;
    const left = wallPixelLeft + p.start_inches * scaleX;
    const top = wallPixelTop + artTop(p) * scaleY;
    const right = left + p.width_inches * scaleX;
    const bottom = top + p.height_inches * scaleY;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  const activeSpan = placementDialog ? segments[placementDialog.spanIndex] : null;

  return html`
    <${Fragment}>
      <div class="workspace">
        <div class=${"wall-editor-stage" + (maximized ? " is-maximized" : "")} role=${maximized ? "dialog" : null} aria-modal=${maximized ? "true" : null} aria-label=${maximized ? `${name} expanded wall editor` : null}>
        <div class="wall-render-head">
          <div class="zoom-controls" aria-label="Zoom controls">
            <button class="iconbtn" type="button" title="Zoom out" aria-label="Zoom out" disabled=${zoom <= 1.01} onClick=${() => zoomBy(-0.25)}>
              <${LucideIcon} name="zoom-out" />
            </button>
            <button class="iconbtn" type="button" title="Zoom in" aria-label="Zoom in" disabled=${zoom >= 2.99} onClick=${() => zoomBy(0.25)}>
              <${LucideIcon} name="zoom-in" />
            </button>
          </div>
          <button class="iconbtn" type="button"
            title=${maximized ? "Close expanded view" : "Maximize"}
            aria-label=${maximized ? "Close expanded wall editor" : "Maximize wall editor"}
            onClick=${() => setMaximized((v) => !v)}>
            <${LucideIcon} name=${maximized ? "x" : "expand"} />
          </button>
        </div>
        <div ref=${viewportRef} class=${"wall-renderer" + (canPan ? " can-pan" : "")}
          style=${rendererH ? `height:${rendererH}px` : ""}
          onWheel=${onViewportWheel}
          onPointerDownCapture=${onViewportPointerDown}
          onPointerMoveCapture=${onViewportPointerMove}
          onPointerUpCapture=${onViewportPointerEnd}
          onPointerCancelCapture=${onViewportPointerEnd}
          onPointerMove=${updateHoverSpanFromPointer}
          onPointerLeave=${() => setHoverSpan(null)}>
          <svg ref=${svgRef} class=${"elevation wall-render-svg" + (canPan ? " can-pan" : "")} style=${renderedWallW && renderedWallH ? `width:${renderedWallW}px;height:${renderedWallH}px;transform:translate(${pan.x}px, ${pan.y}px)` : ""}
            viewBox=${`0 0 ${L} ${bandH}`}
            preserveAspectRatio="xMidYMid meet" onPointerMove=${onMove} onPointerUp=${onUp}>
            <rect class="ev-band" x="0" y="0" width=${L} height=${bandH} onPointerDown=${onDownNew} />
            ${segments.map((s, i) => html`
              <g key=${i}>
                <rect class=${"ev-usable" + (hoverSpan === i ? " is-hover" : "")} x=${s.start} y="0" width=${Math.max(0, s.end - s.start)} height=${bandH}
                  onPointerDown=${onDownNew} />
                ${["start", "end"].map((edge) => html`
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
                <g key=${p.id} class="ev-art is-live" data-placement-hover=${p.id} onPointerDown=${(e) => onArtDown(e, p)}
                  onPointerEnter=${() => setHoverPlace(p.id)}
                  onPointerLeave=${(e) => {
                    if (isSamePlacementHover(e, p.id)) return;
                    setHoverPlace((current) => current === p.id ? null : current);
                  }}>
                  ${p.has_image
                    ? html`<image href=${`/api/art/${p.art_piece_id}/image?v=${encodeURIComponent(p.image_v || "")}`} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} preserveAspectRatio="xMidYMid slice" />`
                    : html`<rect x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} fill="#fff" />`}
                  <rect class=${"ev-art-frame" + (ok ? "" : " no-fit") + (sel ? " is-sel" : "")} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} />
                  <rect class="ev-art-hit" x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} />
              </g>`;
            })}
          </svg>
          ${segments.map((s, i) => {
            const startPx = wallPixelLeft + (rulerTrackWidth * s.start) / L;
            const endPx = wallPixelLeft + (rulerTrackWidth * s.end) / L;
            const visibleStart = Math.max(0, startPx);
            const visibleEnd = Math.min(viewport.w || 0, endPx);
            if (visibleEnd - visibleStart < 24) return null;
            const x = (visibleStart + visibleEnd) / 2;
            return html`
              <div class=${"wall-span-control" + (hoverSpan === i ? " is-hover" : "")} key=${i} style=${`left:${x}px`}
                onMouseEnter=${() => setHoverSpan(i)}
                onPointerEnter=${() => setHoverSpan(i)}
                onFocusIn=${() => setHoverSpan(i)}
                onFocusOut=${() => setHoverSpan(null)}>
                <button class="wall-span-action wall-span-add" type="button"
                  aria-label=${`Place art in ${Math.round(s.end - s.start)} inch usable span`}
                  onPointerDown=${(e) => { e.stopPropagation(); }}
                  onClick=${(e) => { e.stopPropagation(); openPlacementDialog(i); }}>
                  +
                </button>
                <button class="wall-span-action wall-span-delete" type="button"
                  aria-label=${`Delete ${Math.round(s.end - s.start)} inch usable span`}
                  onPointerDown=${(e) => { e.stopPropagation(); }}
                  onClick=${(e) => { e.stopPropagation(); removeSpan(i); }}>
                  <${LucideIcon} name="trash-2" />
                </button>
                <span class="wall-span-label">
                  ${Math.round(s.end - s.start)}″
                </span>
              </div>`;
          })}
          ${liveSpan && (() => {
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
          ${placements.map((p) => {
            const box = artScreenBox(p);
            const visible = box.right > 0 && box.left < (viewport.w || 0) && box.bottom > 0 && box.top < rendererH;
            if (!visible) return null;
            return html`
              <button class=${"wall-span-delete wall-art-delete" + (hoverPlace === p.id ? " is-visible" : "")} type="button"
                key=${p.id}
                data-placement-hover=${p.id}
                style=${`left:${Math.min(viewport.w || 0, Math.max(24, box.right - 4))}px;top:${Math.max(4, Math.min(rendererH - 28, box.top + 4))}px`}
                aria-label=${`Delete ${p.title} placement`}
                onMouseEnter=${() => setHoverPlace(p.id)}
                onMouseLeave=${(e) => {
                  if (isSamePlacementHover(e, p.id)) return;
                  setHoverPlace((current) => current === p.id ? null : current);
                }}
                onPointerDown=${(e) => { e.stopPropagation(); }}
                onClick=${(e) => { e.stopPropagation(); removePlacement(p.id); }}>
                <${LucideIcon} name="trash-2" />
              </button>`;
          })}
        </div>
        <div class="wall-ruler-viewport">
          ${liveMeasures.map((m, i) => html`
            <div class=${"wall-live-measure" + (m.centered ? " is-centered" : "")} key=${i} style=${`left:${xToPx(m.x)}px`}>
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
          Drag across the wall to mark usable space. Drag span edges or placed art to adjust. ${saving ? "· saving…" : ""}
        </p>
      </div>

      ${sidebar()}
    </div>
    ${placementDialog && html`
      <div class="modal-backdrop" onClick=${closePlacementDialog}>
        <div class="modal-panel art-place-modal" role="dialog" aria-modal="true" aria-labelledby="art-place-title" onClick=${(e) => e.stopPropagation()}>
          <h2 id="art-place-title">Place art</h2>
          <p class="modal-copy">
            ${activeSpan ? html`${Math.round(activeSpan.end - activeSpan.start)}″ usable` : "Choose a usable span"}
          </p>
          <div class="art-place-grid">
            ${inventory.length === 0 && html`<p class="swatch-no">No art in inventory yet.</p>`}
            ${inventory.map((piece) => {
              const sizes = piece.sizes || [];
              const selectedSize = pickSelection && pickSelection.pieceId === piece.id
                ? sizes.find((s) => s.id === pickSelection.sizeId)
                : null;
              const displaySize = selectedSize || defaultSizeFor(piece);
              const selected = !!selectedSize;
              return html`
                <button class=${"art-place-card" + (selected ? " is-selected" : "")} type="button" key=${piece.id}
                  disabled=${!displaySize}
                  onClick=${() => displaySize && setPickSelection({ pieceId: piece.id, sizeId: displaySize.id })}>
                  <span class="art-place-thumb">
                    ${piece.has_image
                      ? html`<img src=${`/api/art/${piece.id}/image?v=${encodeURIComponent(piece.image_v || "")}`} alt=${piece.title} loading="lazy" />`
                      : html`<span>No image</span>`}
                  </span>
                  <span class="art-place-title">${piece.title || "Untitled"}</span>
                  ${sizes.length <= 1
                    ? html`<span class="art-place-size">${displaySize ? html`${+displaySize.width_inches}×${+displaySize.height_inches}″${displaySize.label ? ` · ${displaySize.label}` : ""}` : "No dimensions"}</span>`
                    : html`<span class="art-place-sizes">
                      ${sizes.map((size) => {
                        const isSelectedSize = displaySize && displaySize.id === size.id;
                        return html`
                          <span class=${"art-place-size-chip" + (isSelectedSize ? " is-selected" : "")} key=${size.id}
                            onClick=${(e) => { e.stopPropagation(); setPickSelection({ pieceId: piece.id, sizeId: size.id }); }}>
                            ${+size.width_inches}×${+size.height_inches}″${size.label ? ` · ${size.label}` : ""}
                          </span>`;
                      })}
                    </span>`}
                  ${piece.placed && html`<span class="art-place-note">Placed${piece.placed.wall_id === wall.id ? " on this wall" : ""}</span>`}
                </button>`;
            })}
          </div>
          <div class="modal-actions">
            <button class="btn primary" type="button" disabled=${!pickSelection} onClick=${confirmPlacement}>OK</button>
            <button class="btn" type="button" onClick=${closePlacementDialog}>Cancel</button>
          </div>
        </div>
      </div>`}
    </${Fragment}>
  `;

  function sidebar() {
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
        <div class="eyebrow" style="margin-top:24px;margin-bottom:12px">Placed art</div>
        ${placements.length === 0 && html`<p class="swatch-no">No art placed on this wall.</p>`}
        ${placements.length > 0 && html`
          <div class="wall-placed-list">
            ${placements.map((p) => {
              const ok = fitsAt(p.start_inches, p.width_inches, segments);
              return html`
                <div class=${"roomrow wall-span-row" + (selPlace === p.id || hoverPlace === p.id ? " is-hover" : "")} key=${p.id}
                  onMouseEnter=${() => setHoverPlace(p.id)}
                  onMouseLeave=${() => setHoverPlace((current) => current === p.id ? null : current)}
                  onClick=${() => setSelPlace(p.id)}>
                  <span class="grow"><span class="rname">${p.title}</span>
                    <span class="mono muted" style="display:block;font-size:12px">${+p.width_inches}×${+p.height_inches}″ · at ${Math.round(p.start_inches)}″ · ${ok ? "fits" : "doesn’t fit"}</span></span>
                  <button class="linkbtn muted" onClick=${(e) => { e.stopPropagation(); removePlacement(p.id); }}>Delete</button>
                </div>`;
            })}
          </div>`}
      </aside>`;
  }
}
