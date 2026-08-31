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

Project không còn coi toàn bộ dữ liệu là một package duy nhất.

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

Hai dataset có version, checksum, source provenance, update và cache độc lập. Update catalog biển báo không làm tải/import lại 600 câu; update 600 câu cũng không chạm catalog biển báo.

## Tài liệu chính

- Roadmap: [`KE_HOACH.md`](./KE_HOACH.md)
- Trạng thái/handoff: [`docs/STATUS.md`](./docs/STATUS.md)
- Local handoff checklist: [`docs/LOCAL_HANDOFF.md`](./docs/LOCAL_HANDOFF.md)
- Remote datasets: [`docs/REMOTE_DATASET.md`](./docs/REMOTE_DATASET.md)
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

`VITE_DATASET_MANIFEST_URL` chỉ còn là compatibility fallback cho bộ 600 câu; deployment mới không nên dùng.

Production runtime yêu cầu HTTPS. HTTP chỉ được chấp nhận cho localhost development.

## Luồng 600 câu

```text
questions/dataset-manifest.json
    ↓
questions.json → size/SHA-256/provenance/runtime validation
    ↓
assets.zip → bounded verify + safe extract
    ↓
$APPDATA/dataset-assets/<version>/
    ↓
SQLite transaction
    ↓
Learning / Exam / Review / Statistics offline
```

Ba checksum của bộ câu hỏi:

```text
sourceSha256  = PDF nguồn chính thức
contentSha256 = questions.json đã cài
assetSha256   = assets.zip đã cài
```

### Pipeline 600 câu

```powershell
pnpm dataset:prepare:download
pnpm dataset:status
# manual answer/image verification
pnpm dataset:finalize
```

Các lệnh chi tiết nằm trong [`tools/dataset/README.md`](./tools/dataset/README.md).

Output publisher:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

## Luồng catalog biển báo

Phần kiến thức 5 nhóm cơ bản được bundle trong binary và dùng được ngay cả khi catalog chưa tải. Catalog từng biển là remote dataset riêng:

```text
traffic-signs/manifest.json
    ↓
traffic-signs.json → source/content SHA-256 + schema validation
    ↓
traffic-sign-assets.zip → safe extract
    ↓
$APPDATA/traffic-sign-assets/<version>/
    ↓
SQLite traffic_signs
    ↓
search/filter/detail offline
```

Workspace local:

```text
data/traffic-signs/
├── source/
└── processed/
    ├── traffic-signs.json
    └── assets/
```

Validate/publish:

```powershell
pnpm signs:validate
pnpm signs:publish
```

Output:

```text
dist/traffic-signs/
├── manifest.json
├── traffic-signs.json
└── traffic-sign-assets.zip
```

Chưa được điền record biển cụ thể bằng suy đoán. Tên, ý nghĩa, phạm vi, ngoại lệ và hình phải được đối chiếu nguồn chính thức trước khi production publish.

## Chạy frontend/browser preview

```powershell
pnpm dev
```

Browser preview dùng demo/built-in knowledge cho các phần cần native runtime.

## Chạy Tauri local

```powershell
pnpm tauri:dev
```

Nếu máy chưa có 600 câu local thì `VITE_QUESTIONS_MANIFEST_URL` phải hợp lệ. Catalog biển báo có thể được cài độc lập qua `VITE_TRAFFIC_SIGNS_MANIFEST_URL`.

Settings → **Runtime Diagnostics** kiểm tra riêng endpoint, metadata, checksum và asset cache của hai dataset.

## R2 layout đề xuất

```text
lythuyetlaixe/
├── questions/
│   ├── dataset-manifest.json
│   └── ...
└── traffic-signs/
    ├── manifest.json
    └── ...
```

Nên để hai root trên cùng custom domain để CSP/CORS đơn giản, nhưng lifecycle vẫn độc lập.

## SQLite và AppData

```text
SQLite: sqlite:lythuyetlaixe.db
Question assets:     $APPDATA/dataset-assets/<version>/...
Traffic-sign assets: $APPDATA/traffic-sign-assets/<version>/...
Store: settings.json
```

## Windows local release

```powershell
pnpm release:check
pnpm release:windows:local
```

Output NSIS dự kiến:

```text
src-tauri/target/release/bundle/nsis/
```

Production CSP hiện cho HTTPS chung vì host cuối chưa chốt. Trước public release, scope `connect-src` về đúng origin R2 custom domain.

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

Android vẫn cần device verification cho SQL/FS/Store/Back/notifications/offline/update/signing.

## Versioning

```text
Application:    0.1.0 → 0.2.0 → 1.0.0
Questions:      2025.06 → version mới khi bộ câu hỏi thay đổi
Traffic signs:  2025.01 → version mới khi catalog/quy chuẩn thay đổi
```

Mỗi version đã publish là immutable.

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

data/
├── processed/             # 600 questions
├── raw/
├── source/
└── traffic-signs/         # independent sign catalog workspace

tools/
├── dataset/
├── traffic-signs/
└── release/
```

## Quy tắc dữ liệu

- Source of truth phải là tài liệu chính thức.
- AI không tự suy đoán đáp án hoặc ý nghĩa production.
- Hai dataset phải có provenance/checksum riêng.
- Validator/runtime importer là release/import gates.
- Version đã phát hành là bất biến.
- Update 600 câu không xóa progress/bookmark/exam history.
- Catalog biển báo không được dùng để tự suy luận đáp án bộ 600 câu.
