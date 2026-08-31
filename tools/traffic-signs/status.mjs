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

function localEntryState(entry) {
  const filename = typeof entry?.localFile === "string" && path.basename(entry.localFile) === entry.localFile
    ? entry.localFile
    : null;
  const file = filename ? path.join(sourceDir, filename) : null;
  const exists = Boolean(file && fs.existsSync(file));
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
const technical = localEntryState(source?.technicalSource);
const technicalVerified = Boolean(
  technical.hashMatches &&
  source?.technicalSource?.verificationStatus === "verified-official-full-source" &&
  typeof source?.technicalSource?.verifiedBy === "string" &&
  source.technicalSource.verifiedBy.trim(),
);

const signs = Array.isArray(processed?.signs) ? processed.signs : [];
const officialCandidateSections = Array.isArray(officialCandidates?.candidates) ? officialCandidates.candidates : [];
const referenceCandidateSections = Array.isArray(referenceCandidates?.candidates) ? referenceCandidates.candidates : [];
const reviewRecords = Array.isArray(manualReview?.records) ? manualReview.records : [];
const reviewedRecords = reviewRecords.filter((record) => record?.verified === true);
const imageReviewPending = reviewRecords.filter((record) => typeof record?.image === "string" && record.image.trim() && record?.imageVerified !== true);
const processedSourceSha = normalizeSha(processed?.sourceSha256);
const processedProvenanceMatches = Boolean(
  technicalVerified && processedSourceSha && processedSourceSha === technical.declaredSha,
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
console.log(`Technical full source        : ${technical.exists ? technical.filename : "missing"}`);
console.log(`Technical SHA matches        : ${yesNo(technical.hashMatches)}`);
console.log(`Technical source reviewed    : ${yesNo(technicalVerified)}`);
if (technical.exists && technical.declaredSha && !technical.hashMatches) {
  console.log(`Technical SHA mismatch       : declared=${technical.declaredSha} actual=${technical.actualSha}`);
}
console.log(`Official candidates          : ${officialCandidateSections.length}`);
console.log(`Reference-only candidates    : ${referenceCandidateSections.length}`);
console.log(`Manual review records        : ${reviewRecords.length}`);
console.log(`Manual verified records      : ${reviewedRecords.length}`);
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

let next = "Run pnpm signs:source:download to fetch/hash the official promulgation document.";
if (!technical.exists) {
  next = `Obtain the full official QCVN 41:2024/BGTVT and place it at data/traffic-signs/source/${source?.technicalSource?.localFile ?? "qcvn-41-2024-bgvt-full.pdf"}. You may run signs:candidates:reference meanwhile for a non-production typing aid.`;
} else if (!technicalVerified) {
  next = "Run pnpm signs:source:verify -- --reviewer <name> --official-url <official-full-source-url>.";
} else if (officialCandidateSections.length === 0) {
  next = "Run pnpm signs:candidates:official to extract review candidates from the verified full QCVN PDF.";
} else if (reviewRecords.length === 0) {
  next = "Run pnpm signs:review:prepare, then fill/verify each record against the full official QCVN source.";
} else if (reviewedRecords.length !== reviewRecords.length || imageReviewPending.length > 0) {
  next = `Finish manual review: ${reviewRecords.length - reviewedRecords.length} record(s) unverified, ${imageReviewPending.length} image(s) unverified.`;
} else if (!processed) {
  next = "Run pnpm signs:review:apply to build production traffic-signs.json from the verified review file.";
} else if (!processedProvenanceMatches) {
  next = "Fix traffic-signs.json provenance so it matches the verified technical source exactly.";
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

if (missingImages.length > 0) {
  for (const item of missingImages.slice(0, 20)) console.log(`  missing/unsafe: ${item}`);
  if (missingImages.length > 20) console.log(`  ... ${missingImages.length - 20} more`);
}
