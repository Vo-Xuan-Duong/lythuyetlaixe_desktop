# Remote dataset lifecycle

## Mục tiêu

Ứng dụng không bundle bộ 600 câu production vào installer/APK/AAB.

Luồng runtime:

```text
Cài ứng dụng
    ↓
Mở lần đầu
    ↓
GET dataset-manifest.json
    ↓
Chưa có local dataset hoặc version khác?
    ├─ Không → dùng SQLite local
    └─ Có
       ↓
       GET questions.json
       ↓
       kiểm tra size + SHA-256
       ↓
       validate production dataset
       ↓
       transaction import vào SQLite
       ↓
       dùng offline từ SQLite
```

Các lần mở tiếp theo chỉ tải `dataset-manifest.json` để kiểm tra version. Nếu version không thay đổi, app không tải lại 600 câu.

Nếu mất mạng nhưng SQLite local đã có đủ 600 câu, ứng dụng tiếp tục hoạt động với dataset local. Nếu đây là lần chạy đầu tiên và chưa có dataset local, lỗi tải dữ liệu sẽ chặn các feature phụ thuộc dataset cho đến khi tải thành công.

## Nguồn remote cố định

Build production cấu hình:

```env
VITE_DATASET_MANIFEST_URL=https://data.example.com/lythuyetlaixe/dataset-manifest.json
```

URL này được compile vào frontend tại build time. Vì vậy nơi chứa dữ liệu có thể cập nhật nội dung/version mà không cần release lại app, miễn URL manifest không thay đổi.

## Gói phân phối

Sau khi `data/processed/questions.json` vượt qua production validator:

```bash
pnpm dataset:publish
```

Publisher tạo:

```text
dist/dataset/
├── dataset-manifest.json
└── questions.json
```

`dataset-manifest.json` có dạng:

```json
{
  "dataset": "VN_GPLX_600",
  "version": "2025.06",
  "validFrom": "2025-06-01",
  "stage": "production",
  "datasetUrl": "questions.json",
  "sha256": "...",
  "sizeBytes": 1234567
}
```

`datasetUrl` là relative URL và được resolve theo URL thật của manifest. Do đó hai file chỉ cần được upload vào cùng một thư mục trên CDN/static host.

## Update dataset

Khi có dataset mới:

1. Tạo dataset version mới.
2. Chạy validator.
3. Chạy `pnpm dataset:publish`.
4. Upload `questions.json` trước.
5. Upload/replace `dataset-manifest.json` sau cùng.

Thứ tự này tránh trường hợp manifest mới trỏ đến dataset chưa upload xong.

App thấy version mới sẽ tải file mới, kiểm tra SHA-256, validate và import transaction. `user_progress`, bookmark và exam history không bị xóa bởi quá trình cập nhật dataset.

## Storage trên máy

Runtime source of truth là SQLite `lythuyetlaixe.db`, không phải file JSON đã tải.

Dataset JSON chỉ tồn tại trong memory trong quá trình download/verify/import. Điều này tránh phải duy trì hai bản dữ liệu local và giảm nguy cơ SQLite không đồng bộ với JSON cache.

Metadata dataset local nằm trong bảng `dataset_metadata`, gồm tối thiểu:

- `dataset`
- `version`
- `validFrom`
- `sourceSha256`
- `importedAt`

## Network / security

Dataset phải được phục vụ qua HTTPS.

Bootstrap hiện sử dụng Web Fetch API. Host production cần cho phép request từ WebView/CORS phù hợp.

Khi domain production được chốt, nên chuyển transport sang `@tauri-apps/plugin-http` và scope capability đúng domain đó. Không nên cấp HTTP permission rộng cho mọi HTTPS origin chỉ để tránh CORS.

Checksum SHA-256 bảo vệ khỏi file hỏng hoặc nội dung không khớp manifest. Nó không thay thế chữ ký số nếu sau này cần mô hình chống giả mạo mạnh hơn; khi đó có thể thêm public-key signature vào manifest.
