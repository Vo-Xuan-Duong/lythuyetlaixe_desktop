#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_QUESTION_COUNT = 600;
const EXPECTED_CRITICAL_COUNT = 60;
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
  console.error("Usage: node tools/dataset/validate.mjs <questions.json> [--images-root=public/question-images]");
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

async function imageExists(imagePath) {
  if (!imagesRoot || !imagePath) return true;
  const absolutePath = path.resolve(imagesRoot, imagePath.replace(/^[/\\]+/, ""));
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
assert(typeof dataset?.version === "string" && dataset.version.length > 0, "dataset.version is required");
assert(typeof dataset?.validFrom === "string" && dataset.validFrom.length > 0, "dataset.validFrom is required");
assert(Array.isArray(dataset?.questions), "dataset.questions must be an array");

const questions = Array.isArray(dataset?.questions) ? dataset.questions : [];
assert(
  questions.length === EXPECTED_QUESTION_COUNT,
  `expected ${EXPECTED_QUESTION_COUNT} questions, found ${questions.length}`,
);

const seenIds = new Set();
let criticalCount = 0;

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

  assert(Array.isArray(question.answers) && question.answers.length >= 2, `${prefix}: at least 2 answers are required`);

  if (Array.isArray(question.answers)) {
    const answerKeys = new Set();
    let correctCount = 0;

    for (const answer of question.answers) {
      assert(typeof answer?.key === "string" && answer.key.length > 0, `${prefix}: answer key is required`);
      assert(!answerKeys.has(answer?.key), `${prefix}: duplicated answer key ${answer?.key}`);
      answerKeys.add(answer?.key);
      assert(typeof answer?.content === "string" && answer.content.trim().length > 0, `${prefix}: answer content is required`);
      if (answer?.correct === true) correctCount += 1;
    }

    assert(correctCount >= 1, `${prefix}: no correct answer is marked`);
    if (correctCount > 1) {
      warnings.push(`${prefix}: ${correctCount} answers are marked correct; verify against official source`);
    }
  }

  assert(Array.isArray(question.licenses) && question.licenses.length > 0, `${prefix}: licenses must not be empty`);
  assert(typeof question.sourceVersion === "string" && question.sourceVersion.length > 0, `${prefix}: sourceVersion is required`);

  if (question.critical === true) criticalCount += 1;

  if (question.image && imagesRoot && !(await imageExists(question.image))) {
    errors.push(`${prefix}: image not found: ${question.image}`);
  }
}

for (let id = 1; id <= EXPECTED_QUESTION_COUNT; id += 1) {
  assert(seenIds.has(id), `missing question id ${id}`);
}

assert(
  criticalCount === EXPECTED_CRITICAL_COUNT,
  `expected ${EXPECTED_CRITICAL_COUNT} critical questions, found ${criticalCount}`,
);

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
console.log(`- Version: ${dataset.version}`);
console.log(`- Valid from: ${dataset.validFrom}`);
