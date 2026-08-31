from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
EXPECTED_GAZETTE_ISSUES = (
    "1359+1360",
    "1361+1362",
    "1363+1364",
    "1365+1366",
    "1367+1368",
)


@dataclass(frozen=True)
class VerifiedTrafficSignSource:
    manifest: dict[str, Any]
    technical: dict[str, Any]
    combined_file: Path
    source_sha256: str
    part_files: tuple[Path, ...]
    part_sha256: tuple[str, ...]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_sha(value: object) -> str:
    return str(value or "").strip().lower().removeprefix("sha256:")


def safe_local_filename(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} is required")
    filename = value.strip()
    if Path(filename).name != filename or filename in {".", ".."}:
        raise ValueError(f"{label} must be a plain filename")
    return filename


def assert_expected_parts(parts: object) -> list[dict[str, Any]]:
    if not isinstance(parts, list) or len(parts) != len(EXPECTED_GAZETTE_ISSUES):
        raise ValueError(
            f"technicalSource.parts must contain exactly {len(EXPECTED_GAZETTE_ISSUES)} official Gazette parts"
        )
    typed: list[dict[str, Any]] = []
    for index, (part, expected_issue) in enumerate(zip(parts, EXPECTED_GAZETTE_ISSUES), start=1):
        if not isinstance(part, dict):
            raise ValueError(f"technicalSource.parts[{index}] must be an object")
        issue = str(part.get("issue") or "").strip()
        if issue != expected_issue:
            raise ValueError(
                f"technicalSource.parts[{index}].issue must be {expected_issue}, found {issue or '<missing>'}"
            )
        typed.append(part)
    return typed


def canonical_bundle_sha256(parts: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    checked = assert_expected_parts(parts)
    for index, part in enumerate(checked, start=1):
        issue = str(part.get("issue") or "").strip()
        checksum = normalize_sha(part.get("sourceSha256"))
        if not SHA_RE.fullmatch(checksum):
            raise ValueError(f"technicalSource.parts[{index}].sourceSha256 is invalid")
        rows.append(f"{index}|{issue}|{checksum}\n")
    return hashlib.sha256("".join(rows).encode("utf-8")).hexdigest()


def load_manifest(path: Path = DEFAULT_MANIFEST) -> dict[str, Any]:
    if not path.is_file():
        raise ValueError(f"missing traffic-sign source manifest: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("traffic-sign source manifest must contain a JSON object")
    return value


def inspect_multipart_source(
    path: Path = DEFAULT_MANIFEST,
    *,
    require_verified: bool = True,
) -> VerifiedTrafficSignSource:
    manifest = load_manifest(path)
    technical = manifest.get("technicalSource")
    if not isinstance(technical, dict):
        raise ValueError("traffic-sign source manifest is missing technicalSource")
    if technical.get("acquisitionMethod") != "official-gazette-multipart":
        raise ValueError("technicalSource.acquisitionMethod must be official-gazette-multipart")
    if require_verified and technical.get("verificationStatus") != "verified-official-full-source":
        raise ValueError("technicalSource must be verified-official-full-source")
    if require_verified:
        if not isinstance(technical.get("verifiedBy"), str) or not technical["verifiedBy"].strip():
            raise ValueError("technicalSource is missing verifiedBy")
        if not isinstance(technical.get("verifiedAt"), str) or not technical["verifiedAt"].strip():
            raise ValueError("technicalSource is missing verifiedAt")

    source_dir = path.parent
    parts = assert_expected_parts(technical.get("parts"))

    part_files: list[Path] = []
    part_hashes: list[str] = []
    for index, part in enumerate(parts, start=1):
        filename = safe_local_filename(part.get("localFile"), f"technicalSource.parts[{index}].localFile")
        source = source_dir / filename
        if not source.is_file():
            raise ValueError(f"missing official technical source part: {source}")
        declared = normalize_sha(part.get("sourceSha256"))
        actual = sha256_file(source)
        if not SHA_RE.fullmatch(declared) or declared != actual:
            raise ValueError(f"official technical source part SHA-256 mismatch: {filename}")
        part_files.append(source)
        part_hashes.append(declared)

    bundle_sha = canonical_bundle_sha256(parts)
    declared_bundle = normalize_sha(technical.get("sourceSha256"))
    if not SHA_RE.fullmatch(declared_bundle) or declared_bundle != bundle_sha:
        raise ValueError("technicalSource.sourceSha256 does not match canonical multipart bundle hash")

    combined_name = safe_local_filename(technical.get("localFile"), "technicalSource.localFile")
    combined = source_dir / combined_name
    if not combined.is_file():
        raise ValueError(f"missing combined technical source PDF: {combined}")
    declared_combined = normalize_sha(technical.get("combinedSha256"))
    actual_combined = sha256_file(combined)
    if not SHA_RE.fullmatch(declared_combined) or declared_combined != actual_combined:
        raise ValueError("technicalSource.combinedSha256 does not match combined local PDF")

    return VerifiedTrafficSignSource(
        manifest=manifest,
        technical=technical,
        combined_file=combined,
        source_sha256=bundle_sha,
        part_files=tuple(part_files),
        part_sha256=tuple(part_hashes),
    )
