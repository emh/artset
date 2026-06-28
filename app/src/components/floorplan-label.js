import { html } from "htm/preact";

export function FloorplanLabel({ text, x, y, fontSize, className = "room-label" }) {
  const label = String(text || "").toUpperCase();
  const fs = Number(fontSize) || 10;
  const padX = fs * 0.28;
  const padY = fs * 0.18;
  const boxW = Math.max(fs * 1.6, label.length * fs * 0.72 + padX * 2);
  const boxH = fs * 1.18 + padY * 2;
  const boxX = x - padX;
  const boxY = y - fs * 0.98 - padY;

  return html`
    <g class="floorplan-label">
      <rect class="floorplan-label-bg" x=${boxX} y=${boxY} width=${boxW} height=${boxH} />
      <text class=${className} font-size=${fs} x=${x} y=${y}>${label}</text>
    </g>`;
}
