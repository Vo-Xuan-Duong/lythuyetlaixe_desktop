# Lý Thuyết Lái Xe — Tauri

Ứng dụng học và thi thử lý thuyết lái xe Việt Nam bằng **Tauri 2 + React + TypeScript + SQLite**, phát triển theo hướng **Windows Desktop trước, Android sau**.

> Application/data-tooling architecture đã ở mức code-complete. Production còn phụ thuộc dữ liệu chính thức được review, local compile/runtime verification, Cloudflare R2 và installer/device verification.

## Stack

- Tauri 2 + Rust.
- React 19 + TypeScript + Vite.
- SQLite qua `@tauri-apps/plugin-sql`.
- AppData asset cache qua `@tauri-apps/plugin-fs`.
- Device preferences qua `@tauri-apps/plugin-store`.
- Native review reminder qua `@tauri-apps/plugin-notification`.
- pnpm `10.34.5`.
- Python + PyMuPDF cho data tooling.

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

Hai dataset có version/checksum/provenance/update/cache độc lập. Bootstrap có thể chạy song song ở startup; SQLite mutation được serialize qua application write queue.

## Feature layer

Đã có code cho:

- học 600 câu theo 6 chủ đề;
- 60 câu điểm liệt;
- bookmark/progress/mastery/spaced review;
- due/weak/wrong review queues;
- thi thử theo hạng, timer, critical fail, history và result review;
- Dashboard/Statistics từ SQLite;
- Settings, reset user data, runtime diagnostics;
- kiến thức 5 nhóm biển báo built-in;
- catalog từng biển remote: search/filter/pagination/detail/image;
- first-run remote bootstrap, offline fallback, immutable update và self-heal;
- Windows NSIS foundation;
- Android config/back/store/notification/build scripts.

## Tài liệu chính

- Trạng thái hiện tại: [`docs/STATUS.md`](./docs/STATUS.md)
- Local handoff: [`docs/LOCAL_HANDOFF.md`](./docs/LOCAL_HANDOFF.md)
- Roadmap: [`KE_HOACH.md`](./KE_HOACH.md)
- Remote lifecycle: [`docs/REMOTE_DATASET.md`](./docs/REMOTE_DATASET.md)
- Cloudflare R2: [`docs/R2_DEPLOYMENT.md`](./docs/R2_DEPLOYMENT.md)
- 600 câu: [`tools/dataset/README.md`](./tools/dataset/README.md)
- Biển báo: [`docs/TRAFFIC_SIGNS.md`](./docs/TRAFFIC_SIGNS.md)
- Windows release: [`docs/LOCAL_RELEASE.md`](./docs/LOCAL_RELEASE.md)
- Android: [`docs/ANDROID.md`](./docs/ANDROID.md)
- Version/update policy: [`docs/UPDATE_STRATEGY.md`](./docs/UPDATE_STRATEGY.md)

## GitHub Actions

Validation workflow là **manual-only**. Push/PR không tự chạy build/test.

## Cài dependency local

```powershell
corepack enable
pnpm install
```

Sau khi dependency graph ổn định, commit `pnpm-lock.yaml`; để Cargo sinh `src-tauri/Cargo.lock` rồi commit lockfile đó.

## Cấu hình production

Tạo `.env.production` từ `.env.example`:

```env
VITE_QUESTIONS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/traffic-signs/manifest.json
```

Thay `data.example.com` bằng R2 custom domain thật. `VITE_DATASET_MANIFEST_URL` chỉ là compatibility fallback cho questions.

## Pipeline 600 câu

```powershell
python -m pip install -r tools/dataset/requirements.txt
pnpm dataset:prepare:download
pnpm dataset:status
```

Sau manual answer/image verification:

```powershell
pnpm dataset:after-answer-review
# hoàn tất manual image review
pnpm dataset:finalize
```

Output:

```text
dist/dataset/
├── dataset-manifest.json
└── releases/<version>/
    ├── questions.json
    └── assets.zip
```

Integrity:

```text
sourceSha256  = official CSGT source PDF
contentSha256 = questions.json
assetSha256   = assets.zip
```

## Pipeline catalog biển báo

Nguồn production là QCVN 41:2024/BGTVT từ **5 phần Công báo Chính phủ**:

```text
1359+1360
1361+1362
1363+1364
1365+1366
1367+1368
```

`sourceSha256` là canonical hash của đúng 5 part theo thứ tự; PDF ghép chỉ dùng extraction/review và có `combinedSha256` riêng.

Workflow:

```powershell
pnpm signs:source:download
pnpm signs:source:verify -- --reviewer "<name>"
pnpm signs:candidates:official
pnpm signs:candidates:images
pnpm signs:review:prepare
pnpm signs:review:workspace
```

Review/export `data/traffic-signs/raw/manual-review.json`, sau đó:

```powershell
pnpm signs:review:images
pnpm signs:review:workspace
# xem processed asset, xác nhận imageVerified/record verified
pnpm signs:finalize
```

Output:

```text
dist/traffic-signs/
├── manifest.json
└── releases/<version>/
    ├── traffic-signs.json
    └── traffic-sign-assets.zip
```

Root manifest yêu cầu `sourcePartCount = 5`. Mỗi sign record có source section/pages/reviewer/time; ảnh có source bundle/page/crop provenance riêng.

## Chạy app

Browser preview:

```powershell
pnpm dev
```

Tauri native:

```powershell
pnpm tauri:dev
```

Nếu questions dataset chưa tồn tại local thì manifest URL questions phải hợp lệ. Traffic-sign dataset lỗi không chặn app; phần kiến thức 5 nhóm built-in và Settings vẫn dùng được.

## Local checks

Các lệnh dưới đây phải do maintainer chạy local:

```powershell
pnpm release:check
pnpm build
pnpm test
pnpm data:test
cargo check --manifest-path src-tauri/Cargo.toml
```

Không coi chúng là PASS cho tới khi thực sự chạy thành công trên máy local.

## Project / release preflight

Sau khi data production và `.env.production` đã có:

```powershell
pnpm project:status
```

Báo cáo các blocker static nhưng không fail shell.

Trước release candidate:

```powershell
pnpm release:candidate:check
```

Kiểm tra lockfile, hai local production packages, checksum/count/provenance, production URLs và CSP exact origin. Lệnh này không thay compiler/runtime/device tests.

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

Upload `releases/<version>/...` trước, verify public HTTPS GET, root manifest sau cùng.

Sau khi chốt custom domain, đổi CSP `connect-src` từ generic `https:` sang exact R2 origin.

## Windows release

```powershell
pnpm release:check
pnpm release:candidate:check
pnpm release:windows:local
```

NSIS output dự kiến:

```text
src-tauri/target/release/bundle/nsis/
```

Cần verify Windows 10/11: install, first-run hai dataset, offline, update/self-heal, installer upgrade, preserved user data, uninstall.

## Android

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

Android vẫn cần SDK/JDK/NDK, device verification và signing/keystore.

## Quy tắc dữ liệu

- Chỉ source chính thức làm production source of truth.
- AI không đoán đáp án/ý nghĩa production.
- Questions và traffic signs có provenance/version/checksum riêng.
- Dataset version đã publish là immutable.
- Validator/publisher/runtime importer đều là trust boundary.
- Catalog biển báo không được dùng để tự suy luận đáp án bộ 600 câu.
