#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_QUESTION_COUNT = 600;
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ALLOWED_ANSWER_KEYS = new Set(["A", "B", "C", "D"]);
const SUPPORTED_LICENSES = new Set([
  "B", "C1", "C", "D1", "D2", "D", "BE", "C1E", "CE", "D1E", "D2E", "DE",
]);
const EXPECTED_CRITICAL_IDS = new Set([
  19,20,21,22,23,24,25,26,27,28,30,32,34,35,47,48,52,53,55,58,63,64,65,66,67,68,
  70,71,72,73,74,85,86,87,88,89,90,91,92,93,97,98,102,117,163,165,167,197,198,206,
  215,226,234,245,246,252,253,254,255,260,
]);
const CATEGORY_RULES = [
  { code: "GENERAL_RULES", from: 1, to: 180 },
  { code: "CULTURE", from: 181, to: 205 },
  { code: "DRIVING_TECHNIQUE", from: 206, to: 263 },
  { code: "VEHICLE", from: 264, to: 300 },
  { code: "ROAD_SIGNS", from: 301, to: 485 },
  { code: "SITUATIONS", from: 486, to: 600 },
];

const datasetPath = process.argv[2];
const imagesRootArg = process.argv.find((value) => value.startsWith("--images-root="));
const imagesRoot = imagesRootArg?.slice("--images-root=".length);

if (!datasetPath) {
  console.error("Usage: node tools/dataset/validate.mjs <questions.json> [--images-root=data/processed/assets]");
  process.exit(2);
}

const errors = [];
const warnings = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function expectedCategory(questionId) {
  return CATEGORY_RULES.find((rule) => questionId >= rule.from && questionId <= rule.to)?.code;
}

function normalizedSha256(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/^sha256:/, "") : "";
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(normalizedSha256(value));
}

function normalizedImagePath(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  if (!ALLOWED_IMAGE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())) {
    return null;
  }
  return segments.join("/");
}

async function imageExists(imagePath) {
  if (!imagesRoot || !imagePath) return true;
  const root = path.resolve(imagesRoot);
  const absolutePath = path.resolve(root, imagePath);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

let dataset;
try {
  dataset = JSON.parse(await readFile(datasetPath, "utf8"));
} catch (error) {
  console.error(`Cannot read dataset: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

assert(dataset?.dataset === "VN_GPLX_600", "dataset must equal VN_GPLX_600");
assert(typeof dataset?.version === "string" && dataset.version.trim().length > 0, "dataset.version is required");
assert(typeof dataset?.validFrom === "string" && dataset.validFrom.trim().length > 0, "dataset.validFrom is required");
assert(isSha256(dataset?.sourceSha256), "dataset.sourceSha256 must be the 64-character SHA-256 of the official source PDF");
assert(Array.isArray(dataset?.questions), "dataset.questions must be an array");
assert(dataset?.stage === "production", "dataset.stage must equal production before release/import");
assert(
  dataset?.imageVerification && typeof dataset.imageVerification === "object",
  "dataset.imageVerification metadata is required",
);
assert(
  dataset?.imageVerification?.unresolved === 0,
  `dataset.imageVerification.unresolved must equal 0, found ${String(dataset?.imageVerification?.unresolved)}`,
);

const questions = Array.isArray(dataset?.questions) ? dataset.questions : [];
assert(
  questions.length === EXPECTED_QUESTION_COUNT,
  `expected ${EXPECTED_QUESTION_COUNT} questions, found ${questions.length}`,
);

const seenIds = new Set();
let criticalCount = 0;
let unresolvedAnswerCount = 0;
let unresolvedImageCount = 0;

for (const question of questions) {
  const prefix = `question ${question?.id ?? "<missing-id>"}`;

  assert(Number.isInteger(question?.id), `${prefix}: id must be an integer`);
  if (!Number.isInteger(question?.id)) continue;

  assert(question.id >= 1 && question.id <= 600, `${prefix}: id must be between 1 and 600`);
  assert(!seenIds.has(question.id), `${prefix}: duplicated id`);
  seenIds.add(question.id);

  assert(typeof question.content === "string" && question.content.trim().length > 0, `${prefix}: content is required`);
  assert(typeof question.category === "string" && question.category.length > 0, `${prefix}: category is required`);

  const category = expectedCategory(question.id);
  if (category) {
    assert(question.category === category, `${prefix}: expected category ${category}, found ${question.category}`);
  }

  const expectedCritical = EXPECTED_CRITICAL_IDS.has(question.id);
  assert(
    question.critical === expectedCritical,
    `${prefix}: critical flag must be ${expectedCritical ? "true" : "false"}`,
  );
  if (question.critical === true) criticalCount += 1;

  if (question.needsVerification === true) unresolvedAnswerCount += 1;
  assert(question.needsVerification !== true, `${prefix}: answer still requires manual verification`);

  assert(
    typeof question.imageNeedsVerification === "boolean",
    `${prefix}: imageNeedsVerification must be a boolean`,
  );
  if (question.imageNeedsVerification === true) unresolvedImageCount += 1;
  assert(question.imageNeedsVerification !== true, `${prefix}: image still requires manual verification`);

  assert(
    Array.isArray(question.answers) && question.answers.length >= 2 && question.answers.length <= 4,
    `${prefix}: expected between 2 and 4 answers`,
  );

  if (Array.isArray(question.answers)) {
    const answerKeys = new Set();
    let correctCount = 0;

    for (const answer of question.answers) {
      assert(
        typeof answer?.key === "string" && ALLOWED_ANSWER_KEYS.has(answer.key),
        `${prefix}: answer key must be A, B, C or D`,
      );
      assert(!answerKeys.has(answer?.key), `${prefix}: duplicated answer key ${answer?.key}`);
      answerKeys.add(answer?.key);
      assert(typeof answer?.content === "string" && answer.content.trim().length > 0, `${prefix}: answer content is required`);
      assert(typeof answer?.correct === "boolean", `${prefix}: answer ${answer?.key ?? "<missing>"} correct must be boolean`);
      if (answer?.correct === true) correctCount += 1;
    }

    assert(correctCount === 1, `${prefix}: expected exactly 1 correct answer, found ${correctCount}`);
  }

  assert(Array.isArray(question.licenses) && question.licenses.length > 0, `${prefix}: licenses must not be empty`);
  if (Array.isArray(question.licenses)) {
    const licenses = new Set();
    for (const license of question.licenses) {
      assert(typeof license === "string" && SUPPORTED_LICENSES.has(license), `${prefix}: unsupported license ${String(license)}`);
      assert(!licenses.has(license), `${prefix}: duplicated license ${String(license)}`);
      licenses.add(license);
    }
  }

  assert(typeof question.sourceVersion === "string" && question.sourceVersion.trim().length > 0, `${prefix}: sourceVersion is required`);

  if (question.image !== undefined && question.image !== null && question.image !== "") {
    const safeImagePath = normalizedImagePath(question.image);
    assert(Boolean(safeImagePath), `${prefix}: unsafe or unsupported image path ${String(question.image)}`);
    if (safeImagePath && imagesRoot && !(await imageExists(safeImagePath))) {
      errors.push(`${prefix}: image not found: ${safeImagePath}`);
    }
  }
}

for (let id = 1; id <= EXPECTED_QUESTION_COUNT; id += 1) {
  assert(seenIds.has(id), `missing question id ${id}`);
}

assert(
  criticalCount === EXPECTED_CRITICAL_IDS.size,
  `expected ${EXPECTED_CRITICAL_IDS.size} critical questions, found ${criticalCount}`,
);
assert(unresolvedAnswerCount === 0, `expected 0 unresolved answers, found ${unresolvedAnswerCount}`);
assert(unresolvedImageCount === 0, `expected 0 unresolved images, found ${unresolvedImageCount}`);

if (warnings.length > 0) {
  console.warn(`\nWarnings (${warnings.length}):`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error(`\nDataset validation failed (${errors.length} errors):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Dataset validation passed.");
console.log(`- Questions: ${questions.length}`);
console.log(`- Critical questions: ${criticalCount}`);
console.log(`- Unresolved answers: ${unresolvedAnswerCount}`);
console.log(`- Unresolved images: ${unresolvedImageCount}`);
console.log(`- Source PDF SHA-256: ${normalizedSha256(dataset.sourceSha256)}`);
console.log(`- Version: ${dataset.version}`);
console.log(`- Valid from: ${dataset.validFrom}`);
