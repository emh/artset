ALTER TABLE floorplans ADD COLUMN name TEXT NOT NULL DEFAULT 'Floor plan';

ALTER TABLE rooms ADD COLUMN floorplan_id TEXT REFERENCES floorplans(id) ON DELETE CASCADE;

UPDATE rooms
SET floorplan_id = (
  SELECT fp.id
  FROM floorplans fp
  WHERE fp.project_id = rooms.project_id
  ORDER BY fp.rowid
  LIMIT 1
)
WHERE floorplan_id IS NULL;

CREATE INDEX idx_rooms_floorplan ON rooms(floorplan_id);
