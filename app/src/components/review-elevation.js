import { html } from "htm/preact";

const fits = (start, w, segs) => segs.some((s) => start >= s.start - 0.01 && start + w <= s.end + 0.01);

// Read-only wall elevation for the review/share view.
export function ReviewElevation({ wall, artImageUrl }) {
  const L = Number(wall.length_inches) || 1;
  const bandH = Number(wall.height_inches) || 108;
  const segments = wall.segments || [];
  const placements = wall.placements || [];

  const fontR = Math.min(Math.max(L * 0.022, bandH * 0.05), bandH * 0.14);
  const rLabel = fontR * 0.85;
  const tickLen = rLabel * 0.6;
  const labelGap = rLabel * 0.3;
  const rowH = rLabel * 1.2;
  const row1Y = tickLen + labelGap;
  const row2Y = row1Y + rowH;
  const rulerH = row2Y + rLabel * 1.1;
  const VBh = bandH + rulerH;

  const ticks = [];
  const step = L > 180 ? 24 : L > 60 ? 12 : 6;
  for (let i = 0; i <= L + 0.01; i += step) ticks.push(Math.min(i, L));
  if (ticks[ticks.length - 1] < L - step * 0.4) ticks.push(L);
  const artTop = (p) => (bandH - (p.center_height_inches ?? bandH * 0.5)) - p.height_inches / 2;

  return html`
    <svg class="elevation" style="display:block;width:100%" viewBox=${`0 0 ${L} ${VBh}`} preserveAspectRatio="xMidYMid meet">
      <rect class="ev-band" x="0" y="0" width=${L} height=${bandH} />
      ${segments.map((s, i) => html`<rect class="ev-usable" key=${i} x=${s.start} y="0" width=${Math.max(0, s.end - s.start)} height=${bandH} />`)}
      ${placements.map((p) => {
        const ok = fits(p.start_inches, p.width_inches, segments);
        const y = artTop(p);
        return html`
          <g key=${p.id}>
            ${p.has_image
              ? html`<image href=${artImageUrl(p.art_piece_id, p.image_v)} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} preserveAspectRatio="xMidYMid slice" />`
              : html`<rect x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} fill="#fff" />`}
            <rect class=${"ev-art-frame" + (ok ? "" : " no-fit")} x=${p.start_inches} y=${y} width=${p.width_inches} height=${p.height_inches} />
          </g>`;
      })}
      <line class="ev-ruleline" x1="0" y1=${bandH} x2=${L} y2=${bandH} />
      ${ticks.map((t, i) => {
        const isLast = i === ticks.length - 1;
        const y = bandH + (isLast ? row2Y : row1Y);
        return html`
          <g key=${i}>
            <line class="ev-tick" x1=${t} y1=${bandH} x2=${t} y2=${bandH + tickLen} />
            <text class="ev-ticklabel" font-size=${rLabel} x=${t} y=${y}
              text-anchor=${i === 0 ? "start" : isLast ? "end" : "middle"}>${Math.round(t)}″</text>
          </g>`;
      })}
    </svg>`;
}
