from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SOURCE_MANIFEST = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
OUTPUT = ROOT / "data" / "traffic-signs" / "raw" / "reference-candidates.json"
MAX_HTML_BYTES = 16 * 1024 * 1024
HEADING_RE = re.compile(r"^([B-F])\.(\d+[A-Z]?)\s+BIEN\s+SO\s+(.+)$")
CODE_RE = re.compile(r"\b(?:DP|P|W|R|I|S|IE|SE)\.\s*\d+(?:[A-Z])?\b")
APPENDIX_GROUPS = {
    "B": "PROHIBITION",
    "C": "WARNING",
    "D": "MANDATORY",
    "E": "INDICATION",
    "F": "SUPPLEMENTARY",
}


class VisibleTextParser(HTMLParser):
    BREAK_TAGS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table"}
    SKIP_TAGS = {"script", "style", "noscript"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[no-untyped-def]
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1
        if tag in self.BREAK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS and self.skip_depth > 0:
            self.skip_depth -= 1
        if tag in self.BREAK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0 and data:
            self.parts.append(data)

    def text(self) -> str:
        return "".join(self.parts)


def fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character)).upper()


def normalize_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalized_code(value: str) -> str:
    return re.sub(r"\.\s+", ".", value).upper()


def fetch_html(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("candidateReference.url must be an HTTPS URL without credentials")

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "lythuyetlaixe-dataset-tool/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        final = urlparse(response.geturl())
        if final.scheme != "https" or not final.netloc:
            raise ValueError("candidate reference redirected to a non-HTTPS URL")
        content_type = response.headers.get("Content-Type", "").lower()
        if "html" not in content_type:
            raise ValueError(f"candidate reference is not HTML: {content_type or 'unknown content type'}")
        declared = response.headers.get("Content-Length")
        if declared:
            try:
                if int(declared) > MAX_HTML_BYTES:
                    raise ValueError("candidate reference exceeds 16 MiB")
            except ValueError as error:
                if "exceeds" in str(error):
                    raise

        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_HTML_BYTES:
                raise ValueError("candidate reference exceeds 16 MiB")
            chunks.append(chunk)
        raw = b"".join(chunks)
        charset = response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


def extract_candidates(text: str) -> list[dict]:
    lines = [normalize_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    candidates: list[dict] = []
    current: dict | None = None
    body: list[str] = []

    def flush() -> None:
        nonlocal current, body
        if current is None:
            return
        current["body"] = normalize_line(" ".join(body))
        current["reviewStatus"] = "reference-only"
        candidates.append(current)
        current = None
        body = []

    for line in lines:
        folded = normalize_line(fold_text(line))
        match = HEADING_RE.match(folded)
        if match:
            flush()
            appendix = match.group(1)
            current = {
                "appendix": appendix,
                "section": f"{appendix}.{match.group(2)}",
                "groupCode": APPENDIX_GROUPS[appendix],
                "heading": line,
                "codes": sorted({normalized_code(code) for code in CODE_RE.findall(folded)}),
            }
            continue
        if current is not None:
            body.append(line)

    flush()
    return candidates


def main() -> int:
    try:
        manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
        reference = manifest.get("candidateReference")
        if not isinstance(reference, dict) or reference.get("productionSource") is not False:
            raise ValueError("candidateReference must be explicitly marked productionSource=false")
        url = reference.get("url")
        if not isinstance(url, str) or not url.strip():
            raise ValueError("candidateReference.url is required")

        parser = VisibleTextParser()
        parser.feed(fetch_html(url.strip()))
        candidates = extract_candidates(parser.text())
        if not candidates:
            raise ValueError("no Appendix B-F sign sections were detected in the reference HTML")

        output = {
            "dataset": "VN_TRAFFIC_SIGNS_REFERENCE_CANDIDATES",
            "stage": "reference-only",
            "productionSource": False,
            "referenceUrl": url.strip(),
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "candidateCount": len(candidates),
            "notes": "Non-production extraction aid only. Every record must be checked against verified official technicalSource before promotion.",
            "candidates": candidates,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot extract reference traffic-sign candidates: {error}") from error

    print(f"[ok] reference candidates: {len(candidates)}")
    print(f"[ok] output: {OUTPUT}")
    print("WARNING: reference candidates are not production data and cannot replace official technical-source verification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
