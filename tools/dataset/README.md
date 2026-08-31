# Dataset pipeline

Pipeline này biến PDF chính thức thành dataset đã kiểm chứng để import SQLite và phát hành qua remote storage.

## 1. Cài dependency tooling

```powershell
python -m pip install -r tools/dataset/requirements.txt
```

## 2. Tải tài liệu nguồn

```powershell
pnpm dataset:download
```

PDF nằm dưới `data/raw/` và không commit. Nếu máy chủ CSGT tải chậm, có thể tải thủ công và đặt đúng tên:

```text
data/raw/bo-600-cau-hoi.pdf
data/raw/cong-van-2262-csgt-p5.pdf
```

## 3. Extract PDF

```powershell
pnpm dataset:extract
```

Kết quả:

```text
data/raw/extracted/pages.json
data/raw/extracted/images/*
```

`pages.json` giữ plain text, span/bbox/origin/baseline, font metadata, image placements và vector drawings. Vector layer bắt buộc được giữ vì đáp án đúng trong PDF chính thức được thể hiện bằng underline.

## 4. Parse 600 candidate questions

```powershell
pnpm dataset:parse
```

Kết quả:

```text
data/raw/questions.unverified.json
```

Parser không đoán đáp án; `correct` vẫn là `null`.

## 5. Resolve underline geometry

```powershell
pnpm dataset:resolve
```

Resolver dựng lại answer lines, tính overlap với vector underline và chỉ resolve khi score/margin vượt ngưỡng.

Kết quả:

```text
data/raw/questions.resolved.json
data/raw/answer-review.json
```

Nếu confidence thấp hoặc ambiguous, câu giữ `correct: null` và `needsVerification=true`.

## 6. Manual answer review

Copy:

```text
data/source/manual-answer-review.example.json
```

thành:

```text
data/source/manual-answer-review.json
```

Chỉ ghi đáp án sau khi đối chiếu trực tiếp PDF chính thức, ví dụ:

```json
{
  "questionId": 123,
  "answerKey": "B",
  "sourcePage": 41,
  "reviewer": "manual-review",
  "verifiedAt": "2026-08-31",
  "note": "Verified directly against official PDF underline"
}
```

Áp dụng:

```powershell
pnpm dataset:review
```

Kết quả:

```text
data/raw/questions.reviewed.json
```

Manual answer review lưu provenance và không âm thầm overwrite geometry result mâu thuẫn nếu không dùng explicit override option.

## 7. Extract image candidates an toàn

```powershell
pnpm dataset:images
```

`extract_question_images.py` không crop toàn bộ question block. Nó chỉ xét graphics nằm giữa question header và answer đầu tiên để tránh đưa answer text/underline vào asset.

Kết quả:

```text
data/raw/questions.with-images.json
data/raw/image-review.json
data/processed/assets/images/qNNN.png
```

Geometry auto-detection chỉ tạo **candidate**. Một crop được auto-render vẫn chưa mặc định là production-approved.

## 8. Manual image review

Copy:

```text
data/source/manual-image-review.example.json
```

thành:

```text
data/source/manual-image-review.json
```

Các action hỗ trợ:

- `accept-existing`: xác nhận asset auto-render hiện tại;
- `accept-candidate`: chọn một geometry candidate từ report;
- `crop`: chỉ định source page + crop sau khi xem PDF;
- `none`: xác nhận câu thực sự không cần ảnh.

Tất cả câu có image, câu extraction ambiguous và toàn bộ `ROAD_SIGNS`/`SITUATIONS` đều phải có quyết định explicit trước production.

Áp dụng:

```powershell
pnpm dataset:image-review
```

Kết quả:

```text
data/raw/questions.images-reviewed.json
```

Dataset còn `imageNeedsVerification=true` sẽ bị promotion từ chối.

## 9. Review workspace HTML

Sau khi resolver/image extractor đã tạo report:

```powershell
pnpm dataset:review-report
```

Tool tạo:

```text
data/raw/review-workspace.html
```

Trang HTML offline hiển thị:

- answer unresolved;
- parsed answer contents;
- underline scores;
- source page;
- image-sensitive questions;
- image extraction reason;
- crop candidates;
- preview asset hiện có.

Đây là **read-only review workspace**. Nó không tự ghi quyết định và không thay thế PDF chính thức. Kết quả đã verify vẫn phải ghi vào `manual-answer-review.json` / `manual-image-review.json` để giữ provenance.

## 10. Promotion gate

```powershell
pnpm dataset:promote
```

Input mặc định:

```text
data/raw/questions.images-reviewed.json
```

Promotion từ chối nếu:

- không đủ đúng 600 câu;
- thiếu/trùng ID;
- còn parser warning;
- answer verification chưa xong;
- `correct` chưa phải boolean hoặc không có đúng 1 đáp án đúng;
- image verification stage chưa chạy;
- image verification unresolved > 0;
- bất kỳ câu nào còn `imageNeedsVerification=true`.

Kết quả:

```text
data/processed/questions.json
```

với `stage: production`.

## 11. Production validation

```powershell
pnpm dataset:validate
```

Validator kiểm tra lại:

- đúng 600 ID;
- đúng category ranges;
- đúng 60 critical IDs;
- answer verification;
- đúng 1 correct answer/câu;
- source/license metadata;
- image verification metadata;
- image path an toàn/extension hỗ trợ;
- referenced image phải tồn tại dưới `data/processed/assets`.

## 12. Publish remote package

```powershell
pnpm dataset:publish
```

Tạo:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

Upload payload trước và `dataset-manifest.json` cuối cùng để tránh app nhìn thấy version chưa upload đầy đủ.

## 13. Pipeline status/checkpoints

Lệnh read-only:

```powershell
pnpm dataset:status
```

Nó báo:

- file/stage nào đã tồn tại;
- số câu parsed;
- answer unresolved + ID preview;
- parser warning count;
- image unresolved + ID preview;
- production question count;
- bước tiếp theo nên chạy.

Các shortcut local:

```powershell
# PDF đã có sẵn trong data/raw/
pnpm dataset:prepare

# Tự download trước khi prepare
pnpm dataset:prepare:download

# Sau khi đã điền manual-answer-review.json
pnpm dataset:after-answer-review

# Sau khi đã điền manual-image-review.json
pnpm dataset:finalize
```

`dataset:finalize` chạy image review → promotion → validator → publisher; bất kỳ gate nào chưa đạt sẽ làm pipeline dừng.

## 14. Test tooling — chỉ chạy local khi bạn chủ động

```powershell
pnpm dataset:test
```

GitHub `Validate` workflow hiện manual-only và không tự chạy push/PR.

## Pipeline đầy đủ

```text
Official PDF
   ↓
extract_pdf.py
   ↓
parse_questions.py
   ↓
questions.unverified.json
   ↓
resolve_answers.py
   ├─ resolved
   └─ uncertain → answer-review.json
                    ↓
            manual PDF verification
                    ↓
        apply_answer_review.py
                    ↓
         questions.reviewed.json
                    ↓
      extract_question_images.py
          ├─ candidate assets
          └─ image-review.json
                    ↓
       review-workspace.html
                    ↓
            manual visual review
                    ↓
         apply_image_review.py
                    ↓
    questions.images-reviewed.json
                    ↓
          promote_dataset.py
                    ↓
     data/processed/questions.json
                    ↓
       validate.mjs + asset checks
                    ↓
          publish_dataset.py
                    ↓
questions.json + assets.zip + manifest
                    ↓
            HTTPS remote storage
                    ↓
        Tauri bootstrap → SQLite
```

## Phần vẫn cần dữ liệu/máy local thật

- chạy pipeline trên PDF chính thức;
- calibrate underline threshold từ số liệu thật;
- manual verify answer unresolved;
- visual/manual verify image-sensitive questions;
- tạo production dataset đủ 600 câu;
- publish lên HTTPS endpoint cố định;
- xác nhận first-run/update/offline trên app Tauri local.
