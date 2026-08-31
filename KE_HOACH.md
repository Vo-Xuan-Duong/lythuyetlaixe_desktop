# Kế hoạch phát triển — Lý Thuyết Lái Xe Việt Nam

> Repository: `Vo-Xuan-Duong/lythuyetlaixe_desktop`
>
> Chiến lược: **Windows Desktop trước → Android sau**, dùng chung Tauri 2, domain, SQLite, dataset contract và phần lớn UI.
>
> Cập nhật trạng thái: **31/08/2026**.
>
> Quy ước: `[x]` nghĩa là **đã có code**. Những hạng mục cần dữ liệu thật, build hoặc thiết bị vẫn được ghi rõ `LOCAL VERIFY`, `DATA BLOCKER` hoặc `DEVICE VERIFY`; không mặc định coi là production-ready chỉ vì đã implement.

## 1. Mục tiêu sản phẩm

Ứng dụng phải hỗ trợ:

- học toàn bộ 600 câu theo chủ đề;
- học riêng 60 câu điểm liệt;
- thi thử theo hạng GPLX và thời gian hiệu lực;
- lưu tiến độ, câu sai, bookmark và lịch sử thi;
- xếp hạng câu yếu và spaced review;
- hoạt động offline sau lần cài dữ liệu đầu tiên;
- dataset có version, provenance, checksum và validator;
- cập nhật dataset độc lập với binary app;
- mở rộng Android mà không viết lại business logic.

## 2. Source of truth

Dữ liệu production chỉ lấy từ tài liệu chính thức của **Cục Cảnh sát giao thông — Bộ Công an**.

Nguồn và provenance nằm tại:

- `docs/DATA_SOURCE.md`;
- `docs/EXAM_CONFIG.md`;
- `data/source/source-manifest.json`.

Nguyên tắc:

1. Không lấy app/web bên thứ ba làm nguồn đáp án.
2. Không dùng AI để đoán đáp án chính thức.
3. Dataset chưa vượt promotion gate + production validator không được phát hành.
4. Mỗi dataset phải có `version`, `validFrom`, checksum và provenance.
5. Version dataset đã phát hành là bất biến; thay đổi nội dung phải tạo version mới.
6. Ảnh biển báo/sa hình phải qua image review; không crop vùng đáp án có underline.

## 3. Stack

- Tauri 2 + Rust.
- React 19 + TypeScript + Vite.
- SQLite qua `@tauri-apps/plugin-sql`.
- AppData asset cache qua `@tauri-apps/plugin-fs`.
- Device preferences qua `@tauri-apps/plugin-store`.
- Native review reminder qua `@tauri-apps/plugin-notification`.
- pnpm.
- Python/PyMuPDF cho dataset tooling.

## 4. Kiến trúc

```text
React UI
   ↓
Application / hooks
   ↓
Domain / services
   ↓
Repository contracts
   ↓
Infrastructure
   ├─ SQLite repositories
   ├─ Tauri FS / Store / Notification
   ├─ Remote dataset bootstrap
   └─ AppData asset cache
```

Business rule không đặt trực tiếp trong component nếu có thể tách thành domain/service/repository.

Các phần dùng chung Desktop → Android:

- Question/Answer models;
- ExamConfig + Exam Engine;
- progress/mastery/spaced review;
- review ranking;
- SQLite schema;
- remote dataset contract;
- manifest/checksum validation;
- AppData asset layout;
- preferences contract.

Platform-specific chỉ giữ ở boundary:

- native back;
- notification/permission;
- installer/signing;
- mobile lifecycle;
- generated Android/iOS project.

## 5. Dataset/runtime contract

Luồng production:

```text
HTTPS dataset-manifest.json
        ↓
questions.json → size/SHA-256 → validate
        ↓
assets.zip → size/SHA-256/fileCount → safe unzip
        ↓
AppData/dataset-assets/<version>/...
        ↓
SQLite transaction import
        ↓
Offline runtime
```

Ứng dụng không bundle bộ 600 câu production vào installer.

## 6. Database schema

Hiện có:

- `dataset_metadata`;
- `categories`;
- `questions`;
- `answers`;
- `question_license_types`;
- `user_progress`;
- `bookmarks`;
- `exam_sessions`;
- `exam_answers`.

Schema mới phải đi qua migration; không sửa DB production ad-hoc.

---

# 7. Roadmap và trạng thái

## Phase 0 — Khởi tạo dự án

- [x] Scaffold Tauri 2 + React + TypeScript + Vite.
- [x] pnpm scripts.
- [x] Rust/Tauri config.
- [x] capability foundation.
- [x] README/tài liệu chạy local.
- [x] Workflow validation tồn tại nhưng đã chuyển **manual-only** theo policy phát triển hiện tại.

**Trạng thái:** DONE.

## Phase 1 — UI và domain foundation

- [x] App Shell desktop.
- [x] Sidebar desktop.
- [x] Bottom navigation responsive.
- [x] Dashboard.
- [x] Question/Answer/Category/Progress domain.
- [x] ExamConfig domain.
- [x] Demo data cho browser preview.
- [x] Các section Learning/Critical/Exam/Review/Bookmark/Statistics/Settings.

**Trạng thái:** DONE.

## Phase 2 — SQLite + local data foundation

- [x] `@tauri-apps/plugin-sql`.
- [x] initial migration.
- [x] Question/Progress/LearningCatalog/ExamHistory repositories.
- [x] DatasetImporter transaction + metadata/category/question/answer/license UPSERT.
- [x] Update dataset giữ `user_progress` theo question ID.
- [x] Query question theo hạng GPLX.
- [x] Exam answers/history persistence.
- [x] Exam result cập nhật `user_progress` để review queue nhận cả câu sai trong thi.
- [x] Remote bootstrap thay cho bundle dataset.
- [ ] Import đủ **600 câu production thật**. **DATA BLOCKER**.
- [ ] Runtime integration verification migration/repository/import/update trên Tauri local. **LOCAL VERIFY**.

**Trạng thái:** CODE COMPLETE / REAL DATA + LOCAL VERIFY PENDING.

## Phase 3 — Data pipeline 600 câu

- [x] Official source manifest + provenance.
- [x] Danh sách 60 câu điểm liệt.
- [x] Downloader + SHA-256.
- [x] PyMuPDF extractor giữ text spans/bbox/origin/images/vector drawings.
- [x] Parser `questions.unverified.json` không đoán đáp án.
- [x] Underline geometry answer resolver + score/margin.
- [x] `answer-review.json`.
- [x] Manual answer review có provenance.
- [x] Chặn manual override mâu thuẫn nếu không explicit.
- [x] Safe image candidate extractor chỉ xét graphics trước đáp án đầu tiên.
- [x] `image-review.json`.
- [x] Manual image review: accept-existing / accept-candidate / crop / none.
- [x] `imageNeedsVerification` gate.
- [x] Promotion gate.
- [x] Final production validator: 600 ID, 60 critical, 1 correct answer, answer/image verification, safe image paths.
- [x] Remote publisher tạo `questions.json + assets.zip + dataset-manifest.json`.
- [x] Runtime manifest/checksum/assets install/import architecture.
- [ ] Chạy pipeline trên PDF chính thức thật. **LOCAL DATA WORK**.
- [ ] Hiệu chỉnh underline threshold từ số liệu thật. **DATA WORK**.
- [ ] Manual verify các answer unresolved. **DATA WORK**.
- [ ] Visual/manual verify toàn bộ image candidate cần review. **DATA WORK**.
- [ ] Tạo `data/processed/questions.json` production thật. **DATA BLOCKER**.
- [ ] Validator production chạy thành công local. **LOCAL VERIFY**.
- [ ] Upload package lên HTTPS endpoint cố định. **DEPLOYMENT BLOCKER**.
- [ ] First-run import đủ 600 câu + ảnh trên app thật. **LOCAL VERIFY**.

**Definition of Done:** source chính thức → 600 câu verified → images verified → validator pass local → package HTTPS → app import 600 câu + offline hoạt động.

## Phase 4 — Learning mode

- [x] 6 chủ đề.
- [x] Catalog theo chủ đề.
- [x] Filter all/unlearned/learned/wrong/bookmarked.
- [x] Pagination + responsive.
- [x] LearningSession từ SQLite.
- [x] Previous/Next toàn bộ dataset hoặc theo custom review sequence.
- [x] Chấm đáp án.
- [x] Bookmark.
- [x] correct/wrong/progress persistence.
- [x] Mastery 0–4.
- [x] `nextReviewAt` spaced repetition.
- [x] Android/native Back từ LearningSession về collection nguồn.
- [ ] Explanation production đáng tin cậy. **DATA BLOCKER**.
- [ ] Full E2E với dataset 600 câu thật. **LOCAL VERIFY**.

**Trạng thái:** FEATURE CODE COMPLETE / DATA VERIFY PENDING.

## Phase 5 — 60 câu điểm liệt

- [x] Trang riêng.
- [x] Tổng tiến độ đã học/mastery 4/câu từng sai.
- [x] Luyện toàn bộ 60 câu.
- [x] Ôn riêng câu điểm liệt từng sai.
- [x] Điều hướng theo critical sequence.
- [ ] Verify với đúng 60 ID trong production dataset thật. **DATA/LOCAL VERIFY**.

**Trạng thái:** FEATURE CODE COMPLETE.

## Phase 6 — Exam engine

- [x] Config theo hạng GPLX + thời gian hiệu lực.
- [x] Quota theo cấu trúc bộ 600 câu hiện hành.
- [x] Chặn dùng dataset `2025.06` sau `28/02/2027` nếu chưa có config/dataset tương thích.
- [x] Question selection + RNG injection.
- [x] Không trùng câu + critical pool riêng.
- [x] Timer.
- [x] Navigator.
- [x] Submit/scoring.
- [x] Critical fail rule.
- [x] Lưu session + answers.
- [x] Exam result cập nhật learning progress.
- [x] Review chi tiết từng câu sau submit.
- [x] Hiển thị user answer/correct answer/critical/image/explanation.
- [x] Guard chống duplicate submit/history.
- [x] Hạng GPLX mặc định lưu device preference.
- [x] Android Back trong đề có confirm; result Back về exam setup.
- [ ] E2E đề thật theo từng hạng với 600 câu production. **DATA/LOCAL VERIFY**.

**Trạng thái:** FEATURE CODE COMPLETE / REAL DATA E2E PENDING.

## Phase 7 — Review engine

- [x] Queue đến hạn theo `nextReviewAt`.
- [x] Weak-question ranking.
- [x] Queue tất cả câu từng sai.
- [x] Ưu tiên mastery thấp / accuracy thấp / wrong count cao.
- [x] Spaced repetition.
- [x] Bookmark offline.
- [x] Review sequence trong LearningSession.
- [x] Câu sai từ Thi thử cũng đi vào progress/review.

**Trạng thái:** FEATURE CODE COMPLETE.

## Phase 8 — Statistics / Dashboard

- [x] Tổng tiến độ.
- [x] Accuracy tổng.
- [x] Accuracy theo chủ đề.
- [x] Mastered count.
- [x] Due review count.
- [x] Critical progress.
- [x] Weakest questions.
- [x] Exam history.
- [x] Pass rate.
- [x] Average exam score.
- [x] Dashboard đọc snapshot SQLite thay cho demo khi production dataset ready.

**Trạng thái:** FEATURE CODE COMPLETE.

## Phase 9 — Windows Desktop production

- [x] App icon foundation.
- [x] NSIS installer configuration tách trong `tauri.windows.conf.json`.
- [x] Local Windows release command.
- [x] `release:check` kiểm tra version package/Tauri/Cargo đồng bộ.
- [x] `CHANGELOG.md` + local release checklist.
- [x] Semantic version/update strategy.
- [x] Dataset update độc lập với binary app.
- [x] GitHub validation workflow chuyển manual-only; không tự chạy khi push/PR.
- [ ] `pnpm install` + build frontend/Rust local sau các dependency mới. **LOCAL VERIFY**.
- [ ] Build NSIS thực tế. **LOCAL VERIFY**.
- [ ] Test install/uninstall/upgrade Windows 10. **LOCAL VERIFY**.
- [ ] Test install/uninstall/upgrade Windows 11. **LOCAL VERIFY**.
- [ ] Code signing Windows. **OPTIONAL trước public distribution**.

**Trạng thái:** RELEASE INFRA CODED / LOCAL BUILD VERIFY PENDING.

## Phase 10 — Android

### Foundation đã code

- [x] Responsive mobile layout + bottom navigation foundation.
- [x] Platform-specific Tauri config: `tauri.android.conf.json`.
- [x] Android `minSdkVersion = 24`.
- [x] AppData-based dataset asset path, không hard-code Windows path.
- [x] Native preference store bằng `@tauri-apps/plugin-store` + browser/localStorage migration fallback.
- [x] Native Android Back handler stack.
- [x] Learning/Review/Critical/Statistics child flow Back handling.
- [x] Exam Back handling + abandon confirmation.
- [x] Native notification permission/scheduling service.
- [x] Settings UI cho nhắc ôn + test notification.
- [x] Local scripts cho Android debug APK / release APK / release AAB.
- [x] `docs/ANDROID.md` bring-up/release checklist.

### Cần môi trường/thiết bị local

- [ ] Cài Android Studio/JDK/SDK/NDK/Rust Android targets. **LOCAL ENV**.
- [ ] `pnpm tauri:android:init`. **LOCAL VERIFY**.
- [ ] Verify SQL plugin/migration trên Android. **DEVICE VERIFY**.
- [ ] Verify FS/AppData asset cache + asset protocol. **DEVICE VERIFY**.
- [ ] Verify Tauri Store preference. **DEVICE VERIFY**.
- [ ] Verify first-run remote dataset + offline startup. **DEVICE VERIFY**.
- [ ] Verify touch/responsive trên nhiều kích thước màn hình. **DEVICE VERIFY**.
- [ ] Verify Android system Back toàn bộ flow. **DEVICE VERIFY**.
- [ ] Verify notification permission/test/schedule/cancel/restart. **DEVICE VERIFY**.
- [ ] Build/cài APK debug. **LOCAL/DEVICE VERIFY**.
- [ ] Cấu hình Android signing/keystore.
- [ ] Build APK release.
- [ ] Build AAB release.
- [ ] Test app upgrade giữ SQLite/progress/assets/preferences.

**Trạng thái:** CROSS-PLATFORM FOUNDATION CODED / ANDROID PROJECT + DEVICE VERIFY PENDING.

## Phase 11 — Cloud sync — tùy chọn

Chỉ bắt đầu sau khi offline Desktop production ổn định.

- [ ] Account/identity.
- [ ] Sync progress.
- [ ] Sync bookmark.
- [ ] Sync preferences cần thiết.
- [ ] Conflict resolution.
- [ ] Privacy/security model.

**Trạng thái:** DEFERRED.

---

# 8. Local verification policy

Theo workflow hiện tại, trợ lý **không tự chạy test/build/GitHub Action**. Việc xác minh được thực hiện trên máy local.

Các nhóm kiểm tra cần chạy trước release:

```powershell
pnpm install
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
pnpm dataset:test
pnpm release:check
```

Khi dataset production thật có sẵn:

```powershell
pnpm dataset:validate
pnpm dataset:publish
pnpm tauri:dev
```

Windows installer:

```powershell
pnpm release:windows:local
```

Android sau khi đã `tauri android init`:

```powershell
pnpm tauri:android:dev
pnpm tauri:android:build:debug
pnpm release:android:apk:local
pnpm release:android:aab:local
```

## Trạng thái tổng quát

```text
Windows application features : CODE COMPLETE / LOCAL VERIFY PENDING
Dataset tooling               : CODE COMPLETE / REAL DATA WORK PENDING
Production 600-question data  : DATA BLOCKER
Remote production endpoint    : DEPLOYMENT BLOCKER
Windows installer             : CONFIGURED / LOCAL BUILD VERIFY PENDING
Android shared foundation     : CODED
Android generated project     : NOT INITIALIZED
Android device verification   : PENDING
Cloud sync                    : DEFERRED
```
