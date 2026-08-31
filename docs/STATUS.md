# Trạng thái triển khai hiện tại

> Branch: `main`.
>
> **CODED** = đã triển khai bằng code/static review. **LOCAL VERIFY** = cần chạy trên máy phát triển. **DEVICE VERIFY** = cần thiết bị/emulator. **DATA BLOCKER** = cần dữ liệu chính thức đã kiểm chứng. GitHub Actions đang manual-only.

## Tóm tắt

Application feature layer hiện gần như hoàn chỉnh. Phần còn ngăn project thành production release không phải là thiếu màn hình chính, mà là:

1. local compile/runtime verification sau các dependency/config mới;
2. production dataset 600 câu + ảnh đã manual verify;
3. production HTTPS endpoint;
4. Windows installer/device verification;
5. Android init/device/signing nếu tiếp tục target mobile.

## Application core

| Khu vực | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tauri 2 + React + TypeScript | CODED | Shared Desktop/Android foundation |
| SQLite schema/repositories | CODED | Dataset, progress, bookmark, exam history |
| Remote dataset bootstrap | CODED | Manifest → bounded verify → runtime validate → SQLite |
| Remote image assets | CODED | bounded ZIP → safe AppData install → rollback on failed import |
| Offline fallback | CODED | Có local dataset thì mất mạng vẫn dùng local |
| Immutable dataset version | CODED | Same version/package checksum đổi không overwrite |
| Device preferences | CODED | Tauri Store + browser fallback/migration |
| Runtime diagnostics | CODED | SQLite/data/checksum/assets/store/notification |
| Production CSP | CODED | `devCsp` disabled; exact dataset host còn deployment task |
| FS least privilege | CODED | Chỉ command + scope cần cho `$APPDATA/dataset-assets/**` |

## Dataset integrity contract

Ba checksum đã được tách hoàn toàn:

```text
sourceSha256  = SHA-256 PDF nguồn chính thức
contentSha256 = SHA-256 questions.json đã cài
assetSha256   = SHA-256 assets.zip đã cài
```

Đã code:

- legacy metadata migration khi hash package cũ bị lưu nhầm vào `sourceSha256`;
- manifest bắt buộc source provenance;
- manifest ↔ `questions.json` source provenance cross-check;
- HTTPS-only production URL, localhost HTTP dev exception;
- same-origin policy cho manifest/questions/assets;
- redirect URL validation;
- hard size limits cho manifest/questions/assets;
- exact SHA-256 validation;
- failed asset install/import cleanup;
- runtime importer kiểm tra lại production contract.

## Learning / Critical / Review

| Feature | Trạng thái |
| --- | --- |
| Catalog 600 câu / 6 chủ đề | CODED |
| Filter chưa học / đã học / sai / bookmark | CODED |
| LearningSession / answer feedback | CODED |
| Progress/mastery 0–4 | CODED |
| `nextReviewAt` spaced repetition | CODED |
| Bookmark | CODED |
| Review sequence | CODED |
| Due / weak / wrong queues | CODED |
| 60 câu điểm liệt page/progress | CODED |
| Critical-only wrong review | CODED |
| Exam answers cập nhật review progress | CODED |
| Explanation | DATA BLOCKER |
| 600-question E2E | DATA BLOCKER / LOCAL VERIFY |

## Exam

| Feature | Trạng thái |
| --- | --- |
| ExamConfig theo hạng/ngày hiệu lực | CODED |
| Quota selector | CODED |
| Timer / navigator | CODED |
| Scoring / critical fail | CODED |
| Session + answers persistence | CODED |
| Duplicate-submit guard | CODED |
| Result review từng câu | CODED |
| Default license via Store | CODED |
| Android Back/abandon confirm | CODED — DEVICE VERIFY |
| E2E đề thật | DATA BLOCKER / LOCAL VERIFY |

## Statistics / Dashboard

Tổng tiến độ, accuracy tổng/theo chủ đề, mastered, due review, critical progress, weakest questions, exam history, pass rate, average score và Dashboard SQLite đều **CODED**.

## Settings / native utilities

| Feature | Trạng thái |
| --- | --- |
| App/Tauri/identifier info | CODED |
| Dataset metadata + 3 checksum riêng | CODED |
| Local record counts | CODED |
| Dataset update check | CODED |
| Reset progress/bookmark/exam/all user state | CODED |
| Default exam license | CODED |
| Daily reminder preference | CODED |
| Notification permission/test | CODED — LOCAL/DEVICE VERIFY |
| Reminder scheduling | CODED — DEVICE VERIFY |
| Reminder restore on native startup | CODED — DEVICE VERIFY |
| Runtime Diagnostics panel | CODED |

## Dataset tooling

| Stage | Trạng thái |
| --- | --- |
| Official source metadata | CODED |
| Downloader + source SHA-256 | CODED |
| PyMuPDF extractor | CODED |
| Parser | CODED |
| Underline resolver | CODED |
| Manual answer review + provenance | CODED |
| Safe image candidate extraction | CODED |
| Manual image review | CODED |
| HTML review workspace | CODED |
| Promotion provenance/image gate | CODED |
| Final validator | CODED |
| Runtime-equivalent category/critical/license/image invariants | CODED |
| Remote publisher + source/content/asset integrity | CODED |
| `dataset:status` + checkpoint commands | CODED |
| Chạy PDF thật | LOCAL DATA WORK |
| Calibrate underline threshold | DATA WORK |
| Manual unresolved answer review | DATA WORK |
| Visual image review | DATA WORK |
| Production package | DATA BLOCKER |

## Windows Desktop production

| Feature | Trạng thái |
| --- | --- |
| NSIS platform config | CODED |
| `release:check` | CODED |
| Local release command | CODED |
| Changelog/release docs | CODED |
| CSP / FS permission hardening | CODED |
| Auto GitHub validation | DISABLED — manual-only |
| `pnpm-lock.yaml` sau dependency mới | LOCAL PENDING |
| Frontend/Rust compile | LOCAL VERIFY |
| NSIS build | LOCAL VERIFY |
| Windows 10/11 install/upgrade | LOCAL VERIFY |
| Code signing | OPTIONAL / NOT CONFIGURED |

## Android foundation

| Feature | Trạng thái |
| --- | --- |
| Mobile layout / bottom navigation | CODED |
| `tauri.android.conf.json` / minSdk 24 | CODED |
| AppData asset path | CODED — DEVICE VERIFY |
| Store preferences | CODED — DEVICE VERIFY |
| Native Back stack | CODED — DEVICE VERIFY |
| Notification reminder | CODED — DEVICE VERIFY |
| Startup reminder restore | CODED — DEVICE VERIFY |
| Debug APK / release APK / AAB commands | CODED — LOCAL VERIFY |
| Android docs | CODED |
| Android SDK/JDK/NDK/Rust targets | LOCAL ENV PENDING |
| `tauri android init` | LOCAL VERIFY PENDING |
| Plugin/device behavior | DEVICE VERIFY PENDING |
| Signing/keystore | PENDING |

## Security/deployment còn để local

### Khi production host được chốt

- tạo `.env.production`;
- đổi CSP `connect-src` từ generic `https:` sang đúng origin;
- cấu hình CORS cho WebView;
- tùy nhu cầu, đổi sang Tauri HTTP plugin với scope đúng host.

### Optional sau release đầu

- signed manifest/public-key verification;
- binary auto-updater;
- Windows code signing tùy kênh phân phối;
- cloud sync.

## Blocker để có Desktop release candidate

1. `pnpm install` và commit lockfile sau khi xác minh.
2. Frontend/unit/Rust checks local.
3. Chạy PDF pipeline thật.
4. Manual answer/image verification.
5. Production validator/publisher local.
6. Upload HTTPS package + `.env.production`.
7. First-run/offline/update/rollback local verification.
8. Runtime Diagnostics không còn lỗi production.
9. Build/test NSIS Windows 10/11.

Checklist chi tiết: [`LOCAL_HANDOFF.md`](./LOCAL_HANDOFF.md).
