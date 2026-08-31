from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Iterable

import fitz

from source_provenance import DEFAULT_MANIFEST, inspect_multipart_source

ROOT = DEFAULT_MANIFEST.parents[3]
CANDIDATES_PATH = ROOT / "data" / "traffic-signs" / "raw" / "official-candidates.json"
OUTPUT_DIR = ROOT / "data" / "traffic-signs" / "raw" / "image-candidates"
MAX_ABOVE_CAPTION = 320.0
PADDING = 7.0
MIN_WIDTH = 18.0
MIN_HEIGHT = 14.0
MIN_DRAWING_AREA = 50.0


def fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character)).upper()


def union_rects(rects: Iterable[fitz.Rect]) -> fitz.Rect | None:
    items = [fitz.Rect(rect) for rect in rects if rect.is_valid and not rect.is_empty and not rect.is_infinite]
    if not items:
        return None
    result = fitz.Rect(items[0])
    for rect in items[1:]:
        result.include_rect(rect)
    return result


def text_blocks(page: fitz.Page) -> list[tuple[fitz.Rect, str]]:
    result: list[tuple[fitz.Rect, str]] = []
    for block in page.get_text("blocks"):
        if len(block) < 5:
            continue
        text = str(block[4]).strip()
        if not text:
            continue
        rect = fitz.Rect(float(block[0]), float(block[1]), float(block[2]), float(block[3]))
        if rect.is_valid and not rect.is_empty:
            result.append((rect, text))
    return result


def caption_rects(page: fitz.Page, section: str) -> list[fitz.Rect]:
    folded_section = fold_text(section).strip()
    # Exact section boundary is important: B.3 must not match Hình B.30/B.31.
    pattern = re.compile(rf"\bHINH\s+{re.escape(folded_section)}(?![0-9A-Z])")
    return [rect for rect, text in text_blocks(page) if pattern.search(fold_text(text))]


def graphic_rects(page: fitz.Page, caption: fitz.Rect) -> list[fitz.Rect]:
    top = max(0.0, caption.y0 - MAX_ABOVE_CAPTION)
    bottom = caption.y0 + 3.0
    rects: list[fitz.Rect] = []

    for image in page.get_image_info(xrefs=True):
        bbox = image.get("bbox")
        if not bbox:
            continue
        rect = fitz.Rect(bbox)
        if rect.width < MIN_WIDTH or rect.height < MIN_HEIGHT:
            continue
        if rect.y1 <= bottom and rect.y1 >= top and rect.y0 < caption.y0:
            rects.append(rect)

    for drawing in page.get_drawings():
        rect_value = drawing.get("rect")
        if not rect_value:
            continue
        rect = fitz.Rect(rect_value)
        area = max(rect.width, 0.0) * max(rect.height, 0.0)
        if area < MIN_DRAWING_AREA:
            continue
        if rect.height < 2.0 and rect.width > 20.0:
            continue
        if rect.y1 <= bottom and rect.y1 >= top and rect.y0 < caption.y0:
            rects.append(rect)

    return rects


def padded(rect: fitz.Rect, page: fitz.Page) -> fitz.Rect:
    return fitz.Rect(
        max(page.rect.x0, rect.x0 - PADDING),
        max(page.rect.y0, rect.y0 - PADDING),
        min(page.rect.x1, rect.x1 + PADDING),
        min(page.rect.y1, rect.y1 + PADDING),
    )


def safe_name(section: str, index: int) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", section).strip("-").lower()
    return f"{normalized}-{index}.png"


def main() -> int:
    try:
        provenance = inspect_multipart_source(DEFAULT_MANIFEST, require_verified=True)
        candidates_doc = __import__("json").loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
        candidates = candidates_doc.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError("official-candidates.json contains no candidates")
        if str(candidates_doc.get("sourceSha256") or "").lower() != provenance.source_sha256:
            raise ValueError("official candidates were not extracted from the currently verified technical source")

        document = fitz.open(provenance.combined_file)
        extracted = 0
        review_needed = 0
        try:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            # Remove stale candidate images so metadata and files are one extraction snapshot.
            for stale in OUTPUT_DIR.glob("*"):
                if stale.is_file():
                    stale.unlink()
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                section = str(candidate.get("section") or "").strip()
                if not section:
                    continue
                start_page = max(1, int(candidate.get("startPage") or 1))
                end_page = min(document.page_count, int(candidate.get("endPage") or candidate.get("startPage") or 1))
                image_candidates: list[dict] = []
                candidate_index = 0
                for page_number in range(start_page, end_page + 1):
                    page = document[page_number - 1]
                    for caption in caption_rects(page, section):
                        combined = union_rects(graphic_rects(page, caption))
                        if combined is None:
                            continue
                        crop = padded(combined, page)
                        if crop.width < MIN_WIDTH or crop.height < MIN_HEIGHT:
                            continue
                        candidate_index += 1
                        filename = safe_name(section, candidate_index)
                        destination = OUTPUT_DIR / filename
                        pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), clip=crop, alpha=False)
                        pixmap.save(destination)
                        oversized = crop.width > page.rect.width * 0.9 or crop.height > MAX_ABOVE_CAPTION * 0.95
                        image_candidates.append(
                            {
                                "page": page_number,
                                "crop": [round(crop.x0, 2), round(crop.y0, 2), round(crop.x1, 2), round(crop.y1, 2)],
                                "file": f"image-candidates/{filename}",
                                "status": "review" if oversized else "candidate",
                            }
                        )
                        extracted += 1
                        if oversized:
                            review_needed += 1
                candidate["imageCandidates"] = image_candidates
        finally:
            document.close()

        candidates_doc["imageCandidateExtraction"] = {
            "sourceSha256": provenance.source_sha256,
            "candidateImageCount": extracted,
            "reviewNeeded": review_needed,
            "method": "exact-caption-adjacent-verified-qcvn-render",
        }
        CANDIDATES_PATH.write_text(
            __import__("json").dumps(candidates_doc, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except (OSError, ValueError, __import__("json").JSONDecodeError) as error:
        raise SystemExit(f"Cannot extract official traffic-sign image candidates: {error}") from error

    print(f"[ok] image candidates: {extracted}")
    print(f"[ok] candidates needing extra crop review: {review_needed}")
    print(f"[ok] output dir: {OUTPUT_DIR}")
    print(f"[ok] candidate metadata updated: {CANDIDATES_PATH}")
    print("Images remain review candidates; manual-review imageVerified=true is required before production use.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
