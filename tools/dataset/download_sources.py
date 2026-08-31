#!/usr/bin/env python3
"""Download official dataset source PDFs declared in source-manifest.json."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "data" / "source" / "source-manifest.json"
DEFAULT_OUTPUT = ROOT / "data" / "raw"

FILENAMES = {
    "question-bank": "bo-600-cau-hoi.pdf",
    "guidance": "cong-van-2262-csgt-p5.pdf",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_pdf(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    with path.open("rb") as handle:
        return handle.read(5) == b"%PDF-"


def response_preview(path: Path, limit: int = 240) -> str:
    try:
        raw = path.read_bytes()[:limit]
        return raw.decode("utf-8", errors="replace").replace("\r", " ").replace("\n", " ").strip()
    except OSError:
        return ""


def download(url: str, destination: Path, timeout: int, retries: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")

    # csgt.vn sometimes returns an HTML intermediary/challenge to non-browser
    # clients. Browser-like request headers improve compatibility, but the
    # downloaded bytes are still required to have a real PDF signature.
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/151.0.0.0 Safari/537.36"
            ),
            "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.6",
            "Referer": "https://www.csgt.vn/",
            "Cache-Control": "no-cache",
        },
    )

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        content_type = "unknown"
        final_url = url
        try:
            with urlopen(request, timeout=timeout) as response, temporary.open("wb") as output:
                content_type = response.headers.get("Content-Type", "unknown")
                final_url = response.geturl()
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)

            if temporary.stat().st_size < 1024:
                raise RuntimeError(
                    f"Downloaded file is unexpectedly small: {temporary.stat().st_size} bytes"
                )

            if not is_pdf(temporary):
                preview = response_preview(temporary)
                detail = (
                    f"server returned non-PDF content "
                    f"(Content-Type={content_type}, final URL={final_url})"
                )
                if preview:
                    detail += f"; response begins with: {preview!r}"
                raise RuntimeError(detail)

            temporary.replace(destination)
            return
        except (HTTPError, URLError, TimeoutError, RuntimeError) as error:
            last_error = error
            temporary.unlink(missing_ok=True)
            if attempt < retries:
                time.sleep(min(2 ** (attempt - 1), 8))

    raise RuntimeError(
        f"Unable to download {url}: {last_error}\n"
        f"Manual fallback: open the official URL in a browser and save the PDF as:\n"
        f"  {destination}\n"
        f"Then run `pnpm dataset:prepare` (without :download)."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--source-type", action="append", help="Only download one or more source types")
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    selected_types = set(args.source_type or [])
    downloads: list[dict[str, object]] = []

    for source in manifest.get("sources", []):
        source_type = source.get("type")
        if selected_types and source_type not in selected_types:
            continue

        filename = FILENAMES.get(str(source_type), f"{source_type}.pdf")
        destination = args.output / filename

        if destination.exists() and not args.overwrite:
            if not is_pdf(destination):
                raise RuntimeError(
                    f"Existing source file is not a valid PDF: {destination}. "
                    "Delete/replace it before continuing."
                )
            print(f"[skip] {destination} already exists and has a valid PDF signature")
        else:
            print(f"[download] {source_type}: {source['url']}")
            download(str(source["url"]), destination, args.timeout, args.retries)

        downloads.append(
            {
                "type": source_type,
                "file": destination.name,
                "bytes": destination.stat().st_size,
                "sha256": sha256(destination),
                "url": source["url"],
            }
        )

    report = {
        "dataset": manifest.get("dataset"),
        "version": manifest.get("version"),
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "files": downloads,
    }
    report_path = args.output / "downloads.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] metadata: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
