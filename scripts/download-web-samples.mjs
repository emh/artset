#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API = "https://commons.wikimedia.org/w/api.php";
const DEFAULT_COUNT = 12;
const DEFAULT_OUT = "sample-art";
const DEFAULT_DELAY_MS = 1500;
const THUMB_WIDTH = 900;
const CATEGORIES = ["nature", "architecture"];
const MEDIUMS = [
  "Archival pigment print",
  "Fine art photographic print",
  "Framed photographic print",
  "Chromogenic print",
];

function usage() {
  console.error("Usage:");
  console.error("  npm run sample-art:web -- --count 24 --out ./sample-art");
  console.error("  npm run sample-art:web -- --count 24 --out ./sample-art --delay-ms 1500");
}

function parseArgs(argv) {
  const out = { count: DEFAULT_COUNT, out: DEFAULT_OUT, "delay-ms": DEFAULT_DELAY_MS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    out[key] = argv[i + 1];
    i++;
  }
  out.count = Math.max(1, Number.parseInt(out.count, 10) || DEFAULT_COUNT);
  out.delayMs = Math.max(0, Number.parseInt(out["delay-ms"], 10) || DEFAULT_DELAY_MS);
  return out;
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function titleCase(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function titleFor(page, category, index) {
  const raw = String(page.title || "")
    .replace(/^File:/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ");
  const cleaned = raw.replace(/\b(DSC|IMG|PXL|JPEG|JPG|PNG)\b/gi, "").replace(/\s+/g, " ").trim();
  return cleaned ? titleCase(cleaned) : `${titleCase(category)} Study ${String(index + 1).padStart(2, "0")}`;
}

function randomDimensions(pixelWidth, pixelHeight) {
  const ratio = pixelWidth > 0 && pixelHeight > 0 ? pixelWidth / pixelHeight : 1.25;
  const landscapeWidths = [24, 30, 36, 40, 48, 54, 60, 72];
  const portraitHeights = [24, 30, 36, 40, 48, 54, 60, 72];
  const squareSides = [18, 24, 30, 36, 42, 48];
  const count = 1 + Math.floor(Math.random() * 3);
  const sizes = [];
  const used = new Set();

  while (sizes.length < count) {
    let width;
    let height;
    if (ratio > 1.12) {
      width = pick(landscapeWidths);
      height = Math.round(width / ratio);
    } else if (ratio < 0.88) {
      height = pick(portraitHeights);
      width = Math.round(height * ratio);
    } else {
      width = pick(squareSides);
      height = width;
    }

    width = Math.max(8, Math.round(width));
    height = Math.max(8, Math.round(height));
    const key = `${width}x${height}`;
    if (used.has(key)) continue;
    used.add(key);
    sizes.push({
      width_inches: width,
      height_inches: height,
      label: null,
    });
  }

  return sizes
    .sort((a, b) => a.width_inches * a.height_inches - b.width_inches * b.height_inches)
    .map((size, index) => ({
      ...size,
      label: count === 1 ? "Standard" : ["Small", "Medium", "Large"][index],
    }));
}

async function searchCommons(category, limit) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrsearch", `${category} photograph filetype:bitmap`);
  url.searchParams.set("gsrlimit", String(Math.max(limit * 4, 20)));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime|extmetadata");
  url.searchParams.set("iiurlwidth", String(THUMB_WIDTH));

  const res = await fetch(url, {
    headers: { "user-agent": "artset-demo-sample-script/1.0 (demo image downloader)" },
  });
  if (!res.ok) throw new Error(`Commons search ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const pages = Object.values((data.query && data.query.pages) || {});
  return pages
    .map((page) => ({ page, info: page.imageinfo && page.imageinfo[0], category }))
    .filter(({ info }) => info && info.thumburl && String(info.mime || "").startsWith("image/"));
}

async function downloadImage(url, filePath) {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": "artset-demo-sample-script/1.0 (demo image downloader)" },
    });
    if (res.ok) {
      const data = Buffer.from(await res.arrayBuffer());
      await writeFile(filePath, data);
      return;
    }
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt === attempts) {
      throw new Error(`Image download ${res.status}: ${url}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : attempt * 2500;
    await sleep(wait);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });

  const photos = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    const category = CATEGORIES[i];
    const needed = Math.floor(args.count / CATEGORIES.length) + (i < args.count % CATEGORIES.length ? 1 : 0);
    const found = await searchCommons(category, Math.max(needed * 6, args.count));
    if (found.length < needed) throw new Error(`Only found ${found.length} usable ${category} images.`);
    photos.push(...shuffle(found));
  }

  const selected = shuffle(photos);
  const manifest = {
    source: "wikimedia-commons",
    generatedAt: new Date().toISOString(),
    items: [],
  };

  const usedFiles = new Set();
  for (let i = 0; i < selected.length && manifest.items.length < args.count; i++) {
    const { page, info, category } = selected[i];
    const itemNumber = manifest.items.length + 1;
    const title = titleFor(page, category, itemNumber - 1);
    let file = `${String(itemNumber).padStart(3, "0")}-${slug(title)}.jpg`;
    while (usedFiles.has(file)) file = `${String(itemNumber).padStart(3, "0")}-${slug(title)}-${usedFiles.size}.jpg`;
    usedFiles.add(file);
    const artist = stripHtml(info.extmetadata && info.extmetadata.Artist && info.extmetadata.Artist.value) || "Wikimedia Commons";

    try {
      await downloadImage(info.thumburl, path.join(outDir, file));
    } catch (err) {
      usedFiles.delete(file);
      console.warn(`Skipped "${title}": ${(err && err.message) || err}`);
      await sleep(args.delayMs);
      continue;
    }
    manifest.items.push({
      file,
      title,
      artist,
      medium: pick(MEDIUMS),
      status: "Selected",
      description: stripHtml(info.extmetadata && info.extmetadata.ImageDescription && info.extmetadata.ImageDescription.value),
      sizes: randomDimensions(info.width, info.height),
      metadata: {
        source: "wikimedia-commons",
        sourceUrl: info.descriptionurl,
        category,
        pixelWidth: info.width,
        pixelHeight: info.height,
        license: stripHtml(info.extmetadata && info.extmetadata.LicenseShortName && info.extmetadata.LicenseShortName.value),
      },
    });
    console.log(`Downloaded ${manifest.items.length}/${args.count}: ${title}`);
    await sleep(args.delayMs);
  }

  if (manifest.items.length < args.count) {
    throw new Error(`Downloaded ${manifest.items.length}/${args.count} images before running out of candidates. Try a smaller count or rerun.`);
  }

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.join(outDir, "manifest.json")}`);
}

main().catch((err) => {
  console.error((err && err.message) || err);
  process.exitCode = 1;
});
