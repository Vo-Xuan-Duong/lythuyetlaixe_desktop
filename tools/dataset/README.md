# Dataset pipeline

Pipeline này biến tài liệu PDF chính thức thành dataset đã kiểm chứng để import vào SQLite và phát hành qua remote storage.

## 1. Cài dependency tooling

```powershell
python -m pip install -r tools/dataset/requirements.txt
```

## 2. Tải tài liệu nguồn

```powershell
pnpm dataset:download
```

PDF được lưu dưới `data/raw/` và bị `.gitignore` bỏ qua. Script tạo checksum để có thể xác minh file nguồn trong từng lần build dataset.

Nếu máy chủ CSGT tải chậm, có thể tải thủ công PDF chính thức và đặt đúng tên:

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

`pages.json` giữ:

- plain text;
- text span + bounding box;
- baseline/origin;
- font metadata;
- image placement;
- vector drawings.

Vector drawings được giữ vì **đáp án đúng trong tài liệu chính thức được gạch chân**. Không được bỏ layer này rồi đoán đáp án từ text.

## 4. Parse candidate questions

```powershell
pnpm dataset:parse
```

Kết quả:

```text
data/raw/questions.unverified.json
```

File này **không phải production dataset**. Các answer có `correct: null` cho tới khi bước nhận dạng underline/manual verification xác nhận đáp án.

## 5. Resolve underline geometry

```powershell
pnpm dataset:resolve
```

Resolver:

1. dựng lại text line từ `span + bbox + origin`;
2. xác định vùng `Câu N` tới `Câu N+1`;
3. tách vùng đáp án `1.`, `2.`, `3.`, `4.`;
4. tìm vector line nằm ngay dưới baseline của từng answer line;
5. tính score + margin;
6. chỉ đánh dấu đáp án khi confidence vượt ngưỡng;
7. đưa trường hợp không chắc chắn vào manual review.

Kết quả:

```text
data/raw/questions.resolved.json
data/raw/answer-review.json
```

Nếu score thấp hoặc hai đáp án có score gần nhau, resolver **không đoán** và giữ `correct: null`.

## 6. Manual answer review

Copy template:

```text
data/source/manual-answer-review.example.json
```

thành:

```text
data/source/manual-answer-review.json
```

Sau đó chỉ nhập các câu đã kiểm tra trực tiếp trên tài liệu nguồn:

```json
{
  "questionId": 123,
  "answerKey": "B",
  "sourcePage": 41,
  "reviewer": "manual-review",
  "verifiedAt": "2026-08-30",
  "note": "Verified directly against official PDF underline"
}
```

Áp dụng review:

```powershell
pnpm dataset:review
```

Script lưu provenance trong `answerResolution` và không cho manual review âm thầm ghi đè kết quả geometry khác đáp án. Trường hợp thực sự cần sửa sau khi kiểm tra nguồn phải chạy trực tiếp script với `--allow-overwrite`.

Kết quả:

```text
data/raw/questions.reviewed.json
```

## 7. Trích xuất ảnh câu hỏi an toàn

```powershell
pnpm dataset:images
```

Stage `extract_question_images.py` được thiết kế riêng để **không làm lộ đáp án đúng**. Script không crop toàn bộ vùng câu hỏi/đáp án. Nó chỉ:

1. dựng lại các dòng text theo tọa độ;
2. tìm dòng `Câu N`;
3. tìm đáp án đầu tiên (`1.` / `1)`);
4. chỉ xét embedded image/vector graphics nằm giữa hai mốc đó;
5. bỏ các vector line quá mỏng có thể là underline/separator;
6. crop theo bounding box của graphics;
7. nếu geometry mơ hồ thì đưa vào review thay vì tự gán.

Kết quả:

```text
data/raw/questions.with-images.json
data/raw/image-review.json
data/processed/assets/images/q301.png
...
```

`image-review.json` phải được kiểm tra trực quan sau lần chạy thật. Heuristic này chỉ tạo candidate ảnh; nó không thay thế manual review đối với trường hợp mơ hồ.

Các ảnh production được đặt dưới `data/processed/assets/` để publisher sau đó tạo `assets.zip` cho remote dataset.

## 8. Promotion gate

```powershell
pnpm dataset:promote
```

Lệnh hiện promotion từ:

```text
data/raw/questions.with-images.json
```

Promotion bị từ chối nếu:

- không đủ 600 câu;
- thiếu/trùng ID;
- còn global/parser warning;
- còn `needsVerification=true`;
- `correct` chưa phải boolean;
- một câu không có đúng chính xác 1 đáp án đúng.

Kết quả hợp lệ được ghi thành:

```text
data/processed/questions.json
```

với `stage: production`.

## 9. Production validation

```powershell
pnpm dataset:validate
```

Validator kiểm tra:

- đúng 600 câu;
- ID 1-600 đầy đủ;
- đúng category theo khoảng;
- đúng 60 câu điểm liệt;
- không còn câu cần verification;
- mỗi câu có đúng 1 đáp án đúng;
- source version/license metadata;
- image path an toàn;
- extension ảnh được hỗ trợ;
- mọi image path được tham chiếu phải tồn tại dưới `data/processed/assets`.

Chỉ file vượt qua validator mới được phép phát hành/import vào SQLite.

## 10. Publish remote package

```powershell
pnpm dataset:publish
```

Publisher tạo:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip          # có khi dataset có ảnh
```

Manifest chứa SHA-256, kích thước và số asset. Ứng dụng tải/verify assets trước rồi mới activate dataset mới trong SQLite.

Upload theo thứ tự an toàn:

```text
questions.json / assets.zip
        ↓
dataset-manifest.json cuối cùng
```

Không sửa nội dung của một dataset version đã phát hành. Có thay đổi dữ liệu thì tăng version.

## 11. Test tooling — chạy local khi bạn chủ động

```powershell
pnpm dataset:test
```

Workflow GitHub `Validate` hiện manual-only; không còn tự chạy khi push/PR. Mặc định việc kiểm tra được thực hiện local.

## Pipeline đầy đủ

```text
Official PDF
   ↓
download_sources.py
   ↓
extract_pdf.py
   ↓
parse_questions.py
   ↓
questions.unverified.json
   ↓
resolve_answers.py
   ├─ high confidence ──────────────┐
   └─ uncertain → answer-review.json│
                    ↓                │
             manual source review    │
                    ↓                │
             apply_answer_review.py ←┘
                    ↓
             questions.reviewed.json
                    ↓
       extract_question_images.py
          ├─ accepted → assets/images/*
          └─ ambiguous → image-review.json
                    ↓
          questions.with-images.json
                    ↓
              promote_dataset.py
                    ↓
            data/processed/questions.json
                    ↓
      validate.mjs + assets existence
                    ↓
              publish_dataset.py
                    ↓
 questions.json + assets.zip + manifest
                    ↓
             remote storage
                    ↓
          Tauri bootstrap → SQLite
```

## Phần vẫn cần thực hiện trên dữ liệu thật

- Chạy pipeline trên PDF chính thức đầy đủ.
- Hiệu chỉnh threshold underline từ kết quả thực tế.
- Manual review các đáp án chưa resolve chắc chắn.
- Kiểm tra trực quan các ảnh trong `image-review.json` và ảnh đã render.
- Tạo production dataset đủ 600 câu.
- Publish lên endpoint HTTPS cố định.
- Xác nhận first-run/update/offline trên app Tauri local.
