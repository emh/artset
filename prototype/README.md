# Artset — Art Placement Specification (Review Prototype)

A SaaS-style, **read-only** review interface for interior designers to present a
finished art-placement specification to a client. It shows a completed spec for a
fictional high-end home — selected art, assigned rooms and walls, wall usability
constraints, sizing/placement, pricing, and a scaled **wall elevation** showing each
piece in position.

This is a prototype: all data is hardcoded mock data. There is no backend, no
authentication, no persistence, and no editing/uploading/drag-placement (by design —
see the PRD non-goals).

## Run it

The app uses native ES modules, which browsers only load over HTTP (not `file://`).
Serve the folder with any static server:

```bash
cd /Users/emh/Work/personal/artset
python3 -m http.server 8000
```

Then open: <http://localhost:8000/#/summary>

(Any static server works, e.g. `npx serve` or the VS Code Live Server extension.)

## Screens & routes

| Route            | Screen                                                    |
| ---------------- | --------------------------------------------------------- |
| `#/summary`      | Project dashboard — budget, counts, items needing action  |
| `#/art`          | Art Pieces list — every selected work with metadata        |
| `#/rooms`        | Rooms & Walls — room cards with nested wall rows            |
| `#/floorplan`    | Whole-home floorplan — all rooms across two floor plates    |
| `#/wall/:wallId` | Wall detail — scaled elevation, room plan, placed art       |

Navigation flow: an art piece links to its wall (with that piece highlighted via
`#/wall/<wallId>?art=<artId>`); a wall row in the room list links to the same wall
detail; the wall detail links back to Art Pieces and Rooms. The whole-home floorplan
stitches every room into two floor plates — selecting a room opens the Rooms list
focused on it (`#/rooms?room=<roomId>`), and the wall detail's room plan links into
the whole-home plan with that room highlighted (`#/floorplan?room=<roomId>`).

## Files

- `index.html` — shell + persistent top navigation
- `styles.css` — design system (editorial gallery / spec-sheet aesthetic)
- `data.js` — hardcoded mock data (project, rooms, walls, art pieces, floorplans, homeLayout)
- `app.js` — hash router + view render functions + the wall elevation renderer and the architectural plan renderer (`roomArchSVG`)

The floorplans are drawn as architect-style plans: walls as filled **poché**, with each
wall's segments turned into **doors** (gap + swing arc) and **windows** (glazed line
breaks); openings to adjacent space get a dashed header line, plus a scale bar and
north mark. The same `roomArchSVG` renderer drives both the per-wall room plan (full
detail, active wall in red) and the whole-home plan (overview, rooms stitched into
connected floor plates).

## Mock data

Fictional **West Point Grey Residence**: 6 rooms, 17 walls, 14 art pieces, ~$43k
estimated budget. Art imagery uses Unsplash stock photos; any image that fails to
load degrades gracefully to a neutral framed placeholder.
