# Changelog

Mọi thay đổi đáng chú ý của application binary được ghi tại đây. Dataset có version riêng và không dùng app changelog để thay thế provenance dữ liệu.

## [Unreleased]

### Added

- Remote production dataset bootstrap từ manifest cố định.
- SHA-256/size verification trước khi import.
- Remote `assets.zip` cache vào AppData với safe extraction.
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
- Dataset image extraction stage tránh crop vùng đáp án/underline.
- Remote dataset publisher tạo `questions.json`, `assets.zip`, `dataset-manifest.json`.
- Windows NSIS installer target và local release command.

### Changed

- Production questions/images không còn được bundle trong installer.
- Validation GitHub workflow chuyển sang manual-only; local development không tự chạy Actions.
- Dataset validator kiểm tra image path và asset existence.

### Pending production verification

- Chạy pipeline đầy đủ trên PDF 600 câu chính thức.
- Manual verification đáp án unresolved.
- Visual verification ảnh biển báo/sa hình.
- Publish production dataset endpoint.
- First-run/update/offline test local.
- Windows 10/11 installer test.

## [0.1.0] - Development foundation

- Tauri 2 + React + TypeScript + Vite foundation.
- SQLite schema/repository contracts.
- Responsive desktop/mobile navigation foundation.
