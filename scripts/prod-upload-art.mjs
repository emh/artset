#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DB = "artset-db";
const BUCKET = "artset-images";
const DEFAULT_PROJECT = "Sample Art";

function usage() {
  console.error("Usage:");
  console.error("  npm run prod:art:upload -- --studio \"Exact Studio Name\" --dir ./sample-art --manifest manifest.json");
  console.error("  npm run prod:art:upload -- --studio \"Exact Studio Name\" --dir ./sample-art --project \"Project Name\"");
  console.error("  npm run prod:art:upload -- --studio \"Exact Studio Name\" --dir ./sample-art --project-id proj_...");
}

function parseArgs(argv) {
  const out = { project: DEFAULT_PROJECT, manifest: "manifest.json" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    out[key] = argv[i + 1];
    i++;
  }
  return out;
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "NULL";
}

function id(prefix, bytes = 12) {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
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
    ], { maxBuffer: 1024 * 1024 * 20 }));
  } catch (err) {
    throw new Error((err && (err.stderr || err.stdout || err.message)) || err);
  }
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || first.success === false) throw new Error(JSON.stringify(parsed, null, 2));
  return first.results || [];
}

async function putObject(key, file) {
  await execFileAsync("npx", [
    "wrangler",
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--remote",
    "--force",
    "--file",
    file,
    "--content-type",
    contentTypeFor(file),
  ], { maxBuffer: 1024 * 1024 * 10 });
}

function normalizeManifest(raw) {
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : parsed.items || parsed.art || [];
  if (!Array.isArray(items)) throw new Error("Manifest must be an array or contain an items array.");
  return items;
}

function normalizeSizes(item) {
  const sizes = Array.isArray(item.sizes) ? item.sizes : [];
  return sizes
    .map((s) => ({
      width: Number(s.width_inches ?? s.width),
      height: Number(s.height_inches ?? s.height),
      label: s.label ? String(s.label) : null,
    }))
    .filter((s) => s.width > 0 && s.height > 0);
}

async function loadStudio(studioName) {
  const rows = await d1(`
    SELECT id, name
    FROM studios
    WHERE name = ${sqlString(studioName)}
  `);
  if (rows.length > 1) throw new Error(`More than one studio has the exact name "${studioName}".`);
  if (!rows.length) throw new Error(`No studio found with exact name: ${studioName}`);
  return rows[0];
}

async function ensureProject(studioId, projectName) {
  const existing = await d1(`
    SELECT id, name
    FROM projects
    WHERE studio_id = ${sqlString(studioId)}
      AND name = ${sqlString(projectName)}
    LIMIT 1
  `);
  if (existing[0]) return existing[0];

  const projectId = id("proj");
  const now = Date.now();
  await d1(`
    INSERT INTO projects (id, studio_id, name, status, created_at, updated_at, metadata_json)
    VALUES (${sqlString(projectId)}, ${sqlString(studioId)}, ${sqlString(projectName)}, 'active', ${now}, ${now}, '{}')
  `);
  return { id: projectId, name: projectName };
}

async function loadProject(studioId, projectId) {
  const rows = await d1(`
    SELECT id, name
    FROM projects
    WHERE id = ${sqlString(projectId)}
      AND studio_id = ${sqlString(studioId)}
    LIMIT 1
  `);
  if (!rows[0]) throw new Error(`Project ${projectId} was not found in that studio.`);
  return rows[0];
}

async function insertArt(projectId, item, imageKey) {
  const artId = id("art");
  const now = Date.now();
  const title = String(item.title || path.basename(item.file || "Untitled", path.extname(item.file || ""))).trim();
  if (!title) throw new Error(`Manifest item is missing title: ${JSON.stringify(item)}`);
  const sizes = normalizeSizes(item);
  if (!sizes.length) throw new Error(`Manifest item "${title}" needs at least one size.`);
  const metadata = {
    ...(item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {}),
    description: String(item.description || "").trim(),
  };

  const statements = [
    `INSERT INTO art_pieces (id, project_id, title, artist, medium, image_key, price, status, created_at, metadata_json)
     VALUES (${sqlString(artId)}, ${sqlString(projectId)}, ${sqlString(title)}, ${sqlString(item.artist || null)}, ${sqlString(item.medium || "Archival pigment print")}, ${sqlString(imageKey)}, ${sqlNumber(item.price)}, ${sqlString(item.status || "Selected")}, ${now}, ${sqlString(JSON.stringify(metadata))})`,
  ];
  for (const size of sizes) {
    statements.push(
      `INSERT INTO art_sizes (id, art_piece_id, width_inches, height_inches, label)
       VALUES (${sqlString(id("size"))}, ${sqlString(artId)}, ${sqlNumber(size.width)}, ${sqlNumber(size.height)}, ${sqlString(size.label)})`
    );
  }
  await d1(statements.join(";\n"));
  return artId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.studio || !args.dir) {
    usage();
    process.exitCode = 1;
    return;
  }

  const dir = path.resolve(args.dir);
  const manifestPath = path.isAbsolute(args.manifest) ? args.manifest : path.resolve(dir, args.manifest);
  const items = normalizeManifest(await readFile(manifestPath, "utf8"));
  const studio = await loadStudio(args.studio);
  const project = args["project-id"]
    ? await loadProject(studio.id, args["project-id"])
    : await ensureProject(studio.id, args.project || DEFAULT_PROJECT);

  let uploaded = 0;
  for (const item of items) {
    if (!item.file) throw new Error(`Manifest item is missing file: ${JSON.stringify(item)}`);
    const imagePath = path.resolve(dir, item.file);
    const imageKey = `art/${project.id}/${id("sample", 8)}${path.extname(imagePath).toLowerCase() || ".jpg"}`;
    await putObject(imageKey, imagePath);
    await insertArt(project.id, item, imageKey);
    uploaded++;
    console.log(`Uploaded ${uploaded}/${items.length}: ${item.title || item.file}`);
  }

  console.log(`Uploaded ${uploaded} art item(s) to "${studio.name}" / "${project.name}".`);
}

main().catch((err) => {
  console.error((err && err.message) || err);
  process.exitCode = 1;
});
