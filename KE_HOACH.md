# Kế hoạch phát triển — Lý Thuyết Lái Xe Việt Nam

> Repository: `Vo-Xuan-Duong/lythuyetlaixe_desktop`
>
> Mục tiêu: xây dựng ứng dụng học và thi thử bộ 600 câu lý thuyết lái xe Việt Nam, ưu tiên Windows Desktop trước và mở rộng Android sau bằng cùng kiến trúc Tauri 2.

## 1. Mục tiêu sản phẩm

Ứng dụng phải giúp người học:

- Học toàn bộ 600 câu theo nhóm/chủ đề.
- Học riêng 60 câu điểm liệt.
- Làm bài thi thử theo cấu hình hạng giấy phép lái xe.
- Lưu câu sai, câu đánh dấu và lịch sử học.
- Theo dõi tiến độ và mức độ ghi nhớ.
- Hoạt động offline ở phiên bản đầu tiên.
- Có dữ liệu được version hóa để cập nhật khi bộ câu hỏi/quy định thay đổi.
- Có thể phát triển tiếp lên Android mà không viết lại business logic.

## 2. Nguồn dữ liệu

Nguồn dữ liệu chuẩn phải lấy từ tài liệu chính thức của Cục Cảnh sát giao thông, không lấy dữ liệu của ứng dụng bên thứ ba làm source of truth.

Bộ dữ liệu phải chứa tối thiểu:

- ID câu hỏi.
- Nội dung câu hỏi.
- Danh sách đáp án.
- Đáp án đúng.
- Hình ảnh nếu có.
- Nhóm/chủ đề.
- Cờ `isCritical` cho câu điểm liệt.
- Hạng GPLX áp dụng.
- Phiên bản dataset và ngày hiệu lực.
- Nguồn tham chiếu.

Dữ liệu gốc được chuẩn hóa thành JSON và sau đó import vào SQLite.

## 3. Công nghệ

### Desktop / Mobile shell

- Tauri 2.
- Rust cho native layer.

### Frontend

- React 19.
- TypeScript.
- Vite.

### State và kiến trúc frontend

Giai đoạn đầu ưu tiên React hooks/context nhỏ gọn, chưa thêm state library nếu chưa cần thiết. Khi state liên feature tăng mạnh mới đánh giá Zustand hoặc tương đương.

### Database

- SQLite.
- `@tauri-apps/plugin-sql`.
- Migration chạy từ Tauri/Rust.

### Package manager

- pnpm.

## 4. Nguyên tắc kiến trúc

Không đặt business logic trực tiếp trong component React.

```text
UI (React)
   |
Application / Use cases
   |
Domain
   |
Repository interfaces
   |
Infrastructure
   |-- SQLite
   |-- Tauri APIs
```

Các phần phải tái sử dụng được khi chuyển Windows -> Android:

- Domain models.
- Question engine.
- Exam engine.
- Progress calculation.
- Review logic.
- Repository contracts.
- SQLite schema.
- Dataset format.

Chỉ các phần sau được phép phụ thuộc platform khi cần:

- File system.
- Window behavior.
- Notifications.
- Native permissions.
- Mobile lifecycle.

## 5. Cấu trúc thư mục mục tiêu

```text
.
├── KE_HOACH.md
├── README.md
├── package.json
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── dashboard/
│   │   ├── learning/
│   │   ├── critical-questions/
│   │   ├── exam/
│   │   ├── mistakes/
│   │   ├── bookmarks/
│   │   ├── progress/
│   │   └── settings/
│   ├── domain/
│   │   ├── entities/
│   │   ├── repositories/
│   │   └── services/
│   ├── infrastructure/
│   │   ├── database/
│   │   └── repositories/
│   ├── data/
│   └── styles/
├── src-tauri/
│   ├── src/
│   ├── capabilities/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tools/
│   └── dataset/
├── public/
│   └── question-images/
└── docs/
```

## 6. Schema dữ liệu dự kiến

### `dataset_metadata`

- `key`
- `value`

### `categories`

- `id`
- `code`
- `name`
- `sort_order`

### `questions`

- `id`
- `category_id`
- `content`
- `image_path`
- `is_critical`
- `source_version`

### `answers`

- `id`
- `question_id`
- `answer_key`
- `content`
- `is_correct`

### `question_license_types`

- `question_id`
- `license_type`

### `user_progress`

- `question_id`
- `attempt_count`
- `correct_count`
- `wrong_count`
- `mastery`
- `last_answered_at`
- `next_review_at`

### `bookmarks`

- `question_id`
- `created_at`

### `exam_sessions`

- `id`
- `license_type`
- `question_count`
- `score`
- `passed`
- `critical_failed`
- `started_at`
- `completed_at`

### `exam_answers`

- `exam_session_id`
- `question_id`
- `selected_answer_key`
- `is_correct`

## 7. Dataset contract

Dataset JSON phải có cấu trúc ổn định và độc lập UI.

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
      "answers": [
        { "key": "A", "content": "...", "correct": true },
        { "key": "B", "content": "...", "correct": false }
      ]
    }
  ]
}
```

Không hard-code đáp án, số câu thi, điểm đạt hoặc thời gian thi vào component.

## 8. Exam engine

Exam engine phải đọc cấu hình thay vì hard-code:

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

Điều này cho phép thay đổi quy định mà không phải viết lại engine.

## 9. Responsive và Android

Desktop là mục tiêu triển khai đầu tiên nhưng frontend phải responsive từ đầu.

Breakpoints tham khảo:

- Mobile: `< 640px`.
- Tablet: `640px - 1023px`.
- Desktop: `>= 1024px`.

Không rải `platform === windows` trong business logic.

Android phase sử dụng Tauri 2 mobile target và tái sử dụng frontend/domain/database hiện tại.

## 10. Roadmap

### Phase 0 — Khởi tạo dự án

- [x] Tạo kế hoạch phát triển.
- [ ] Scaffold Tauri 2 + React + TypeScript + Vite.
- [ ] Thiết lập pnpm scripts.
- [ ] Thiết lập Rust/Tauri config.
- [ ] Thiết lập capability tối thiểu.
- [ ] Tạo README hướng dẫn chạy.

**Definition of Done:** `pnpm install`, `pnpm tauri dev` có cấu trúc hợp lệ và app có thể khởi động trên Windows khi môi trường Tauri đã đủ prerequisite.

### Phase 1 — Foundation UI và domain

- [ ] Tạo App Shell desktop.
- [ ] Sidebar/navigation.
- [ ] Dashboard.
- [ ] Domain model cho Question, Answer, Category, Progress.
- [ ] Tạo dữ liệu demo để UI có thể phát triển độc lập với dataset chính thức.
- [ ] Responsive shell cho hướng Android.

**Definition of Done:** người dùng có thể điều hướng giữa Dashboard, Học 600 câu, Câu điểm liệt, Thi thử, Câu sai, Đánh dấu, Thống kê và Cài đặt.

### Phase 2 — SQLite foundation

- [ ] Tích hợp `@tauri-apps/plugin-sql`.
- [ ] Tạo migrations.
- [ ] Tạo repository layer.
- [ ] Seed metadata/category.
- [ ] Lưu progress.
- [ ] Lưu bookmark.
- [ ] Lưu lịch sử thi.

**Definition of Done:** đóng/mở app không làm mất dữ liệu học.

### Phase 3 — Data pipeline 600 câu

- [ ] Lưu tài liệu nguồn và metadata nguồn.
- [ ] Xây parser/extractor.
- [ ] Extract text và hình ảnh.
- [ ] Chuẩn hóa JSON.
- [ ] Xác định đáp án đúng.
- [ ] Đánh dấu 60 câu điểm liệt.
- [ ] Validator đảm bảo đủ 600 câu.
- [ ] Validator ảnh/đáp án/category.
- [ ] Import dataset vào SQLite.

**Definition of Done:** dataset được validator xác nhận đủ 600 câu, ID không trùng/không thiếu và mỗi câu có đáp án đúng hợp lệ.

### Phase 4 — Learning mode

- [ ] Danh sách chương/chủ đề.
- [ ] Danh sách câu hỏi.
- [ ] Màn hình làm từng câu.
- [ ] Chấm đáp án.
- [ ] Hiển thị giải thích nếu dataset có.
- [ ] Previous/Next.
- [ ] Bookmark.
- [ ] Ghi nhận correct/wrong.
- [ ] Bộ lọc chưa học/đã học/hay sai.

### Phase 5 — 60 câu điểm liệt

- [ ] Trang riêng.
- [ ] Tiến độ riêng.
- [ ] Chế độ luyện toàn bộ 60 câu.
- [ ] Ôn câu điểm liệt làm sai.

### Phase 6 — Exam engine

- [ ] Exam config theo hạng GPLX và thời gian hiệu lực.
- [ ] Sinh đề.
- [ ] Timer.
- [ ] Question navigator.
- [ ] Submit.
- [ ] Chấm điểm.
- [ ] Fail khi sai câu điểm liệt nếu config yêu cầu.
- [ ] Result breakdown.
- [ ] Lưu lịch sử.

### Phase 7 — Review engine

- [ ] Trang câu sai.
- [ ] Mức mastery.
- [ ] Weak-question ranking.
- [ ] Review queue.
- [ ] Spaced repetition cơ bản.

### Phase 8 — Statistics

- [ ] Tổng tiến độ.
- [ ] Độ chính xác theo chủ đề.
- [ ] Câu yếu nhất.
- [ ] Lịch sử thi.
- [ ] Pass rate.

### Phase 9 — Desktop production

- [ ] App icon.
- [ ] Installer Windows.
- [ ] GitHub Actions CI.
- [ ] GitHub Actions manual release.
- [ ] Versioning.
- [ ] Update strategy.
- [ ] Backup/export progress nếu cần.
- [ ] Test trên Windows 10/11.

### Phase 10 — Android

- [ ] Khởi tạo Android target Tauri 2.
- [ ] Kiểm tra plugin compatibility.
- [ ] Mobile navigation.
- [ ] Touch targets.
- [ ] Back navigation.
- [ ] Android storage/path.
- [ ] Notification ôn tập.
- [ ] APK debug.
- [ ] AAB release.
- [ ] Test nhiều kích thước màn hình.

### Phase 11 — Cloud sync (tùy chọn)

Chỉ triển khai sau khi offline app ổn định.

- [ ] Account.
- [ ] Sync progress.
- [ ] Sync bookmarks.
- [ ] Dataset update service.
- [ ] Conflict resolution.

## 11. Testing strategy

### Unit tests

Ưu tiên test:

- Exam scoring.
- Critical-question fail rule.
- Question selection.
- Progress calculation.
- Mastery calculation.
- Dataset validation.

### Integration tests

- SQLite repositories.
- Migration.
- Import dataset.

### UI tests

- Navigation.
- Answer selection.
- Exam submission.
- Responsive layout.

## 12. Git workflow

- `main`: phiên bản ổn định.
- `feature/*`: tính năng.
- `fix/*`: sửa lỗi.
- PR trước khi merge các phase lớn.

Commit nên theo Conventional Commits:

```text
feat: add learning dashboard
fix: correct exam scoring
chore: initialize tauri project
docs: update development plan
```

## 13. Quy tắc phát triển

1. Không đưa dữ liệu 600 câu chưa kiểm chứng vào production.
2. Không dùng AI để tự suy đoán đáp án chính thức.
3. Không hard-code quy định thi vào UI.
4. Tất cả schema thay đổi qua migration.
5. Dataset luôn có version.
6. Feature phải chạy offline trước khi cân nhắc cloud.
7. Desktop-first nhưng không tạo dependency khiến Android phải viết lại core.
8. Mỗi phase chỉ đánh dấu hoàn thành khi đạt Definition of Done.

## 14. Trạng thái hiện tại

- Project status: **Initialization**.
- Primary target: **Windows Desktop**.
- Future target: **Android**.
- Current phase: **Phase 0 — Khởi tạo dự án**.
