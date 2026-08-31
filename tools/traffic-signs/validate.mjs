import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] ?? "data/traffic-signs/processed/traffic-signs.json";
const assetsRoot = process.argv[3] ?? "data/traffic-signs/processed/assets";
const sourceManifestPath = process.argv[4] ?? "data/traffic-signs/source/source-manifest.json";
const GROUPS = new Set(["PROHIBITION", "MANDATORY", "WARNING", "INDICATION", "SUPPLEMENTARY"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const MAX_SIGN_COUNT = 2_000;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const SHA_RE = /^[a-f0-9]{64}$/i;

function fail(message) {
  console.error(`traffic-signs: INVALID - ${message}`);
  process.exit(1);
}

function readJson(file, label) {
  if (!fs.existsSync(file)) fail(`missing ${label}: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot parse ${label}: ${error.message}`);
  }
}

function normalizeSha(value) {
  return typeof value === "string" ? value.replace(/^sha256:/i, "").trim().toLowerCase() : "";
}

function sha256File(file) {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(file));
  return digest.digest("hex");
}

function safeImagePath(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    fail(`unsafe image path: ${value}`);
  }
  const ext = path.extname(segments.at(-1)).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) fail(`unsupported image type: ${value}`);
  return segments.join("/");
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    fail(`${label} must be an array of non-empty strings`);
  }
}

function assertOptionalString(value, label) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    fail(`${label} must be a string when provided`);
  }
}

const dataset = readJson(input, "traffic-signs dataset");
const sourceManifest = readJson(sourceManifestPath, "traffic-sign source manifest");
const technical = sourceManifest?.technicalSource;
if (!technical || typeof technical !== "object") fail(`source manifest is missing technicalSource`);
if (technical.verificationStatus !== "verified-official-full-source") {
  fail(`technicalSource is not verified-official-full-source`);
}
if (typeof technical.verifiedBy !== "string" || !technical.verifiedBy.trim()) {
  fail(`technicalSource is missing verifiedBy`);
}
if (typeof technical.verifiedAt !== "string" || !technical.verifiedAt.trim()) {
  fail(`technicalSource is missing verifiedAt`);
}
const technicalSha = normalizeSha(technical.sourceSha256);
if (!SHA_RE.test(technicalSha)) fail(`technicalSource.sourceSha256 must be a SHA-256 hex digest`);
if (typeof technical.localFile !== "string" || path.basename(technical.localFile) !== technical.localFile) {
  fail(`technicalSource.localFile must be a plain filename`);
}
const technicalFile = path.join(path.dirname(sourceManifestPath), technical.localFile);
if (!fs.existsSync(technicalFile) || !fs.statSync(technicalFile).isFile()) {
  fail(`verified technical source file is missing: ${technicalFile}`);
}
const actualTechnicalSha = sha256File(technicalFile);
if (actualTechnicalSha !== technicalSha) {
  fail(`technicalSource SHA-256 does not match local file`);
}

if (dataset.dataset !== "VN_TRAFFIC_SIGNS") fail(`dataset must be VN_TRAFFIC_SIGNS`);
if (dataset.stage !== "production") fail(`stage must be production`);
if (typeof dataset.version !== "string" || !VERSION_RE.test(dataset.version.trim())) fail(`invalid version`);
if (typeof dataset.validFrom !== "string" || !DATE_RE.test(dataset.validFrom.trim())) fail(`validFrom must use YYYY-MM-DD`);
if (typeof dataset.sourceDocument !== "string" || !dataset.sourceDocument.trim()) fail(`sourceDocument is required`);
if (dataset.sourceDocument.trim() !== sourceManifest.sourceDocument) fail(`sourceDocument does not match verified source manifest`);
const datasetSourceSha = normalizeSha(dataset.sourceSha256);
if (!SHA_RE.test(datasetSourceSha)) fail(`sourceSha256 must be a SHA-256 hex digest`);
if (datasetSourceSha !== technicalSha) fail(`sourceSha256 does not match verified technicalSource`);
if (!Array.isArray(dataset.signs) || dataset.signs.length === 0) fail(`signs must contain at least one verified record`);
if (dataset.signs.length > MAX_SIGN_COUNT) fail(`signs exceeds maximum of ${MAX_SIGN_COUNT} records`);

const codes = new Set();
let imageCount = 0;
for (const sign of dataset.signs) {
  const code = typeof sign.code === "string" ? sign.code.trim() : "";
  if (!CODE_RE.test(code)) fail(`invalid code: ${String(sign.code)}`);
  if (codes.has(code)) fail(`duplicate code: ${code}`);
  codes.add(code);
  if (typeof sign.name !== "string" || !sign.name.trim()) fail(`${code}: name is required`);
  if (!GROUPS.has(sign.groupCode)) fail(`${code}: invalid groupCode ${String(sign.groupCode)}`);
  if (typeof sign.meaning !== "string" || !sign.meaning.trim()) fail(`${code}: meaning is required`);
  if (typeof sign.sourceVersion !== "string" || !sign.sourceVersion.trim()) fail(`${code}: sourceVersion is required`);
  if (sign.sourceVersion.trim() !== sourceManifest.sourceDocument) fail(`${code}: sourceVersion must match ${sourceManifest.sourceDocument}`);
  assertOptionalString(sign.recognition, `${code}: recognition`);
  assertOptionalString(sign.scope, `${code}: scope`);
  assertOptionalString(sign.notes, `${code}: notes`);
  assertStringArray(sign.exceptions, `${code}: exceptions`);
  assertStringArray(sign.keywords, `${code}: keywords`);

  if (sign.image !== undefined && sign.image !== null && sign.image !== "") {
    if (typeof sign.image !== "string") fail(`${code}: image must be a string`);
    const relative = safeImagePath(sign.image);
    const absolute = path.join(assetsRoot, ...relative.split("/"));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`${code}: missing image ${relative}`);
    imageCount += 1;
  }
}

console.log(`traffic-signs: VALID`);
console.log(`version: ${dataset.version}`);
console.log(`source: ${dataset.sourceDocument}`);
console.log(`source sha256: ${technicalSha}`);
console.log(`source reviewer: ${technical.verifiedBy}`);
console.log(`signs: ${dataset.signs.length}`);
console.log(`images: ${imageCount}`);
