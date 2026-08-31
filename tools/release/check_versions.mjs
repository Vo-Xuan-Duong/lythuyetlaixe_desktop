#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const PACKAGE_JSON = new URL("../../package.json", import.meta.url);
const TAURI_CONFIG = new URL("../../src-tauri/tauri.conf.json", import.meta.url);
const CARGO_TOML = new URL("../../src-tauri/Cargo.toml", import.meta.url);

function cargoPackageVersion(content) {
  const packageSection = /\[package\]([\s\S]*?)(?:\n\[|$)/.exec(content)?.[1] ?? "";
  return /^version\s*=\s*"([^"]+)"\s*$/m.exec(packageSection)?.[1] ?? null;
}

function assertSemver(value, source) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error(`${source} version is not valid SemVer: ${value}`);
  }
}

async function main() {
  const [packageRaw, tauriRaw, cargoRaw] = await Promise.all([
    readFile(PACKAGE_JSON, "utf8"),
    readFile(TAURI_CONFIG, "utf8"),
    readFile(CARGO_TOML, "utf8"),
  ]);

  const packageVersion = JSON.parse(packageRaw).version;
  const tauriVersion = JSON.parse(tauriRaw).version;
  const cargoVersion = cargoPackageVersion(cargoRaw);

  if (!packageVersion || !tauriVersion || !cargoVersion) {
    throw new Error("Cannot resolve version from package.json, tauri.conf.json and Cargo.toml");
  }

  assertSemver(packageVersion, "package.json");
  assertSemver(tauriVersion, "tauri.conf.json");
  assertSemver(cargoVersion, "Cargo.toml");

  const versions = new Map([
    ["package.json", packageVersion],
    ["src-tauri/tauri.conf.json", tauriVersion],
    ["src-tauri/Cargo.toml", cargoVersion],
  ]);
  const unique = new Set(versions.values());

  if (unique.size !== 1) {
    const details = [...versions.entries()]
      .map(([file, version]) => `- ${file}: ${version}`)
      .join("\n");
    throw new Error(`Release version mismatch:\n${details}`);
  }

  console.log(`Release version check passed: v${packageVersion}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
