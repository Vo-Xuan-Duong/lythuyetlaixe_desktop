# Kiến thức và catalog biển báo giao thông

Module `Kiến thức biển báo` gồm hai lớp độc lập:

1. kiến thức 5 nhóm cơ bản bundle cùng binary, luôn đọc được;
2. catalog từng biển là remote dataset `VN_TRAFFIC_SIGNS`, tách khỏi bộ 600 câu.

## Source/provenance

Kiến thức nhóm hiện bám theo `QCVN 41:2024/BGTVT`, ban hành kèm `Thông tư 51/2024/TT-BGTVT`, hiệu lực từ `01/01/2025`.

Built-in provenance:

```text
data/source/traffic-signs-knowledge-source.json
```

Catalog provenance:

```text
data/traffic-signs/source/source-manifest.json
```

Local source workflow:

```powershell
pnpm signs:source:download
pnpm signs:status
```

PDF/raw source được giữ local. `source-manifest.json` lưu URL, filename và SHA-256 của snapshot nguồn dùng để xây catalog.

Không dùng website/app luyện thi bên thứ ba làm source of truth.

## Dataset isolation

```text
600 questions
├── env: VITE_QUESTIONS_MANIFEST_URL
├── metadata: dataset_metadata
├── tables: categories/questions/answers/...
└── cache: $APPDATA/dataset-assets/<version>/

Traffic signs
├── env: VITE_TRAFFIC_SIGNS_MANIFEST_URL
├── metadata: traffic_sign_metadata
├── table: traffic_signs
└── cache: $APPDATA/traffic-sign-assets/<version>/
```

Version, checksums, update and asset cache are independent. App starts both bootstrap flows, but traffic-sign failure never blocks Learning/Exam or the built-in 5-group knowledge.

## Record contract

```json
{
  "code": "<official-code>",
  "name": "<official-name>",
  "groupCode": "PROHIBITION",
  "meaning": "<verified-meaning>",
  "recognition": "<optional>",
  "scope": "<optional>",
  "exceptions": [],
  "notes": "<optional>",
  "image": "signs/<file>.svg",
  "keywords": [],
  "sourceVersion": "QCVN 41:2024/BGTVT"
}
```

Allowed groups:

```text
PROHIBITION
MANDATORY
WARNING
INDICATION
SUPPLEMENTARY
```

Runtime/release validation requires non-empty code/name/meaning/sourceVersion, known group, safe image path, supported image extension, string arrays, valid optional-string fields and at most 2,000 records per package.

## Local processed workspace

```text
data/traffic-signs/processed/
├── traffic-signs.json
└── assets/
    └── signs/...
```

Generated processed files are ignored by Git.

Status:

```powershell
pnpm signs:status
```

Validation/tests:

```powershell
pnpm signs:validate
pnpm signs:test
```

Finalize:

```powershell
pnpm signs:finalize
```

## Versioned distribution output

```text
dist/traffic-signs/
├── manifest.json
└── releases/
    └── <version>/
        ├── traffic-signs.json
        └── traffic-sign-assets.zip   # only when images are referenced
```

The root manifest points to the immutable release payload:

```json
{
  "dataset": "VN_TRAFFIC_SIGNS",
  "version": "<version>",
  "validFrom": "YYYY-MM-DD",
  "stage": "production",
  "datasetUrl": "releases/<version>/traffic-signs.json",
  "sha256": "<traffic-signs.json sha256>",
  "sourceDocument": "QCVN 41:2024/BGTVT",
  "sourceSha256": "<source document sha256>",
  "signCount": 123,
  "sizeBytes": 123456,
  "assets": {
    "url": "releases/<version>/traffic-sign-assets.zip",
    "format": "zip",
    "sha256": "<asset archive sha256>",
    "sizeBytes": 654321,
    "fileCount": 120
  }
}
```

Publisher refuses different bytes under an already-generated release version. Change content by bumping the traffic-sign dataset version.

## Runtime integrity/self-heal

Runtime verifies HTTPS/same-origin URLs, size limits, SHA-256, source provenance, identity/stage/version/validFrom/signCount and record schema before SQLite import.

If the same immutable remote version/checksums are still valid but local rows or asset directory are damaged, app may re-download that exact package to self-heal. If remote bytes change without a version bump, app keeps the local snapshot and warns.

## Catalog UI

The native catalog supports:

- search by code/name/meaning/keywords;
- filter by 5 groups;
- 48 records per page;
- image, meaning, recognition, scope, exceptions, notes and source version;
- offline access after first successful install.

## R2

Target:

```text
lythuyetlaixe/traffic-signs/
├── manifest.json
└── releases/<version>/...
```

Upload release payload first and `manifest.json` last. See [`R2_DEPLOYMENT.md`](./R2_DEPLOYMENT.md).

## Relation to the 600-question bank

Traffic-sign catalog is for learning/reference. It **must not** be used to infer official answers in `VN_GPLX_600`. Questions in `ROAD_SIGNS` remain governed by the separate verified question pipeline.
