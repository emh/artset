import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { api } from "../api.js";
import { crumbs } from "../store.js";
import { navigate } from "../router.js";
import { FloorplanLabel } from "../components/floorplan-label.js";

const blankDraft = () => ({ titleDescription: "", dimensions: "", customValues: {}, file: null, preview: "", error: "" });
const inch = (n) => `${Math.round(Number(n) || 0)}"`;
const sizeLine = (s) => `${+s.width_inches}x${+s.height_inches}"${s.label ? ` ${s.label}` : ""}`;
const textForPiece = (p) => [p.title || "", p.description || ""].filter(Boolean).join("\n");
const dimensionsForPiece = (p) => (p.sizes || []).map(sizeLine).join("\n");

function parseTitleDescription(value) {
  const lines = String(value || "").replace(/\r/g, "").split("\n");
  const title = (lines.shift() || "").trim();
  const description = lines.join("\n").trim();
  return { title, description };
}

function parseDimensions(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const nums = line.match(/(\d+(?:\.\d+)?)/g) || [];
      const width = parseFloat(nums[0]);
      const height = parseFloat(nums[1]);
      const label = line.replace(/^\s*\d+(?:\.\d+)?\s*(?:"|in|inches)?\s*[xX×]\s*\d+(?:\.\d+)?\s*(?:"|in|inches)?\s*/i, "").trim();
      return { width_inches: width, height_inches: height, label };
    })
    .filter((s) => s.width_inches > 0 && s.height_inches > 0);
}

function placementText(p) {
  if (!p.placed) return "";
  const offset = p.placed.start_inches !== undefined && p.placed.start_inches !== null
    ? ` · ${inch(p.placed.start_inches)} from left`
    : "";
  return `${p.placed.room_name || ""}\n${p.placed.wall_name || ""}${offset}`;
}

function selectedSizeIndex(p) {
  const sizes = p.sizes || [];
  if (sizes.length === 1) return 0;
  const fromMeta = Number(p.metadata && p.metadata.selectedSizeIndex);
  if (Number.isInteger(fromMeta) && fromMeta >= 0 && fromMeta < sizes.length) return fromMeta;
  if (p.placed) {
    const placed = sizes.findIndex((s) => s.width_inches === p.placed.width_inches && s.height_inches === p.placed.height_inches);
    if (placed >= 0) return placed;
  }
  return -1;
}

function customValuesForPiece(p) {
  return { ...((p.metadata && p.metadata.customColumns) || {}) };
}

export function ArtView({ projectId }) {
  const [project, setProject] = useState(null);
  const [art, setArt] = useState(null);
  const [edits, setEdits] = useState({});
  const [draft, setDraft] = useState(blankDraft());
  const [saving, setSaving] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingDims, setEditingDims] = useState(null);
  const [editingColumn, setEditingColumn] = useState(null);
  const [hoverHeader, setHoverHeader] = useState(false);
  const [hoverRow, setHoverRow] = useState(null);
  const [floorplan, setFloorplan] = useState(null);
  const [placementTarget, setPlacementTarget] = useState(null);
  const [rooms, setRooms] = useState(null);
  const [wallsByRoom, setWallsByRoom] = useState({});
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [hoverRoomId, setHoverRoomId] = useState(null);
  const [hoverWallId, setHoverWallId] = useState(null);
  const [placementZoom, setPlacementZoom] = useState(1);
  const [placementPan, setPlacementPan] = useState({ x: 0, y: 0 });
  const [placementViewport, setPlacementViewport] = useState({ w: 0, h: 0 });
  const [draftColumnId, setDraftColumnId] = useState(null);
  const fileRefs = useRef({});
  const columnInputRefs = useRef({});
  const artSheetRef = useRef(null);
  const draftFileRef = useRef(null);
  const placementPlanRef = useRef(null);
  const placementPointers = useRef(new Map());
  const placementPanPoint = useRef(null);
  const headerHoverTimer = useRef(null);
  const rowHoverTimer = useRef(null);
  const focusedColumnRef = useRef(null);
  const canceledColumnRefs = useRef(new Set());

  useEffect(() => {
    api.get(`/api/projects/${projectId}`).then((d) => {
      setProject(d.project);
      setFloorplan(d.floorplan || null);
      crumbs.value = [{ label: d.project.name, href: `/projects/${projectId}` }];
    }).catch(() => {});
    refresh();
  }, [projectId]);
  useEffect(() => {
    if (!editingColumn) return;
    if (focusedColumnRef.current === editingColumn) return;
    const input = columnInputRefs.current[editingColumn];
    if (!input) return;
    focusedColumnRef.current = editingColumn;
    input.focus();
    input.select();
    if (draftColumnId === editingColumn && artSheetRef.current) {
      requestAnimationFrame(() => {
        artSheetRef.current.scrollLeft = artSheetRef.current.scrollWidth;
      });
    }
  }, [editingColumn, draftColumnId]);
  useEffect(() => {
    const el = placementPlanRef.current;
    if (!el || !placementTarget || !floorplan) return;
    const measure = () => setPlacementViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [placementTarget, floorplan, selectedRoomId]);
  useEffect(() => {
    setPlacementPan((p) => clampPlacementPan(p));
  }, [placementZoom, placementViewport.w, placementViewport.h]);
  useEffect(() => {
    if (!deleteTarget && !placementTarget) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (placementTarget) closePlacementPicker();
      else setDeleteTarget(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, placementTarget]);

  async function refresh() {
    const { art } = await api.get(`/api/projects/${projectId}/art`);
    setArt(art);
    setEdits(Object.fromEntries(art.map((p) => [p.id, {
      titleDescription: textForPiece(p),
      dimensions: dimensionsForPiece(p),
      customValues: customValuesForPiece(p),
      error: "",
    }])));
  }

  function setEdit(id, patch) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }

  function showHeaderControls() {
    if (headerHoverTimer.current) clearTimeout(headerHoverTimer.current);
    setHoverHeader(true);
  }

  function hideHeaderControlsSoon() {
    if (headerHoverTimer.current) clearTimeout(headerHoverTimer.current);
    headerHoverTimer.current = setTimeout(() => setHoverHeader(false), 140);
  }

  function showRowControls(id) {
    if (rowHoverTimer.current) clearTimeout(rowHoverTimer.current);
    setHoverRow(id);
  }

  function hideRowControlsSoon() {
    if (rowHoverTimer.current) clearTimeout(rowHoverTimer.current);
    rowHoverTimer.current = setTimeout(() => setHoverRow(null), 140);
  }

  function piecePayload(row) {
    const { title, description } = parseTitleDescription(row.titleDescription);
    const sizes = parseDimensions(row.dimensions);
    if (!title && !sizes.length) return null;
    if (!title) return { error: "Title is required." };
    if (!sizes.length) return { error: "Add at least one W x H measurement." };
    return { title, description, sizes, metadata: { customColumns: row.customValues || {} } };
  }

  async function savePiece(p) {
    const row = edits[p.id];
    if (!row) return;
    const payload = piecePayload(row);
    if (!payload) return;
    if (payload.error) { setEdit(p.id, { error: payload.error }); return; }
    const original = { titleDescription: textForPiece(p), dimensions: dimensionsForPiece(p) };
    if (row.titleDescription === original.titleDescription && row.dimensions === original.dimensions) {
      setEditingDims(null);
      return;
    }
    setSaving((prev) => ({ ...prev, [p.id]: true }));
    try {
      await api.patch(`/api/art/${p.id}`, payload);
      setEditingDims(null);
      await refresh();
    } catch (ex) {
      setEdit(p.id, { error: ex.message || "Could not save." });
    } finally {
      setSaving((prev) => ({ ...prev, [p.id]: false }));
    }
  }

  async function saveCustomValue(p, columnId) {
    const row = edits[p.id];
    if (!row) return;
    const customValues = { ...customValuesForPiece(p), ...(row.customValues || {}) };
    const original = customValuesForPiece(p)[columnId] || "";
    const next = customValues[columnId] || "";
    if (next === original) return;
    setSaving((prev) => ({ ...prev, [p.id]: true }));
    try {
      await api.patch(`/api/art/${p.id}`, { metadata: { customColumns: customValues } });
      await refresh();
    } catch (ex) {
      setEdit(p.id, { error: ex.message || "Could not save." });
    } finally {
      setSaving((prev) => ({ ...prev, [p.id]: false }));
    }
  }

  async function selectSize(p, index) {
    setSaving((prev) => ({ ...prev, [p.id]: true }));
    try {
      await api.patch(`/api/art/${p.id}`, { metadata: { selectedSizeIndex: index } });
      await refresh();
    } catch (ex) {
      setEdit(p.id, { error: ex.message || "Could not select size." });
    } finally {
      setSaving((prev) => ({ ...prev, [p.id]: false }));
    }
  }

  async function createDraft() {
    const parsed = parseTitleDescription(draft.titleDescription);
    const sizes = parseDimensions(draft.dimensions);
    if (!parsed.title || !sizes.length) return;
    const payload = piecePayload(draft);
    if (!payload) return;
    if (payload.error) { setDraft((prev) => ({ ...prev, error: payload.error })); return; }
    setSaving((prev) => ({ ...prev, draft: true }));
    try {
      const res = await api.post(`/api/projects/${projectId}/art`, payload);
      if (draft.file) await uploadImage(res.art.id, draft.file);
      setDraft(blankDraft());
      await refresh();
    } catch (ex) {
      setDraft((prev) => ({ ...prev, error: ex.message || "Could not save." }));
    } finally {
      setSaving((prev) => ({ ...prev, draft: false }));
    }
  }

  async function uploadImage(id, file) {
    const fd = new FormData();
    fd.append("image", file);
    await api.post(`/api/art/${id}/image`, fd);
  }

  async function setPieceImage(p, file) {
    if (!file) return;
    setSaving((prev) => ({ ...prev, [p.id]: true }));
    try {
      await uploadImage(p.id, file);
      await refresh();
    } catch (ex) {
      setEdit(p.id, { error: ex.message || "Could not upload image." });
    } finally {
      setSaving((prev) => ({ ...prev, [p.id]: false }));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await api.del(`/api/art/${deleteTarget.id}`);
    setDeleteTarget(null);
    refresh();
  }

  async function saveColumns(columns) {
    const res = await api.patch(`/api/projects/${projectId}`, { metadata: { artColumns: columns } });
    setProject(res.project);
    return res.project;
  }

  async function addColumn() {
    const column = { id: `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: "" };
    const next = [...columns, column];
    await saveColumns(next);
    setDraftColumnId(column.id);
    setEditingColumn(column.id);
  }

  async function renameColumn(columnId, name) {
    if (canceledColumnRefs.current.has(columnId)) {
      canceledColumnRefs.current.delete(columnId);
      return;
    }
    await saveColumns(columns.map((c) => (c.id === columnId ? { ...c, name: String(name || "").trim() } : c)));
    if (draftColumnId === columnId) setDraftColumnId(null);
    setEditingColumn(null);
    focusedColumnRef.current = null;
  }

  async function deleteColumn(columnId) {
    await saveColumns(columns.filter((c) => c.id !== columnId));
    if (draftColumnId === columnId) setDraftColumnId(null);
    if (editingColumn === columnId) setEditingColumn(null);
    if (focusedColumnRef.current === columnId) focusedColumnRef.current = null;
  }

  async function cancelDraftColumn(columnId) {
    if (draftColumnId !== columnId) return;
    canceledColumnRefs.current.add(columnId);
    await deleteColumn(columnId);
  }

  function clampPlacementPan(next) {
    const maxX = Math.max(0, ((placementViewport.w || 0) * (placementZoom - 1)) / 2);
    const maxY = Math.max(0, ((placementViewport.h || 0) * (placementZoom - 1)) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }

  function resetPlacementView() {
    setPlacementZoom(1);
    setPlacementPan({ x: 0, y: 0 });
    placementPointers.current.clear();
    placementPanPoint.current = null;
  }

  function zoomPlacementBy(delta) {
    setPlacementZoom((z) => {
      const next = Math.max(1, Math.min(3, Math.round((z + delta) * 100) / 100));
      if (next <= 1.01) setPlacementPan({ x: 0, y: 0 });
      return next;
    });
  }

  function panPlacementBy(dx, dy) {
    if (placementZoom <= 1.01) return;
    setPlacementPan((p) => clampPlacementPan({ x: p.x + dx, y: p.y + dy }));
  }

  function placementMidpoint() {
    const pts = Array.from(placementPointers.current.values());
    if (pts.length < 2) return null;
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  function onPlacementWheel(e) {
    if (placementZoom <= 1.01) return;
    e.preventDefault();
    panPlacementBy(-e.deltaX, -e.deltaY);
  }

  function onPlacementPointerDown(e) {
    if (e.pointerType !== "touch") return;
    placementPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (placementPointers.current.size >= 2 && placementZoom > 1.01) {
      placementPanPoint.current = placementMidpoint();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onPlacementPointerMove(e) {
    if (e.pointerType !== "touch" || !placementPointers.current.has(e.pointerId)) return;
    placementPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (placementPointers.current.size < 2 || placementZoom <= 1.01) return;
    const next = placementMidpoint();
    if (next && placementPanPoint.current) panPlacementBy(next.x - placementPanPoint.current.x, next.y - placementPanPoint.current.y);
    placementPanPoint.current = next;
    e.preventDefault();
    e.stopPropagation();
  }

  function onPlacementPointerEnd(e) {
    placementPointers.current.delete(e.pointerId);
    placementPanPoint.current = placementMidpoint();
  }

  async function openPlacementPicker(p) {
    setPlacementTarget(p);
    setSelectedRoomId(null);
    setHoverRoomId(null);
    setHoverWallId(null);
    resetPlacementView();
    if (rooms === null) {
      const res = await api.get(`/api/projects/${projectId}/rooms`);
      setRooms(res.rooms);
    }
  }

  function closePlacementPicker() {
    setPlacementTarget(null);
    setSelectedRoomId(null);
    setHoverRoomId(null);
    setHoverWallId(null);
    resetPlacementView();
  }

  async function chooseRoom(room) {
    setSelectedRoomId(room.id);
    setHoverRoomId(room.id);
    resetPlacementView();
    if (!wallsByRoom[room.id]) {
      const res = await api.get(`/api/rooms/${room.id}/walls`);
      setWallsByRoom((prev) => ({ ...prev, [room.id]: res.walls }));
    }
  }

  function chooseWall(room, wall) {
    if (!placementTarget) return;
    navigate(`/projects/${projectId}/rooms/${room.id}/walls/${wall.id}?place=${placementTarget.id}`);
  }

  async function unplacePiece(e, p) {
    e.stopPropagation();
    const placementId = p.placed && p.placed.id;
    if (!placementId) return;
    setSaving((s) => ({ ...s, [p.id]: true }));
    try {
      await api.del(`/api/placements/${placementId}`);
      await refresh();
    } finally {
      setSaving((s) => ({ ...s, [p.id]: false }));
    }
  }

  function imageCell(p) {
    return html`
      <button class="art-sheet-image" type="button"
        onClick=${() => fileRefs.current[p.id] && fileRefs.current[p.id].click()}
        onDragOver=${(e) => e.preventDefault()}
        onDrop=${(e) => {
          e.preventDefault();
          setPieceImage(p, e.dataTransfer.files[0]);
        }}>
        ${p.has_image
          ? html`<img src=${`/api/art/${p.id}/image?v=${encodeURIComponent(p.image_v || "")}`} alt=${p.title} loading="lazy" />`
          : html`<span>Drop image</span>`}
      </button>
      <input ref=${(el) => { fileRefs.current[p.id] = el; }} type="file" accept="image/*" style="display:none"
        onChange=${(e) => setPieceImage(p, e.target.files[0])} />`;
  }

  function draftImageCell() {
    return html`
      <button class="art-sheet-image" type="button"
        onClick=${() => draftFileRef.current && draftFileRef.current.click()}
        onDragOver=${(e) => e.preventDefault()}
        onDrop=${(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0] || null;
          setDraft((prev) => ({ ...prev, file, preview: file ? URL.createObjectURL(file) : "" }));
        }}>
        ${draft.preview ? html`<img src=${draft.preview} alt="preview" />` : html`<span>Drop image</span>`}
      </button>
      <input ref=${draftFileRef} type="file" accept="image/*" style="display:none"
        onChange=${(e) => {
          const file = e.target.files[0] || null;
          setDraft((prev) => ({ ...prev, file, preview: file ? URL.createObjectURL(file) : "" }));
        }} />`;
  }

  function dimensionsCell(p, row) {
    if (editingDims === p.id) {
      return html`
        <textarea class="sheet-input sheet-input--dims" value=${row.dimensions}
          onInput=${(e) => setEdit(p.id, { dimensions: e.target.value, error: "" })}
          onBlur=${() => savePiece(p)}
          placeholder=${"24x36\n30x40 framed"}
          autofocus></textarea>`;
    }
    const checkedIndex = selectedSizeIndex(p);
    return html`
      <div class="sheet-dimensions" onDblClick=${() => setEditingDims(p.id)}>
        ${(p.sizes || []).map((s, i) => html`
          <label class="sheet-dimension" key=${s.id || i}>
            <input type="checkbox" checked=${checkedIndex === i}
              onClick=${(e) => e.stopPropagation()}
              onChange=${() => selectSize(p, i)} />
            <span>${sizeLine(s)}</span>
          </label>`)}
        <button class="sheet-cell-edit" type="button" onClick=${() => setEditingDims(p.id)}>Edit</button>
      </div>`;
  }

  function customCell(p, row, column) {
    const value = (row.customValues && row.customValues[column.id]) || "";
    return html`
      <textarea class="sheet-input sheet-input--custom" value=${value}
        onInput=${(e) => setEdit(p.id, {
          customValues: { ...(row.customValues || {}), [column.id]: e.target.value },
          error: "",
        })}
        onBlur=${() => saveCustomValue(p, column.id)}></textarea>`;
  }

  const rows = art || [];
  const columns = (project && project.metadata && project.metadata.artColumns) || [];
  const gridTemplate = `108px 320px 220px minmax(280px, 1fr) ${columns.map(() => "220px").join(" ")}`;
  const placementCanPan = placementZoom > 1.01;
  const placementSvgStyle = `transform:translate(${placementPan.x}px, ${placementPan.y}px) scale(${placementZoom})`;

  return html`
    <main>
      <div class="wrap">
        <div class="art-sheet-frame">
          <div class="art-sheet" ref=${artSheetRef}>
            <div class="art-sheet-head" style=${`grid-template-columns:${gridTemplate}`}
              onMouseEnter=${showHeaderControls}
              onMouseLeave=${hideHeaderControlsSoon}
              onFocusIn=${showHeaderControls}
              onFocusOut=${hideHeaderControlsSoon}>
              <div class="art-sheet-sticky art-sheet-sticky--left">Image</div>
              <div>Title / Description</div>
              <div>Dimensions (WxH")</div>
              <div>Placement</div>
              ${columns.map((column) => html`
                <div class=${"art-custom-head" + (editingColumn === column.id ? " is-editing" : "")} key=${column.id}>
                  <input ref=${(el) => { columnInputRefs.current[column.id] = el; }}
                    value=${column.name}
                    placeholder="Column"
                    onFocus=${() => setEditingColumn(column.id)}
                    onInput=${(e) => {
                      const next = columns.map((c) => (c.id === column.id ? { ...c, name: e.target.value } : c));
                      setProject((prev) => ({ ...prev, metadata: { ...((prev && prev.metadata) || {}), artColumns: next } }));
                    }}
                    onBlur=${(e) => renameColumn(column.id, e.target.value)}
                    onKeyDown=${(e) => {
                      if (e.key === "Escape" && draftColumnId === column.id) {
                        e.preventDefault();
                        cancelDraftColumn(column.id);
                        return;
                      }
                      if (e.key === "Enter") e.target.blur();
                    }} />
                  <button class="art-delete-column" type="button" title="Delete column" aria-label=${column.name ? `Delete ${column.name} column` : "Delete column"}
                    onPointerDown=${(e) => { e.preventDefault(); deleteColumn(column.id); }}
                    onClick=${() => deleteColumn(column.id)}>X</button>
                </div>`)}
            </div>

            ${art === null && html`<p class="spinner">Loading...</p>`}

            ${rows.map((p) => {
              const row = edits[p.id] || { titleDescription: textForPiece(p), dimensions: dimensionsForPiece(p), error: "" };
              return html`
                <div class="art-sheet-row" key=${p.id} style=${`grid-template-columns:${gridTemplate}`}
                  onMouseEnter=${() => showRowControls(p.id)}
                  onMouseLeave=${hideRowControlsSoon}
                  onFocusIn=${() => showRowControls(p.id)}
                  onFocusOut=${hideRowControlsSoon}>
                  <div class="art-sheet-cell art-sheet-cell--image art-sheet-sticky art-sheet-sticky--left">${imageCell(p)}</div>
                  <div class="art-sheet-cell">
                    <textarea class="sheet-input sheet-input--title" value=${row.titleDescription}
                      onInput=${(e) => setEdit(p.id, { titleDescription: e.target.value, error: "" })}
                      onBlur=${() => savePiece(p)}
                      placeholder=${"Title\nDescription"}></textarea>
                    ${row.error && html`<div class="sheet-error">${row.error}</div>`}
                  </div>
                  <div class="art-sheet-cell">
                    ${dimensionsCell(p, row)}
                  </div>
                  <div class="art-sheet-cell">
                    <div class="sheet-placement-wrap">
                      <button class="sheet-placement sheet-placement--button" type="button" onClick=${() => openPlacementPicker(p)}>
                        ${placementText(p) || html`<span class="muted">Not placed</span>`}
                      </button>
                      ${p.placed && html`
                        <button class="sheet-placement-unplace" type="button" disabled=${!!saving[p.id]} onClick=${(e) => unplacePiece(e, p)}>
                          Unplace
                        </button>`}
                    </div>
                  </div>
                  ${columns.map((column) => html`
                    <div class="art-sheet-cell" key=${column.id}>
                      ${customCell(p, row, column)}
                    </div>`)}
                  ${saving[p.id] && html`<span class="sheet-saving sheet-saving--row">Saving</span>`}
                </div>`;
            })}

            ${art !== null && html`
              <div class="art-sheet-row art-sheet-row--draft" style=${`grid-template-columns:${gridTemplate}`}>
                <div class="art-sheet-cell art-sheet-cell--image art-sheet-sticky art-sheet-sticky--left">${draftImageCell()}</div>
                <div class="art-sheet-cell">
                  <textarea class="sheet-input sheet-input--title" value=${draft.titleDescription}
                    onInput=${(e) => setDraft((prev) => ({ ...prev, titleDescription: e.target.value, error: "" }))}
                    onBlur=${createDraft}
                    placeholder=${"Title\nDescription"}></textarea>
                  ${draft.error && html`<div class="sheet-error">${draft.error}</div>`}
                </div>
                <div class="art-sheet-cell">
                  <textarea class="sheet-input sheet-input--dims" value=${draft.dimensions}
                    onInput=${(e) => setDraft((prev) => ({ ...prev, dimensions: e.target.value, error: "" }))}
                    onBlur=${createDraft}
                    placeholder=${"24x36\n30x40 framed"}></textarea>
                </div>
                <div class="art-sheet-cell">
                  <div class="sheet-placement"><span class="muted">Not placed</span></div>
                </div>
                ${columns.map((column) => html`
                  <div class="art-sheet-cell" key=${column.id}>
                    <textarea class="sheet-input sheet-input--custom" value=${draft.customValues[column.id] || ""}
                      onInput=${(e) => setDraft((prev) => ({
                        ...prev,
                        customValues: { ...(prev.customValues || {}), [column.id]: e.target.value },
                      }))}></textarea>
                  </div>`)}
                ${saving.draft && html`<span class="sheet-saving sheet-saving--row">Saving</span>`}
              </div>`}
          </div>
          <div class="art-add-column-hit"
            onMouseEnter=${showHeaderControls}
            onMouseLeave=${hideHeaderControlsSoon}>
            <button class=${"art-add-column" + (hoverHeader ? " is-visible" : "")} type="button" title="Add column" aria-label="Add column"
              onClick=${addColumn}>+</button>
          </div>
          <div class="art-row-delete-rail">
            ${rows.map((p, i) => html`
              <div class="art-row-delete-hit" key=${p.id} style=${`top:${i * 113}px`}
                onMouseEnter=${() => showRowControls(p.id)}
                onMouseLeave=${hideRowControlsSoon}>
                <button class=${"wall-span-delete art-row-delete" + (hoverRow === p.id ? " is-visible" : "")} type="button"
                  aria-label=${`Delete ${p.title}`}
                  onClick=${() => setDeleteTarget(p)}>X</button>
              </div>`)}
          </div>
        </div>
      </div>

      ${deleteTarget && html`
        <div class="modal-backdrop" onClick=${() => setDeleteTarget(null)}>
          <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="art-delete-title" onClick=${(e) => e.stopPropagation()}>
            <h2 id="art-delete-title">Delete art</h2>
            <p>This will remove “${deleteTarget.title}” from the inventory and any wall placement.</p>
            <div class="modal-actions">
              <button class="btn btn--ghost" type="button" onClick=${() => setDeleteTarget(null)}>Cancel</button>
              <button class="btn" type="button" onClick=${confirmDelete}>Delete</button>
            </div>
          </div>
        </div>`}
      ${placementTarget && html`
        <div class="modal-backdrop" onClick=${closePlacementPicker}>
          <div class="modal-panel art-placement-modal" role="dialog" aria-modal="true" aria-labelledby="art-placement-title" onClick=${(e) => e.stopPropagation()}>
            <h2 id="art-placement-title">Place art</h2>
            ${!floorplan && html`<p class="swatch-no" style="margin-top:22px">Upload a floor plan before placing art.</p>`}
            ${floorplan && html`
              ${(() => {
                const selectedRoom = (rooms || []).find((r) => r.id === selectedRoomId);
                const pad = selectedRoom ? Math.max(selectedRoom.rect_w, selectedRoom.rect_h) * 0.08 : 0;
                const viewBox = selectedRoom
                  ? `${selectedRoom.rect_x - pad} ${selectedRoom.rect_y - pad} ${selectedRoom.rect_w + pad * 2} ${selectedRoom.rect_h + pad * 2}`
                  : `0 0 ${floorplan.width_px} ${floorplan.height_px}`;
                const wallStroke = selectedRoom ? Math.max(4, Math.min(selectedRoom.rect_w, selectedRoom.rect_h) * 0.02) : 4;
                const walls = selectedRoom ? (wallsByRoom[selectedRoom.id] || []) : [];
                return html`
                  <div class="art-placement-tools">
                    <div class="zoom-controls" aria-label="Floor plan zoom controls">
                      <button class="iconbtn" type="button" title="Zoom out" aria-label="Zoom out floor plan" disabled=${placementZoom <= 1.01} onClick=${() => zoomPlacementBy(-0.25)}>-</button>
                      <button class="iconbtn" type="button" title="Zoom in" aria-label="Zoom in floor plan" disabled=${placementZoom >= 2.99} onClick=${() => zoomPlacementBy(0.25)}>+</button>
                    </div>
                  </div>
                  <div ref=${placementPlanRef}
                    class=${"art-placement-plan" + (placementCanPan ? " can-pan" : "")}
                    onWheel=${onPlacementWheel}
                    onPointerDownCapture=${onPlacementPointerDown}
                    onPointerMoveCapture=${onPlacementPointerMove}
                    onPointerUpCapture=${onPlacementPointerEnd}
                    onPointerCancelCapture=${onPlacementPointerEnd}>
                    <svg class="art-placement-svg" style=${placementSvgStyle} viewBox=${viewBox} preserveAspectRatio="xMidYMid meet" aria-label="Choose placement wall">
                      <image href=${`/api/projects/${projectId}/plan-image?v=${floorplan.id}`} x="0" y="0" width=${floorplan.width_px} height=${floorplan.height_px} preserveAspectRatio="none" />
                      ${(rooms || []).map((room) => html`
                        <g key=${room.id} class=${selectedRoomId && selectedRoomId !== room.id ? "is-muted" : ""}
                          onMouseEnter=${() => setHoverRoomId(room.id)}
                          onMouseLeave=${() => setHoverRoomId(null)}
                          onClick=${() => chooseRoom(room)}>
                          <rect class=${"room-rect art-placement-room" + (hoverRoomId === room.id || selectedRoomId === room.id ? " is-hover" : "")}
                            x=${room.rect_x} y=${room.rect_y} width=${room.rect_w} height=${room.rect_h} />
                          ${!selectedRoom && html`<${FloorplanLabel} text=${room.name} fontSize=${Math.max(10, floorplan.width_px * 0.013)} x=${room.rect_x + floorplan.width_px * 0.006} y=${room.rect_y + floorplan.width_px * 0.02} />`}
                        </g>
                      `)}
                      ${selectedRoom && walls.map((wall) => html`
                        <g key=${wall.id} class="art-placement-wall-group"
                          onMouseEnter=${() => setHoverWallId(wall.id)}
                          onMouseLeave=${() => setHoverWallId(null)}
                          onClick=${() => chooseWall(selectedRoom, wall)}>
                          <line class=${"wall-line" + (hoverWallId === wall.id ? " is-hover" : "")}
                            x1=${wall.ax} y1=${wall.ay} x2=${wall.bx} y2=${wall.by} stroke-width=${wallStroke} />
                          <text class="wall-label" font-size=${Math.max(8, selectedRoom.rect_w * 0.025)}
                            x=${(wall.ax + wall.bx) / 2} y=${(wall.ay + wall.by) / 2 - wallStroke}>${wall.name.toUpperCase()}</text>
                        </g>
                      `)}
                    </svg>
                    ${rooms === null && html`<p class="spinner art-placement-loading">Loading rooms...</p>`}
                  </div>
                  <div class="modal-actions">
                    ${selectedRoom
                      ? html`<button class="btn btn--ghost" type="button" onClick=${() => { setSelectedRoomId(null); setHoverWallId(null); resetPlacementView(); }}>Rooms</button>`
                      : html`<button class="btn btn--ghost" type="button" onClick=${closePlacementPicker}>Cancel</button>`}
                  </div>
                `;
              })()}
            `}
          </div>
        </div>`}
    </main>
  `;
}
