from __future__ import annotations

import hashlib
import json
import shutil
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "data" / "traffic-signs" / "source" / "source-manifest.json"
SOURCE_DIR = MANIFEST_PATH.parent
MAX_SOURCE_BYTES = 64 * 1024 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if not MANIFEST_PATH.is_file():
        raise SystemExit(f"Missing source manifest: {MANIFEST_PATH}")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    url = manifest.get("officialUrl")
    local_file = manifest.get("localFile")
    if not isinstance(url, str) or not url.strip():
        raise SystemExit("source-manifest.json is missing officialUrl")
    if urlparse(url).scheme != "https":
        raise SystemExit("Traffic-sign source URL must use HTTPS")
    if not isinstance(local_file, str) or not local_file.strip():
        raise SystemExit("source-manifest.json is missing localFile")
    if Path(local_file).name != local_file or local_file in {".", ".."}:
        raise SystemExit("localFile must be a plain filename inside data/traffic-signs/source")

    destination = SOURCE_DIR / local_file
    temporary = destination.with_suffix(destination.suffix + ".download")
    if temporary.exists():
        temporary.unlink()

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "lythuyetlaixe-dataset-tool/1.0"},
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            final_url = response.geturl()
            if urlparse(final_url).scheme != "https":
                raise RuntimeError(f"Source redirected to non-HTTPS URL: {final_url}")

            declared_length = response.headers.get("Content-Length")
            if declared_length and int(declared_length) > MAX_SOURCE_BYTES:
                raise RuntimeError("Traffic-sign source exceeds the 64 MiB safety limit")

            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise RuntimeError("Traffic-sign source exceeds the 64 MiB safety limit")
                output.write(chunk)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    temporary.replace(destination)
    checksum = sha256_file(destination)
    manifest["sourceSha256"] = checksum
    manifest["verificationStatus"] = "downloaded-and-sha256-recorded"
    manifest["downloadedFrom"] = url
    manifest["sourceSizeBytes"] = destination.stat().st_size
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"[ok] source: {destination}")
    print(f"[ok] sha256: {checksum}")
    print(f"[ok] manifest updated: {MANIFEST_PATH}")
    print("Review that the downloaded document is the intended official source before using it for production catalog work.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
