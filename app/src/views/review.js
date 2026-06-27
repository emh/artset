import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { ReviewElevation } from "../components/review-elevation.js";
import { crumbs } from "../store.js";

const money = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString());

function usableSummary(w) {
  const total = (w.segments || []).reduce((a, s) => a + (s.end - s.start), 0);
  return `${Math.round(w.length_inches)}″ total · ${Math.round(total)}″ usable`;
}

export function ReviewView({ projectId, token }) {
  const isPublic = !!token;
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [share, setShare] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = isPublic ? `/api/public/${token}` : `/api/projects/${projectId}/review`;
    api.get(url).then((d) => {
      setData(d); setShare(d.share || null);
      if (!isPublic) crumbs.value = [{ label: d.project.name, href: `/projects/${projectId}` }];
    }).catch((e) => setErr(e.message));
  }, [projectId, token]);

  const fpV = data && data.floorplan && data.floorplan.v;
  const planImageUrl = (isPublic ? `/api/public/${token}/plan-image` : `/api/projects/${projectId}/plan-image`) + (fpV ? `?v=${encodeURIComponent(fpV)}` : "");
  const artImageUrl = (aid, v) => (isPublic ? `/api/public/${token}/art/${aid}/image` : `/api/art/${aid}/image`) + (v ? `?v=${encodeURIComponent(v)}` : "");

  async function mintShare() { const { token } = await api.post(`/api/projects/${projectId}/share`); setShare(token); }
  async function revokeShare() { await api.del(`/api/projects/${projectId}/share`); setShare(null); setCopied(false); }
  function copyShare() {
    const link = `${location.origin}/s/${share}`;
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }

  if (err) return html`<main><div class="wrap"><div class="empty"><p>${err}</p>
    ${!isPublic && html`<p class="mt-md"><a class="linkbtn" href="/" data-link>Back to projects</a></p>`}</div></div></main>`;
  if (!data) return html`<main><div class="wrap"><p class="spinner">Loading…</p></div></main>`;

  const { project, studio, floorplan, rooms, art, summary } = data;
  const W = floorplan && floorplan.width_px, H = floorplan && floorplan.height_px;
  const fs = floorplan ? Math.max(10, W * 0.013) : 0;

  const head = isPublic && html`<div class="page-head">
        <div class="eyebrow">${studio.name}</div>
        <h1 class="display" style="font-size:40px;margin-top:12px">${project.name}</h1>
        <p class="muted" style="margin-top:8px">Art placement specification</p>
      </div>`;

  return html`
    <main>
      <div class="wrap">
        ${head}
        ${isPublic && html`<hr class="rule" />`}

        ${!isPublic && html`
          <div class="share-bar">
            ${share
              ? html`
                <span class="mono">${location.origin}/s/${share}</span>
                <button class="linkbtn" onClick=${copyShare}>${copied ? "Copied ✓" : "Copy link"}</button>
                <button class="linkbtn muted" onClick=${revokeShare}>Revoke</button>`
              : html`<span class="muted" style="font-size:13px">Share a read-only version with your client.</span>
                <button class="btn" onClick=${mintShare}>Create share link</button>`}
          </div>`}

        <div class="stat-row mt-lg">
          <div class="stat"><div class="stat-n">${summary.rooms}</div><div class="label">Rooms</div></div>
          <div class="stat"><div class="stat-n">${summary.walls}</div><div class="label">Walls</div></div>
          <div class="stat"><div class="stat-n">${summary.pieces}</div><div class="label">Art pieces</div></div>
          <div class="stat"><div class="stat-n">${summary.placed}</div><div class="label">Placed</div></div>
          <div class="stat"><div class="stat-n">${money(summary.placedValue)}</div><div class="label">Placed value</div></div>
        </div>

        ${floorplan && html`
          <section class="mt-lg">
            <div class="eyebrow" style="margin-bottom:18px">Floor plan</div>
            <div class="stage" style="position:relative">
              <img src=${planImageUrl} alt="Floor plan" draggable=${false} />
              <svg class="overlay" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none">
                ${rooms.map((r) => html`
                  <g key=${r.id}>
                    <rect class="room-rect" x=${r.rect_x} y=${r.rect_y} width=${r.rect_w} height=${r.rect_h} />
                    <text class="room-label" font-size=${fs} x=${r.rect_x + fs * 0.5} y=${r.rect_y + fs * 1.5}>${r.name.toUpperCase()}</text>
                  </g>`)}
              </svg>
            </div>
          </section>`}

        ${rooms.map((room) => html`
          <section class="mt-lg" key=${room.id}>
            <h2 class="display" style="font-size:24px;border-top:1px solid var(--line);padding-top:28px">${room.name}</h2>
            ${room.walls.length === 0 && html`<p class="swatch-no" style="margin-top:10px">No walls specified.</p>`}
            ${room.walls.map((w) => html`
              <div class="review-wall" key=${w.id}>
                <div class="flex between items-center" style="margin:22px 0 12px">
                  <div class="label" style="color:var(--ink)">${w.name}</div>
                  <div class="mono muted">${usableSummary(w)}</div>
                </div>
                <${ReviewElevation} wall=${w} artImageUrl=${artImageUrl} />
                ${w.placements.length > 0 && html`
                  <div class="rows" style="margin-top:14px">
                    ${w.placements.map((p) => html`
                      <div class="row" key=${p.id} style="padding:12px 0">
                        <span class="grow"><span class="rname">${p.title}</span>
                          <span class="mono muted" style="display:block;font-size:12px">${+p.width_inches}×${+p.height_inches}″ · at ${Math.round(p.start_inches)}″</span></span>
                        <span class="mono">${money(p.price)}</span>
                      </div>`)}
                  </div>`}
              </div>`)}
          </section>`)}

        ${art.length > 0 && html`
          <section class="mt-lg">
            <h2 class="display" style="font-size:24px;border-top:1px solid var(--line);padding-top:28px;margin-bottom:24px">Selected art</h2>
            <div class="art-grid">
              ${art.map((p) => html`
                <div class="art-card" key=${p.id}>
                  <div class="art-thumb">
                    ${p.has_image ? html`<img src=${artImageUrl(p.id, p.image_v)} alt=${p.title} loading="lazy" />` : html`<span class="muted mono">no image</span>`}
                  </div>
                  <div class="art-meta">
                    <h3>${p.title}</h3>
                    ${p.artist && html`<div class="muted">${p.artist}</div>`}
                    <div class="art-sizes">${p.sizes.map((s) => html`<span class="chip" key=${s.id}>${+s.width_inches}×${+s.height_inches}″</span>`)}</div>
                    <div class="mono" style="margin-top:12px">${money(p.price)}</div>
                  </div>
                </div>`)}
            </div>
          </section>`}

        ${isPublic && html`<p class="muted" style="margin-top:64px;text-align:center;font-size:12px">Prepared by ${studio.name} · Artset</p>`}
      </div>
    </main>`;
}
