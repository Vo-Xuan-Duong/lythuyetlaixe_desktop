# Remote dataset lifecycle

Ứng dụng dùng hai production dataset độc lập:

```text
VN_GPLX_600        → 600 câu + ảnh câu hỏi
VN_TRAFFIC_SIGNS   → catalog từng biển + ảnh biển báo
```

Mỗi dataset có manifest URL, version, provenance/content/asset SHA-256, SQLite metadata và AppData cache riêng.

## Build configuration

```env
VITE_QUESTIONS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/traffic-signs/manifest.json
```

`VITE_DATASET_MANIFEST_URL` chỉ là legacy fallback cho questions. Production URL phải HTTPS; HTTP chỉ cho localhost development.

## Shared SQLite write discipline

Hai bootstrap có thể download/verify song song nhưng cùng dùng `sqlite:lythuyetlaixe.db`. Application-level mutation queue serialize importer/progress/exam/reset writes để transaction boundaries không bị xen bởi feature khác.

Read queries vẫn có thể chạy độc lập.

---

# Dataset 1 — 600 câu

Runtime:

```text
questions/dataset-manifest.json
        ↓
manifest URL/version/provenance/checksum validation
        ↓
releases/<version>/questions.json
        ↓
bounded SHA-256 + runtime 600-question validation
        ↓
releases/<version>/assets.zip
        ↓
safe extract → $APPDATA/dataset-assets/<version>/
        ↓
serialized SQLite transaction
        ↓
Learning / Exam / Review / Statistics offline
```

Integrity metadata:

```text
sourceSha256  = official CSGT source PDF SHA-256
contentSha256 = installed questions.json SHA-256
assetSha256   = installed assets.zip SHA-256
```

Importer validates exact 600 IDs, category ranges, exact 60 critical IDs, sourceVersion, licenses, 2–4 answers, exactly one correct answer and safe image paths.

Publisher:

```powershell
pnpm dataset:finalize
```

Output:

```text
dist/dataset/
├── dataset-manifest.json
└── releases/
    └── <version>/
        ├── questions.json
        └── assets.zip   # when referenced
```

Publisher refuses different bytes under an existing release version.

---

# Dataset 2 — Traffic signs

Nguồn kỹ thuật production là QCVN 41:2024/BGTVT được Công báo Chính phủ phát hành thành đúng 5 phần:

```text
1359+1360
1361+1362
1363+1364
1365+1366
1367+1368
```

Provenance:

```text
part sourceSha256 × 5
        ↓
canonical bundle SHA-256
        ↓
manifest/source dataset sourceSha256

5 PDF Công báo
        ↓ merge local for parsing/review only
combined PDF
        ↓
combinedSha256
```

`sourceSha256` không phải SHA-256 của PDF ghép. Runtime manifest yêu cầu `sourcePartCount = 5`.

Runtime:

```text
traffic-signs/manifest.json
        ↓
manifest URL/version/signCount/sourcePartCount/provenance/checksum validation
        ↓
releases/<version>/traffic-signs.json
        ↓
bounded SHA-256 + runtime catalog/provenance validation
        ↓
releases/<version>/traffic-sign-assets.zip
        ↓
safe extract → $APPDATA/traffic-sign-assets/<version>/
        ↓
serialized SQLite transaction
        ↓
search/filter/pagination/detail offline
```

Integrity metadata:

```text
sourceSha256  = canonical SHA-256 của bundle 5 PDF Công báo
contentSha256 = installed traffic-signs.json SHA-256
assetSha256   = installed traffic-sign-assets.zip SHA-256
```

Mỗi production sign record phải có provenance `sourceSection`, `sourcePages`, `verifiedBy`, `verifiedAt`. Nếu record có ảnh, ảnh phải có `imageVerified=true` và `imageSelection` trỏ về canonical source bundle với page/crop/processedAsset hợp lệ. Hai image method được chấp nhận là candidate render từ QCVN hoặc manual crop trực tiếp từ QCVN đã verify.

Local pipeline:

```powershell
pnpm signs:source:download
pnpm signs:source:verify -- --reviewer "<name>"
pnpm signs:candidates:official
pnpm signs:candidates:images
pnpm signs:review:prepare
pnpm signs:review:workspace
# review/export manual-review.json
pnpm signs:review:images
# reopen workspace, inspect processed image, set imageVerified explicitly
pnpm signs:review:apply
pnpm signs:validate
pnpm signs:publish
pnpm signs:status
```

Hoặc sau khi review hoàn tất:

```powershell
pnpm signs:finalize
```

Output:

```text
dist/traffic-signs/
├── manifest.json
└── releases/
    └── <version>/
        ├── traffic-signs.json
        └── traffic-sign-assets.zip   # when referenced
```

Traffic-sign failure does not block the app. Built-in 5-group knowledge stays available independently.

---

# Immutable update and self-heal

For either dataset:

```text
same version + same checksums + healthy local state
→ use local cache

same version + same checksums + missing local asset/rows
→ re-download exact package and self-heal

same version + changed remote checksum
→ reject overwrite, keep local snapshot, warn

new version
→ verify/install/import, then cleanup old asset version
```

If asset installation succeeds but database import fails, the new asset directory is removed and the previous local snapshot remains active.

# Local storage

```text
SQLite: sqlite:lythuyetlaixe.db

Questions:
  dataset_metadata
  categories/questions/answers/question_license_types/...
  $APPDATA/dataset-assets/<version>/

Traffic signs:
  traffic_sign_metadata
  traffic_signs
  $APPDATA/traffic-sign-assets/<version>/
```

Question dataset updates preserve progress/bookmark/exam history. Traffic-sign updates never modify those user tables.

# R2 publication

Target:

```text
lythuyetlaixe/
├── questions/
│   ├── dataset-manifest.json
│   └── releases/<version>/...
└── traffic-signs/
    ├── manifest.json
    └── releases/<version>/...
```

For each dataset upload all `releases/<version>/...` payload objects first, verify they are publicly readable, then replace the root manifest last.

Detailed deployment policy: [`R2_DEPLOYMENT.md`](./R2_DEPLOYMENT.md).

# Network/security

- HTTPS required outside localhost development.
- Payload URLs must remain same-origin with their manifest.
- Downloads have hard compressed/content limits.
- ZIP extraction has path/type/file-count/uncompressed-size limits.
- Tauri FS capability and asset protocol are scoped to the two application asset roots only.
- Web Fetch currently requires suitable read-only CORS from the final data origin.
- Production CSP currently allows generic HTTPS until the final host is selected; scope `connect-src` to the exact R2 custom-domain origin before public release.

SHA-256 proves payload integrity relative to the manifest. HTTPS/domain control is the current publisher trust model; signed manifests remain an optional post-1.0 hardening step.

# Release preflight

Sau khi local data + R2 config đã chuẩn bị:

```powershell
pnpm project:status
pnpm release:candidate:check
```

`project:status` chỉ báo cáo. `release:candidate:check` trả mã lỗi nếu còn blocker static như thiếu lockfile, production packages, `.env.production`, checksum/count mismatch hoặc CSP còn generic `https:`.
