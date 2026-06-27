-- Artset schema (D1 / SQLite)
-- Tenancy: studio -> users (members) -> projects -> {floorplans, rooms->walls, art_pieces->art_sizes, placements}

CREATE TABLE studios (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  studio_id     TEXT NOT NULL REFERENCES studios(id),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_users_studio ON users(studio_id);

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  studio_id   TEXT NOT NULL REFERENCES studios(id),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_projects_studio ON projects(studio_id);

-- One uploaded plan image per project (v1).
CREATE TABLE floorplans (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image_key   TEXT NOT NULL,        -- R2 object key
  width_px    INTEGER NOT NULL,
  height_px   INTEGER NOT NULL
);
CREATE INDEX idx_floorplans_project ON floorplans(project_id);

-- Rooms are user-drawn rectangles over the plan image (px coords).
CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  rect_x      REAL NOT NULL,
  rect_y      REAL NOT NULL,
  rect_w      REAL NOT NULL,
  rect_h      REAL NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_rooms_project ON rooms(project_id);

-- Walls are user-drawn line segments (px coords) with a user-entered length in inches.
-- segments = JSON array of USABLE spans in inches: [{ "start": n, "end": n }, ...]
CREATE TABLE walls (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  length_inches REAL NOT NULL,
  height_inches REAL NOT NULL DEFAULT 108,
  ax REAL NOT NULL, ay REAL NOT NULL,
  bx REAL NOT NULL, by REAL NOT NULL,
  segments      TEXT NOT NULL DEFAULT '[]',
  sort          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_walls_room ON walls(room_id);

CREATE TABLE art_pieces (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  artist      TEXT,
  medium      TEXT,
  image_key   TEXT,                 -- R2 object key (nullable until uploaded)
  price       REAL,
  status      TEXT NOT NULL DEFAULT 'Selected',
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_art_project ON art_pieces(project_id);

-- A piece can be offered in multiple sizes.
CREATE TABLE art_sizes (
  id            TEXT PRIMARY KEY,
  art_piece_id  TEXT NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  width_inches  REAL NOT NULL,
  height_inches REAL NOT NULL,
  label         TEXT
);
CREATE INDEX idx_sizes_piece ON art_sizes(art_piece_id);

-- A placed instance of a piece (which size, which wall, horizontal offset).
CREATE TABLE placements (
  id                   TEXT PRIMARY KEY,
  art_piece_id         TEXT NOT NULL REFERENCES art_pieces(id) ON DELETE CASCADE,
  art_size_id          TEXT NOT NULL REFERENCES art_sizes(id) ON DELETE CASCADE,
  wall_id              TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
  start_inches         REAL NOT NULL,
  center_height_inches REAL
);
CREATE INDEX idx_placements_wall ON placements(wall_id);
CREATE INDEX idx_placements_piece ON placements(art_piece_id);

CREATE TABLE share_links (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER
);
CREATE INDEX idx_share_project ON share_links(project_id);
