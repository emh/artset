// Artset Worker entry. Serves the JSON API under /api/*.
// Static SPA assets (./app) are served by the [assets] binding; this Worker
// only runs first for /api/* (see wrangler.toml run_worker_first).

import { Router } from "./router.js";
import { json, error } from "./json.js";
import { getSession } from "./auth.js";
import { signup, login, logout, me } from "./routes_auth.js";
import {
  listProjects, createProject, getProject, updateProject, deleteProject,
} from "./routes_projects.js";
import {
  listFloorplans, getFloorplan, uploadFloorplan, updateFloorplan,
  getFloorplanImage, getPlanImage, deleteFloorplan, deleteProjectFloorplans,
} from "./routes_floorplan.js";
import { listRooms, createRoom, updateRoom, deleteRoom, getRoom } from "./routes_rooms.js";
import { listWalls, createWall, getWall, updateWall, deleteWall } from "./routes_walls.js";
import {
  listArt, createArt, getArt, updateArt, deleteArt, uploadArtImage, getArtImage,
} from "./routes_art.js";
import {
  listPlacements, createPlacement, updatePlacement, deletePlacement,
} from "./routes_placements.js";
import {
  getReview, createShare, deleteShare, getPublicReview, getPublicPlanImage, getPublicFloorplanImage, getPublicArtImage,
} from "./routes_review.js";

// Wrap a handler so it requires an authenticated session.
const auth = (handler) => (ctx) => {
  if (!ctx.session) return error(401, "Not authenticated");
  return handler(ctx);
};

const router = new Router();

router.get("/api/health", ({ env }) => json({
  ok: true, service: "artset",
  bindings: { db: !!env.DB, bucket: !!env.BUCKET, kv: !!env.KV },
  time: Date.now(),
}));

// auth
router.post("/api/auth/signup", signup);
router.post("/api/auth/login", login);
router.post("/api/auth/logout", logout);
router.get("/api/auth/me", me);

// projects (studio-scoped)
router.get("/api/projects", auth(listProjects));
router.post("/api/projects", auth(createProject));
router.get("/api/projects/:id", auth(getProject));
router.patch("/api/projects/:id", auth(updateProject));
router.delete("/api/projects/:id", auth(deleteProject));

// floor plan
router.get("/api/projects/:id/floorplans", auth(listFloorplans));
router.post("/api/projects/:id/floorplans", auth(uploadFloorplan));
router.get("/api/projects/:id/floorplans/:floorplanId", auth(getFloorplan));
router.patch("/api/projects/:id/floorplans/:floorplanId", auth(updateFloorplan));
router.delete("/api/projects/:id/floorplans/:floorplanId", auth(deleteFloorplan));
router.get("/api/projects/:id/floorplans/:floorplanId/image", auth(getFloorplanImage));
router.post("/api/projects/:id/floorplan", auth(uploadFloorplan));
router.delete("/api/projects/:id/floorplan", auth(deleteProjectFloorplans));
router.get("/api/projects/:id/plan-image", auth(getPlanImage));

// rooms
router.get("/api/projects/:id/rooms", auth(listRooms));
router.post("/api/projects/:id/rooms", auth(createRoom));
router.get("/api/projects/:id/floorplans/:floorplanId/rooms", auth(listRooms));
router.post("/api/projects/:id/floorplans/:floorplanId/rooms", auth(createRoom));
router.get("/api/rooms/:id", auth(getRoom));
router.patch("/api/rooms/:id", auth(updateRoom));
router.delete("/api/rooms/:id", auth(deleteRoom));

// walls
router.get("/api/rooms/:id/walls", auth(listWalls));
router.post("/api/rooms/:id/walls", auth(createWall));
router.get("/api/walls/:id", auth(getWall));
router.patch("/api/walls/:id", auth(updateWall));
router.delete("/api/walls/:id", auth(deleteWall));

// art inventory
router.get("/api/projects/:id/art", auth(listArt));
router.post("/api/projects/:id/art", auth(createArt));
router.get("/api/art/:id", auth(getArt));
router.patch("/api/art/:id", auth(updateArt));
router.delete("/api/art/:id", auth(deleteArt));
router.post("/api/art/:id/image", auth(uploadArtImage));
router.get("/api/art/:id/image", auth(getArtImage));

// placements
router.get("/api/walls/:id/placements", auth(listPlacements));
router.post("/api/walls/:id/placements", auth(createPlacement));
router.patch("/api/placements/:id", auth(updatePlacement));
router.delete("/api/placements/:id", auth(deletePlacement));

// review + share
router.get("/api/projects/:id/review", auth(getReview));
router.post("/api/projects/:id/share", auth(createShare));
router.delete("/api/projects/:id/share", auth(deleteShare));

// public (no auth) via share token
router.get("/api/public/:token", getPublicReview);
router.get("/api/public/:token/plan-image", getPublicPlanImage);
router.get("/api/public/:token/floorplans/:floorplanId/image", getPublicFloorplanImage);
router.get("/api/public/:token/art/:artId/image", getPublicArtImage);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        const session = await getSession(env, request);
        return await router.handle(request, env, { session });
      } catch (err) {
        return error(500, "Internal error", { detail: String((err && err.message) || err) });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
