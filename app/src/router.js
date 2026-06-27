// Minimal history-API router built on a signal.
import { signal } from "@preact/signals";

export const path = signal(window.location.pathname + window.location.search);

window.addEventListener("popstate", () => {
  path.value = window.location.pathname + window.location.search;
});

export function navigate(to, { replace = false } = {}) {
  if (to === path.value) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  path.value = to;
  window.scrollTo(0, 0);
}

// Intercept in-app link clicks (anchors with data-link).
export function onLinkClick(e) {
  const a = e.target.closest && e.target.closest("a[data-link]");
  if (!a) return;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("http")) return;
  e.preventDefault();
  navigate(href);
}

// Match the current pathname against "/projects/:id" style patterns.
// Returns params object or null.
export function matchRoute(pattern, pathname) {
  const pp = pattern.split("/").filter(Boolean);
  const sp = pathname.split("/").filter(Boolean);
  if (pp.length !== sp.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
    else if (pp[i] !== sp[i]) return null;
  }
  return params;
}

export function currentPathname() {
  return path.value.split("?")[0];
}
