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

export function PlanUploader({ projectId, onUploaded }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
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
      const { floorplan } = await api.post(`/api/projects/${projectId}/floorplan`, fd);
      onUploaded(floorplan);
    } catch (ex) {
      setErr(ex.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return html`
    <div>
      <div
        class=${"dropzone" + (over ? " is-over" : "")}
        onClick=${() => inputRef.current && inputRef.current.click()}
        onDragOver=${(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave=${() => setOver(false)}
        onDrop=${(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
      >
        <span class="label">${busy ? "Uploading…" : "Drop a floor plan"}</span>
        <p class="muted" style="margin:0">PNG or JPG · or click to browse</p>
      </div>
      <input ref=${inputRef} type="file" accept="image/*" style="display:none"
        onChange=${(e) => handle(e.target.files[0])} />
      ${err && html`<p style="color:var(--warn);font-size:13px;margin-top:14px">${err}</p>`}
    </div>
  `;
}
