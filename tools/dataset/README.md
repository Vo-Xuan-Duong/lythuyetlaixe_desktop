# Dataset pipeline

Pipeline này biến tài liệu PDF chính thức thành dataset đã kiểm chứng để import vào SQLite.

## 1. Cài dependency tooling

```powershell
python -m pip install -r tools/dataset/requirements.txt
```

## 2. Tải tài liệu nguồn

```powershell
python tools/dataset/download_sources.py
```

PDF được lưu dưới `data/raw/` và bị `.gitignore` bỏ qua. Script tạo checksum để có thể xác minh file nguồn trong từng lần build dataset.

Nếu máy chủ CSGT tải chậm, có thể tải thủ công PDF chính thức và đặt đúng tên:

```text
data/raw/bo-600-cau-hoi.pdf
data/raw/cong-van-2262-csgt-p5.pdf
```

## 3. Extract PDF

```powershell
python tools/dataset/extract_pdf.py
```

Kết quả:

```text
data/raw/extracted/pages.json
data/raw/extracted/images/*
```

`pages.json` giữ:

- plain text;
- text span + bounding box;
- font metadata;
- image placement;
- vector drawings.

Vector drawings được giữ vì **đáp án đúng trong tài liệu chính thức được gạch chân**. Không được bỏ layer này rồi đoán đáp án từ text.

## 4. Parse candidate questions

```powershell
python tools/dataset/parse_questions.py
```

Kết quả:

```text
data/raw/questions.unverified.json
```

File này **không phải production dataset**. Các answer có `correct: null` cho tới khi bước nhận dạng underline/manual verification xác nhận đáp án.

## 5. Metadata check

```powershell
python tools/dataset/check_source_metadata.py
```

## 6. Production validation

Sau khi đã resolve đáp án và map hình:

```powershell
pnpm dataset:validate
```

Chỉ file vượt qua production validator mới được phép seed vào SQLite.

## Tiếp theo

- Viết underline detector dựa trên `spans` + `drawings`.
- Map image placements vào question ID.
- Xuất review report cho các câu không chắc chắn.
- Manual verification.
- Import validated JSON vào SQLite.
