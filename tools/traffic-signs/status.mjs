import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "data/traffic-signs/source");
const rawDir = path.join(root, "data/traffic-signs/raw");
const sourceManifestPath = path.join(sourceDir, "source-manifest.json");
const processedPath = path.join(root, "data/traffic-signs/processed/traffic-signs.json");
const assetsRoot = path.join(root, "data/traffic-signs/processed/assets");
const officialCandidatePath = path.join(rawDir, "official-candidates.json");
const referenceCandidatePath = path.join(rawDir, "reference-candidates.json");
const manualReviewPath = path.join(rawDir, "manual-review.json");
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

function sha256File(file) {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(file));
  return digest.digest("hex");
}

function normalizeSha(value) {
  return typeof value === "string" ? value.replace(/^sha256:/i, "").trim().toLowerCase() : "";
}

function safeLocalFile(value) {
  return typeof value === "string" && value.trim() && path.basename(value.trim()) === value.trim()
    ? value.trim()
    : null;
}

function localEntryState(entry) {
  const filename = safeLocalFile(entry?.localFile);
  const file = filename ? path.join(sourceDir, filename) : null;
  const exists = Boolean(file && fs.existsSync(file) && fs.statSync(file).isFile());
  const declaredSha = normalizeSha(entry?.sourceSha256);
  const actualSha = exists ? sha256File(file) : "";
  return {
    filename,
    exists,
    declaredSha,
    actualSha,
    hashMatches: Boolean(exists && SHA_RE.test(declaredSha) && declaredSha === actualSha),
  };
}

function canonicalBundleSha256(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return "";
  const rows = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const issue = typeof part?.issue === "string" ? part.issue.trim() : "";
    const checksum = normalizeSha(part?.sourceSha256);
    if (!issue || !SHA_RE.test(checksum)) return "";
    rows.push(`${index + 1}|${issue}|${checksum}\n`);
  }
  return crypto.createHash("sha256").update(rows.join(""), "utf8").digest("hex");
}

function technicalState(technical) {
  const parts = Array.isArray(technical?.parts) ? technical.parts : [];
  const partStates = parts.map((part) => ({ issue: part?.issue ?? "?", ...localEntryState(part) }));
  const downloaded = partStates.filter((state) => state.exists).length;
  const verifiedParts = partStates.filter((state) => state.hashMatches).length;
  const canonicalSha = canonicalBundleSha256(parts);
  const declaredBundleSha = normalizeSha(technical?.sourceSha256);
  const bundleMatches = Boolean(canonicalSha && declaredBundleSha === canonicalSha);
  const combinedFilename = safeLocalFile(technical?.localFile);
  const combinedFile = combinedFilename ? path.join(sourceDir, combinedFilename) : null;
  const combinedExists = Boolean(combinedFile && fs.existsSync(combinedFile) && fs.statSync(combinedFile).isFile());
  const actualCombinedSha = combinedExists ? sha256File(combinedFile) : "";
  const declaredCombinedSha = normalizeSha(technical?.combinedSha256);
  const combinedMatches = Boolean(combinedExists && SHA_RE.test(declaredCombinedSha) && declaredCombinedSha === actualCombinedSha);
  const reviewed = Boolean(
    technical?.acquisitionMethod === "official-gazette-multipart" &&
    parts.length > 0 &&
    verifiedParts === parts.length &&
    bundleMatches &&
    combinedMatches &&
    technical?.verificationStatus === "verified-official-full-source" &&
    typeof technical?.verifiedBy === "string" && technical.verifiedBy.trim() &&
    typeof technical?.verifiedAt === "string" && technical.verifiedAt.trim()
  );
  return {
    parts,
    partStates,
    downloaded,
    verifiedParts,
    canonicalSha,
    declaredBundleSha,
    bundleMatches,
    combinedFilename,
    combinedExists,
    combinedMatches,
    reviewed,
  };
}

function yesNo(value) {
  return value ? "yes" : "no";
}

const source = readJson(sourceManifestPath);
const processed = readJson(processedPath);
const officialCandidates = readJson(officialCandidatePath);
const referenceCandidates = readJson(referenceCandidatePath);
const manualReview = readJson(manualReviewPath);
const published = readJson(publishedManifestPath);
const legal = localEntryState(source?.legalBasis);
const technical = technicalState(source?.technicalSource);

const signs = Array.isArray(processed?.signs) ? processed.signs : [];
const officialCandidateSections = Array.isArray(officialCandidates?.candidates) ? officialCandidates.candidates : [];
const officialCandidateImages = officialCandidateSections.reduce(
  (count, candidate) => count + (Array.isArray(candidate?.imageCandidates) ? candidate.imageCandidates.length : 0),
  0,
);
const referenceCandidateSections = Array.isArray(referenceCandidates?.candidates) ? referenceCandidates.candidates : [];
const reviewRecords = Array.isArray(manualReview?.records) ? manualReview.records : [];
const reviewedRecords = reviewRecords.filter((record) => record?.verified === true);
const selectedImages = reviewRecords.filter((record) => typeof record?.selectedImageCandidate === "string" && record.selectedImageCandidate.trim());
const processedReviewImages = reviewRecords.filter((record) => typeof record?.image === "string" && record.image.trim());
const imageReviewPending = processedReviewImages.filter((record) => record?.imageVerified !== true);
const processedSourceSha = normalizeSha(processed?.sourceSha256);
const processedProvenanceMatches = Boolean(
  technical.reviewed && processedSourceSha && processedSourceSha === technical.canonicalSha,
);
const imagePaths = signs
  .map((sign) => sign?.image)
  .filter((value) => typeof value === "string" && value.trim());
const missingImages = imagePaths.filter((relative) => {
  const safe = relative.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = safe.split("/").filter(Boolean);
  if (safe.startsWith("/") || /^[a-zA-Z]:/.test(safe) || segments.some((segment) => segment === "." || segment === "..")) {
    return true;
  }
  return !fs.existsSync(path.join(assetsRoot, ...segments));
});

console.log("Traffic signs dataset status");
console.log("----------------------------");
console.log(`Source manifest              : ${yesNo(Boolean(source))}`);
if (source?.__error) console.log(`Source manifest error        : ${source.__error}`);
console.log(`Legal-basis file             : ${legal.exists ? legal.filename : "missing"}`);
console.log(`Legal-basis SHA verified     : ${yesNo(legal.hashMatches)}`);
console.log(`Official Gazette parts       : ${technical.downloaded}/${technical.parts.length} downloaded`);
console.log(`Part SHA verified            : ${technical.verifiedParts}/${technical.parts.length}`);
console.log(`Canonical bundle SHA matches : ${yesNo(technical.bundleMatches)}`);
console.log(`Combined parsing PDF         : ${technical.combinedExists ? technical.combinedFilename : "missing"}`);
console.log(`Combined PDF SHA verified    : ${yesNo(technical.combinedMatches)}`);
console.log(`Technical source reviewed    : ${yesNo(technical.reviewed)}`);
console.log(`Official candidate sections  : ${officialCandidateSections.length}`);
console.log(`Official image candidates    : ${officialCandidateImages}`);
console.log(`Reference-only candidates    : ${referenceCandidateSections.length}`);
console.log(`Manual review records        : ${reviewRecords.length}`);
console.log(`Manual verified records      : ${reviewedRecords.length}`);
console.log(`Selected image candidates    : ${selectedImages.length}`);
console.log(`Processed review images      : ${processedReviewImages.length}`);
console.log(`Image verification pending   : ${imageReviewPending.length}`);
console.log(`Processed dataset            : ${yesNo(Boolean(processed))}`);
if (processed?.__error) console.log(`Processed JSON error         : ${processed.__error}`);
console.log(`Dataset version              : ${processed?.version ?? "-"}`);
console.log(`Signs                        : ${signs.length}`);
console.log(`Processed provenance matches : ${yesNo(processedProvenanceMatches)}`);
console.log(`Referenced images            : ${imagePaths.length}`);
console.log(`Missing images               : ${missingImages.length}`);
console.log(`Published manifest           : ${yesNo(Boolean(published))}`);
console.log(`Published version            : ${published?.version ?? "-"}`);

let next = "Run pnpm signs:source:download to fetch/hash all official Gazette source parts.";
if (technical.parts.length === 0 || technical.downloaded !== technical.parts.length || technical.verifiedParts !== technical.parts.length || !technical.bundleMatches || !technical.combinedMatches) {
  next = "Run pnpm signs:source:download and resolve any missing/hash-mismatched Gazette part before review.";
} else if (!technical.reviewed) {
  next = "Run pnpm signs:source:verify -- --reviewer <name>.";
} else if (officialCandidateSections.length === 0) {
  next = "Run pnpm signs:candidates:official, then pnpm signs:candidates:images.";
} else if (reviewRecords.length === 0) {
  next = "Run pnpm signs:review:prepare and pnpm signs:review:workspace.";
} else if (selectedImages.length > processedReviewImages.length) {
  next = "Export manual-review.json, run pnpm signs:review:images, rebuild workspace, inspect copied assets, then mark imageVerified.";
} else if (reviewedRecords.length !== reviewRecords.length || imageReviewPending.length > 0) {
  next = `Finish manual review: ${reviewRecords.length - reviewedRecords.length} record(s) unverified, ${imageReviewPending.length} processed image(s) unverified.`;
} else if (!processed) {
  next = "Run pnpm signs:review:apply to build production traffic-signs.json.";
} else if (!processedProvenanceMatches) {
  next = "Fix traffic-signs.json sourceSha256 so it matches the verified canonical Gazette bundle.";
} else if (signs.length === 0) {
  next = "Add verified traffic-sign records; empty catalogs cannot be published.";
} else if (missingImages.length > 0) {
  next = `Add or fix ${missingImages.length} missing/unsafe referenced image file(s).`;
} else if (!published) {
  next = "Run pnpm signs:publish (or signs:finalize) to validate and publish the catalog.";
} else {
  next = "Upload releases/<version>/ payload to R2 first, then upload manifest.json last.";
}

console.log(`Next                         : ${next}`);

for (const state of technical.partStates) {
  if (!state.exists || !state.hashMatches) {
    console.log(`  source part: ${state.issue} -> ${state.exists ? "SHA mismatch" : "missing"} (${state.filename ?? "invalid localFile"})`);
  }
}
if (missingImages.length > 0) {
  for (const item of missingImages.slice(0, 20)) console.log(`  missing/unsafe: ${item}`);
  if (missingImages.length > 20) console.log(`  ... ${missingImages.length - 20} more`);
}
