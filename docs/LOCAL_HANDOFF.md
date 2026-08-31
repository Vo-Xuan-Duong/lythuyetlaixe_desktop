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

`data:test` gồm test source của question tooling và traffic-sign tooling. Repo không tự chạy các lệnh này.

## 3. Hai dataset remote độc lập

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

Hai package có source/content/asset SHA-256 riêng. SQLite dùng application-level write queue để hai bootstrap và user mutations không xen transaction.

## 4. Hoàn thiện bộ 600 câu

```powershell
python -m pip install -r tools/dataset/requirements.txt
pnpm dataset:prepare:download
pnpm dataset:status
```

Trước promotion cần:

- parse đủ 600 câu;
- answer unresolved = 0;
- image unresolved = 0;
- provenance nguồn đầy đủ.

Manual answer:

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

Output:

```text
dist/dataset/
├── dataset-manifest.json
└── releases/<version>/
    ├── questions.json
    └── assets.zip
```

## 5. Hoàn thiện catalog biển báo

### 5.1 Tải đúng nguồn chính thức

Cài PyMuPDF nếu chưa có:

```powershell
python -m pip install -r tools/dataset/requirements.txt
```

Tải legal basis + đúng 5 phần Công báo Chính phủ của QCVN 41:2024/BGTVT:

```powershell
pnpm signs:source:download
pnpm signs:status
```

Technical source bắt buộc đúng thứ tự:

```text
1359+1360
1361+1362
1363+1364
1365+1366
1367+1368
```

`sourceSha256` là canonical hash của 5 part-hash; `combinedSha256` chỉ là hash PDF ghép dùng cho parser.

Sau download:

```powershell
pnpm signs:source:verify -- --reviewer "<reviewer>"
pnpm signs:status
```

### 5.2 Extract text/image candidates

```powershell
pnpm signs:candidates:official
pnpm signs:candidates:images
pnpm signs:status
```

Output local:

```text
data/traffic-signs/raw/
├── official-candidates.json
└── image-candidates/
```

Nếu candidate extraction có section không detect được code, dừng và sửa/đối chiếu thay vì đoán.

### 5.3 Manual review

```powershell
pnpm signs:review:prepare
pnpm signs:review:workspace
```

Mở:

```text
data/traffic-signs/raw/review-workspace.html
```

Trong workspace:

- đối chiếu từng record với QCVN chính thức;
- điền/kiểm tra name, meaning, recognition, scope, exceptions, notes, keywords;
- giữ đúng `sourceSection` và `sourcePages`;
- điền `verifiedBy` + `verifiedAt`;
- chọn candidate image **hoặc** nhập manual crop `page + x0,y0,x1,y1`;
- export `manual-review.json`.

Chép file export trở lại:

```text
data/traffic-signs/raw/manual-review.json
```

### 5.4 Processed image verification — hai bước

Sau khi chọn/crop ảnh:

```powershell
pnpm signs:review:images
pnpm signs:review:workspace
```

Tool sẽ copy/render ảnh vào:

```text
data/traffic-signs/processed/assets/signs/
```

và ghi provenance:

```text
method
sourceSha256
sourceSection
page
crop
processedAsset
candidateFile (nếu dùng candidate)
```

**Không** tự bật `imageVerified`.

Mở lại workspace, xem processed asset; nếu đúng mới bật `imageVerified=true`, hoàn tất record verification và export `manual-review.json` lần cuối.

### 5.5 Promotion / publish

```powershell
pnpm signs:status
pnpm signs:finalize
```

Production gate yêu cầu:

- official source bundle đã verify;
- manual-review code set khớp chính xác official candidate code set;
- mọi record verified;
- per-sign sourceSection/sourcePages/reviewer/time;
- mọi ảnh có imageVerified và official image provenance;
- processed assets tồn tại;
- validator pass trước publisher.

Output:

```text
dist/traffic-signs/
├── manifest.json
└── releases/<version>/
    ├── traffic-signs.json
    └── traffic-sign-assets.zip
```

Schema chi tiết: [`TRAFFIC_SIGNS.md`](./TRAFFIC_SIGNS.md).

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

Cho từng dataset: upload versioned payload trước, verify HTTPS GET, rồi upload root manifest cuối. R2/custom domain cần CORS read-only cho WebView. Sau khi chốt host, scope CSP `connect-src` về đúng origin.

Chi tiết: [`R2_DEPLOYMENT.md`](./R2_DEPLOYMENT.md).

## 7. Tauri runtime verification

```powershell
pnpm tauri:dev
```

### Questions

1. Clean AppData → tải question manifest/questions/assets.
2. SQLite đúng 600 câu và 60 critical.
3. Ảnh từ `$APPDATA/dataset-assets/<version>/`.
4. Offline restart vẫn học/thi/review.
5. New version giữ progress/bookmark/exam history.
6. Broken update giữ previous version.
7. Same version + changed checksum bị reject.
8. Missing local asset directory với package identity hợp lệ → self-heal.

### Traffic signs

1. Startup bootstrap độc lập với questions.
2. migration v2 tạo `traffic_sign_metadata` + `traffic_signs`.
3. Runtime reject payload thiếu per-sign/image provenance.
4. Search/filter/pagination hoạt động.
5. Ảnh từ `$APPDATA/traffic-sign-assets/<version>/`.
6. Offline restart vẫn tra cứu được.
7. Update signs không reset questions; update questions không xóa signs.
8. Missing rows/assets với same valid package → self-heal.
9. Same version + changed checksum bị reject.

### Concurrency / user data

Khi cả hai bootstrap đang chạy, thử bookmark/progress/exam/settings reset và xác minh không có nested/interleaved transaction error. Reset user data không được xóa production datasets.

Chạy **Settings → Runtime Diagnostics** sau first-run và sau offline restart.

## 8. Windows release candidate

```powershell
pnpm release:check
pnpm release:windows:local
```

Verify Windows 10/11: install, first launch, hai dataset download, offline persistence, notification, installer upgrade, preserved user data và uninstall.

## 9. Android bring-up

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Verify migration v2, hai AppData asset roots, Store, first-run/offline, native Back, notification và responsive/touch.

```powershell
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

Release APK/AAB cần signing/keystore.

## 10. Remaining blockers

### DATA

- production 600-question package;
- manual unresolved answer/image work;
- production traffic-sign records/images verified từ official QCVN bundle;
- explanation đáng tin cậy nếu đưa vào production.

### DEPLOYMENT

- R2 bucket/custom domain;
- CORS;
- exact production CSP origin.

### LOCAL / DEVICE VERIFY

- frontend/Vitest/Rust/plugin build;
- migration v2 + write queue;
- first-run/update/offline/self-heal của hai datasets;
- NSIS Windows;
- Android APK/AAB;
- notification scheduling.

### OPTIONAL AFTER 1.0

- signed manifests;
- Windows code signing;
- binary auto-updater;
- cloud sync/account/conflict resolution.

## Desktop release-candidate definition

```text
600 questions verified + published
+ traffic signs verified + published (nếu đưa vào 1.0)
+ versioned two-manifest R2 deployment
+ first-run/offline/update/self-heal verified
+ frontend/Rust/data checks pass local
+ Runtime Diagnostics không có lỗi production chưa giải thích
+ NSIS install/upgrade verified
```
