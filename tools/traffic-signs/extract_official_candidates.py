from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
SOURCE_MANIFEST = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
OUTPUT = ROOT / "data" / "traffic-signs" / "raw" / "official-candidates.json"
HEADING_RE = re.compile(r"^([B-F])\.(\d+[A-Z]?)\s+BIEN\s+SO\s+(.+)$")
CODE_RE = re.compile(r"\b(?:DP|P|W|R|I|S|IE|SE)\.\s*\d+(?:[A-Z])?\b")
APPENDIX_GROUPS = {
    "B": "PROHIBITION",
    "C": "WARNING",
    "D": "MANDATORY",
    "E": "INDICATION",
    "F": "SUPPLEMENTARY",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character)).upper()


def normalize_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalized_code(value: str) -> str:
    return re.sub(r"\.\s+", ".", value).upper()


def load_verified_source() -> tuple[dict, dict, Path, str]:
    if not SOURCE_MANIFEST.is_file():
        raise ValueError(f"missing source manifest: {SOURCE_MANIFEST}")
    manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    technical = manifest.get("technicalSource")
    if not isinstance(technical, dict):
        raise ValueError("source-manifest.json is missing technicalSource")
    if technical.get("verificationStatus") != "verified-official-full-source":
        raise ValueError("technicalSource must be verified before official candidate extraction")

    filename = technical.get("localFile")
    if not isinstance(filename, str) or not filename.strip() or Path(filename).name != filename:
        raise ValueError("technicalSource.localFile must be a plain filename")
    source = SOURCE_MANIFEST.parent / filename
    if not source.is_file():
        raise ValueError(f"missing verified technical source: {source}")

    declared = str(technical.get("sourceSha256") or "").strip().lower().removeprefix("sha256:")
    actual = sha256_file(source)
    if not re.fullmatch(r"[0-9a-f]{64}", declared) or declared != actual:
        raise ValueError("technicalSource SHA-256 does not match the local verified file")
    return manifest, technical, source, actual


def extract_candidates(source: Path) -> list[dict]:
    document = fitz.open(source)
    try:
        lines: list[tuple[int, str]] = []
        for page_index, page in enumerate(document):
            text = page.get_text("text")
            for raw_line in text.splitlines():
                line = normalize_line(raw_line)
                if line:
                    lines.append((page_index + 1, line))
    finally:
        document.close()

    candidates: list[dict] = []
    current: dict | None = None
    body: list[str] = []

    def flush(end_page: int | None = None) -> None:
        nonlocal current, body
        if current is None:
            return
        content = normalize_line(" ".join(body))
        current["body"] = content
        current["endPage"] = end_page or current["startPage"]
        current["reviewStatus"] = "pending"
        candidates.append(current)
        current = None
        body = []

    for page_number, line in lines:
        folded = normalize_line(fold_text(line))
        match = HEADING_RE.match(folded)
        if match:
            flush(page_number)
            appendix = match.group(1)
            codes = sorted({normalized_code(code) for code in CODE_RE.findall(folded)})
            current = {
                "appendix": appendix,
                "section": f"{appendix}.{match.group(2)}",
                "groupCode": APPENDIX_GROUPS[appendix],
                "heading": line,
                "codes": codes,
                "startPage": page_number,
                "endPage": page_number,
            }
            body = []
            continue

        if current is not None:
            body.append(line)
            current["endPage"] = page_number

    flush()
    return candidates


def main() -> int:
    try:
        manifest, technical, source, checksum = load_verified_source()
        candidates = extract_candidates(source)
        if not candidates:
            raise ValueError(
                "no Appendix B-F traffic-sign sections were detected; inspect PDF text extraction before continuing"
            )

        output = {
            "dataset": "VN_TRAFFIC_SIGNS_CANDIDATES",
            "stage": "review-candidate",
            "sourceDocument": manifest.get("sourceDocument"),
            "sourceSha256": checksum,
            "sourceFile": technical.get("localFile"),
            "sourceOfficialUrl": technical.get("officialUrl"),
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "candidateCount": len(candidates),
            "notes": "Candidate sections extracted from a verified full QCVN source. These are not production records until manually reviewed/normalized.",
            "candidates": candidates,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot extract official traffic-sign candidates: {error}") from error

    print(f"[ok] source: {source}")
    print(f"[ok] candidates: {len(candidates)}")
    print(f"[ok] output: {OUTPUT}")
    print("Next: review/normalize candidate sections before creating production traffic-signs.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
