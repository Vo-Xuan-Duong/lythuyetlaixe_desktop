# Lý Thuyết Lái Xe — Tauri

Ứng dụng học và thi thử lý thuyết lái xe Việt Nam bằng **Tauri 2 + React + TypeScript + SQLite**, phát triển theo hướng **Windows Desktop trước, Android sau**.

> Trạng thái hiện tại: application features và cross-platform foundation đã được code gần đầy đủ. Blocker production còn lại chủ yếu là bộ 600 câu + ảnh đã xác minh, endpoint HTTPS thật và local/device verification.

## Stack

- Tauri 2 + Rust.
- React 19 + TypeScript.
- Vite.
- SQLite qua `@tauri-apps/plugin-sql`.
- AppData asset cache qua `@tauri-apps/plugin-fs`.
- Device preferences qua `@tauri-apps/plugin-store`.
- Native review reminder qua `@tauri-apps/plugin-notification`.
- pnpm `10.34.5`.

## Tài liệu chính

- Roadmap: [`KE_HOACH.md`](./KE_HOACH.md)
- Trạng thái/handoff: [`docs/STATUS.md`](./docs/STATUS.md)
- Local handoff checklist: [`docs/LOCAL_HANDOFF.md`](./docs/LOCAL_HANDOFF.md)
- Remote dataset: [`docs/REMOTE_DATASET.md`](./docs/REMOTE_DATASET.md)
- Dataset pipeline: [`tools/dataset/README.md`](./tools/dataset/README.md)
- Windows release: [`docs/LOCAL_RELEASE.md`](./docs/LOCAL_RELEASE.md)
- Android bring-up: [`docs/ANDROID.md`](./docs/ANDROID.md)
- Update/version policy: [`docs/UPDATE_STRATEGY.md`](./docs/UPDATE_STRATEGY.md)

## GitHub Actions

Workflow `Validate` là **manual-only** (`workflow_dispatch`). Push/PR không tự chạy test hoặc build.

Validation được thực hiện local bởi maintainer.

## Cài dependency local

Repository hiện chưa có `pnpm-lock.yaml` được xác minh sau nhóm dependency native mới. Trên máy phát triển:

```powershell
corepack enable
pnpm install
```

Sau khi dependency graph ổn định, commit `pnpm-lock.yaml` để các lần cài sau reproducible.

## Cấu hình remote dataset

Tạo `.env.production` từ `.env.example` trước production build:

```env
VITE_DATASET_MANIFEST_URL=https://data.example.com/lythuyetlaixe/dataset-manifest.json
```

Production runtime yêu cầu HTTPS. HTTP chỉ được code bootstrap chấp nhận cho localhost development.

Ứng dụng không bundle 600 câu/ảnh production. Runtime:

```text
dataset-manifest.json
    ↓ validate URL/version/provenance/checksum
questions.json
    ↓ bounded download + SHA-256 + runtime contract validation
assets.zip (nếu có ảnh)
    ↓ bounded download + SHA-256 + safe extract
AppData assets
    ↓
SQLite transaction
    ↓
offline runtime
```

Ba checksum được tách riêng:

```text
sourceSha256  = PDF nguồn chính thức
contentSha256 = questions.json đã cài
assetSha256   = assets.zip đã cài
```

Chi tiết: [`docs/REMOTE_DATASET.md`](./docs/REMOTE_DATASET.md).

## Chạy frontend/browser preview

```powershell
pnpm dev
```

Browser preview dùng dữ liệu demo cho các feature cần Tauri/SQLite native.

## Chạy Tauri local

```powershell
pnpm tauri:dev
```

Nếu máy chưa có local dataset, `VITE_DATASET_MANIFEST_URL` phải trỏ tới manifest hợp lệ.

Settings có **Runtime Diagnostics** để kiểm tra nhanh SQLite, 600 câu, 60 câu điểm liệt, license mappings, checksum metadata, asset cache, Store và notification permission.

## Dataset pipeline

Lệnh từng bước:

```powershell
pnpm dataset:download
pnpm dataset:extract
pnpm dataset:parse
pnpm dataset:resolve
pnpm dataset:review
pnpm dataset:images
pnpm dataset:review-report
pnpm dataset:image-review
pnpm dataset:promote
pnpm dataset:validate
pnpm dataset:publish
pnpm dataset:status
```

Checkpoint helpers:

```powershell
pnpm dataset:prepare:download
pnpm dataset:after-answer-review
pnpm dataset:finalize
```

Không dùng AI để suy đoán đáp án chính thức. Answer/image unresolved phải được kiểm tra trực tiếp từ nguồn chính thức và lưu provenance trong manual review file.

## Remote distribution package

`pnpm dataset:publish` tạo:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip              # nếu có ảnh
```

Upload `questions.json`/`assets.zip` trước và publish manifest cuối cùng.

Manifest chứa:

- dataset/version/validFrom;
- `sourceSha256` của PDF chính thức;
- `sha256` của `questions.json`;
- size;
- optional asset SHA-256/size/fileCount.

Payload URL phải cùng origin với manifest.

## SQLite và AppData

```text
SQLite: sqlite:lythuyetlaixe.db
Assets: $APPDATA/dataset-assets/<version>/...
Store : settings.json
```

Update dataset giữ user progress/bookmark/exam history theo question ID. Asset version mới chỉ được giữ sau khi SQLite import thành công.

## Windows local release

```powershell
pnpm release:check
pnpm release:windows:local
```

Output NSIS dự kiến:

```text
src-tauri/target/release/bundle/nsis/
```

Production build bật CSP. `connect-src` hiện cho HTTPS vì host cuối chưa được chốt; trước public release nên scope về đúng origin dataset.

## Android local bring-up

Sau khi cài Android Studio/JDK/SDK/NDK/Rust targets:

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Build commands đã có:

```powershell
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

Android vẫn cần device verification cho SQL/FS/Store/Back/notifications/offline/update và signing.

## Versioning

```text
Application: 0.1.0 → 0.2.0 → 1.0.0
Dataset:     2025.06 → version mới khi dữ liệu chính thức thay đổi
```

Dataset version đã publish là immutable. Sửa nội dung/ảnh phải phát hành version dataset mới.

## Cấu trúc chính

```text
src/
├── app/
├── components/
├── data/
├── domain/
├── features/
└── infrastructure/
    ├── assets/
    ├── database/
    ├── diagnostics/
    ├── navigation/
    ├── notifications/
    ├── preferences/
    ├── repositories/
    └── runtime/

src-tauri/
├── capabilities/
├── src/
├── Cargo.toml
├── tauri.conf.json
├── tauri.windows.conf.json
└── tauri.android.conf.json

tools/
├── dataset/
└── release/
```

## Quy tắc dữ liệu

- Source of truth phải là tài liệu chính thức.
- AI không tự suy đoán đáp án production.
- Production dataset phải có provenance SHA-256.
- Promotion/validator/runtime importer đều là release/import gates.
- Dataset version đã phát hành là bất biến.
- Payload mới chỉ activate sau khi JSON và assets verify thành công.
- Update không được xóa progress/bookmark/exam history.
- UI không hard-code quy định thi ngoài domain/config layer.
