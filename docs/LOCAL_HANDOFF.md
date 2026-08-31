# Local maintainer handoff

Checklist tiếp tục project trên máy local sau giai đoạn code/static-review.

> Không coi mục nào là đã pass cho tới khi maintainer chạy/xác minh trên máy hoặc thiết bị thật.

## 1. Dependency / lockfile

```powershell
corepack enable
pnpm --version
pnpm install
```

Sau khi dependency graph ổn định, commit `pnpm-lock.yaml`. Không tạo lockfile thủ công.

## 2. Compile / checks local

```powershell
pnpm release:check
pnpm build
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
pnpm data:test
```

`data:test` gồm test source của question publisher và traffic-sign publisher; repo không tự chạy các lệnh này.

## 3. Hai dataset remote

```text
QUESTIONS
  env: VITE_QUESTIONS_MANIFEST_URL
  metadata: dataset_metadata
  assets: $APPDATA/dataset-assets/<version>/

TRAFFIC SIGNS
  env: VITE_TRAFFIC_SIGNS_MANIFEST_URL
  metadata: traffic_sign_metadata
  assets: $APPDATA/traffic-sign-assets/<version>/
```

Hai package có source/content/asset SHA-256 riêng. Traffic-sign manifest còn có `signCount` bắt buộc.

SQLite dùng một application-level write queue. Khi verify runtime, cần chú ý không xuất hiện lỗi transaction/database lock khi startup bootstrap hai dataset đồng thời với progress/exam/settings mutations.

## 4. Hoàn thiện bộ 600 câu

```powershell
python -m pip install -r tools/dataset/requirements.txt
pnpm dataset:prepare:download
pnpm dataset:status
```

Trước promotion:

- parse đủ 600 câu;
- answer unresolved = 0 sau manual review;
- image unresolved = 0 sau manual review;
- provenance nguồn đầy đủ.

Manual answer file:

```text
data/source/manual-answer-review.json
```

Sau đó:

```powershell
pnpm dataset:after-answer-review
```

Review workspace:

```text
data/raw/review-workspace.html
```

Manual image review:

```text
data/source/manual-image-review.json
```

Final:

```powershell
pnpm dataset:finalize
```

Expected output:

```text
dist/dataset/
├── dataset-manifest.json
└── releases/<version>/
    ├── questions.json
    └── assets.zip
```

## 5. Hoàn thiện catalog biển báo

Catalog từng biển chưa được tự suy diễn. Chỉ tạo production record sau khi đối chiếu tài liệu chính thức.

Tải/hash source đã khai báo:

```powershell
pnpm signs:source:download
pnpm signs:status
```

Workspace generated:

```text
data/traffic-signs/processed/
├── traffic-signs.json
└── assets/
    └── signs/...
```

Sau khi dữ liệu và ảnh đã verified:

```powershell
pnpm signs:validate
pnpm signs:finalize
```

Expected output:

```text
dist/traffic-signs/
├── manifest.json
└── releases/<version>/
    ├── traffic-signs.json
    └── traffic-sign-assets.zip
```

Schema/contract: [`TRAFFIC_SIGNS.md`](./TRAFFIC_SIGNS.md).

## 6. Cloudflare R2

`.env.production`:

```env
VITE_QUESTIONS_MANIFEST_URL=https://<production-host>/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://<production-host>/lythuyetlaixe/traffic-signs/manifest.json
```

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

For each dataset: upload versioned payload first, verify public HTTPS GET, then upload root manifest last. Host needs read-only CORS for the current Web Fetch transport.

After final host is selected, scope CSP `connect-src` from generic `https:` to the exact origin.

Detailed deployment: [`R2_DEPLOYMENT.md`](./R2_DEPLOYMENT.md).

## 7. Tauri runtime verification

```powershell
pnpm tauri:dev
```

### Questions

1. Clean AppData → first-run downloads manifest/questions/assets.
2. SQLite contains exactly 600 questions and 60 critical questions.
3. Images display from `$APPDATA/dataset-assets/<version>/`.
4. Offline restart still supports Learning/Exam/Review.
5. New question version preserves progress/bookmark/exam history.
6. Broken update keeps previous version.
7. Same version + changed checksum is rejected.
8. Deleting asset directory while keeping valid metadata causes self-heal from the same immutable package.

### Traffic signs

1. Startup bootstrap runs independently from questions.
2. First-run import creates/uses migration-v2 `traffic_sign_metadata` + `traffic_signs`.
3. Search/filter/pagination work against SQLite.
4. Images display from `$APPDATA/traffic-sign-assets/<version>/`.
5. Offline restart keeps catalog available.
6. Updating signs does not reload/reset questions.
7. Updating questions does not remove signs.
8. Missing sign rows/assets with same valid package identity self-heal.
9. Same version + changed checksum is rejected.

### Concurrency / user data

While both bootstraps are active, exercise bookmark/progress/exam/settings reset paths and verify no nested/interleaved transaction errors. Reset user data must not delete either production dataset.

Run **Settings → Runtime Diagnostics** after first-run and after offline restart.

## 8. Windows release candidate

```powershell
pnpm release:check
pnpm release:windows:local
```

Verify Windows 10/11: install, first launch, both dataset downloads, offline persistence, notification, installer upgrade, preserved user data and uninstall policy.

## 9. Android bring-up

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Verify SQL migration v2, both AppData asset roots, Store, first-run/offline, native Back, notification and responsive/touch.

```powershell
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

Release APK/AAB still needs signing/keystore.

## 10. Remaining blockers

### DATA

- verified production 600-question package;
- manual unresolved answer/image work;
- verified production traffic-sign catalog and images;
- trusted explanation content if included.

### DEPLOYMENT

- R2 bucket/custom domain;
- CORS;
- exact production CSP origin.

### LOCAL / DEVICE VERIFY

- frontend/Vitest/Rust/plugin build;
- SQLite migration v2 + write queue behavior;
- first-run/update/offline/self-heal of both datasets;
- NSIS Windows;
- Android APK/AAB;
- notification scheduling.

### OPTIONAL AFTER 1.0

- signed manifests;
- Windows code signing depending on channel;
- binary auto-updater;
- cloud sync/account/conflict resolution.

## Desktop release-candidate definition

```text
600 questions verified + published
+ traffic signs verified + published (if included in 1.0)
+ versioned two-manifest R2 deployment
+ first-run/offline/update/self-heal verified
+ frontend/Rust/data checks pass local
+ Runtime Diagnostics has no unexplained production failures
+ NSIS install/upgrade verified
```
