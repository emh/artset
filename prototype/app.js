import {
  project,
  rooms,
  walls,
  artPieces,
  STATUS,
  floorplans,
  homeLayout,
} from "./data.js";

// ---------------------------------------------------------------------------
// Lookups & derivations
// ---------------------------------------------------------------------------
const wallById = (id) => walls.find((w) => w.id === id);
const roomById = (id) => rooms.find((r) => r.id === id);

const artForWall = (wallId) => artPieces.filter((a) => a.wallId === wallId);
const artForRoom = (roomId) => artPieces.filter((a) => a.roomId === roomId);
const wallsForRoom = (room) => room.wallIds.map(wallById).filter(Boolean);

const usableInches = (wall) =>
  wall.segments
    .filter((s) => s.usable)
    .reduce((sum, s) => sum + (s.end - s.start), 0);

const roomBudget = (roomId) =>
  artForRoom(roomId).reduce((sum, a) => sum + a.price, 0);

// A wall is "uncovered" if it has usable space but no art assigned.
const wallIsUncovered = (wall) =>
  usableInches(wall) > 0 && artForWall(wall.id).length === 0;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const formatPrice = (n) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const inch = (n) => `${n}″`; // double-prime
const dims = (a) => `${inch(a.widthInches)} W × ${inch(a.heightInches)} H`;

const statusSlug = (status) =>
  ({
    [STATUS.SELECTED]: "selected",
    [STATUS.PURCHASED]: "purchased",
    [STATUS.PENDING]: "pending",
    [STATUS.TO_BE_FRAMED]: "framed",
  }[status] || "selected");

const statusPill = (status) =>
  `<span class="pill pill--${statusSlug(status)}">${status}</span>`;

// Minimal HTML escaping for any interpolated text.
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// onerror fallback so a dead Unsplash URL degrades to a neutral tile.
const FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">` +
      `<rect width="400" height="400" fill="#e9e3d8"/>` +
      `<rect x="40" y="40" width="320" height="320" fill="none" stroke="#b9ae9a" stroke-width="2"/>` +
      `</svg>`
  );

const imgTag = (a, cls) =>
  `<img class="${cls}" src="${esc(a.imageUrl)}" alt="${esc(a.title)} by ${esc(
    a.artist
  )}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'" />`;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const appEl = document.getElementById("app");

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/summary";
  const [path, query] = raw.split("?");
  const parts = path.split("/").filter(Boolean); // e.g. ["wall","wall-living-north"]
  const params = new URLSearchParams(query || "");
  return { view: parts[0] || "summary", id: parts[1], params };
}

function setActiveNav(view) {
  document.querySelectorAll("#primary-nav a").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.route === view);
  });
}

function render() {
  const { view, id, params } = parseHash();
  let html;
  switch (view) {
    case "art":
      html = renderArtList();
      break;
    case "rooms":
      html = renderRooms(params.get("room"));
      break;
    case "floorplan":
      html = renderHomeFloorplan(params.get("room"));
      break;
    case "wall":
      html = renderWallDetail(id, params.get("art"));
      break;
    case "summary":
    default:
      html = renderSummary();
  }
  appEl.innerHTML = html;
  setActiveNav(view === "wall" ? null : view);
  window.scrollTo({ top: 0 });

  // After paint, scroll a highlighted art panel into view.
  const focus = appEl.querySelector("[data-autoscroll]");
  if (focus) focus.scrollIntoView({ behavior: "smooth", block: "center" });
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);

// ---------------------------------------------------------------------------
// View: Project Summary
// ---------------------------------------------------------------------------
function renderSummary() {
  const totalBudget = artPieces.reduce((s, a) => s + a.price, 0);
  const pending = artPieces.filter((a) => a.status === STATUS.PENDING);
  const framing = artPieces.filter((a) => a.status === STATUS.TO_BE_FRAMED);
  const purchased = artPieces.filter((a) => a.status === STATUS.PURCHASED);

  const incompleteRooms = rooms
    .map((r) => ({
      room: r,
      uncovered: wallsForRoom(r).filter(wallIsUncovered),
    }))
    .filter((x) => x.uncovered.length > 0);

  const metric = (label, value, sub = "") => `
    <div class="metric">
      <div class="metric-value">${value}</div>
      <div class="metric-label">${label}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ""}
    </div>`;

  return `
    <section class="view view--summary">
      <div class="hero">
        <div class="hero-eyebrow">Art Placement Specification</div>
        <h1 class="hero-title">${esc(project.name)}</h1>
        <div class="hero-meta">
          <span>${esc(project.clientName)}</span>
          <span class="dot">·</span>
          <span>${esc(project.city)}</span>
          <span class="dot">·</span>
          <span>${artPieces.length} works specified</span>
        </div>
      </div>

      <div class="metric-grid">
        ${metric("Estimated art budget", formatPrice(totalBudget))}
        ${metric("Rooms", rooms.length)}
        ${metric("Walls", walls.length)}
        ${metric("Art pieces", artPieces.length)}
        ${metric("Purchased", purchased.length)}
        ${metric("Pending approval", pending.length)}
        ${metric("To be framed", framing.length)}
        ${metric(
          "Avg. piece value",
          formatPrice(Math.round(totalBudget / artPieces.length))
        )}
      </div>

      <div class="summary-columns">
        <div class="panel">
          <h2 class="panel-title">Needs attention</h2>
          <ul class="attention-list">
            <li>
              <span class="attention-count">${pending.length}</span>
              <span>pieces pending client approval</span>
            </li>
            <li>
              <span class="attention-count">${framing.length}</span>
              <span>pieces awaiting framing</span>
            </li>
            <li>
              <span class="attention-count">${incompleteRooms.length}</span>
              <span>rooms with usable walls not yet covered</span>
            </li>
          </ul>
        </div>

        <div class="panel">
          <h2 class="panel-title">Rooms with open wall space</h2>
          ${
            incompleteRooms.length
              ? `<ul class="coverage-list">
                  ${incompleteRooms
                    .map(
                      ({ room, uncovered }) => `
                    <li>
                      <a href="#/rooms">${esc(room.name)}</a>
                      <span class="coverage-detail">${uncovered.length} open ${
                        uncovered.length === 1 ? "wall" : "walls"
                      } · ${uncovered.map((w) => esc(w.name)).join(", ")}</span>
                    </li>`
                    )
                    .join("")}
                </ul>`
              : `<p class="empty">Every usable wall has art assigned.</p>`
          }
        </div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// View: Art Pieces list
// ---------------------------------------------------------------------------
function renderArtList() {
  const rowsHtml = artPieces
    .map((a) => {
      const wall = wallById(a.wallId);
      const room = roomById(a.roomId);
      return `
      <a class="art-row" href="#/wall/${a.wallId}?art=${a.id}">
        <div class="art-thumb">${imgTag(a, "art-thumb-img")}</div>
        <div class="art-main">
          <div class="art-title-line">
            <h3 class="art-title">${esc(a.title)}</h3>
            ${statusPill(a.status)}
          </div>
          <div class="art-artist">${esc(a.artist)}</div>
          <div class="art-medium">${esc(a.medium)}</div>
          <div class="art-location">${esc(room.name)} · ${esc(wall.name)}</div>
        </div>
        <div class="art-specs">
          <div class="spec"><span class="spec-k">Size</span><span class="spec-v mono">${dims(
            a
          )}</span></div>
          <div class="spec"><span class="spec-k">Placement</span><span class="spec-v mono">${inch(
            a.placement.startInches
          )} from start</span></div>
          <div class="spec"><span class="spec-k">Price</span><span class="spec-v price">${formatPrice(
            a.price
          )}</span></div>
          <span class="art-cta">View on wall →</span>
        </div>
      </a>`;
    })
    .join("");

  return `
    <section class="view view--art">
      <header class="view-head">
        <div>
          <div class="view-eyebrow">Specification</div>
          <h1 class="view-title">Art Pieces</h1>
        </div>
        <div class="view-count">${artPieces.length} works</div>
      </header>
      <div class="art-list">${rowsHtml}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// View: Room list
// ---------------------------------------------------------------------------
function renderRooms(focusRoomId) {
  const cards = rooms
    .map((room) => {
      const isFocus = room.id === focusRoomId;
      const roomWalls = wallsForRoom(room);
      const pieceCount = artForRoom(room.id).length;
      const wallRows = roomWalls
        .map((w) => {
          const count = artForWall(w.id).length;
          const usable = usableInches(w);
          const open = usable > 0 && count === 0;
          return `
          <a class="wall-row" href="#/wall/${w.id}">
            <span class="wall-row-name">${esc(w.name)}</span>
            <span class="wall-row-len mono">${inch(w.lengthInches)} total</span>
            <span class="wall-row-usable mono">${inch(usable)} usable</span>
            <span class="wall-row-count ${
              open ? "is-open" : ""
            }">${count ? `${count} ${count === 1 ? "piece" : "pieces"}` : "open"}</span>
            <span class="wall-row-go">→</span>
          </a>`;
        })
        .join("");

      return `
      <article class="room-card${isFocus ? " is-focus" : ""}" id="room-card-${
        room.id
      }" ${isFocus ? "data-autoscroll" : ""}>
        <header class="room-head">
          <div>
            <h2 class="room-name">${esc(room.name)}</h2>
            <div class="room-type">${esc(room.type)}</div>
          </div>
          <div class="room-metrics">
            <div class="room-metric"><span class="rm-v">${
              roomWalls.length
            }</span><span class="rm-k">walls</span></div>
            <div class="room-metric"><span class="rm-v">${pieceCount}</span><span class="rm-k">pieces</span></div>
            <div class="room-metric"><span class="rm-v">${formatPrice(
              roomBudget(room.id)
            )}</span><span class="rm-k">budget</span></div>
          </div>
        </header>
        <div class="wall-list">${wallRows}</div>
      </article>`;
    })
    .join("");

  return `
    <section class="view view--rooms">
      <header class="view-head">
        <div>
          <div class="view-eyebrow">Specification</div>
          <h1 class="view-title">Rooms &amp; Walls</h1>
        </div>
        <div class="view-count">${rooms.length} rooms · ${walls.length} walls</div>
      </header>
      <div class="room-grid">${cards}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Architectural plan rendering — shared by the whole-home plan and the
// per-wall room plan. Walls are drawn as poché (filled thickness); each wall's
// elevation segments become openings: doors (gap + swing arc) and windows
// (glazed line breaks). Perimeter openings get a dashed header line.
// ---------------------------------------------------------------------------
const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  mul: (a, s) => [a[0] * s, a[1] * s],
  len: (a) => Math.hypot(a[0], a[1]),
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  norm: (a) => {
    const l = Math.hypot(a[0], a[1]) || 1;
    return [a[0] / l, a[1] / l];
  },
};

// Map a wall-segment reason to an architectural opening type (null = solid wall;
// furniture/clearance zones stay solid).
function openingType(reason) {
  if (!reason) return null;
  const r = reason.toLowerCase();
  if (r.includes("window")) return "window";
  if (r.includes("slid")) return "window"; // glazed sliding door
  if (r.includes("door")) return "door";
  return null;
}

const fmtPt = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
const svgLine = (p, q, cls) =>
  `<line x1="${p[0].toFixed(2)}" y1="${p[1].toFixed(2)}" x2="${q[0].toFixed(
    2
  )}" y2="${q[1].toFixed(2)}" class="${cls}" />`;

function scaleBarSVG(x, y, fs) {
  const u = 24; // 24" = 2 ft
  const th = fs * 0.45;
  return `<g class="pl-scale" aria-hidden="true">
    ${svgLine([x, y], [x + u, y], "pl-scale-bar")}
    ${svgLine([x, y - th], [x, y + th], "pl-scale-bar")}
    ${svgLine([x + u, y - th], [x + u, y + th], "pl-scale-bar")}
    <text x="${(x + u + fs * 0.4).toFixed(2)}" y="${(y + fs * 0.35).toFixed(
    2
  )}" class="pl-scale-label" font-size="${fs.toFixed(2)}">2 ft</text>
  </g>`;
}

// Returns { floor, body } SVG fragments for one room drawn as an architectural
// plan. `ox/oy` translate it into a shared floor; `t` is wall thickness (in).
function roomArchSVG(room, opts = {}) {
  const {
    ox = 0,
    oy = 0,
    t = 5,
    currentWallId = null,
    artMode = false,
    detail = "full",
  } = opts;
  const fp = floorplans[room.id];
  const O = fp.outline.map(([x, y]) => [x + ox, y + oy]);
  const C = [
    O.reduce((s, p) => s + p[0], 0) / O.length,
    O.reduce((s, p) => s + p[1], 0) / O.length,
  ];
  const floor = `<polygon points="${O.map(fmtPt).join(" ")}" class="pl-floor" />`;

  let body = "";

  // Dashed header lines across perimeter openings (open to adjacent space).
  for (const [a, b] of fp.openings || []) {
    body += svgLine([a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], "pl-threshold");
  }

  for (const [wid, seg] of Object.entries(fp.walls)) {
    const A = [seg[0][0] + ox, seg[0][1] + oy];
    const B = [seg[1][0] + ox, seg[1][1] + oy];
    const L = V.len(V.sub(B, A));
    if (L === 0) continue;
    const d = V.norm(V.sub(B, A));
    let n = [-d[1], d[0]];
    const mid = V.mul(V.add(A, B), 0.5);
    if (V.dot(n, V.sub(C, mid)) < 0) n = [-n[0], -n[1]]; // inward normal

    const cur = wid === currentWallId;
    const fillClass = cur
      ? "pl-wall pl-wall--current"
      : artMode && artForWall(wid).length > 0
      ? "pl-wall pl-wall--art"
      : "pl-wall";
    const ink = (base) => (cur ? `${base} is-current` : base);

    // Openings along this wall, from its elevation segments.
    const feats = (wallById(wid) ? wallById(wid).segments : [])
      .map((s) => ({
        type: openingType(s.reason),
        s: Math.max(0, Math.min(L, s.start)),
        e: Math.max(0, Math.min(L, s.end)),
      }))
      .filter((f) => f.type && f.e > f.s)
      .sort((a, b) => a.s - b.s);

    // Solid spans = [0, L] minus openings.
    const solids = [];
    let cursor = 0;
    for (const f of feats) {
      if (f.s > cursor) solids.push([cursor, f.s]);
      cursor = Math.max(cursor, f.e);
    }
    if (cursor < L) solids.push([cursor, L]);

    // Poché for each solid span (thickness inward), corners extended at ends.
    for (const [s0, e0] of solids) {
      const s = s0 - (s0 === 0 ? t * 0.5 : 0);
      const e = e0 + (e0 === L ? t * 0.5 : 0);
      const p0 = V.add(A, V.mul(d, s));
      const p1 = V.add(A, V.mul(d, e));
      const q2 = V.add(p1, V.mul(n, t));
      const q3 = V.add(p0, V.mul(n, t));
      body += `<polygon points="${[p0, p1, q2, q3]
        .map(fmtPt)
        .join(" ")}" class="${fillClass}" />`;
    }

    // Door / window symbols.
    for (const f of feats) {
      const j0 = V.add(A, V.mul(d, f.s));
      const j1 = V.add(A, V.mul(d, f.e));
      const wdt = f.e - f.s;
      if (f.type === "window") {
        const i0 = V.add(j0, V.mul(n, t));
        const i1 = V.add(j1, V.mul(n, t));
        const c0 = V.add(j0, V.mul(n, t * 0.5));
        const c1 = V.add(j1, V.mul(n, t * 0.5));
        body +=
          svgLine(j0, j1, ink("pl-glassframe")) +
          svgLine(i0, i1, ink("pl-glassframe")) +
          svgLine(c0, c1, ink("pl-glass"));
      } else if (detail === "full") {
        // Door — gap already left in the poché; draw leaf + swing arc.
        const leafEnd = V.add(j0, V.mul(n, wdt));
        body += svgLine(j0, leafEnd, ink("pl-door"));
        let a0 = Math.atan2(n[1], n[0]);
        const a1 = Math.atan2(d[1], d[0]);
        let da = a1 - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const a = a0 + (da * k) / 12;
          pts.push([j0[0] + wdt * Math.cos(a), j0[1] + wdt * Math.sin(a)]);
        }
        body += `<polyline points="${pts.map(fmtPt).join(" ")}" class="${ink(
          "pl-swing"
        )}" />`;
      }
    }
  }
  return { floor, body };
}

// ---------------------------------------------------------------------------
// View: Whole-home floorplan — stitches every room into floor plates.
// Each room reuses its local outline translated by its homeLayout (x, y).
// Clicking a room opens the Rooms list focused on that room.
// ---------------------------------------------------------------------------
function renderHomeFloorplan(focusRoomId) {
  const plates = homeLayout.floors
    .map((floor) => {
      // Bounds across all translated room outlines on this floor.
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      floor.rooms.forEach((r) => {
        floorplans[r.roomId].outline.forEach(([px, py]) => {
          minX = Math.min(minX, px + r.x);
          maxX = Math.max(maxX, px + r.x);
          minY = Math.min(minY, py + r.y);
          maxY = Math.max(maxY, py + r.y);
        });
      });
      const w = maxX - minX;
      const h = maxY - minY;
      const span = Math.max(w, h);
      const t = 6; // wall thickness, inches
      const pad = span * 0.04 + t;
      const scaleH = span * 0.1 + t;
      const vb = `${minX - pad} ${minY - pad} ${w + pad * 2} ${
        h + pad * 2 + scaleH
      }`;
      const fsName = span * 0.034 + 3;
      const fsMeta = span * 0.024 + 2;

      const roomsSvg = floor.rooms
        .map((r) => {
          const room = roomById(r.roomId);
          const fp = floorplans[r.roomId];
          const pieces = artForRoom(r.roomId).length;
          const xs = fp.outline.map((p) => p[0]);
          const ys = fp.outline.map((p) => p[1]);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + r.x;
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + r.y;
          const label = `${pieces} ${pieces === 1 ? "piece" : "pieces"}`;

          const { floor: roomFloor, body } = roomArchSVG(room, {
            ox: r.x,
            oy: r.y,
            t,
            artMode: true,
            detail: "overview",
          });

          return `
          <a href="#/rooms?room=${r.roomId}" class="hp-room${
            r.roomId === focusRoomId ? " is-focus" : ""
          }" aria-label="${esc(room.name)}, ${label}">
            ${roomFloor}<title>${esc(room.name)} — ${label}</title>
          </a>
          ${body}
          <text x="${cx.toFixed(1)}" y="${cy.toFixed(
            1
          )}" class="hp-name" font-size="${fsName.toFixed(
            1
          )}" text-anchor="middle">${esc(room.name)}</text>
          <text x="${cx.toFixed(1)}" y="${(cy + fsName).toFixed(
            1
          )}" class="hp-meta" font-size="${fsMeta.toFixed(
            1
          )}" text-anchor="middle">${label}</text>`;
        })
        .join("");

      return `
      <div class="panel hp-plate">
        <div class="hp-plate-head">
          <h2 class="panel-title">${esc(floor.name)}</h2>
          <span class="fp-compass" aria-hidden="true">N</span>
        </div>
        <svg viewBox="${vb}" class="hp-svg" role="img"
             aria-label="${esc(floor.name)} floorplan">
          ${roomsSvg}
          ${scaleBarSVG(minX, maxY + pad * 0.7 + scaleH * 0.4, fsMeta)}
        </svg>
      </div>`;
    })
    .join("");

  return `
    <section class="view view--home">
      <header class="view-head">
        <div>
          <div class="view-eyebrow">Specification</div>
          <h1 class="view-title">Floorplan</h1>
        </div>
        <div class="view-count">${rooms.length} rooms · ${walls.length} walls</div>
      </header>
      <p class="hp-intro">Plan of the residence across two floors — walls, doors, and windows shown. Select a room to open its walls and placement detail.</p>
      <div class="hp-floors">${plates}</div>
      <div class="legend hp-legend">
        <span class="legend-item"><span class="swatch swatch--art"></span>Wall with art</span>
        <span class="legend-item"><span class="swatch swatch--plain"></span>Wall</span>
        <span class="legend-item"><span class="swatch swatch--opening"></span>Opening</span>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Floorplan — render the current room as a plan, highlighting the active wall.
// ---------------------------------------------------------------------------
function renderFloorplan(room, currentWallId) {
  const fp = floorplans[room.id];
  if (!fp) return "";

  const xs = fp.outline.map((p) => p[0]);
  const ys = fp.outline.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const span = Math.max(w, h);
  const pad = span * 0.06 + 8;
  const scaleH = span * 0.14 + 6;
  const vb = `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2 + scaleH}`;

  const { floor, body } = roomArchSVG(room, { currentWallId, detail: "full" });

  return `
    <div class="floorplan">
      <span class="fp-compass" aria-hidden="true">N</span>
      <svg viewBox="${vb}" class="fp-svg" role="img"
           aria-label="Plan of ${esc(room.name)} with ${esc(
    wallById(currentWallId).name
  )} highlighted">
        ${floor}
        ${body}
        ${scaleBarSVG(minX, maxY + pad * 0.6 + scaleH * 0.4, span * 0.05 + 3)}
      </svg>
    </div>`;
}

// ---------------------------------------------------------------------------
// View: Wall Detail + elevation
// ---------------------------------------------------------------------------
function renderWallDetail(wallId, focusArtId) {
  const wall = wallById(wallId);
  if (!wall) {
    return `
      <section class="view">
        <p class="empty">Wall not found.</p>
        <p><a class="back-link" href="#/rooms">← Back to Rooms</a></p>
      </section>`;
  }
  const room = roomById(wall.roomId);
  const pieces = artForWall(wall.id);
  const usable = usableInches(wall);
  const L = wall.lengthInches;
  const H = wall.heightInches;
  const pct = (v) => `${(v / L) * 100}%`;

  // Unusable overlays
  const segHtml = wall.segments
    .filter((s) => !s.usable)
    .map(
      (s) => `
      <div class="seg-unusable" style="left:${pct(s.start)};width:${pct(
        s.end - s.start
      )}">
        <span class="seg-reason">${esc(s.reason || "Unusable")}</span>
      </div>`
    )
    .join("");

  // Art on the wall — positioned by offset (left) & size, vertical from centerHeight.
  const artHtml = pieces
    .map((a) => {
      const isFocus = a.id === focusArtId;
      const leftPct = (a.placement.startInches / L) * 100;
      const widthPct = (a.widthInches / L) * 100;
      const heightPct = (a.heightInches / H) * 100;
      // center vertically around centerHeightInches measured from floor.
      const centerFromTopPct =
        ((H - a.placement.centerHeightInches) / H) * 100;
      const topPct = centerFromTopPct - heightPct / 2;
      return `
      <div class="wall-art ${isFocus ? "is-focus" : ""}"
           style="left:${leftPct}%;width:${widthPct}%;top:${topPct}%;height:${heightPct}%">
        ${imgTag(a, "wall-art-img")}
        <span class="wall-art-center"></span>
      </div>`;
    })
    .join("");

  // Bottom ruler ticks every 12"
  let ticks = "";
  for (let x = 0; x <= L; x += 12) {
    ticks += `<span class="tick" style="left:${pct(x)}"><span class="tick-label mono">${x}</span></span>`;
  }

  const usableSummary = wall.segments
    .map((s) => {
      const cls = s.usable ? "is-usable" : "is-unusable";
      const label = s.usable ? "Usable" : esc(s.reason || "Unusable");
      return `<li class="${cls}"><span class="mono">${inch(s.start)}–${inch(
        s.end
      )}</span><span>${label}</span></li>`;
    })
    .join("");

  const detailPanels = pieces.length
    ? pieces
        .map((a) => {
          const isFocus = a.id === focusArtId;
          return `
        <article class="art-detail ${isFocus ? "is-focus" : ""}" ${
            isFocus ? "data-autoscroll" : ""
          }>
          <div class="art-detail-thumb">${imgTag(a, "art-detail-img")}</div>
          <div class="art-detail-body">
            <div class="art-title-line">
              <h3 class="art-title">${esc(a.title)}</h3>
              ${statusPill(a.status)}
            </div>
            <div class="art-artist">${esc(a.artist)} · ${esc(a.medium)}</div>
            <div class="art-detail-specs">
              <div class="spec"><span class="spec-k">Size</span><span class="spec-v mono">${dims(
                a
              )}</span></div>
              <div class="spec"><span class="spec-k">Placement</span><span class="spec-v mono">${inch(
                a.placement.startInches
              )} from start</span></div>
              <div class="spec"><span class="spec-k">Center height</span><span class="spec-v mono">${inch(
                a.placement.centerHeightInches
              )} from floor</span></div>
              <div class="spec"><span class="spec-k">Price</span><span class="spec-v price">${formatPrice(
                a.price
              )}</span></div>
            </div>
            <a class="art-detail-link" href="#/art">All art pieces →</a>
          </div>
        </article>`;
        })
        .join("")
    : `<p class="empty">No art is placed on this wall.</p>`;

  return `
    <section class="view view--wall">
      <div class="wall-breadcrumb">
        <a href="#/rooms">Rooms</a> <span class="dot">/</span>
        <span>${esc(room.name)}</span>
      </div>
      <header class="view-head wall-head">
        <div>
          <div class="view-eyebrow">${esc(room.name)}</div>
          <h1 class="view-title">${esc(wall.name)}</h1>
        </div>
        <div class="wall-stats">
          <div class="wall-stat"><span class="ws-v mono">${inch(
            L
          )}</span><span class="ws-k">length</span></div>
          <div class="wall-stat"><span class="ws-v mono">${inch(
            H
          )}</span><span class="ws-k">height</span></div>
          <div class="wall-stat"><span class="ws-v mono">${inch(
            usable
          )}</span><span class="ws-k">usable</span></div>
          <div class="wall-stat"><span class="ws-v">${
            pieces.length
          }</span><span class="ws-k">${
    pieces.length === 1 ? "piece" : "pieces"
  }</span></div>
        </div>
      </header>

      <div class="elevation-frame">
        <div class="elevation" style="aspect-ratio:${L} / ${H}">
          ${segHtml}
          ${artHtml}
          <div class="floor-line"></div>
        </div>
        <div class="ruler">${ticks}</div>
        <div class="elevation-caption">Wall elevation · viewed straight on · scaled to ${inch(
          L
        )} × ${inch(H)}</div>
      </div>

      <div class="wall-columns">
        <div class="wall-side">
          <div class="panel floorplan-panel">
            <h2 class="panel-title">Floorplan</h2>
            ${renderFloorplan(room, wall.id)}
            <div class="legend">
              <span class="legend-item"><span class="swatch swatch--current"></span>This wall</span>
              <span class="legend-item"><span class="swatch swatch--opening"></span>Opening</span>
            </div>
            <a class="fp-home-link" href="#/floorplan?room=${room.id}">See in whole-home plan →</a>
          </div>
          <div class="panel wall-segments">
            <h2 class="panel-title">Wall sections</h2>
            <ul class="segment-list">${usableSummary}</ul>
            <div class="legend">
              <span class="legend-item"><span class="swatch swatch--usable"></span>Usable</span>
              <span class="legend-item"><span class="swatch swatch--unusable"></span>Unusable</span>
            </div>
          </div>
        </div>
        <div class="art-details">
          <h2 class="panel-title">Placed art</h2>
          ${detailPanels}
        </div>
      </div>

      <div class="wall-back">
        <a class="back-link" href="#/art">← Art Pieces</a>
        <a class="back-link" href="#/rooms">← Rooms</a>
      </div>
    </section>`;
}
