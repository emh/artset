import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { LucideIcon } from "./lucide-icon.js";
import { MaximizeModal } from "./maximize-modal.js";

function normalizeViewBox(viewBox) {
  if (!viewBox) return { x: 0, y: 0, w: 1, h: 1 };
  if (typeof viewBox === "string") {
    const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
    return { x, y, w, h };
  }
  return viewBox;
}

export function FloorplanViewport({
  width,
  height,
  viewBox,
  imageHref,
  svgRef,
  className = "",
  ariaLabel = "Floor plan",
  children,
  overlay,
  renderMiniContent,
  title = "Floor plan",
  canMaximize = true,
}) {
  const [maximized, setMaximized] = useState(false);

  return html`
    <${FloorplanSurface}
      width=${width}
      height=${height}
      viewBox=${viewBox}
      imageHref=${imageHref}
      svgRef=${svgRef}
      className=${className}
      ariaLabel=${ariaLabel}
      title=${title}
      canMaximize=${canMaximize}
      onMaximize=${() => setMaximized(true)}
      overlay=${maximized ? null : overlay}
      renderMiniContent=${renderMiniContent}>
      ${children}
    <//>
    ${maximized && html`
      <${MaximizeModal} title=${title} onClose=${() => setMaximized(false)}>
        <${FloorplanSurface}
          width=${width}
          height=${height}
          viewBox=${viewBox}
          imageHref=${imageHref}
          svgRef=${svgRef}
          className=${className}
          ariaLabel=${ariaLabel}
          title=${title}
          isMaximized=${true}
          canMaximize=${false}
          overlay=${overlay}
          renderMiniContent=${renderMiniContent}>
          ${children}
        <//>
      <//>
    `}
  `;
}

function FloorplanSurface({
  width,
  height,
  viewBox,
  imageHref,
  svgRef,
  className = "",
  ariaLabel = "Floor plan",
  title = "Floor plan",
  children,
  overlay,
  renderMiniContent,
  onMaximize,
  canMaximize = true,
  isMaximized = false,
}) {
  const vb = normalizeViewBox(viewBox);
  const frameRef = useRef(null);
  const pointers = useRef(new Map());
  const panPoint = useRef(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0, windowH: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const aspect = vb.w > 0 && vb.h > 0 ? vb.w / vb.h : 1;
  const targetH = viewport.w
    ? isMaximized
      ? Math.max(260, Math.min(viewport.w / aspect, Math.max(260, viewport.windowH - 170)))
      : Math.max(220, Math.min(viewport.w / aspect, Math.max(260, viewport.windowH - 280), 720))
    : 0;

  const baseScale = viewport.w && targetH ? Math.min(viewport.w / vb.w, targetH / vb.h) : 1;
  const displayW = vb.w * baseScale;
  const displayH = vb.h * baseScale;
  const maxPanX = Math.max(0, (displayW * zoom - viewport.w) / 2);
  const maxPanY = Math.max(0, (displayH * zoom - targetH) / 2);
  const canPan = zoom > 1.01;
  const svgStyle = `transform:translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  function clampPan(next, nextZoom = zoom) {
    const maxX = Math.max(0, (displayW * nextZoom - viewport.w) / 2);
    const maxY = Math.max(0, (displayH * nextZoom - targetH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }

  function zoomBy(delta) {
    setZoom((z) => {
      const next = Math.max(1, Math.min(3, Math.round((z + delta) * 100) / 100));
      setPan((p) => (next <= 1.01 ? { x: 0, y: 0 } : clampPan(p, next)));
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

  function onWheel(e) {
    if (!canPan) return;
    e.preventDefault();
    panBy(-e.deltaX, -e.deltaY);
  }

  function onPointerDown(e) {
    if (e.pointerType !== "touch") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && canPan) {
      panPoint.current = midpoint();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onPointerMove(e) {
    if (e.pointerType !== "touch" || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size < 2 || !canPan) return;
    const next = midpoint();
    if (next && panPoint.current) panBy(next.x - panPoint.current.x, next.y - panPoint.current.y);
    panPoint.current = next;
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerEnd(e) {
    pointers.current.delete(e.pointerId);
    panPoint.current = midpoint();
  }

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight, windowH: window.innerHeight });
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
  }, [zoom, viewport.w, targetH, displayW, displayH]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    pointers.current.clear();
    panPoint.current = null;
  }, [vb.x, vb.y, vb.w, vb.h, imageHref]);

  const visibleW = baseScale && zoom ? Math.min(vb.w, viewport.w / (baseScale * zoom)) : vb.w;
  const visibleH = baseScale && zoom ? Math.min(vb.h, targetH / (baseScale * zoom)) : vb.h;
  const visibleX = Math.max(vb.x, Math.min(vb.x + vb.w - visibleW, vb.x + vb.w / 2 - visibleW / 2 - pan.x / (baseScale * zoom)));
  const visibleY = Math.max(vb.y, Math.min(vb.y + vb.h - visibleH, vb.y + vb.h / 2 - visibleH / 2 - pan.y / (baseScale * zoom)));
  const renderContext = { displayScale: baseScale * zoom, zoom, baseScale };

  return html`
    <div class=${"floorplan-viewport" + (isMaximized ? " is-maximized" : "")}>
      <div class="floorplan-viewport-head">
        <div class="zoom-controls" aria-label="Floor plan zoom controls">
          <button class="iconbtn" type="button" title="Zoom out" aria-label="Zoom out floor plan" disabled=${zoom <= 1.01} onClick=${() => zoomBy(-0.25)}>
            <${LucideIcon} name="zoom-out" />
          </button>
          <button class="iconbtn" type="button" title="Zoom in" aria-label="Zoom in floor plan" disabled=${zoom >= 2.99} onClick=${() => zoomBy(0.25)}>
            <${LucideIcon} name="zoom-in" />
          </button>
        </div>
        ${canMaximize && html`
          <button class="iconbtn" type="button" title="Maximize" aria-label=${`Maximize ${title}`} onClick=${onMaximize}>
            <${LucideIcon} name="expand" />
          </button>
        `}
      </div>
      <div ref=${frameRef}
        class=${"floorplan-viewport-frame" + (canPan ? " can-pan" : "")}
        style=${targetH ? `height:${targetH}px` : ""}
        onWheel=${onWheel}
        onPointerDownCapture=${onPointerDown}
        onPointerMoveCapture=${onPointerMove}
        onPointerUpCapture=${onPointerEnd}
        onPointerCancelCapture=${onPointerEnd}>
        <svg ref=${svgRef}
          class=${"floorplan-editor-svg " + className}
          style=${svgStyle}
          viewBox=${`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label=${ariaLabel}>
          <image href=${imageHref} x="0" y="0" width=${width} height=${height} preserveAspectRatio="none" />
          ${typeof children === "function" ? children(renderContext) : children}
        </svg>
        ${overlay}
      </div>
      ${canPan && html`
        <svg class="floorplan-minimap" viewBox=${`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" aria-label="Floor plan minimap">
          <image href=${imageHref} x="0" y="0" width=${width} height=${height} preserveAspectRatio="none" />
          ${renderMiniContent ? renderMiniContent() : null}
          <rect class="mini-window" x=${visibleX} y=${visibleY} width=${visibleW} height=${visibleH} />
        </svg>
      `}
    </div>
  `;
}
