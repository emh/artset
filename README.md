# Artset

**Artset** is an art-placement specification tool for interior design studios. A designer
signs in, uploads a floor plan, blocks out rooms, draws and specs each wall (including
usable vs. unusable space), builds an art inventory, places art on walls with live
fit-checking, then shares a polished, read-only review with their client.

It is built for the **Gaile Guevara Studio** aesthetic — Swiss-minimalist: white/charcoal,
uppercase letter-spaced geometric-sans headers, hairline dividers, generous whitespace.

- **Live:** <https://artset.emh.workers.dev>
- The original throwaway prototypes live in [`prototype/`](prototype/) and are kept for
  reference only. The production app is everything else.

---

## Features

The full v1 loop is implemented and persisted:

1. **Studios & auth** — sign up creates a studio + first user. Multi-tenant: every project
   is scoped to a studio and isolated from others.
2. **Projects** — a dashboard of the studio's projects (create / open / rename / delete).
3. **Floor plan** — upload a plan image (stored in R2); replace it any time.
4. **Rooms** — drag rectangles over the plan to block out rooms, name them inline.
5. **Walls** — open a room (cropped/zoomed plan), drag a line for each wall, name it and
   set its length. A live length readout follows the cursor as you draw.
6. **Usable space** — each wall renders as a horizontal elevation with an inch ruler; drag
   to mark usable spans, drag the edges to adjust. Unmarked space is greyed (unusable).
7. **Art inventory** — upload art images with title, artist, medium, price, and one or more
   size options. A piece can live in exactly one place at a time.
8. **Placement** — place art on a wall from either the wall (pick a piece) or the inventory
   (pick a room → wall). Pieces render to scale; **fit-checking** outlines anything that
   doesn't fit the usable space. Drag to reposition with a live inch readout.
9. **Review & share** — a read-only project review (summary, plan, per-wall elevations with
   placed art, art schedule). One click mints an unguessable **share link** (`/s/:token`)
   your client can open with no login.

---

## Architecture

Everything runs on **one Cloudflare Worker** — no separate frontend host, **no build step**,
no bundler. Wrangler is the only tool.

```
                         ┌──────────────────────────── Cloudflare Worker ───────────────────────────┐
  Browser ──HTTPS──▶     │  fetch(request)                                                           │
                         │    ├─ /api/*          → JSON API (auth, projects, rooms, walls, art, …)   │
                         │    ├─ /api/public/*   → no-auth reads via share token                     │
                         │    └─ everything else → static assets (the SPA), SPA fallback to index    │
                         │                                                                           │
                         │  Bindings:  DB (D1 / SQLite)   BUCKET (R2 images)   KV (sessions)         │
                         └───────────────────────────────────────────────────────────────────────────┘
```

- **Frontend** — [Preact](https://preactjs.com) + [htm](https://github.com/developit/htm)
  (tagged-template "JSX", no transpile) + [`@preact/signals`](https://preactjs.com/guide/v10/signals/),
  loaded as native ES modules via an **import map** in [`app/index.html`](app/index.html). The
  libraries are **vendored** under [`app/vendor/`](app/vendor/) so there is no runtime CDN
  dependency and no install step for the browser. Routing is a tiny history-API router built
  on a signal ([`app/src/router.js`](app/src/router.js)).
- **API** — the same Worker's `fetch` handler. A small hand-rolled router
  ([`worker/src/router.js`](worker/src/router.js)) matches `method + path` (with `:params`).
  Static assets are served by the Worker's **Assets** binding; `run_worker_first = ["/api/*"]`
  in `wrangler.toml` makes the Worker handle API paths while everything else falls back to the
  SPA's `index.html`.
- **D1** (serverless SQLite) — all relational data. Schema in
  [`worker/migrations/`](worker/migrations).
- **R2** — uploaded floor-plan and art images, keyed by project. Served back through
  auth-checked Worker routes (image URLs are cache-busted with a `?v=` token so a replaced
  image shows immediately).
- **KV** — session id → user, keyed by an httpOnly cookie.
- **Auth** — studio login + username + password hashed with **WebCrypto PBKDF2** (no native deps); session
  cookie is `HttpOnly; SameSite=Lax`, and `Secure` in production (omitted only on
  `localhost`). Client share links are unguessable random tokens — no client accounts in v1.
- **Tenancy** — every project-scoped query filters on the caller's `studio_id`; share-link
  reads resolve `token → project` and serve read-only with no membership check.

### Why Cloudflare

One platform for the whole app (frontend assets + API + DB + object storage + sessions),
zero-egress R2 for serving images, edge reads for share links, and a perfect fit for the
"no build / minimal tooling / plain JS" constraint. The only thing not turnkey is end-user
auth, which is a small amount of WebCrypto + KV code given v1's modest needs.

---

## Project structure

```
app/                         frontend — static, no build
  index.html                 import map + app shell
  styles.css                 design system (Gaile Guevara aesthetic)
  vendor/                    pinned preact / preact-hooks / signals / htm ESM
  src/
    main.js                  renders <App> into #app
    app.js                   top bar (brand + breadcrumb), auth gate, route table
    router.js                history-API router (signal-based) + helpers
    store.js                 auth state + breadcrumb signal
    api.js                   fetch wrapper (JSON + FormData)
    views/                   dashboard, auth, project, room, wall, art, review
    components/              plan-uploader, room-editor, wall-spec-editor,
                             project-nav, review-elevation
worker/
  src/
    index.js                 Worker entry — route table + auth wrapper
    router.js                tiny method+path router
    json.js                  response/id helpers
    auth.js                  PBKDF2 hashing, KV sessions, cookies
    routes_*.js              handlers: auth, projects, floorplan, rooms,
                             walls, art, placements, review (+ share/public)
  migrations/                D1 schema (0001 init, 0002 one-placement-per-piece)
wrangler.toml                Worker config + D1/R2/KV bindings
package.json                 wrangler (dev dep) + vendored runtime libs
prototype/                   original throwaway prototypes (reference only)
```

---

## Data model (D1)

`studios` → `users` (members) → `projects` → everything project-scoped.

| Table | Notes |
| --- | --- |
| `studios` | the workspace/tenant |
| `users` | belong to a studio; `username` unique per studio, `password_hash` (PBKDF2) |
| `projects` | belong to a studio |
| `floorplans` | named plan images for a project (R2 `image_key`, px dimensions) |
| `rooms` | a named rectangle over one floor plan (px coords) |
| `walls` | a drawn line (px) with `length_inches`, `height_inches`, and `segments` (JSON array of usable spans, in inches) |
| `art_pieces` | inventory item (title/artist/medium/price, optional R2 image) |
| `art_sizes` | one or more size options (W×H, optional label) per piece |
| `placements` | a placed instance: piece + size + wall + `start_inches` (+ center height). **Unique on `art_piece_id`** — a piece can be placed once |
| `share_links` | `token → project` for public review |

Wall lengths are entered in inches by the designer, so there is no pixel-to-inch scale;
the plan image is only used as a backdrop and for cropping per room.

---

## API

All under `/api`. Authenticated routes require the session cookie; `*/public/*` routes do not.

**Auth** — `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
**Projects** — `GET|POST /projects`, `GET|PATCH|DELETE /projects/:id`
**Floor plans** — `GET|POST /projects/:id/floorplans`, `GET|PATCH|DELETE /projects/:id/floorplans/:floorplanId`, `GET /projects/:id/floorplans/:floorplanId/image`
**Rooms** — `GET|POST /projects/:id/floorplans/:floorplanId/rooms`, `GET|PATCH|DELETE /rooms/:id`
**Walls** — `GET|POST /rooms/:id/walls`, `GET|PATCH|DELETE /walls/:id`
**Art** — `GET|POST /projects/:id/art`, `GET|PATCH|DELETE /art/:id`, `POST|GET /art/:id/image`
**Placements** — `GET|POST /walls/:id/placements`, `PATCH|DELETE /placements/:id`
**Review & share** — `GET /projects/:id/review`, `POST|DELETE /projects/:id/share`
**Public (no auth)** — `GET /public/:token`, `GET /public/:token/plan-image`, `GET /public/:token/art/:artId/image`

### App routes (SPA)

| Path | Screen |
| --- | --- |
| `/` | Studio dashboard — projects |
| `/projects/:id` | Plan — upload floor plan, block out rooms |
| `/projects/:id/rooms/:roomId` | Draw & name the room's walls |
| `/projects/:id/rooms/:roomId/walls/:wallId` | Wall elevation — usable space + art placement |
| `/projects/:id/art` | Art inventory |
| `/projects/:id/review` | Read-only review + share link |
| `/s/:token` | Public client review (no login) |

---

## Local development

```bash
npm install
npm run migrate:local      # apply D1 migrations to the local SQLite simulator
npm run dev                # wrangler dev on http://localhost:8787
```

Open <http://localhost:8787> and **create a studio** to get started. Local dev uses
Wrangler's built-in D1 / R2 / KV simulators — state lives under `.wrangler/` (git-ignored),
and **no Cloudflare account is needed**. Restarting `wrangler dev` clears local KV (so you'll
sign in again); the local D1 data persists on disk.

| Script | Does |
| --- | --- |
| `npm run dev` | `wrangler dev` (local simulators) |
| `npm run migrate:local` | apply migrations to the local DB |
| `npm run migrate:remote` | apply migrations to the production DB |
| `npm run prod:studios:list` | list production studios with user/project/art counts |
| `npm run prod:studios:delete -- "Exact Studio Name"` | delete one production studio, including users, projects, art, floor plans, and uploaded images |
| `npm run deploy` | `wrangler deploy` to production |

---

## Deploy to Cloudflare

This repo is already wired to a deployed instance (the ids in `wrangler.toml` are this
project's production D1 database and KV namespace — these are identifiers, not secrets;
access is gated by your Cloudflare account, not the id). To deploy your **own** instance
from a fresh fork:

1. **Authenticate**
   ```bash
   npx wrangler login
   ```
2. **Create the resources** and paste the returned ids into `wrangler.toml`
   (`d1_databases.database_id` and `kv_namespaces.id`):
   ```bash
   npx wrangler d1 create artset-db            # → database_id
   npx wrangler kv namespace create KV         # → id
   npx wrangler r2 bucket create artset-images
   ```
3. **Apply migrations to the remote DB**
   ```bash
   npm run migrate:remote
   ```
4. **Deploy**
   ```bash
   npm run deploy
   ```

The app deploys to `https://<worker-name>.<your-subdomain>.workers.dev`. Schema changes are
just new files in `worker/migrations/` followed by `npm run migrate:remote`.

### Continuous deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) deploys automatically on every
push to `main`: it applies remote D1 migrations, then runs `wrangler deploy`. The only setup
is a single repo secret — **`CLOUDFLARE_API_TOKEN`** (a token with **Workers Scripts: Edit**
and **D1: Edit** on the account). Add it under *Settings → Secrets and variables → Actions*.
The account id is set directly in the workflow (it's an identifier, not a secret).

There are **no secrets** to configure — auth is self-contained (PBKDF2 + KV). To use a custom
domain, add a route/custom domain in `wrangler.toml` (or the Cloudflare dashboard) and point
DNS at the Worker.

---

## Conventions & notes

- **No build step.** Frontend is plain ESM; libraries are vendored and pinned. To bump a
  library, update `package.json` and copy the new ESM build into `app/vendor/`.
- **Images are cache-busted.** Plan/art image URLs carry a `?v=<key>` token that changes when
  the image changes, so replacing an image is reflected immediately despite caching.
- **The studio logo** in the header is currently a text recreation of the Gaile Guevara
  wordmark using the Jost font; drop a real SVG/PNG into `app/` to replace it.

## Roadmap (deferred from v1)

Client accounts / approvals / comments, PDF & installer-packet export, multi-floor plans, a
studio-wide shared art library, scale calibration (pixel → inch), and AI-assisted art
suggestions.
