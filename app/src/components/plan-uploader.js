import { html } from "htm/preact";
import { useState, useRef } from "preact/hooks";
import { api } from "../api.js";

// Reads an image file, measures its natural dimensions, uploads to R2.
function measure(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("Could not read image")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export function PlanUploader({ projectId, onUploaded, compact = false }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [name, setName] = useState("Floor plan");
  const inputRef = useRef(null);

  async function handle(file) {
    setErr(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Please choose an image file (PNG or JPG)."); return; }
    setBusy(true);
    try {
      const { width, height } = await measure(file);
      const fd = new FormData();
      fd.append("image", file);
      fd.append("width", String(width));
      fd.append("height", String(height));
      fd.append("name", name.trim() || "Floor plan");
      const { floorplan } = await api.post(`/api/projects/${projectId}/floorplans`, fd);
      onUploaded(floorplan);
      setName("Floor plan");
    } catch (ex) {
      setErr(ex.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const dropTarget = html`
    <div
      class=${(compact ? "dropzone floorplan-drop-thumb" : "dropzone") + (over ? " is-over" : "")}
      onClick=${() => inputRef.current && inputRef.current.click()}
      onDragOver=${(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave=${() => setOver(false)}
      onDrop=${(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
    >
      <span class="label">${busy ? "Uploading..." : "Drop a floor plan"}</span>
      <p class="muted" style="margin:0">PNG or JPG · or click to browse</p>
    </div>`;
  const nameField = html`
      <label class="field">
        <span class="label">${compact ? "Name" : "Floor plan name"}</span>
        <input class="input" name="floorplan-name" autocomplete="off" value=${name}
          onInput=${(e) => setName(e.target.value)} placeholder="First floor" />
      </label>`;
  const fileInput = html`
      <input ref=${inputRef} type="file" accept="image/*" style="display:none"
        onChange=${(e) => handle(e.target.files[0])} />`;
  const errorText = err && html`<p style="color:var(--warn);font-size:13px;margin-top:14px">${err}</p>`;

  if (compact) return html`
    <div class="floorplan-row floorplan-add-row">
      ${dropTarget}
      <div class="floorplan-row-main">
        ${nameField}
        ${errorText}
      </div>
      ${fileInput}
    </div>`;

  return html`
    <div>
      ${nameField}
      ${dropTarget}
      ${fileInput}
      ${errorText}
    </div>
  `;
}
