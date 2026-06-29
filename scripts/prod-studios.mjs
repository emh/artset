#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DB = "artset-db";
const BUCKET = "artset-images";

function usage() {
  console.error("Usage:");
  console.error("  npm run prod:studios:list");
  console.error("  npm run prod:studios:delete -- \"Exact Studio Name\"");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function d1(sql) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("npx", [
      "wrangler",
      "d1",
      "execute",
      DB,
      "--remote",
      "--json",
      "--command",
      sql,
    ], { maxBuffer: 1024 * 1024 * 10 }));
  } catch (err) {
    throw new Error((err && (err.stderr || err.stdout || err.message)) || err);
  }
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || first.success === false) {
    throw new Error(JSON.stringify(parsed, null, 2));
  }
  return first.results || [];
}

async function deleteObject(key) {
  await execFileAsync("npx", [
    "wrangler",
    "r2",
    "object",
    "delete",
    `${BUCKET}/${key}`,
    "--remote",
    "--force",
  ]);
}

async function listStudios() {
  const rows = await d1(`
    SELECT
      s.id,
      s.name,
      s.login_key AS loginKey,
      s.created_at AS createdAt,
      COUNT(DISTINCT u.id) AS users,
      COUNT(DISTINCT p.id) AS projects,
      COUNT(DISTINCT a.id) AS art
    FROM studios s
    LEFT JOIN users u ON u.studio_id = s.id
    LEFT JOIN projects p ON p.studio_id = s.id
    LEFT JOIN art_pieces a ON a.project_id = p.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);

  if (!rows.length) {
    console.log("No studios found.");
    return;
  }
  console.table(rows);
}

async function deleteStudio(studioName) {
  if (!studioName) {
    usage();
    process.exitCode = 1;
    return;
  }

  const studioRows = await d1(`
    SELECT id, name, login_key AS loginKey
    FROM studios
    WHERE name = ${sqlString(studioName)}
  `);
  if (studioRows.length > 1) {
    console.error(`More than one studio has the exact name "${studioName}". Delete by hand after resolving the duplicate.`);
    process.exitCode = 1;
    return;
  }
  const studio = studioRows[0];
  if (!studio) {
    console.error(`No studio found with exact name: ${studioName}`);
    process.exitCode = 1;
    return;
  }

  const studioId = sqlString(studio.id);
  const imageRows = await d1(`
    SELECT image_key AS imageKey
    FROM floorplans
    WHERE project_id IN (SELECT id FROM projects WHERE studio_id = ${studioId})
    UNION
    SELECT image_key AS imageKey
    FROM art_pieces
    WHERE image_key IS NOT NULL
      AND project_id IN (SELECT id FROM projects WHERE studio_id = ${studioId})
  `);

  for (const row of imageRows) {
    if (!row.imageKey) continue;
    try {
      await deleteObject(row.imageKey);
    } catch (err) {
      console.warn(`Could not delete R2 object ${row.imageKey}: ${(err && err.message) || err}`);
    }
  }

  await d1(`
    DELETE FROM placements
    WHERE art_piece_id IN (
      SELECT a.id FROM art_pieces a
      JOIN projects p ON p.id = a.project_id
      WHERE p.studio_id = ${studioId}
    );
    DELETE FROM placements
    WHERE wall_id IN (
      SELECT w.id FROM walls w
      JOIN rooms r ON r.id = w.room_id
      JOIN projects p ON p.id = r.project_id
      WHERE p.studio_id = ${studioId}
    );
    DELETE FROM art_sizes
    WHERE art_piece_id IN (
      SELECT a.id FROM art_pieces a
      JOIN projects p ON p.id = a.project_id
      WHERE p.studio_id = ${studioId}
    );
    DELETE FROM art_pieces WHERE project_id IN (SELECT id FROM projects WHERE studio_id = ${studioId});
    DELETE FROM walls WHERE room_id IN (
      SELECT r.id FROM rooms r
      JOIN projects p ON p.id = r.project_id
      WHERE p.studio_id = ${studioId}
    );
    DELETE FROM rooms WHERE project_id IN (SELECT id FROM projects WHERE studio_id = ${studioId});
    DELETE FROM floorplans WHERE project_id IN (SELECT id FROM projects WHERE studio_id = ${studioId});
    DELETE FROM share_links WHERE project_id IN (SELECT id FROM projects WHERE studio_id = ${studioId});
    DELETE FROM projects WHERE studio_id = ${studioId};
    DELETE FROM users WHERE studio_id = ${studioId};
    DELETE FROM studios WHERE id = ${studioId};
  `);

  console.log(`Deleted studio "${studio.name}" and ${imageRows.length} R2 object(s).`);
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "list") await listStudios();
  else if (command === "delete") await deleteStudio(args.join(" "));
  else {
    usage();
    process.exitCode = 1;
  }
} catch (err) {
  console.error((err && err.message) || err);
  process.exitCode = 1;
}
