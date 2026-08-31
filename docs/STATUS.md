# Trạng thái triển khai hiện tại

> Branch hiện tại: `main`.
>
> Quy ước: **CODED** = đã triển khai code; **LOCAL VERIFY** = cần chạy trên máy phát triển; **DEVICE VERIFY** = cần thiết bị/emulator; **DATA BLOCKER** = cần dataset chính thức đã kiểm chứng. GitHub Actions đang manual-only và không tự chạy.

## Application core

| Khu vực | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tauri 2 + React + TypeScript | CODED | Shared Desktop/Android foundation |
| SQLite schema/migration | CODED | Dataset, progress, bookmarks, exam history |
| Remote dataset bootstrap | CODED | Manifest → questions → verify → SQLite |
| Remote image assets | CODED | assets.zip → SHA-256 → safe AppData install |
| Offline fallback | CODED | Có dataset local thì không phụ thuộc mạng |
| Immutable dataset version | CODED | Cùng version nhưng checksum đổi không overwrite local |
| Device preferences | CODED | Tauri Store native + browser localStorage fallback/migration |
| Runtime diagnostics | CODED | SQLite/data/assets/store/endpoint/notification status trong Settings |

## Learning / Critical / Review

| Feature | Trạng thái |
| --- | --- |
| Catalog 600 câu / 6 chủ đề | CODED |
| Filter chưa học / đã học / sai / bookmark | CODED |
| LearningSession + chấm đáp án | CODED |
| Progress/mastery 0–4 | CODED |
| `nextReviewAt` spaced repetition | CODED |
| Bookmark | CODED |
| Custom review sequence | CODED |
| Due queue | CODED |
| Weak-question ranking | CODED |
| Queue câu từng sai | CODED |
| 60 câu điểm liệt page/progress | CODED |
| Critical-only wrong review | CODED |
| Câu sai trong Exam cập nhật review progress | CODED |
| Explanation | DATA BLOCKER |
| Full 600-question E2E | DATA BLOCKER / LOCAL VERIFY |

## Exam

| Feature | Trạng thái |
| --- | --- |
| ExamConfig theo hạng + thời gian hiệu lực | CODED |
| Quota selector | CODED |
| Timer / navigator | CODED |
| Scoring / critical fail | CODED |
| Session + answers persistence | CODED |
| Duplicate-submit guard | CODED |
| Review chi tiết từng câu sau submit | CODED |
| User answer / correct answer / critical / image / explanation | CODED |
| Default exam license | CODED — Tauri Store |
| Android Back khi đang thi | CODED — DEVICE VERIFY |
| E2E với 600 câu thật | DATA BLOCKER / LOCAL VERIFY |

## Statistics / Dashboard

| Feature | Trạng thái |
| --- | --- |
| Tổng tiến độ / accuracy | CODED |
| Accuracy theo chủ đề | CODED |
| Mastered / due count | CODED |
| Critical progress | CODED |
| Weakest questions | CODED |
| Exam history / pass rate / average score | CODED |
| Dashboard đọc SQLite | CODED |

## Settings

| Feature | Trạng thái |
| --- | --- |
| App/Tauri/identifier version info | CODED |
| Dataset version / validFrom / importedAt | CODED |
| Dataset / asset checksum | CODED |
| Local record counts | CODED |
| Check dataset update | CODED |
| Reset progress / bookmark / exam / all user state | CODED |
| Default exam license | CODED — Tauri Store |
| Daily review reminder preference | CODED — Store |
| Notification permission + test notification | CODED — LOCAL/DEVICE VERIFY |
| Native scheduled reminder | CODED — DEVICE VERIFY |
| Runtime diagnostics panel | CODED |

## Dataset tooling

| Stage | Trạng thái |
| --- | --- |
| Official source metadata | CODED |
| PDF downloader + SHA-256 | CODED |
| PyMuPDF extractor | CODED |
| Question parser | CODED |
| Underline answer resolver | CODED |
| Manual answer review | CODED |
| Safe image candidate extraction | CODED |
| Manual image review | CODED |
| Image verification gate | CODED |
| Promotion gate | CODED |
| Final production validator | CODED |
| Remote publisher | CODED |
| Chạy toàn bộ trên PDF thật | LOCAL DATA WORK |
| Calibrate underline threshold | DATA WORK |
| Manual unresolved answer verification | DATA WORK |
| Visual image verification | DATA WORK |
| Production `questions.json` / `assets.zip` | DATA BLOCKER |
| Production HTTPS endpoint | DEPLOYMENT BLOCKER |

## Windows Desktop production

| Feature | Trạng thái |
| --- | --- |
| App icon | CODED |
| Platform-specific `tauri.windows.conf.json` | CODED |
| NSIS bundle target | CODED |
| `release:check` version consistency | CODED |
| Local release command | CODED |
| Changelog / release checklist / update strategy | CODED |
| Automatic GitHub validation | DISABLED — workflow_dispatch only |
| Build installer | LOCAL VERIFY |
| Windows 10 install/upgrade | LOCAL VERIFY |
| Windows 11 install/upgrade | LOCAL VERIFY |
| Code signing | OPTIONAL / NOT CONFIGURED |

Local build:

```powershell
pnpm release:windows:local
```

## Android foundation

| Feature | Trạng thái |
| --- | --- |
| Responsive/bottom navigation | CODED |
| Platform-specific `tauri.android.conf.json` | CODED |
| minSdk 24 | CODED |
| AppData asset layout | CODED — DEVICE VERIFY |
| Tauri Store preferences | CODED — DEVICE VERIFY |
| Native Back handler stack | CODED — DEVICE VERIFY |
| Exam abandon confirmation | CODED — DEVICE VERIFY |
| Notification reminder service/UI | CODED — DEVICE VERIFY |
| Debug APK command | CODED — LOCAL VERIFY |
| Release APK command | CODED — LOCAL VERIFY |
| Release AAB command | CODED — LOCAL VERIFY |
| Android bring-up docs | CODED |
| Android Studio/JDK/SDK/NDK | LOCAL ENV PENDING |
| `tauri android init` | LOCAL VERIFY PENDING |
| SQL/FS/Store/Notification plugin runtime | DEVICE VERIFY PENDING |
| Signing/keystore | PENDING |
| Upgrade persistence | DEVICE VERIFY PENDING |

Xem `docs/ANDROID.md`.

## Blocker thực sự để có bản Desktop production

1. Chạy dataset pipeline trên PDF chính thức local.
2. Manual verify answer unresolved.
3. Manual/visual verify image candidates.
4. Tạo production `questions.json` + assets.
5. Chạy validator/publisher local.
6. Upload package lên HTTPS endpoint cố định.
7. Cấu hình `.env.production`.
8. Test first-run/offline/update bằng Tauri local; có thể dùng Settings → Runtime Diagnostics hỗ trợ kiểm tra.
9. Build NSIS và test install/upgrade Windows 10/11.

## Những gì chưa nên làm tiếp

Cloud sync vẫn **DEFERRED** cho đến khi bản offline production ổn định. Không tạo dữ liệu explanation/đáp án bằng suy đoán để lấp blocker production.
