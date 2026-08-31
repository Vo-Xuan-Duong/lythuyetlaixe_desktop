#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const SHA_RE = /^[a-f0-9]{64}$/i;
const results = [];

function result(level, label, detail) {
  results.push({ level, label, detail });
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}

function readText(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function readJson(relative, label) {
  try {
    return JSON.parse(readText(relative));
  } catch (error) {
    result("BLOCK", label, `Không đọc được JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function sha256File(relative) {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(path.join(ROOT, relative)));
  return digest.digest("hex");
}

function normalizeSha(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/^sha256:/, "") : "";
}

function safeReleasePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || parts.some((part) => part === "." || part === "..")) return null;
  return parts.join("/");
}

function parseEnv(relative) {
  if (!exists(relative)) return null;
  const values = new Map();
  for (const raw of readText(relative).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  return values;
}

function productionUrl(value, label) {
  if (!value) {
    result("BLOCK", label, "Chưa cấu hình");
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      result("BLOCK", label, `Production URL phải HTTPS: ${value}`);
      return null;
    }
    if (url.hostname === "data.example.com" || url.hostname.endsWith(".example.com")) {
      result("BLOCK", label, "Vẫn đang dùng domain ví dụ");
      return null;
    }
    if (url.username || url.password) {
      result("BLOCK", label, "URL không được chứa credentials");
      return null;
    }
    result("PASS", label, url.toString());
    return url;
  } catch {
    result("BLOCK", label, `URL không hợp lệ: ${value}`);
    return null;
  }
}

function checkLockfiles() {
  result(exists("pnpm-lock.yaml") ? "PASS" : "BLOCK", "pnpm-lock.yaml", exists("pnpm-lock.yaml") ? "Có lockfile frontend" : "Chưa có; chạy pnpm install local rồi commit");
  result(exists("src-tauri/Cargo.lock") ? "PASS" : "BLOCK", "src-tauri/Cargo.lock", exists("src-tauri/Cargo.lock") ? "Có Rust lockfile" : "Chưa có; để Cargo sinh local rồi commit");
}

function checkQuestionsPackage() {
  const manifestPath = "dist/dataset/dataset-manifest.json";
  if (!exists(manifestPath)) {
    result("BLOCK", "Questions production package", "Thiếu dist/dataset/dataset-manifest.json; chạy dataset pipeline/finalize local");
    return;
  }
  const manifest = readJson(manifestPath, "Questions manifest");
  if (!manifest) return;
  if (manifest.dataset !== "VN_GPLX_600" || manifest.stage !== "production") {
    result("BLOCK", "Questions manifest identity", "dataset/stage không phải VN_GPLX_600/production");
    return;
  }
  const payload = safeReleasePath(manifest.datasetUrl);
  if (!payload || !exists(path.join("dist/dataset", payload))) {
    result("BLOCK", "Questions payload", `Thiếu payload: ${String(manifest.datasetUrl)}`);
    return;
  }
  const payloadRelative = path.join("dist/dataset", payload);
  const contentSha = normalizeSha(manifest.sha256);
  const sourceSha = normalizeSha(manifest.sourceSha256);
  if (!SHA_RE.test(contentSha) || sha256File(payloadRelative) !== contentSha) {
    result("BLOCK", "Questions content SHA-256", "Manifest checksum không khớp questions.json");
    return;
  }
  if (!SHA_RE.test(sourceSha)) {
    result("BLOCK", "Questions source provenance", "sourceSha256 không hợp lệ");
    return;
  }
  const dataset = readJson(payloadRelative, "Questions payload");
  if (!dataset || !Array.isArray(dataset.questions) || dataset.questions.length !== 600) {
    result("BLOCK", "Questions count", `Cần đúng 600 câu; hiện ${Array.isArray(dataset?.questions) ? dataset.questions.length : 0}`);
    return;
  }
  if (normalizeSha(dataset.sourceSha256) !== sourceSha) {
    result("BLOCK", "Questions provenance cross-check", "questions.json sourceSha256 khác manifest");
    return;
  }
  if (manifest.assets) {
    const asset = safeReleasePath(manifest.assets.url);
    const relative = asset ? path.join("dist/dataset", asset) : null;
    if (!relative || !exists(relative)) {
      result("BLOCK", "Question assets", `Thiếu ${String(manifest.assets.url)}`);
      return;
    }
    if (!SHA_RE.test(normalizeSha(manifest.assets.sha256)) || sha256File(relative) !== normalizeSha(manifest.assets.sha256)) {
      result("BLOCK", "Question assets SHA-256", "assets.zip không khớp manifest");
      return;
    }
  }
  result("PASS", "Questions production package", `${manifest.version} · 600 câu · checksum/provenance hợp lệ ở mức package`);
}

function checkTrafficSignsPackage() {
  const manifestPath = "dist/traffic-signs/manifest.json";
  if (!exists(manifestPath)) {
    result("BLOCK", "Traffic-sign production package", "Thiếu dist/traffic-signs/manifest.json; chạy signs pipeline/finalize local");
    return;
  }
  const manifest = readJson(manifestPath, "Traffic-sign manifest");
  if (!manifest) return;
  if (manifest.dataset !== "VN_TRAFFIC_SIGNS" || manifest.stage !== "production") {
    result("BLOCK", "Traffic-sign manifest identity", "dataset/stage không phải VN_TRAFFIC_SIGNS/production");
    return;
  }
  if (manifest.sourcePartCount !== 5) {
    result("BLOCK", "Traffic-sign source parts", `sourcePartCount phải là 5; hiện ${String(manifest.sourcePartCount)}`);
    return;
  }
  const payload = safeReleasePath(manifest.datasetUrl);
  if (!payload || !exists(path.join("dist/traffic-signs", payload))) {
    result("BLOCK", "Traffic-sign payload", `Thiếu payload: ${String(manifest.datasetUrl)}`);
    return;
  }
  const payloadRelative = path.join("dist/traffic-signs", payload);
  const contentSha = normalizeSha(manifest.sha256);
  const sourceSha = normalizeSha(manifest.sourceSha256);
  if (!SHA_RE.test(contentSha) || sha256File(payloadRelative) !== contentSha) {
    result("BLOCK", "Traffic-sign content SHA-256", "Manifest checksum không khớp traffic-signs.json");
    return;
  }
  if (!SHA_RE.test(sourceSha)) {
    result("BLOCK", "Traffic-sign source provenance", "canonical sourceSha256 không hợp lệ");
    return;
  }
  const dataset = readJson(payloadRelative, "Traffic-sign payload");
  const count = Array.isArray(dataset?.signs) ? dataset.signs.length : 0;
  if (!dataset || count <= 0 || count !== manifest.signCount) {
    result("BLOCK", "Traffic-sign count", `Manifest=${String(manifest.signCount)}, payload=${count}`);
    return;
  }
  if (normalizeSha(dataset.sourceSha256) !== sourceSha) {
    result("BLOCK", "Traffic-sign provenance cross-check", "traffic-signs.json sourceSha256 khác manifest");
    return;
  }
  if (manifest.assets) {
    const asset = safeReleasePath(manifest.assets.url);
    const relative = asset ? path.join("dist/traffic-signs", asset) : null;
    if (!relative || !exists(relative)) {
      result("BLOCK", "Traffic-sign assets", `Thiếu ${String(manifest.assets.url)}`);
      return;
    }
    if (!SHA_RE.test(normalizeSha(manifest.assets.sha256)) || sha256File(relative) !== normalizeSha(manifest.assets.sha256)) {
      result("BLOCK", "Traffic-sign assets SHA-256", "traffic-sign-assets.zip không khớp manifest");
      return;
    }
  }
  result("PASS", "Traffic-sign production package", `${manifest.version} · ${count} biển · multipart provenance/checksum hợp lệ ở mức package`);
}

function checkProductionEnvironment() {
  const env = parseEnv(".env.production");
  if (!env) {
    result("BLOCK", ".env.production", "Chưa có file production environment");
    return [];
  }
  const questions = productionUrl(env.get("VITE_QUESTIONS_MANIFEST_URL"), "Questions manifest URL");
  const signs = productionUrl(env.get("VITE_TRAFFIC_SIGNS_MANIFEST_URL"), "Traffic-sign manifest URL");
  if (env.get("VITE_DATASET_MANIFEST_URL")) {
    result("WARN", "Legacy manifest env", "VITE_DATASET_MANIFEST_URL không cần cho deployment mới");
  }
  return [questions, signs].filter(Boolean);
}

function checkCsp(origins) {
  const config = readJson("src-tauri/tauri.conf.json", "Tauri config");
  if (!config) return;
  const connectSrc = config?.app?.security?.csp?.["connect-src"];
  if (typeof connectSrc !== "string") {
    result("BLOCK", "Production CSP", "Thiếu connect-src");
    return;
  }
  if (/\bhttps:\b/.test(connectSrc) || connectSrc.split(/\s+/).includes("https:")) {
    result("BLOCK", "Production CSP", "connect-src vẫn cho phép generic https:; khóa về exact R2 custom-domain trước release");
    return;
  }
  for (const url of origins) {
    if (!connectSrc.includes(url.origin)) {
      result("BLOCK", "Production CSP", `connect-src thiếu ${url.origin}`);
      return;
    }
  }
  result("PASS", "Production CSP", "Không còn generic https: và chứa các production data origin");
}

function printResults() {
  const order = { BLOCK: 0, WARN: 1, PASS: 2 };
  results.sort((a, b) => order[a.level] - order[b.level]);
  console.log("Project production preflight");
  console.log("============================");
  for (const item of results) console.log(`[${item.level}] ${item.label}: ${item.detail}`);
  const blockers = results.filter((item) => item.level === "BLOCK").length;
  const warnings = results.filter((item) => item.level === "WARN").length;
  console.log("----------------------------");
  console.log(`Blockers: ${blockers} · Warnings: ${warnings}`);
  console.log(blockers === 0 ? "Release preflight: READY (static artifact/config checks)" : "Release preflight: NOT READY");
  if (STRICT && blockers > 0) process.exitCode = 1;
}

checkLockfiles();
checkQuestionsPackage();
checkTrafficSignsPackage();
const origins = checkProductionEnvironment();
checkCsp(origins);
printResults();
