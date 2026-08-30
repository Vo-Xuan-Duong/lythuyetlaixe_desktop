# Dataset pipeline

Pipeline này biến tài liệu PDF chính thức thành dataset đã kiểm chứng để import vào SQLite.

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

## 6. Manual review

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

## 7. Promotion gate

```powershell
pnpm dataset:promote
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

## 8. Production validation

```powershell
pnpm dataset:validate
```

Validator kiểm tra lại:

- đúng 600 câu;
- ID 1-600 đầy đủ;
- đúng category theo khoảng;
- đúng 60 câu điểm liệt;
- không còn câu cần verification;
- mỗi câu có đúng 1 đáp án đúng;
- source version/license metadata;
- image path nếu bật `--images-root`.

Chỉ file vượt qua validator mới được phép seed/import vào SQLite.

## 9. Test tooling

```powershell
pnpm dataset:test
```

CI cũng chạy unit test cho underline resolver, manual review và promotion gate.

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
              promote_dataset.py
                    ↓
            data/processed/questions.json
                    ↓
                validate.mjs
                    ↓
                 SQLite
```

## Phần còn lại của Phase 3

- Chạy pipeline trên PDF thật và hiệu chỉnh threshold từ số liệu thực tế.
- Map/rasterize hình ảnh câu hỏi, đặc biệt biển báo và sa hình.
- Hoàn tất manual review cho các câu không resolve tự động.
- Import production dataset vào SQLite.
