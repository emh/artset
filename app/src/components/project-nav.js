import { html } from "htm/preact";
import { navigate } from "../router.js";

// Project section tabs (Plan / Art / Review). The page title now lives in the
// header breadcrumb, so this renders just the tabs.
export function ProjectNav({ projectId, active, className = "" }) {
  const tab = (key, label, href) => html`
    <a class=${"subnav-link" + (active === key ? " is-active" : "")} href=${href} data-link
      onClick=${(e) => { e.preventDefault(); navigate(href); }}>${label}</a>`;
  return html`
    <nav class=${`subnav ${className}`}>
      ${tab("plan", "Plan", `/projects/${projectId}`)}
      ${tab("art", "Art", `/projects/${projectId}/art`)}
      ${tab("review", "Review", `/projects/${projectId}/review`)}
    </nav>`;
}
