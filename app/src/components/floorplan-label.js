import { html } from "htm/preact";

export function FloorplanLabel({ text, x, y, fontSize, displayScale, anchor = "start", className = "room-label" }) {
  const label = String(text || "").toUpperCase();
  const fs = Number(fontSize) || 10;
  const scale = Number(displayScale) > 0 ? 1 / Number(displayScale) : 1;
  const padX = fs * 0.28;
  const padY = fs * 0.18;
  const boxW = Math.max(fs * 1.6, label.length * fs * 0.72 + padX * 2);
  const boxH = fs * 1.18 + padY * 2;
  const boxX = anchor === "middle" ? x - boxW / 2 : x - padX;
  const boxY = y - fs * 0.98 - padY;
  const transform = scale === 1 ? null : `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`;

  return html`
    <g class="floorplan-label" transform=${transform}>
      <rect class="floorplan-label-bg" x=${boxX} y=${boxY} width=${boxW} height=${boxH} />
      <text class=${className} font-size=${fs} x=${x} y=${y}>${label}</text>
    </g>`;
}
