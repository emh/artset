import { html } from "htm/preact";

const fits = (start, w, segs) => segs.some((s) => start >= s.start - 0.01 && start + w <= s.end + 0.01);

// Read-only wall elevation for the review/share view.
export function ReviewElevation({ wall, artImageUrl, selectedPlacementId, onPlacementSelect }) {
  const L = Number(wall.length_inches) || 1;
  const bandH = Number(wall.height_inches) || 108;
  const segments = wall.segments || [];
  const placements = wall.placements || [];
  const aspect = Math.max(0.05, L / bandH);

  const ticks = [];
  const step = L > 180 ? 24 : L > 60 ? 12 : 6;
  for (let i = 0; i <= L + 0.01; i += step) ticks.push(Math.min(i, L));
  if (ticks[ticks.length - 1] < L - step * 0.4) ticks.push(L);
  const artTop = (p) => (bandH - (p.center_height_inches ?? bandH * 0.5)) - p.height_inches / 2;

  return html`
    <div class="review-elevation" style=${`--wall-aspect:${aspect}`}>
      <svg class="elevation review-elevation-wall" viewBox=${`0 0 ${L} ${bandH}`} preserveAspectRatio="xMidYMid meet">
        <rect class="ev-band" x="0" y="0" width=${L} height=${bandH} />
        ${segments.map((s, i) => html`<rect class="ev-usable" key=${i} x=${s.start} y="0" width=${Math.max(0, s.end - s.start)} height=${bandH} />`)}
        ${placements.map((p) => {
          const ok = fits(p.start_inches, p.width_inches, segments);
          const y = artTop(p);
          return html`
            <g key=${p.id} class=${"review-elevation-placement" + (selectedPlacementId === p.id ? " is-active" : "")}
              onClick=${onPlacementSelect ? () => onPlacementSelect(p) : undefined}>
              ${p.has_image
                ? html`<image href=${artImageUrl(p.art_piece_id, p.image_v)} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} preserveAspectRatio="xMidYMid slice" />`
                : html`<rect x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} fill="#fff" />`}
              <rect class=${"ev-art-frame" + (ok ? "" : " no-fit")} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} />
            </g>`;
        })}
      </svg>
      <div class="review-ruler" aria-hidden="true">
        <div class="review-ruler-line"></div>
        ${ticks.map((t, i) => {
          const x = `${(t / L) * 100}%`;
          return html`
            <span class=${"review-ruler-tick" + (i === 0 ? " is-start" : i === ticks.length - 1 ? " is-end" : "")} key=${i} style=${`left:${x}`}>
              <span>${Math.round(t)}″</span>
            </span>`;
        })}
      </div>
    </div>`;
}
