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

## 2. Compile / unit checks local

```powershell
pnpm release:check
pnpm build
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
pnpm dataset:test
```

Các plugin native cần chú ý: SQL, FS, Store, Notification.

## 3. Hai remote dataset

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

Hai package có source/content/asset SHA-256 riêng và update độc lập.

## 4. Hoàn thiện bộ 600 câu

```powershell
python -m pip install -r tools/dataset/requirements.txt
pnpm dataset:prepare:download
pnpm dataset:status
```

Yêu cầu trước promotion:

- parse đủ 600 câu;
- manual answer unresolved = 0;
- manual image unresolved = 0;
- provenance nguồn đầy đủ.

Manual answer review:

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

## 5. Hoàn thiện catalog biển báo

Catalog từng biển **chưa được điền tự động**. Chỉ thêm record khi đã đối chiếu quy chuẩn/tài liệu chính thức.

Workspace:

```text
data/traffic-signs/
├── source/
└── processed/
    ├── traffic-signs.json
    └── assets/
        └── signs/...
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

Schema/contract: [`TRAFFIC_SIGNS.md`](./TRAFFIC_SIGNS.md).

## 6. Production endpoint / Cloudflare R2

Tạo `.env.production`:

```env
VITE_QUESTIONS_MANIFEST_URL=https://<production-host>/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://<production-host>/lythuyetlaixe/traffic-signs/manifest.json
```

R2 layout đề xuất:

```text
lythuyetlaixe/
├── questions/
│   └── ...
└── traffic-signs/
    └── ...
```

Host cần CORS GET/HEAD cho WebView. Khi domain được chốt, đổi CSP `connect-src ... https:` thành đúng production origin.

Cho từng dataset, upload payload trước và manifest cuối cùng.

## 7. Tauri runtime verification

```powershell
pnpm tauri:dev
```

### 600 câu

1. DB sạch → first-run tải question manifest/questions/assets.
2. SQLite đúng 600 câu và 60 câu điểm liệt.
3. Ảnh câu hỏi hiển thị.
4. Tắt mạng → học/thi vẫn hoạt động.
5. Version mới → giữ progress/bookmark/exam history.
6. Update lỗi → giữ version cũ.
7. Same version + checksum khác → không overwrite.

### Biển báo

1. `VITE_TRAFFIC_SIGNS_MANIFEST_URL` độc lập với questions URL.
2. First-run của catalog import `traffic_signs` mà không chạm `questions`.
3. Search/filter từng biển hoạt động.
4. Ảnh đọc từ `$APPDATA/traffic-sign-assets/<version>/`.
5. Tắt mạng → catalog vẫn hoạt động.
6. Update traffic-sign version không làm reload/reset 600 câu.
7. Update question version không làm xóa traffic-sign catalog.

### Chung

- Settings → Runtime Diagnostics kiểm tra riêng hai endpoint/dataset.
- Reset user progress không xóa bất kỳ production dataset nào.

## 8. Windows release candidate

```powershell
pnpm release:check
pnpm release:windows:local
```

Kiểm tra Windows 10/11: install, first launch, persistence, notification, installer upgrade và dữ liệu sau upgrade.

## 9. Android bring-up

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Verify SQL migration v2, hai AppData asset root, Store, first-run/offline, Android Back, notification và responsive/touch.

```powershell
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

Release APK/AAB cần signing/keystore.

## 10. Blockers còn lại

### DATA

- production 600-question dataset;
- manual unresolved answers/images;
- production traffic-sign catalog từng biển;
- ảnh biển báo có provenance;
- explanation đáng tin cậy.

### DEPLOYMENT

- production R2/custom domain;
- CORS;
- CSP exact origin.

### LOCAL / DEVICE VERIFY

- frontend/Rust/plugin build;
- SQLite migration v2;
- first-run/update/offline của cả hai dataset;
- Windows NSIS;
- Android APK/AAB;
- notification scheduling.

### OPTIONAL SAU 1.0

- signed manifests;
- Windows code signing;
- binary auto-updater;
- cloud sync/account/conflict resolution.

## Definition of Desktop release candidate

```text
600 questions verified + published
+ traffic-sign catalog verified + published (nếu включ vào 1.0)
+ two-manifest first-run/offline/update verified
+ frontend/Rust checks pass local
+ Runtime Diagnostics sạch lỗi production
+ NSIS install/upgrade verified
```
