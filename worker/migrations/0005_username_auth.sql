ALTER TABLE studios ADD COLUMN login_key TEXT;
CREATE UNIQUE INDEX idx_studios_login_key ON studios(login_key);

DROP INDEX IF EXISTS idx_users_studio;
DROP TABLE users;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  studio_id     TEXT NOT NULL REFERENCES studios(id),
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_users_studio ON users(studio_id);
CREATE UNIQUE INDEX idx_users_studio_username ON users(studio_id, username);
