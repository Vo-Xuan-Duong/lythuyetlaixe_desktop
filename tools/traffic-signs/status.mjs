import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceManifestPath = path.join(root, "data/traffic-signs/source/source-manifest.json");
const processedPath = path.join(root, "data/traffic-signs/processed/traffic-signs.json");
const assetsRoot = path.join(root, "data/traffic-signs/processed/assets");
const publishedManifestPath = path.join(root, "dist/traffic-signs/manifest.json");
const SHA_RE = /^[a-f0-9]{64}$/i;

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { __error: error.message };
  }
}

function yesNo(value) {
  return value ? "yes" : "no";
}

const source = readJson(sourceManifestPath);
const processed = readJson(processedPath);
const published = readJson(publishedManifestPath);

const sourceSha = typeof source?.sourceSha256 === "string"
  ? source.sourceSha256.replace(/^sha256:/i, "")
  : "";
const sourceReady = Boolean(source && !source.__error && SHA_RE.test(sourceSha));
const signs = Array.isArray(processed?.signs) ? processed.signs : [];
const imagePaths = signs
  .map((sign) => sign?.image)
  .filter((value) => typeof value === "string" && value.trim());
const missingImages = imagePaths.filter((relative) => {
  const safe = relative.replaceAll("\\", "/").replace(/^\.\//, "");
  return !fs.existsSync(path.join(assetsRoot, ...safe.split("/")));
});

console.log("Traffic signs dataset status");
console.log("----------------------------");
console.log(`Source manifest        : ${yesNo(Boolean(source))}`);
if (source?.__error) console.log(`Source manifest error  : ${source.__error}`);
console.log(`Source SHA-256 verified: ${yesNo(sourceReady)}`);
console.log(`Processed dataset      : ${yesNo(Boolean(processed))}`);
if (processed?.__error) console.log(`Processed JSON error   : ${processed.__error}`);
console.log(`Dataset version        : ${processed?.version ?? "-"}`);
console.log(`Signs                  : ${signs.length}`);
console.log(`Referenced images      : ${imagePaths.length}`);
console.log(`Missing images         : ${missingImages.length}`);
console.log(`Published manifest     : ${yesNo(Boolean(published))}`);
console.log(`Published version      : ${published?.version ?? "-"}`);

let next = "Download/hash the official source document and update source-manifest.json.";
if (sourceReady && !processed) {
  next = "Create data/traffic-signs/processed/traffic-signs.json from verified official data.";
} else if (sourceReady && processed && signs.length === 0) {
  next = "Add verified traffic-sign records; empty catalogs cannot be published.";
} else if (sourceReady && processed && missingImages.length > 0) {
  next = `Add ${missingImages.length} missing referenced image file(s).`;
} else if (sourceReady && processed && signs.length > 0 && missingImages.length === 0 && !published) {
  next = "Run pnpm signs:finalize to validate and publish the catalog.";
} else if (published) {
  next = "Upload the versioned release payload to R2 first, then upload manifest.json last.";
}

console.log(`Next                   : ${next}`);

if (missingImages.length > 0) {
  for (const item of missingImages.slice(0, 20)) console.log(`  missing: ${item}`);
  if (missingImages.length > 20) console.log(`  ... ${missingImages.length - 20} more`);
}
