# Changelog

Mọi thay đổi đáng chú ý của application binary được ghi tại đây. Dataset có version riêng và không dùng app changelog để thay thế provenance dữ liệu.

## [Unreleased]

### Added

- Remote production dataset bootstrap từ manifest cố định.
- Tách integrity metadata thành `sourceSha256` (PDF provenance), `contentSha256` (`questions.json`) và `assetSha256` (`assets.zip`).
- Migration an toàn cho metadata legacy từng lưu nhầm package checksum vào `sourceSha256`.
- SHA-256/size verification trước khi import.
- Hard download limits cho manifest, dataset JSON và asset archive.
- HTTPS-only remote URL policy, ngoại trừ localhost development.
- Manifest ↔ `questions.json` cross-check cho source PDF provenance.
- Remote `assets.zip` cache vào AppData với safe extraction và rollback nếu SQLite import thất bại.
- SQLite learning progress, mastery, bookmark và exam history.
- Learning catalog theo 6 chủ đề.
- Dedicated 60 câu điểm liệt và queue câu điểm liệt từng sai.
- Review engine: due / weak / wrong queues.
- Statistics: overall, categories, critical questions, exam history/pass rate.
- Dashboard đọc statistics từ SQLite.
- Exam Engine với config theo hạng/ngày hiệu lực, quota, timer và critical fail.
- Review chi tiết từng câu sau khi nộp bài thi.
- Settings: dataset metadata/checksum, reset local user data, default exam license.
- Native runtime/app version information trong Settings.
- Runtime Diagnostics kiểm tra SQLite, 600 câu, 60 critical, licenses, checksum, assets, Store và Notification.
- Dataset image extraction stage tránh crop vùng đáp án/underline.
- Manual image verification gate và local review workspace HTML.
- Remote dataset publisher tạo `questions.json`, `assets.zip`, `dataset-manifest.json`.
- Dataset status/checkpoint commands cho local data work.
- Windows NSIS installer target và local release command.
- Android platform config, native Back handling, Store preferences, notification reminder và APK/AAB local commands.
- Restore review reminder trên native startup mà không tự mở permission prompt.
- Production Content Security Policy.

### Changed

- Production questions/images không còn được bundle trong installer.
- Validation GitHub workflow chuyển sang manual-only; local development không tự chạy Actions.
- Dataset validator kiểm tra exact critical IDs, category ranges, licenses, answer shape, image paths, provenance và asset existence.
- Runtime importer cũng validate production contract trước khi ghi SQLite.
- Filesystem capability thu hẹp chỉ còn các command cần cho `$APPDATA/dataset-assets/**`.
- Daily review notification không yêu cầu `allowWhileIdle`.
- `packageManager` được pin `pnpm@10.34.5`; lockfile sẽ được sinh/kiểm tra local.

### Pending production verification

- `pnpm install` để sinh/cập nhật `pnpm-lock.yaml` và xác minh dependency graph local.
- Chạy frontend/Rust checks local sau các plugin/config mới.
- Chạy pipeline đầy đủ trên PDF 600 câu chính thức.
- Manual verification đáp án unresolved.
- Visual verification ảnh biển báo/sa hình.
- Publish production dataset endpoint và siết CSP `connect-src` về đúng host.
- First-run/update/offline test local.
- Windows 10/11 installer test.
- Android init/device/plugin/notification/APK/AAB verification.

## [0.1.0] - Development foundation

- Tauri 2 + React + TypeScript + Vite foundation.
- SQLite schema/repository contracts.
- Responsive desktop/mobile navigation foundation.
