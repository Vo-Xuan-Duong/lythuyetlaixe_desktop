import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] ?? "data/traffic-signs/processed/traffic-signs.json";
const assetsRoot = process.argv[3] ?? "data/traffic-signs/processed/assets";
const sourceManifestPath = process.argv[4] ?? "data/traffic-signs/source/source-manifest.json";
const GROUPS = new Set(["PROHIBITION", "MANDATORY", "WARNING", "INDICATION", "SUPPLEMENTARY"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const EXPECTED_GAZETTE_ISSUES = ["1359+1360", "1361+1362", "1363+1364", "1365+1366", "1367+1368"];
const MAX_SIGN_COUNT = 2_000;
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9.,_-]{0,31}$/;
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

function safeLocalFilename(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  const filename = value.trim();
  if (path.basename(filename) !== filename || filename === "." || filename === "..") fail(`${label} must be a plain filename`);
  return filename;
}

function checkedParts(parts) {
  if (!Array.isArray(parts) || parts.length !== EXPECTED_GAZETTE_ISSUES.length) {
    fail(`technicalSource.parts must contain exactly ${EXPECTED_GAZETTE_ISSUES.length} official Gazette parts`);
  }
  parts.forEach((part, index) => {
    if (!part || typeof part !== "object") fail(`technicalSource.parts[${index + 1}] must be an object`);
    const issue = typeof part.issue === "string" ? part.issue.trim() : "";
    if (issue !== EXPECTED_GAZETTE_ISSUES[index]) {
      fail(`technicalSource.parts[${index + 1}].issue must be ${EXPECTED_GAZETTE_ISSUES[index]}, found ${issue || "<missing>"}`);
    }
  });
  return parts;
}

function canonicalBundleSha256(parts) {
  const rows = [];
  checkedParts(parts).forEach((part, index) => {
    const checksum = normalizeSha(part.sourceSha256);
    if (!SHA_RE.test(checksum)) fail(`technicalSource.parts[${index + 1}].sourceSha256 is invalid`);
    rows.push(`${index + 1}|${EXPECTED_GAZETTE_ISSUES[index]}|${checksum}\n`);
  });
  return crypto.createHash("sha256").update(rows.join(""), "utf8").digest("hex");
}

function verifyMultipartSource(sourceManifest) {
  const technical = sourceManifest?.technicalSource;
  if (!technical || typeof technical !== "object") fail(`source manifest is missing technicalSource`);
  if (technical.acquisitionMethod !== "official-gazette-multipart") fail(`technicalSource.acquisitionMethod must be official-gazette-multipart`);
  if (technical.verificationStatus !== "verified-official-full-source") fail(`technicalSource is not verified-official-full-source`);
  if (typeof technical.verifiedBy !== "string" || !technical.verifiedBy.trim()) fail(`technicalSource is missing verifiedBy`);
  if (typeof technical.verifiedAt !== "string" || !technical.verifiedAt.trim()) fail(`technicalSource is missing verifiedAt`);

  const sourceDir = path.dirname(sourceManifestPath);
  const parts = checkedParts(technical.parts);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const filename = safeLocalFilename(part.localFile, `technicalSource.parts[${index + 1}].localFile`);
    const partFile = path.join(sourceDir, filename);
    if (!fs.existsSync(partFile) || !fs.statSync(partFile).isFile()) fail(`missing official source part: ${partFile}`);
    const declared = normalizeSha(part.sourceSha256);
    if (!SHA_RE.test(declared)) fail(`invalid SHA-256 for official source part: ${filename}`);
    if (sha256File(partFile) !== declared) fail(`official source part SHA-256 mismatch: ${filename}`);
  }

  const bundleSha = canonicalBundleSha256(parts);
  const declaredBundleSha = normalizeSha(technical.sourceSha256);
  if (!SHA_RE.test(declaredBundleSha) || declaredBundleSha !== bundleSha) fail(`technicalSource.sourceSha256 does not match canonical multipart bundle hash`);

  const combinedFilename = safeLocalFilename(technical.localFile, "technicalSource.localFile");
  const combinedFile = path.join(sourceDir, combinedFilename);
  if (!fs.existsSync(combinedFile) || !fs.statSync(combinedFile).isFile()) fail(`missing combined technical source PDF: ${combinedFile}`);
  const declaredCombinedSha = normalizeSha(technical.combinedSha256);
  if (!SHA_RE.test(declaredCombinedSha) || sha256File(combinedFile) !== declaredCombinedSha) fail(`technicalSource.combinedSha256 does not match combined local PDF`);

  return { technical, bundleSha };
}

function safeImagePath(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) fail(`unsafe image path: ${value}`);
  const ext = path.extname(segments.at(-1)).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) fail(`unsupported image type: ${value}`);
  return segments.join("/");
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) fail(`${label} must be an array of non-empty strings`);
}

function assertOptionalString(value, label) {
  if (value !== undefined && value !== null && typeof value !== "string") fail(`${label} must be a string when provided`);
}

const dataset = readJson(input, "traffic-signs dataset");
const sourceManifest = readJson(sourceManifestPath, "traffic-sign source manifest");
const { technical, bundleSha } = verifyMultipartSource(sourceManifest);

if (dataset.dataset !== "VN_TRAFFIC_SIGNS") fail(`dataset must be VN_TRAFFIC_SIGNS`);
if (dataset.stage !== "production") fail(`stage must be production`);
if (typeof dataset.version !== "string" || !VERSION_RE.test(dataset.version.trim())) fail(`invalid version`);
if (typeof dataset.validFrom !== "string" || !DATE_RE.test(dataset.validFrom.trim())) fail(`validFrom must use YYYY-MM-DD`);
if (typeof dataset.sourceDocument !== "string" || !dataset.sourceDocument.trim()) fail(`sourceDocument is required`);
if (dataset.sourceDocument.trim() !== sourceManifest.sourceDocument) fail(`sourceDocument does not match verified source manifest`);
const datasetSourceSha = normalizeSha(dataset.sourceSha256);
if (!SHA_RE.test(datasetSourceSha)) fail(`sourceSha256 must be a SHA-256 hex digest`);
if (datasetSourceSha !== bundleSha) fail(`sourceSha256 does not match verified canonical multipart bundle`);
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
    if (sign.imageVerified !== true) fail(`${code}: image is present but imageVerified is not true`);
    imageCount += 1;
  }
}

console.log(`traffic-signs: VALID`);
console.log(`version: ${dataset.version}`);
console.log(`source: ${dataset.sourceDocument}`);
console.log(`source bundle sha256: ${bundleSha}`);
console.log(`source parts: ${technical.parts.length}`);
console.log(`source reviewer: ${technical.verifiedBy}`);
console.log(`signs: ${dataset.signs.length}`);
console.log(`images: ${imageCount}`);
