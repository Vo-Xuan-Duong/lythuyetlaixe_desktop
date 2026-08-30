#!/usr/bin/env python3
"""Extract text spans, image placements and vector drawings from the official PDF.

The vector layer is intentionally preserved because the official document marks
correct answers by underlining them. The extractor does not guess the answer.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "raw" / "bo-600-cau-hoi.pdf"
DEFAULT_OUTPUT = ROOT / "data" / "raw" / "extracted"


def simplify(value: Any) -> Any:
    if isinstance(value, fitz.Point):
        return [round(value.x, 3), round(value.y, 3)]
    if isinstance(value, fitz.Rect):
        return [round(value.x0, 3), round(value.y0, 3), round(value.x1, 3), round(value.y1, 3)]
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, dict):
        return {str(key): simplify(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [simplify(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_spans(page: fitz.Page) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    raw = page.get_text("dict")

    for block_index, block in enumerate(raw.get("blocks", [])):
        if block.get("type") != 0:
            continue
        for line_index, line in enumerate(block.get("lines", [])):
            for span_index, span in enumerate(line.get("spans", [])):
                text = span.get("text", "")
                if not text:
                    continue
                result.append(
                    {
                        "block": block_index,
                        "line": line_index,
                        "span": span_index,
                        "text": text,
                        "bbox": simplify(span.get("bbox")),
                        "origin": simplify(span.get("origin")),
                        "font": span.get("font"),
                        "size": span.get("size"),
                        "flags": span.get("flags"),
                        "color": span.get("color"),
                    }
                )
    return result


def extract_unique_images(document: fitz.Document, page: fitz.Page, images_dir: Path, seen: set[int]) -> list[dict[str, Any]]:
    placements: list[dict[str, Any]] = []
    for info in page.get_image_info(xrefs=True):
        item = simplify(info)
        xref = int(info.get("xref", 0) or 0)
        item["asset"] = None

        if xref > 0:
            if xref not in seen:
                extracted = document.extract_image(xref)
                extension = extracted.get("ext", "bin")
                asset_name = f"xref-{xref}.{extension}"
                (images_dir / asset_name).write_bytes(extracted["image"])
                seen.add(xref)
            else:
                extension = document.extract_image(xref).get("ext", "bin")
                asset_name = f"xref-{xref}.{extension}"
            item["asset"] = f"images/{asset_name}"

        placements.append(item)
    return placements


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"PDF not found: {args.input}. Run download_sources.py first or provide a PDF path.")

    args.output.mkdir(parents=True, exist_ok=True)
    images_dir = args.output / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    document = fitz.open(args.input)
    pages: list[dict[str, Any]] = []
    seen_images: set[int] = set()

    for page_index, page in enumerate(document):
        print(f"[extract] page {page_index + 1}/{document.page_count}")
        pages.append(
            {
                "page": page_index + 1,
                "width": page.rect.width,
                "height": page.rect.height,
                "plainText": page.get_text("text", sort=True),
                "spans": extract_spans(page),
                "drawings": simplify(page.get_drawings()),
                "images": extract_unique_images(document, page, images_dir, seen_images),
            }
        )

    payload = {
        "source": args.input.name,
        "sourceSha256": file_sha256(args.input),
        "pageCount": document.page_count,
        "pages": pages,
    }
    output_path = args.output / "pages.json"
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] extracted raw document: {output_path}")
    print(f"[ok] unique embedded images: {len(seen_images)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
