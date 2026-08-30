# Kế hoạch phát triển — Lý Thuyết Lái Xe Việt Nam

> Repository: `Vo-Xuan-Duong/lythuyetlaixe_desktop`
>
> Chiến lược: **Windows Desktop trước → Android sau**, cùng một kiến trúc Tauri 2 để tái sử dụng domain, data layer và phần lớn UI.
>
> Cập nhật trạng thái: **30/08/2026**.

## 1. Mục tiêu sản phẩm

Ứng dụng phải hỗ trợ:

- Học toàn bộ 600 câu theo chủ đề.
- Học riêng 60 câu điểm liệt.
- Thi thử theo cấu hình hạng GPLX và thời gian hiệu lực của quy định.
- Lưu câu sai, bookmark, lịch sử thi và tiến độ học.
- Xếp hạng câu yếu và ôn tập lại.
- Hoạt động offline ở bản đầu tiên.
- Dataset có version, provenance và validator.
- Mở rộng Android mà không viết lại business logic.

## 2. Source of truth

Dữ liệu production chỉ lấy từ tài liệu chính thức của **Cục Cảnh sát giao thông — Bộ Công an**.

Nguồn hiện hành được ghi tại:

- `docs/DATA_SOURCE.md`
- `data/source/source-manifest.json`

Nguyên tắc:

1. Không lấy app/web bên thứ ba làm nguồn đáp án.
2. Không dùng AI để đoán đáp án chính thức.
3. Dataset chưa qua validator không được import vào production database.
4. Mỗi dataset phải có `version`, `validFrom`, nguồn tài liệu và số lượng câu điểm liệt.
5. Khi quy định thay đổi, tạo dataset version mới thay vì ghi đè lịch sử.

## 3. Stack

### Application shell

- Tauri 2.
- Rust.

### Frontend

- React 19.
- TypeScript.
- Vite.
- Responsive desktop/mobile từ đầu.

### Database

- SQLite.
- `@tauri-apps/plugin-sql`.
- Migration quản lý từ Rust/Tauri.

### Package manager

- pnpm.

## 4. Kiến trúc

```text
React UI
   |
Application / use cases
   |
Domain
   |
Repository contracts
   |
Infrastructure
   |-- SQLite repositories
   |-- Tauri APIs
```

Business logic không được đặt trực tiếp trong component React.

Các phần phải tái sử dụng khi chuyển Desktop → Android:

- Question/Answer models.
- ExamConfig và exam engine.
- Progress/mastery logic.
- Review logic.
- Repository interfaces.
- SQLite schema.
- Dataset contract.

Platform-specific chỉ nên gồm:

- native file/path;
- window behavior;
- notification;
- permission;
- mobile lifecycle.

## 5. Cấu trúc repository

```text
.
├── KE_HOACH.md
├── README.md
├── package.json
├── data/
│   ├── source/
│   └── processed/
├── docs/
│   └── DATA_SOURCE.md
├── src/
│   ├── app/
│   ├── components/
│   ├── data/
│   ├── domain/
│   │   ├── entities/
│   │   ├── repositories/
│   │   └── services/
│   ├── features/
│   ├── infrastructure/
│   │   ├── database/
│   │   └── repositories/
│   └── styles/
├── src-tauri/
│   ├── capabilities/
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
└── tools/
    └── dataset/
```

## 6. Database schema

Foundation migration hiện có các bảng:

- `dataset_metadata`
- `categories`
- `questions`
- `answers`
- `question_license_types`
- `user_progress`
- `bookmarks`
- `exam_sessions`
- `exam_answers`

Schema thay đổi trong tương lai phải đi qua migration.

## 7. Dataset contract

Dataset chuẩn hóa dự kiến:

```json
{
  "dataset": "VN_GPLX_600",
  "version": "2025.06",
  "validFrom": "2025-06-01",
  "questions": [
    {
      "id": 1,
      "category": "GENERAL_RULES",
      "content": "...",
      "image": null,
      "critical": false,
      "licenses": ["B", "C1", "C"],
      "sourceVersion": "2025.06",
      "answers": [
        { "key": "A", "content": "...", "correct": true },
        { "key": "B", "content": "...", "correct": false }
      ]
    }
  ]
}
```

Validator phải kiểm tra tối thiểu:

- đủ 600 câu;
- ID 1 → 600 không thiếu/trùng;
- đúng nhóm câu theo khoảng;
- đủ 60 câu điểm liệt;
- có đáp án đúng;
- answer key không trùng;
- license không rỗng;
- source version có mặt;
- image path tồn tại khi bật kiểm tra ảnh.

## 8. Exam engine

Không hard-code cấu hình thi trong UI.

```ts
interface ExamConfig {
  licenseType: string;
  questionCount: number;
  durationSeconds: number;
  passingScore: number;
  criticalQuestionCount: number;
  failOnWrongCriticalQuestion: boolean;
  validFrom: string;
  validTo?: string;
}
```

## 9. Responsive / Android strategy

Breakpoints tham khảo:

- `< 640px`: mobile.
- `640–1023px`: tablet.
- `>= 1024px`: desktop.

Desktop dùng sidebar/không gian nhiều cột; mobile dùng bottom navigation/single column.

Không rải check `platform === windows` trong domain/application layer.

---

# 10. Roadmap và trạng thái

## Phase 0 — Khởi tạo dự án

- [x] Tạo `KE_HOACH.md`.
- [x] Scaffold Tauri 2 + React + TypeScript + Vite.
- [x] Thiết lập pnpm scripts.
- [x] Thiết lập Rust/Tauri config.
- [x] Capability tối thiểu.
- [x] README hướng dẫn chạy.
- [x] Workflow validation frontend/Rust.

**Trạng thái:** hoàn thành foundation.

## Phase 1 — UI và domain foundation

- [x] App Shell desktop.
- [x] Sidebar/navigation desktop.
- [x] Bottom navigation responsive cho mobile layout.
- [x] Dashboard.
- [x] Domain model cho Question/Answer/Category/Progress.
- [x] Domain model cho ExamConfig.
- [x] Dữ liệu demo để phát triển UI độc lập dataset production.
- [x] Màn hình học câu hỏi demo + chọn/chấm đáp án.
- [x] Route/state cho Điểm liệt, Thi thử, Câu sai, Bookmark, Thống kê, Cài đặt.

**Trạng thái:** foundation hoàn thành; feature thật sẽ được thay dần cho placeholder.

## Phase 2 — SQLite foundation

- [x] Tích hợp `@tauri-apps/plugin-sql`.
- [x] Tạo initial migration.
- [x] Tạo repository contracts.
- [x] Tạo `SqliteQuestionRepository`.
- [x] Tạo `SqliteProgressRepository`.
- [ ] Seed metadata/category từ dataset production.
- [ ] Wire màn hình học vào QuestionRepository.
- [ ] Wire progress/bookmark vào SQLite.
- [ ] Lưu/lấy lịch sử thi qua repository riêng.
- [ ] Integration tests cho migration/repository.

**Trạng thái:** đang thực hiện.

## Phase 3 — Data pipeline 600 câu

- [x] Xác định nguồn chính thức.
- [x] Tạo source manifest/version.
- [x] Viết tài liệu provenance.
- [x] Tạo validator foundation.
- [ ] Tải/lưu bản nguồn dùng cho extraction.
- [ ] Xây PDF text extractor.
- [ ] Extract hình ảnh.
- [ ] Parse câu hỏi/đáp án.
- [ ] Xác định đáp án đúng từ tài liệu chính thức.
- [ ] Map 60 câu điểm liệt.
- [ ] Chuẩn hóa `questions.json`.
- [ ] Chạy validator đủ 600 câu.
- [ ] Manual verification các câu parser không chắc chắn.
- [ ] Import dataset validated vào SQLite.

**Definition of Done:** validator xanh, đủ 600 ID, đủ 60 câu điểm liệt, đáp án/hình ảnh được kiểm chứng.

## Phase 4 — Learning mode

- [ ] Danh sách 6 chủ đề.
- [ ] Danh sách câu theo chủ đề.
- [ ] Màn hình câu hỏi dùng repository thật.
- [ ] Previous/Next.
- [ ] Chấm đáp án.
- [ ] Explanation.
- [ ] Bookmark.
- [ ] Lưu correct/wrong/progress.
- [ ] Filter chưa học/đã học/hay sai.

## Phase 5 — 60 câu điểm liệt

- [ ] Trang riêng.
- [ ] Tiến độ riêng.
- [ ] Luyện toàn bộ 60 câu.
- [ ] Ôn lại câu điểm liệt sai.

## Phase 6 — Exam engine

- [ ] Exam config theo hạng GPLX và thời gian hiệu lực.
- [ ] Question selection engine.
- [ ] Timer.
- [ ] Question navigator.
- [ ] Submit/chấm điểm.
- [ ] Critical fail rule.
- [ ] Result breakdown.
- [ ] Lưu exam history.

## Phase 7 — Review engine

- [ ] Trang câu sai.
- [ ] Mastery calculation.
- [ ] Weak-question ranking.
- [ ] Review queue.
- [ ] Spaced repetition cơ bản.

## Phase 8 — Statistics

- [ ] Tổng tiến độ.
- [ ] Accuracy theo chủ đề.
- [ ] Câu yếu nhất.
- [ ] Lịch sử thi.
- [ ] Pass rate.

## Phase 9 — Desktop production

- [ ] App icon.
- [ ] Windows installer.
- [ ] CI tối ưu với lockfile/cache.
- [ ] GitHub Action manual release.
- [ ] Versioning/release notes.
- [ ] Update strategy.
- [ ] Test Windows 10/11.

## Phase 10 — Android

- [ ] Cài Android Studio/JDK/SDK/NDK cho Tauri mobile.
- [ ] `tauri android init`.
- [ ] Xác minh SQLite/plugin behavior trên Android.
- [ ] Mobile navigation hoàn chỉnh.
- [ ] Touch/back navigation.
- [ ] Storage/path Android.
- [ ] Notification ôn tập.
- [ ] APK debug.
- [ ] AAB release.
- [ ] Device/responsive testing.

## Phase 11 — Cloud sync (tùy chọn)

Chỉ làm sau khi offline app production ổn định.

- [ ] Account.
- [ ] Sync progress.
- [ ] Sync bookmark.
- [ ] Dataset update service.
- [ ] Conflict resolution.

---

## 11. Testing strategy

### Unit tests

Ưu tiên:

- exam scoring;
- critical fail rule;
- question selection;
- progress/mastery;
- dataset validation.

### Integration tests

- migration;
- SQLite repositories;
- dataset import.

### UI tests

- navigation;
- answer selection;
- submit exam;
- responsive layout.

## 12. Git workflow

- `main`: phiên bản ổn định.
- `feature/*`: tính năng.
- `fix/*`: sửa lỗi.
- Phase lớn phát triển qua PR.

Conventional Commits:

```text
feat: add learning dashboard
fix: correct exam scoring
chore: initialize tauri project
docs: update development plan
```

## 13. Trạng thái hiện tại

```text
Target hiện tại : Windows Desktop
Target tương lai: Android
Phase 0         : DONE
Phase 1         : FOUNDATION DONE
Phase 2         : IN PROGRESS
Phase 3         : DATA FOUNDATION IN PROGRESS
Next focus      : hoàn thiện data pipeline → validated 600-question dataset
```
