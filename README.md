# Lý Thuyết Lái Xe — Tauri

Ứng dụng học và thi thử lý thuyết lái xe Việt Nam bằng **Tauri 2 + React + TypeScript + SQLite**, phát triển theo hướng **Windows Desktop trước, Android sau**.

> Application feature layer gần hoàn chỉnh. Production blockers chính còn lại là dữ liệu chính thức đã xác minh, remote storage và local/device verification.

## Stack

- Tauri 2 + Rust.
- React 19 + TypeScript + Vite.
- SQLite qua `@tauri-apps/plugin-sql`.
- AppData asset cache qua `@tauri-apps/plugin-fs`.
- Device preferences qua `@tauri-apps/plugin-store`.
- Native review reminder qua `@tauri-apps/plugin-notification`.
- pnpm `10.34.5`.

## Hai dataset production độc lập

```text
QUESTIONS
├── dataset: VN_GPLX_600
├── manifest: VITE_QUESTIONS_MANIFEST_URL
├── SQLite: dataset_metadata/categories/questions/answers/...
└── assets: $APPDATA/dataset-assets/<version>/

TRAFFIC SIGNS
├── dataset: VN_TRAFFIC_SIGNS
├── manifest: VITE_TRAFFIC_SIGNS_MANIFEST_URL
├── SQLite: traffic_sign_metadata/traffic_signs
└── assets: $APPDATA/traffic-sign-assets/<version>/
```

Hai dataset có version, checksum, source provenance, update và cache độc lập. Hai bootstrap có thể chạy song song ở startup, nhưng mọi mutation SQLite được serialize qua application write queue để transaction của questions/traffic-signs/progress/exam/reset không xen lẫn nhau.

## Tài liệu chính

- Roadmap: [`KE_HOACH.md`](./KE_HOACH.md)
- Trạng thái/handoff: [`docs/STATUS.md`](./docs/STATUS.md)
- Local handoff checklist: [`docs/LOCAL_HANDOFF.md`](./docs/LOCAL_HANDOFF.md)
- Remote datasets: [`docs/REMOTE_DATASET.md`](./docs/REMOTE_DATASET.md)
- Cloudflare R2: [`docs/R2_DEPLOYMENT.md`](./docs/R2_DEPLOYMENT.md)
- Dataset 600 câu: [`tools/dataset/README.md`](./tools/dataset/README.md)
- Catalog biển báo: [`docs/TRAFFIC_SIGNS.md`](./docs/TRAFFIC_SIGNS.md)
- Windows release: [`docs/LOCAL_RELEASE.md`](./docs/LOCAL_RELEASE.md)
- Android bring-up: [`docs/ANDROID.md`](./docs/ANDROID.md)
- Update/version policy: [`docs/UPDATE_STRATEGY.md`](./docs/UPDATE_STRATEGY.md)

## GitHub Actions

Workflow validation là **manual-only**. Push/PR không tự chạy test hoặc build; maintainer thực hiện verification local.

## Cài dependency local

```powershell
corepack enable
pnpm install
```

Sau khi dependency graph ổn định, commit `pnpm-lock.yaml` để install reproducible.

## Cấu hình remote production

Tạo `.env.production` từ `.env.example`:

```env
VITE_QUESTIONS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/traffic-signs/manifest.json
```

`VITE_DATASET_MANIFEST_URL` chỉ còn là compatibility fallback cho bộ 600 câu; deployment mới không nên dùng. Production runtime yêu cầu HTTPS; HTTP chỉ dành cho localhost development.

## Bộ 600 câu

Pipeline chính:

```powershell
pnpm dataset:prepare:download
pnpm dataset:status
# manual answer/image verification
pnpm dataset:finalize
```

Output publisher là immutable theo version:

```text
dist/dataset/
├── dataset-manifest.json
└── releases/
    └── <version>/
        ├── questions.json
        └── assets.zip        # nếu dataset tham chiếu ảnh
```

Runtime:

```text
questions/dataset-manifest.json
    ↓
releases/<version>/questions.json → size/SHA-256/provenance/runtime validation
    ↓
releases/<version>/assets.zip → bounded verify + safe extract
    ↓
$APPDATA/dataset-assets/<version>/
    ↓
SQLite transaction
    ↓
Learning / Exam / Review / Statistics offline
```

Ba checksum độc lập:

```text
sourceSha256  = PDF nguồn chính thức
contentSha256 = questions.json đã cài
assetSha256   = assets.zip đã cài
```

## Catalog biển báo

Phần kiến thức 5 nhóm cơ bản được bundle trong binary. Catalog từng biển là dataset remote riêng và không phải nguồn đáp án của bộ 600 câu.

Bắt đầu local:

```powershell
pnpm signs:source:download
pnpm signs:status
```

Sau khi đã xây dựng `data/traffic-signs/processed/traffic-signs.json` và ảnh từ nguồn chính thức:

```powershell
pnpm signs:validate
pnpm signs:finalize
```

Output:

```text
dist/traffic-signs/
├── manifest.json
└── releases/
    └── <version>/
        ├── traffic-signs.json
        └── traffic-sign-assets.zip   # nếu có ảnh
```

Runtime catalog hỗ trợ search, filter 5 nhóm, pagination và offline cache. Dataset có trust boundary riêng: source/content/asset SHA-256, sign count, bounded download, safe paths và runtime schema validation.

## Kiểm tra data tooling local

```powershell
pnpm dataset:test
pnpm signs:test
# hoặc
pnpm data:test
```

Các test source tồn tại trong repo nhưng chỉ được coi là pass sau khi maintainer chạy local.

## Chạy app

Browser preview:

```powershell
pnpm dev
```

Tauri native:

```powershell
pnpm tauri:dev
```

Nếu máy chưa có bộ 600 câu local thì `VITE_QUESTIONS_MANIFEST_URL` phải hợp lệ. Catalog biển báo có thể được cài/cập nhật độc lập. Settings và kiến thức 5 nhóm vẫn truy cập được khi questions first-run chưa thành công.

Settings → **Runtime Diagnostics** kiểm tra riêng endpoint, metadata, checksum và asset cache của hai dataset.

## Cloudflare R2 layout

```text
lythuyetlaixe/
├── questions/
│   ├── dataset-manifest.json
│   └── releases/<version>/...
└── traffic-signs/
    ├── manifest.json
    └── releases/<version>/...
```

Upload versioned payload trước, root manifest cuối cùng. Chi tiết: [`docs/R2_DEPLOYMENT.md`](./docs/R2_DEPLOYMENT.md).

## SQLite và AppData

```text
SQLite: sqlite:lythuyetlaixe.db
Question assets:     $APPDATA/dataset-assets/<version>/...
Traffic-sign assets: $APPDATA/traffic-sign-assets/<version>/...
Store: settings.json
```

Update questions giữ progress/bookmark/exam history. Traffic-sign update không chạm các bảng học của questions dataset.

## Windows local release

```powershell
pnpm release:check
pnpm release:windows:local
```

NSIS output dự kiến dưới:

```text
src-tauri/target/release/bundle/nsis/
```

Production CSP hiện cho HTTPS chung vì data host cuối chưa chốt. Trước public release phải scope `connect-src` về đúng R2 custom-domain origin.

## Android local bring-up

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Build commands:

```powershell
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

Android vẫn cần device verification cho SQL migration v2, hai AppData asset roots, Store, Back, notifications, first-run/offline/update và signing.

## Versioning

```text
Application:    0.1.0 → 0.2.0 → 1.0.0
Questions:      2025.06 → version mới khi bộ câu hỏi thay đổi
Traffic signs:  version riêng khi catalog/quy chuẩn thay đổi
```

Mỗi dataset version đã publish là immutable. Publisher local từ chối ghi khác bytes vào release directory của cùng version.

## Quy tắc dữ liệu

- Source of truth phải là tài liệu chính thức.
- AI không tự suy đoán đáp án hoặc ý nghĩa production.
- Hai dataset có provenance/checksum/version riêng.
- Validator/runtime importer là release/import gates.
- Root manifest chỉ được publish sau khi toàn bộ versioned payload đã upload.
- Catalog biển báo không được dùng để tự suy luận đáp án bộ 600 câu.
