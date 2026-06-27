import { html } from "htm/preact";
import { useEffect } from "preact/hooks";
import { path, onLinkClick, currentPathname, matchRoute, navigate } from "./router.js";
import { me, authReady, loadMe, logout, crumbs } from "./store.js";
import { AuthView } from "./views/auth.js";
import { Dashboard } from "./views/dashboard.js";
import { ProjectView } from "./views/project.js";
import { RoomView } from "./views/room.js";
import { WallView } from "./views/wall.js";
import { ArtView } from "./views/art.js";
import { ReviewView } from "./views/review.js";

function TopBar() {
  const items = crumbs.value;
  return html`
    <header class="topbar">
      <div class="wrap topbar-inner">
        <a class="brand-block" href="/" data-link>
          <span class="brandline"><span class="brand">Artset</span><span class="credit-by">by</span></span>
          <span class="studio-logo"><span>Gaile</span><span>Guevara</span><span>Studio</span></span>
        </a>
        <nav class="crumbs">
          ${items.map((c, i) => html`
            <span class="crumb-item" key=${i}>
              ${i > 0 && html`<span class="crumb-sep">|</span>`}
              ${c.href && i < items.length - 1
                ? html`<a class="crumb-link" href=${c.href} data-link>${c.label}</a>`
                : html`<span class="crumb-current">${c.label}</span>`}
            </span>`)}
        </nav>
        <nav class="navlinks">
          <a href="/" data-link class=${currentPathname() === "/" ? "is-active" : ""}>Projects</a>
          <button class="linkbtn muted" onClick=${async () => { await logout(); navigate("/"); }}>Sign out</button>
        </nav>
      </div>
    </header>
  `;
}

function Splash() {
  return html`<div class="center-pane"><span class="spinner">Artset</span></div>`;
}

export function App() {
  useEffect(() => { loadMe(); }, []);

  const pathname = path.value.split("?")[0];

  // Public share page — no auth required, no app chrome.
  const shareMatch = matchRoute("/s/:token", pathname);
  if (shareMatch) return html`<div onClick=${onLinkClick}><${ReviewView} token=${shareMatch.token} /></div>`;

  if (!authReady.value) return html`<${Splash} />`;

  // Unauthenticated → auth screen for everything.
  if (!me.value) return html`<${AuthView} />`;

  // Authenticated routes (most specific first).
  let view;
  const wallMatch = matchRoute("/projects/:id/rooms/:roomId/walls/:wallId", pathname);
  const roomMatch = matchRoute("/projects/:id/rooms/:roomId", pathname);
  const artMatch = matchRoute("/projects/:id/art", pathname);
  const reviewMatch = matchRoute("/projects/:id/review", pathname);
  const projectMatch = matchRoute("/projects/:id", pathname);
  if (pathname === "/") view = html`<${Dashboard} />`;
  else if (wallMatch) view = html`<${WallView} projectId=${wallMatch.id} roomId=${wallMatch.roomId} wallId=${wallMatch.wallId} />`;
  else if (roomMatch) view = html`<${RoomView} projectId=${roomMatch.id} roomId=${roomMatch.roomId} />`;
  else if (artMatch) view = html`<${ArtView} projectId=${artMatch.id} />`;
  else if (reviewMatch) view = html`<${ReviewView} projectId=${reviewMatch.id} />`;
  else if (projectMatch) view = html`<${ProjectView} id=${projectMatch.id} />`;
  else view = html`<main><div class="wrap"><div class="empty">
      <div class="display" style="font-size:28px">404</div>
      <p class="mt-md"><a class="linkbtn" href="/" data-link>Back to projects</a></p>
    </div></div></main>`;

  return html`
    <div onClick=${onLinkClick}>
      <${TopBar} />
      ${view}
    </div>
  `;
}
