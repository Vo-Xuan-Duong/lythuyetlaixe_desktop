# Trạng thái triển khai hiện tại

> Branch phát triển hiện tại: `local-dev/remaining-features`
>
> Quy ước: **CODED** = đã triển khai code nhưng chưa mặc định coi là đã test runtime. **LOCAL VERIFY** = cần chạy/kiểm tra trên máy phát triển. GitHub Actions không tự chạy.

## Application core

| Khu vực | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tauri 2 + React + TypeScript | CODED | Desktop foundation hoàn chỉnh |
| SQLite schema/migration | CODED | Dataset, progress, bookmarks, exam history |
| Remote dataset bootstrap | CODED | Manifest → questions → verify → SQLite |
| Remote image assets | CODED | assets.zip → SHA-256 → AppData → asset protocol |
| Offline fallback | CODED | Có local dataset thì mất mạng vẫn dùng local |
| Immutable dataset version | CODED | Cùng version nhưng checksum đổi sẽ không overwrite local |

## Learning

| Feature | Trạng thái |
| --- | --- |
| Danh sách 600 câu / 6 chủ đề | CODED |
| Filter chưa học / đã học / sai / bookmark | CODED |
| Chấm đáp án | CODED |
| Lưu progress SQLite | CODED |
| Mastery 0–4 | CODED |
| Spaced review `nextReviewAt` | CODED |
| Bookmark | CODED |
| Previous / Next | CODED |
| Review sequence riêng | CODED |
| Explanation | DATA BLOCKER — model/UI hỗ trợ nhưng cần dữ liệu tin cậy |

## 60 câu điểm liệt

| Feature | Trạng thái |
| --- | --- |
| Danh sách riêng | CODED |
| Tiến độ đã học / mastery 4 | CODED |
| Luyện toàn bộ | CODED |
| Chế độ chỉ câu điểm liệt từng sai | CODED |
| Điều hướng trong đúng critical sequence | CODED |

## Review engine

| Feature | Trạng thái |
| --- | --- |
| Queue đến hạn | CODED |
| Xếp hạng câu yếu | CODED |
| Queue đã từng sai | CODED |
| Ưu tiên mastery / accuracy / wrong count | CODED |
| Mở LearningSession từ queue | CODED |

## Exam

| Feature | Trạng thái |
| --- | --- |
| ExamConfig theo hạng + ngày hiệu lực | CODED |
| Question quota selector | CODED |
| Timer | CODED |
| Navigator | CODED |
| Critical fail | CODED |
| Chấm điểm | CODED |
| Lưu exam session + answers | CODED |
| Kết quả tổng hợp | CODED |
| Review chi tiết từng câu | CODED |
| Hiển thị lựa chọn / đáp án đúng / critical / explanation | CODED |
| Hạng GPLX mặc định | CODED — localStorage |
| End-to-end với 600 câu thật | LOCAL VERIFY / DATA BLOCKER |

## Statistics / Dashboard

| Feature | Trạng thái |
| --- | --- |
| Tổng tiến độ | CODED |
| Accuracy tổng | CODED |
| Accuracy theo chủ đề | CODED |
| Mastered | CODED |
| Due review | CODED |
| Critical progress | CODED |
| Weakest questions | CODED |
| Exam history | CODED |
| Pass rate | CODED |
| Average exam score | CODED |
| Dashboard đọc SQLite | CODED |

## Settings

| Feature | Trạng thái |
| --- | --- |
| Dataset version / validFrom / importedAt | CODED |
| Dataset / asset checksum | CODED |
| Local record counts | CODED |
| Check dataset update | CODED |
| Reset learning progress | CODED |
| Reset bookmarks | CODED |
| Reset exam history | CODED |
| Reset all user state (không xóa dataset) | CODED |
| Default exam license | CODED |

## Dataset tooling

| Stage | Trạng thái |
| --- | --- |
| Official source metadata | CODED |
| PDF downloader + SHA-256 | CODED |
| PyMuPDF extractor | CODED |
| Question parser | CODED |
| Underline answer resolver | CODED |
| Manual answer review | CODED |
| Safe question image extraction | CODED |
| Image review report | CODED |
| Promotion gate | CODED |
| Production validator | CODED |
| Remote publisher | CODED |
| Chạy toàn bộ trên PDF thật | LOCAL VERIFY |
| Calibrate underline threshold | DATA WORK |
| Manual unresolved answer verification | DATA WORK |
| Visual image verification | DATA WORK |
| Production `questions.json` | DATA BLOCKER |
| Production `assets.zip` | DATA BLOCKER |
| Production HTTPS endpoint | DEPLOYMENT BLOCKER |

## Windows Desktop production

| Feature | Trạng thái |
| --- | --- |
| App icon | CODED |
| NSIS bundle target | CODED |
| Local release command | CODED |
| Release checklist | CODED |
| Auto GitHub validation | DISABLED — manual-only workflow |
| Build installer | LOCAL VERIFY |
| Windows 10 test | LOCAL VERIFY |
| Windows 11 test | LOCAL VERIFY |
| Code signing | OPTIONAL / NOT CONFIGURED |

Local build command:

```powershell
pnpm release:windows:local
```

Xem `docs/LOCAL_RELEASE.md`.

## Android

Chưa bắt đầu platform bring-up. Domain, SQLite contract, remote dataset contract và responsive foundation đã được giữ platform-neutral để dùng lại.

Còn cần:

- Android Studio/JDK/SDK/NDK;
- `tauri android init`;
- kiểm tra plugin SQL/FS trên Android;
- back navigation/mobile lifecycle;
- storage path thực tế;
- notification ôn tập;
- APK/AAB;
- device testing.

## Blocker thực sự để có bản Desktop dùng được

Theo thứ tự:

1. Chạy dataset pipeline trên PDF chính thức bằng máy local.
2. Manual verify các đáp án unresolved.
3. Kiểm tra/correct image extraction.
4. Tạo `data/processed/questions.json` + assets production.
5. Publish package lên HTTPS endpoint cố định.
6. Cấu hình `.env.production` trỏ tới endpoint đó.
7. Test first-run, offline và dataset update trên Tauri local.
8. Build NSIS và test cài/gỡ Windows.

Không nên thêm cloud sync hoặc Android trước khi các bước trên ổn định, trừ khi cần phát triển song song có chủ đích.
