import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { inspectAssetArchive } from "./RemoteAssetStore";

function makeZip(entries: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, content]) => [path, new TextEncoder().encode(content)]),
    ),
  );
}

describe("inspectAssetArchive", () => {
  it("accepts supported image files and verifies file count", () => {
    const files = inspectAssetArchive(
      makeZip({
        "images/q301.webp": "one",
        "images/q486.png": "two",
      }),
      2,
    );

    expect(files.map((file) => file.path)).toEqual([
      "images/q301.webp",
      "images/q486.png",
    ]);
  });

  it("rejects path traversal entries", () => {
    expect(() =>
      inspectAssetArchive(
        makeZip({
          "../outside.png": "unsafe",
        }),
      ),
    ).toThrow("Unsafe asset path");
  });

  it("rejects unsupported file types", () => {
    expect(() =>
      inspectAssetArchive(
        makeZip({
          "images/payload.html": "<script></script>",
        }),
      ),
    ).toThrow("Unsupported asset type");
  });

  it("rejects an unexpected number of files", () => {
    expect(() =>
      inspectAssetArchive(
        makeZip({
          "images/q301.webp": "one",
        }),
        2,
      ),
    ).toThrow("Asset file count mismatch");
  });
});
