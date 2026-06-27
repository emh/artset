-- A piece can be placed in at most one location.
DROP INDEX IF EXISTS idx_placements_piece;
CREATE UNIQUE INDEX idx_placements_piece ON placements(art_piece_id);
