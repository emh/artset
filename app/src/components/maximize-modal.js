import { html } from "htm/preact";
import { useEffect } from "preact/hooks";
import { LucideIcon } from "./lucide-icon.js";

export function MaximizeModal({ title = "Expanded view", onClose, children }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return html`
    <div class="modal-backdrop modal-backdrop--max" role="presentation" onClick=${onClose}>
      <div class="modal-panel modal-panel--max" role="dialog" aria-modal="true" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
        <div class="max-modal-head">
          <div class="eyebrow">${title}</div>
          <button class="iconbtn" type="button" title="Close" aria-label="Close expanded view" onClick=${onClose}>
            <${LucideIcon} name="x" />
          </button>
        </div>
        <div class="max-modal-body">${children}</div>
      </div>
    </div>
  `;
}
