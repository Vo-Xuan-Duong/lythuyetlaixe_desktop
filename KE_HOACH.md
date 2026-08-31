# Kế hoạch phát triển — Lý Thuyết Lái Xe Việt Nam

> Repository: `Vo-Xuan-Duong/lythuyetlaixe_desktop`
>
> Trạng thái cập nhật: **31/08/2026**.
>
> Chiến lược: **Windows Desktop production trước → Android sau**.
>
> `[x]` = đã có code/static implementation. Các mục `DATA`, `LOCAL VERIFY`, `DEVICE VERIFY`, `DEPLOYMENT` chỉ được coi hoàn tất sau khi chạy/xác minh thực tế.

## 1. Mục tiêu sản phẩm

- học toàn bộ bộ 600 câu theo 6 chủ đề;
- học riêng 60 câu điểm liệt;
- thi thử theo hạng GPLX và thời gian hiệu lực;
- lưu progress/mastery/câu sai/bookmark/lịch sử thi;
- spaced review + weak-question ranking;
- kiến thức 5 nhóm biển báo luôn có sẵn;
- catalog từng biển từ QCVN chính thức;
- hoạt động offline sau lần cài data đầu tiên;
- questions và traffic-sign data cập nhật độc lập với binary app;
- Windows installer trước, Android sau.

## 2. Stack

- Tauri 2 + Rust.
- React 19 + TypeScript + Vite.
- SQLite `@tauri-apps/plugin-sql`.
- AppData assets `@tauri-apps/plugin-fs`.
- Preferences `@tauri-apps/plugin-store`.
- Native notifications `@tauri-apps/plugin-notification`.
- pnpm `10.34.5`.
- Python + PyMuPDF cho data tooling.

## 3. Kiến trúc data cuối

```text
Application
   │
   ├── VN_GPLX_600
   │   ├── VITE_QUESTIONS_MANIFEST_URL
   │   ├── SQLite question/progress/exam tables
   │   └── $APPDATA/dataset-assets/<version>/
   │
   └── VN_TRAFFIC_SIGNS
       ├── VITE_TRAFFIC_SIGNS_MANIFEST_URL
       ├── traffic_sign_metadata / traffic_signs
       └── $APPDATA/traffic-sign-assets/<version>/
```

Hai dataset có version, provenance, content checksum, asset checksum, update lifecycle và cache độc lập.

SQLite mutation của bootstrap/progress/exam/settings được serialize qua application write queue.

## 4. Quy tắc source of truth

### 600 câu

Source of truth = tài liệu chính thức Cục CSGT/Bộ Công an.

```text
sourceSha256  = PDF CSGT chính thức
contentSha256 = questions.json
assetSha256   = assets.zip
```

Không dùng AI/web luyện thi để suy đoán đáp án production.

### Traffic signs

Source of truth = QCVN 41:2024/BGTVT từ đúng 5 phần Công báo Chính phủ:

```text
1359+1360
1361+1362
1363+1364
1365+1366
1367+1368
```

```text
part SHA-256 × 5
     ↓
canonical bundle sourceSha256

5 parts
     ↓ merge local
combined PDF
     ↓
combinedSha256 (extraction/review only)
```

Production sign record phải có source section/pages/reviewer/time. Production image phải có verified source/page/crop provenance.

---

# 5. Roadmap / trạng thái

## Phase A — Application foundation

- [x] Tauri 2 + React + TypeScript + Vite.
- [x] Responsive desktop/mobile shell.
- [x] SQLite migrations v1/v2.
- [x] Tauri FS/SQL/Store/Notification integration.
- [x] Shared SQLite write queue.
- [x] Runtime Diagnostics.
- [x] Production CSP foundation.
- [x] GitHub validation manual-only.

**Trạng thái:** CODE COMPLETE.

## Phase B — Learning / Critical / Review

- [x] 6 chủ đề.
- [x] catalog/filter/pagination.
- [x] LearningSession.
- [x] correct/wrong attempts.
- [x] mastery 0–4.
- [x] `nextReviewAt`.
- [x] bookmarks.
- [x] 60 câu điểm liệt.
- [x] due/weak/wrong review queues.
- [x] sequence-aware navigation.
- [x] Android/native Back handling.

Còn:

- [ ] E2E với 600 câu production. **DATA + LOCAL VERIFY**.
- [ ] explanation production nếu có nguồn đáng tin cậy. **DATA OPTIONAL**.

**Trạng thái:** FEATURE CODE COMPLETE.

## Phase C — Exam Engine

- [x] cấu hình hạng GPLX.
- [x] date-effective config.
- [x] quota selection.
- [x] critical pool/fail rule.
- [x] RNG injection/no duplicates.
- [x] timer/navigator/submit.
- [x] history + answers persistence.
- [x] exam answers → learning progress.
- [x] result review từng câu.
- [x] default license device preference.
- [x] duplicate-submit guard.
- [x] abandon/back confirmation.
- [x] chặn dataset/config cũ ngoài thời gian tương thích.

Còn:

- [ ] E2E đề thật theo từng hạng. **DATA + LOCAL VERIFY**.

**Trạng thái:** FEATURE CODE COMPLETE.

## Phase D — Statistics / Settings

- [x] overall/category accuracy.
- [x] learned/mastered/due counts.
- [x] critical progress.
- [x] weakest questions.
- [x] exam history/pass-rate/average.
- [x] Dashboard SQLite.
- [x] Settings cho hai dataset.
- [x] reset progress/bookmark/exam/all user data.
- [x] runtime/app metadata.
- [x] review reminder settings.
- [x] Runtime Diagnostics.

**Trạng thái:** FEATURE CODE COMPLETE.

## Phase E — 600-question production pipeline

- [x] official source manifest.
- [x] downloader + hash.
- [x] PyMuPDF extractor.
- [x] question parser.
- [x] exact 60 critical IDs.
- [x] underline answer resolver.
- [x] manual answer review gate.
- [x] safe image candidate extractor.
- [x] manual image review gate.
- [x] promotion gate.
- [x] production validator.
- [x] immutable versioned publisher.
- [x] runtime remote manifest/content/assets validation.
- [x] offline/update/self-heal logic.
- [x] dataset status/review workspace.

Còn:

- [ ] chạy PDF CSGT thật. **DATA LOCAL**.
- [ ] calibrate underline nếu dữ liệu thật yêu cầu. **DATA LOCAL**.
- [ ] manual unresolved answer review. **DATA LOCAL**.
- [ ] manual image verification. **DATA LOCAL**.
- [ ] tạo production 600 questions package. **DATA**.

**Definition of Done:** `dataset:finalize` tạo package production verified, sau đó app import đúng 600 câu/60 critical và dùng offline.

## Phase F — Traffic-sign knowledge/catalog

### UI/runtime

- [x] kiến thức 5 nhóm built-in.
- [x] section/navigation riêng.
- [x] catalog SQLite độc lập.
- [x] search code/name/meaning/keyword.
- [x] filter 5 nhóm.
- [x] pagination.
- [x] AppData images.
- [x] independent bootstrap/offline/update/self-heal.

### Official-source tooling

- [x] legal-basis provenance.
- [x] exact 5-part Gazette source manifest.
- [x] safe official downloader.
- [x] per-part SHA-256.
- [x] canonical bundle SHA-256.
- [x] combined parsing PDF + `combinedSha256`.
- [x] source verification markers.
- [x] exact issue-sequence gate.
- [x] official text candidate extractor.
- [x] variant sign-code parser including comma codes.
- [x] exact-caption image candidate extractor.
- [x] manual review JSON generator.
- [x] offline review workspace.
- [x] image candidate gallery.
- [x] manual QCVN crop UI.
- [x] processed image selection/crop tool.
- [x] per-sign provenance gate.
- [x] image provenance gate.
- [x] exact official candidate code coverage gate.
- [x] local validator.
- [x] immutable versioned publisher.
- [x] runtime importer trust boundary.
- [x] runtime manifest `sourcePartCount = 5` gate.
- [x] multipart/review `signs:status`.

Còn:

- [ ] download/verify 5 PDF thật. **DATA LOCAL**.
- [ ] extract/review all real candidate records. **DATA LOCAL**.
- [ ] verify processed images/crops. **DATA LOCAL**.
- [ ] tạo `traffic-signs.json` + assets production. **DATA**.

**Definition of Done:** official 5-part bundle → 100% reviewed records/images → `signs:finalize` → runtime import/offline catalog.

## Phase G — Remote distribution / Cloudflare R2

- [x] two-manifest architecture.
- [x] immutable `releases/<version>` publishers.
- [x] HTTPS/same-origin runtime rules.
- [x] hard download/archive limits.
- [x] R2 deployment documentation.
- [x] static `project:status` preflight.
- [x] strict `release:candidate:check`.

Còn:

- [ ] create R2 bucket/custom domain. **DEPLOYMENT**.
- [ ] upload questions package. **DEPLOYMENT**.
- [ ] upload traffic-sign package. **DEPLOYMENT**.
- [ ] CORS GET/HEAD. **DEPLOYMENT**.
- [ ] `.env.production` two URLs. **DEPLOYMENT**.
- [ ] lock CSP `connect-src` to exact origin. **DEPLOYMENT**.

## Phase H — Windows release candidate

- [x] NSIS platform config.
- [x] local release command.
- [x] version synchronization check.
- [x] update/release documentation.

Còn:

- [ ] `pnpm install` + lockfiles. **LOCAL**.
- [ ] `pnpm build`. **LOCAL VERIFY**.
- [ ] `pnpm test`. **LOCAL VERIFY**.
- [ ] `pnpm data:test`. **LOCAL VERIFY**.
- [ ] `cargo check`. **LOCAL VERIFY**.
- [ ] `release:candidate:check` zero blockers. **LOCAL/DEPLOYMENT**.
- [ ] first-run/offline/update/self-heal E2E. **LOCAL VERIFY**.
- [ ] NSIS build/install/upgrade Windows 10/11. **LOCAL VERIFY**.
- [ ] Windows code signing. **OPTIONAL trước public distribution**.

**Definition of Done:** production data + R2 + clean first-run/offline/update + zero static preflight blockers + local checks + NSIS install/upgrade verified.

## Phase I — Android

Foundation code:

- [x] Android platform config.
- [x] min SDK config.
- [x] platform-neutral AppData.
- [x] Store preferences.
- [x] native Back stack.
- [x] exam abandon handling.
- [x] notification service/settings.
- [x] APK/AAB scripts.
- [x] Android documentation.

Còn:

- [ ] Android Studio/JDK/SDK/NDK/Rust targets. **LOCAL ENV**.
- [ ] `tauri android init`. **LOCAL**.
- [ ] migration v2/device verification. **DEVICE VERIFY**.
- [ ] two-dataset first-run/offline. **DEVICE VERIFY**.
- [ ] Store/Back/Notification. **DEVICE VERIFY**.
- [ ] APK/AAB + signing. **LOCAL/DEVICE**.

**Ưu tiên:** chỉ bắt đầu release Android sau khi Desktop release candidate ổn định.

## Phase J — Post-1.0 optional

- [ ] signed dataset manifests.
- [ ] binary auto-updater.
- [ ] cloud sync/account/conflict resolution.
- [ ] analytics/crash reporting nếu cần.

---

# 6. Thứ tự hoàn thiện từ trạng thái hiện tại

```text
1. pnpm install + local compile/tests
        ↓
2. production 600-question data
        ↓
3. production traffic-sign data
        ↓
4. publish both packages to R2
        ↓
5. .env.production + exact CSP
        ↓
6. pnpm release:candidate:check
        ↓
7. clean first-run / offline / update / self-heal
        ↓
8. NSIS Windows 10/11 release candidate
        ↓
9. Android bring-up
```

## 7. Local completion commands

```powershell
corepack enable
pnpm install

pnpm release:check
pnpm build
pnpm test
pnpm data:test
cargo check --manifest-path src-tauri/Cargo.toml

pnpm dataset:prepare:download
pnpm dataset:status

pnpm signs:source:download
pnpm signs:source:verify -- --reviewer "<name>"
pnpm signs:candidates:official
pnpm signs:candidates:images
pnpm signs:review:prepare
pnpm signs:review:workspace

# after both production packages + R2 config exist
pnpm project:status
pnpm release:candidate:check
```

Chi tiết thao tác: [`docs/LOCAL_HANDOFF.md`](./docs/LOCAL_HANDOFF.md).
