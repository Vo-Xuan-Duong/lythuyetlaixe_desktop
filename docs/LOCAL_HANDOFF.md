# Local maintainer handoff

File này là checklist để tiếp tục project trên máy local sau giai đoạn code/static-review.

> Không coi các mục dưới đây là đã pass cho tới khi chính maintainer chạy/xác minh trên máy hoặc thiết bị thật.

## 1. Dependency / lockfile

Repository pin `pnpm@10.34.5`.

```powershell
corepack enable
pnpm --version
pnpm install
```

Sau khi dependency graph hoạt động ổn định, kiểm tra và commit `pnpm-lock.yaml`. Không tạo lockfile thủ công.

## 2. Compile / unit checks local

```powershell
pnpm release:check
pnpm build
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
pnpm dataset:test
```

Các dependency native mới cần chú ý: FS, Store, Notification và SQL plugin của Tauri 2.

## 3. Remote dataset contract

Ba hash độc lập:

```text
sourceSha256  = PDF nguồn chính thức
contentSha256 = questions.json được cài
assetSha256   = assets.zip được cài
```

Manifest production bắt buộc có `dataset`, `version`, `validFrom`, `stage`, `datasetUrl`, `sha256`, `sourceSha256`, `sizeBytes`; nếu có ảnh thì thêm `assets` với URL/SHA-256/size/fileCount.

Runtime policy:

- production URL phải HTTPS; HTTP chỉ cho localhost development;
- questions/assets phải cùng origin với manifest;
- redirect cuối vẫn phải là URL hợp lệ;
- hard download limits được áp dụng;
- provenance manifest phải khớp `questions.json`;
- runtime importer validate lại 600 câu/category/critical/license/answers/image paths.

## 4. Chạy dataset thật

```powershell
python -m pip install -r tools/dataset/requirements.txt
pnpm dataset:prepare:download
pnpm dataset:status
```

Kiểm tra parse đúng 600 câu, parser warning, answer unresolved và underline score/margin.

Manual answer review dùng:

```text
data/source/manual-answer-review.json
```

Sau đó:

```powershell
pnpm dataset:after-answer-review
```

Mở `data/raw/review-workspace.html` để hỗ trợ xem unresolved/image candidates.

Manual image review dùng:

```text
data/source/manual-image-review.json
```

Khi toàn bộ answer/image đã xác minh:

```powershell
pnpm dataset:finalize
```

Không dùng AI để điền đáp án/explanation chính thức nếu không có nguồn xác minh.

## 5. Production endpoint

Sau publish:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

Upload `questions.json`/`assets.zip` trước, `dataset-manifest.json` cuối cùng.

Tạo `.env.production`:

```env
VITE_DATASET_MANIFEST_URL=https://<production-host>/lythuyetlaixe/dataset-manifest.json
```

Host cần CORS phù hợp vì transport hiện dùng Web Fetch API.

Khi host được chốt, thay `connect-src ... https:` trong `src-tauri/tauri.conf.json` bằng đúng production origin. Nếu chuyển sang Tauri HTTP plugin, scope capability chỉ đúng host đó.

## 6. Tauri runtime verification

```powershell
pnpm tauri:dev
```

Test case tối thiểu:

1. DB sạch → first-run tải manifest/questions/assets.
2. SQLite đúng 600 câu và 60 câu điểm liệt.
3. Ảnh hiển thị.
4. Tắt mạng → app vẫn học/thi được.
5. Dataset version mới → update giữ progress/bookmark/exam history.
6. Update hỏng giữa chừng → giữ version cũ.
7. Same version + checksum khác → không overwrite.
8. Settings → Runtime Diagnostics không có FAIL bất ngờ.
9. Reset dữ liệu người dùng không xóa dataset/assets.

## 7. Windows release candidate

```powershell
pnpm release:check
pnpm release:windows:local
```

Kiểm tra Windows 10/11: install, first launch, persistence, notification, installer upgrade và dữ liệu người dùng sau upgrade.

Trước public distribution cần quyết định code signing. Binary auto-updater hiện chưa triển khai.

## 8. Android bring-up

Sau khi cài Android Studio/JDK/SDK/NDK/Rust Android targets:

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Verify SQL migration, AppData assets, Store, first-run/offline, Android Back, abandon-confirm, notification và responsive/touch.

```powershell
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

Release APK/AAB còn cần signing/keystore.

## 9. Những phần cố ý chưa hoàn thành

### DATA BLOCKER

- production 600-question dataset;
- manual unresolved answers;
- visual image verification;
- explanation đáng tin cậy.

### DEPLOYMENT BLOCKER

- production HTTPS host;
- CSP exact host;
- CORS hoặc native HTTP transport decision.

### LOCAL / DEVICE VERIFY

- frontend/Rust/plugin build;
- SQLite runtime integration;
- Windows NSIS;
- Android init/APK/AAB;
- notification scheduling.

### OPTIONAL SAU 1.0

- signed dataset manifest;
- Windows code signing tùy kênh phân phối;
- binary auto-updater;
- cloud sync/account/conflict resolution.

## 10. Definition of Desktop release candidate

```text
600 câu verified
+ 60 critical exact
+ images verified
+ production validator pass local
+ remote package published
+ first-run/offline/update verified
+ frontend/Rust checks pass local
+ NSIS install/upgrade verified
```
