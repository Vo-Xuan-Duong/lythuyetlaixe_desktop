# Changelog

Mọi thay đổi đáng chú ý của application binary được ghi tại đây. Dataset có version riêng và không dùng app changelog để thay thế provenance dữ liệu.

## [Unreleased]

### Added

- Remote production bootstrap cho hai dataset độc lập: `VN_GPLX_600` và `VN_TRAFFIC_SIGNS`.
- SQLite migration v2 với `traffic_sign_metadata` và `traffic_signs`.
- Tách integrity metadata questions thành `sourceSha256`, `contentSha256`, `assetSha256` và migration metadata legacy.
- Traffic-sign canonical provenance từ đúng 5 phần Công báo Chính phủ của QCVN 41:2024/BGTVT; PDF ghép có `combinedSha256` riêng.
- Traffic-sign source downloader/verifier, candidate text/image extraction, manual-review workspace, candidate selection và manual QCVN crop.
- Per-sign provenance: source section/pages/reviewer/time.
- Per-image provenance: source bundle/page/crop/method/processed asset.
- Traffic-sign validator/publisher/runtime importer với cùng production trust contract.
- Traffic-sign catalog UI: 5 nhóm, search, filter, pagination, detail và AppData images.
- Hai AppData asset roots và bootstrap/update/self-heal độc lập.
- Shared SQLite write queue cho importer/progress/exam/settings mutations.
- SHA-256/size/count verification trước remote import.
- Hard download limits, HTTPS-only production URL policy và same-origin payload rule.
- Asset ZIP safe extraction + rollback nếu SQLite import thất bại.
- SQLite learning progress, mastery, bookmark và exam history.
- Learning catalog theo 6 chủ đề.
- Dedicated 60 câu điểm liệt và queue câu điểm liệt từng sai.
- Review engine: due / weak / wrong queues.
- Statistics: overall, categories, critical questions, exam history/pass rate.
- Dashboard đọc statistics từ SQLite.
- Exam Engine với config theo hạng/ngày hiệu lực, quota, timer và critical fail.
- Review chi tiết từng câu sau khi nộp bài thi.
- Settings cho hai dataset, reset local user data, default exam license, native app/runtime info.
- Runtime Diagnostics cho SQLite/questions/traffic-signs/assets/Store/Notification.
- Safe question image extraction, manual image verification gate và local review workspace.
- Versioned immutable publishers dưới `releases/<version>/` cho cả questions và traffic signs.
- Dataset status/checkpoint commands cho local data work.
- `project:status` và strict `release:candidate:check` static preflight.
- Windows NSIS installer target và local release command.
- Android platform config, native Back handling, Store preferences, notification reminder và APK/AAB local commands.
- Restore review reminder trên native startup mà không tự mở permission prompt.
- Production Content Security Policy foundation.

### Changed

- Production questions/images không còn bundle trong installer.
- Questions và traffic-sign dataset có manifest/version/checksum/cache riêng.
- Traffic-sign root manifest yêu cầu `sourcePartCount = 5`; runtime reject giá trị khác.
- Traffic-sign image/record production data phải có provenance đã verify, không chỉ file/field tồn tại.
- Validation GitHub workflow chuyển sang manual-only; push/PR không tự chạy Actions.
- Dataset validator kiểm tra exact critical IDs, category ranges, licenses, answer shape, image paths, provenance và asset existence.
- Runtime importers validate production contracts trước khi ghi SQLite.
- Filesystem capability thu hẹp vào đúng hai AppData dataset asset roots.
- Daily review notification không yêu cầu `allowWhileIdle`.
- `packageManager` được pin `pnpm@10.34.5`; lockfiles phải được sinh/xác minh local.

### Pending production verification

- `pnpm install` để sinh/xác minh `pnpm-lock.yaml`; Cargo local để sinh/xác minh `src-tauri/Cargo.lock`.
- Frontend/Vitest/data/Rust checks local.
- Chạy pipeline đầy đủ trên PDF 600 câu CSGT và hoàn tất manual answer/image review.
- Chạy pipeline 5-part QCVN traffic signs và hoàn tất manual record/image review.
- Tạo/publish hai production packages.
- Cloudflare R2 custom domain + CORS + `.env.production`.
- Siết CSP `connect-src` về exact production origin.
- First-run/update/offline/self-heal test cho hai dataset.
- Windows 10/11 NSIS install/upgrade test.
- Android init/device/plugin/notification/APK/AAB verification.

## [0.1.0] - Development foundation

- Tauri 2 + React + TypeScript + Vite foundation.
- SQLite schema/repository contracts.
- Responsive desktop/mobile navigation foundation.
