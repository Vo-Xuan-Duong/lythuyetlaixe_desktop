from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone

import fitz

from source_provenance import DEFAULT_MANIFEST, inspect_multipart_source

ROOT = DEFAULT_MANIFEST.parents[2]
OUTPUT = ROOT / "data" / "traffic-signs" / "raw" / "official-candidates.json"
HEADING_RE = re.compile(r"^([B-F])\.\s*(\d+[A-Z]?)\s*BIEN\s+SO\s+(.+)$")
EXPLICIT_CODE_RE = re.compile(r"\b(?:DP|P|W|R|I|S|IE|SE)(?:\.[A-Z])?[,.]\s*\d+[A-Z]?\b")
STANDARD_CODE_RE = re.compile(r"\b(?:DP|P|W|R|I|S|IE|SE)\.\s*\d+[A-Z]?\b")
VARIANT_RE = re.compile(
    r"\b((?:DP|P|W|R|I|S|IE|SE)(?:\.[A-Z])?[,.]\s*\d+)\s*\(\s*([A-Z](?:\s*,\s*[A-Z])+)\s*\)"
)
APPENDIX_GROUPS = {
    "B": "PROHIBITION",
    "C": "WARNING",
    "D": "MANDATORY",
    "E": "INDICATION",
    "F": "SUPPLEMENTARY",
}


def fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character)).upper()


def normalize_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_code(value: str) -> str:
    value = re.sub(r"\s+", "", value.upper())
    value = value.replace(".,", ",")
    return value


def extract_codes(value: str) -> list[str]:
    folded = fold_text(value)
    codes: set[str] = set()
    for match in STANDARD_CODE_RE.finditer(folded):
        codes.add(normalize_code(match.group(0)))
    for match in EXPLICIT_CODE_RE.finditer(folded):
        codes.add(normalize_code(match.group(0)))
    for match in VARIANT_RE.finditer(folded):
        base = normalize_code(match.group(1))
        for suffix in match.group(2).split(","):
            normalized_suffix = suffix.strip().upper()
            if normalized_suffix:
                codes.add(f"{base}{normalized_suffix}")
        # A parenthesized variant list denotes the variants, not an additional
        # unsuffixed sign code. Remove an accidentally captured base.
        codes.discard(base)
    return sorted(codes)


def extract_candidates(source) -> list[dict]:  # type: ignore[no-untyped-def]
    document = fitz.open(source)
    try:
        lines: list[tuple[int, str]] = []
        for page_index, page in enumerate(document):
            for raw_line in page.get_text("text").splitlines():
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
        current["body"] = normalize_line(" ".join(body))
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
            current = {
                "appendix": appendix,
                "section": f"{appendix}.{match.group(2)}",
                "groupCode": APPENDIX_GROUPS[appendix],
                "heading": line,
                "codes": extract_codes(line),
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
        provenance = inspect_multipart_source(DEFAULT_MANIFEST, require_verified=True)
        candidates = extract_candidates(provenance.combined_file)
        if not candidates:
            raise ValueError("no Appendix B-F traffic-sign sections were detected; inspect PDF text extraction")

        appendix_counts = {
            appendix: sum(1 for candidate in candidates if candidate.get("appendix") == appendix)
            for appendix in APPENDIX_GROUPS
        }
        missing_appendices = [appendix for appendix, count in appendix_counts.items() if count == 0]
        if missing_appendices:
            raise ValueError("candidate extraction missed required appendices: " + ", ".join(missing_appendices))

        output = {
            "dataset": "VN_TRAFFIC_SIGNS_CANDIDATES",
            "stage": "review-candidate",
            "sourceDocument": provenance.manifest.get("sourceDocument"),
            "sourceSha256": provenance.source_sha256,
            "sourceFile": provenance.technical.get("localFile"),
            "sourceRegistryUrl": provenance.technical.get("registryUrl"),
            "sourcePartCount": len(provenance.part_files),
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "candidateCount": len(candidates),
            "appendixCounts": appendix_counts,
            "detectedCodeCount": len({code for candidate in candidates for code in candidate.get("codes", [])}),
            "notes": "Candidate sections extracted only from the verified five-part Government Gazette QCVN source. Manual review is still required before production.",
            "candidates": candidates,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot extract official traffic-sign candidates: {error}") from error

    print(f"[ok] source: {provenance.combined_file}")
    print(f"[ok] official parts: {len(provenance.part_files)}")
    print(f"[ok] candidate sections: {len(candidates)}")
    print(f"[ok] detected unique codes: {output['detectedCodeCount']}")
    print(f"[ok] appendix counts: {appendix_counts}")
    print(f"[ok] output: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
