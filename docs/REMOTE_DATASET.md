# Remote dataset lifecycle

## Mục tiêu

Ứng dụng không bundle bộ 600 câu production hoặc ảnh câu hỏi vào installer/APK/AAB.

Luồng runtime:

```text
Cài ứng dụng
    ↓
Mở lần đầu
    ↓
GET dataset-manifest.json
    ↓
Chưa có local dataset hoặc version khác?
    ├─ Không → dùng SQLite + asset cache local
    └─ Có
       ↓
       GET questions.json
       ↓
       kiểm tra size + SHA-256
       ↓
       validate production dataset
       ↓
       dataset có image?
       ├─ Không → bỏ qua asset package
       └─ Có
          ↓
          GET assets.zip
          ↓
          kiểm tra size + SHA-256 + fileCount
          ↓
          kiểm tra path/type/giới hạn giải nén
          ↓
          giải nén vào $APPDATA/dataset-assets/<version>/
       ↓
       transaction import vào SQLite
       ↓
       dùng offline từ SQLite + AppData
```

Asset package được cài **trước** khi SQLite chuyển sang dataset version mới. Vì vậy nếu download hoặc giải nén ảnh thất bại, app vẫn giữ dataset và asset version cũ đang hoạt động.

Các lần mở tiếp theo chỉ tải `dataset-manifest.json` để kiểm tra version/checksum. Nếu version và checksum không thay đổi, app không tải lại 600 câu hoặc asset package.

Nếu mất mạng nhưng SQLite local đã có đủ 600 câu, ứng dụng tiếp tục hoạt động với dataset local. Nếu đây là lần chạy đầu tiên và chưa có dataset local, lỗi tải dữ liệu sẽ chặn các feature phụ thuộc dataset cho đến khi tải thành công.

## Nguồn remote cố định

Build production cấu hình:

```env
VITE_DATASET_MANIFEST_URL=https://data.example.com/lythuyetlaixe/dataset-manifest.json
```

URL này được compile vào frontend tại build time. Nơi chứa dữ liệu có thể cập nhật version mà không cần release lại app, miễn URL manifest không thay đổi.

## Gói phân phối

Ảnh production đặt trong:

```text
data/processed/assets/
└── images/
    ├── q301.webp
    ├── q302.webp
    └── ...
```

Giá trị `question.image` trong `questions.json` phải là relative path, ví dụ:

```json
"image": "images/q301.webp"
```

Sau khi `data/processed/questions.json` vượt qua production validator:

```bash
pnpm dataset:publish
```

Publisher tạo:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip              # chỉ có khi dataset tham chiếu ảnh
```

Ví dụ `dataset-manifest.json`:

```json
{
  "dataset": "VN_GPLX_600",
  "version": "2025.06",
  "validFrom": "2025-06-01",
  "stage": "production",
  "datasetUrl": "questions.json",
  "sha256": "...",
  "sizeBytes": 1234567,
  "assets": {
    "url": "assets.zip",
    "format": "zip",
    "sha256": "...",
    "sizeBytes": 987654,
    "fileCount": 185
  }
}
```

Các URL trong manifest là relative URL và được resolve theo URL thật của manifest. Các file chỉ cần được upload vào cùng một thư mục trên CDN/static host.

Publisher không zip toàn bộ thư mục assets một cách mù quáng. Nó chỉ đưa các file đang được `questions.json` tham chiếu vào archive và fail nếu thiếu file hoặc path không an toàn.

## Update dataset

Khi có dataset mới:

1. Tạo dataset version mới.
2. Chạy validator.
3. Chuẩn bị toàn bộ ảnh tương ứng trong `data/processed/assets`.
4. Chạy `pnpm dataset:publish`.
5. Upload `questions.json` và `assets.zip` trước.
6. Upload/replace `dataset-manifest.json` sau cùng.

Manifest phải được publish cuối cùng để không bao giờ quảng bá một version mà payload chưa upload xong.

Version đã phát hành là immutable. Nếu remote thay checksum của `questions.json` hoặc `assets.zip` nhưng giữ nguyên version, app không tự overwrite bản local đó. Mọi thay đổi production phải tăng version.

## Storage trên máy

Runtime source of truth:

```text
SQLite: lythuyetlaixe.db
AppData:
└── dataset-assets/
    └── <version>/
        └── images/
            └── ...
```

Dataset JSON chỉ tồn tại trong memory trong quá trình download/verify/import. Không giữ thêm một bản `questions.json` local để tránh hai nguồn dữ liệu bị lệch nhau.

Ảnh được lưu thành file vì WebView cần đọc binary assets hiệu quả. `questions.image_path` trong SQLite vẫn lưu relative path; `SqliteQuestionRepository` resolve thành Tauri asset URL khi trả Question cho UI.

Metadata local trong `dataset_metadata` gồm tối thiểu:

- `dataset`
- `version`
- `validFrom`
- `sourceSha256`
- `assetSha256`
- `importedAt`

## Asset security

Asset ZIP được kiểm tra trước khi ghi vào AppData:

- SHA-256 và optional `sizeBytes` của archive;
- optional `fileCount`;
- không chấp nhận absolute path hoặc `..` path traversal;
- chỉ chấp nhận `.png`, `.jpg`, `.jpeg`, `.webp`;
- tối đa 2.000 files;
- tối đa 128 MiB dữ liệu sau giải nén.

Tauri filesystem plugin chỉ dùng AppData của ứng dụng. Asset protocol chỉ scope tới:

```text
$APPDATA/dataset-assets/**/*
```

## Network / security

Dataset phải được phục vụ qua HTTPS.

Bootstrap hiện sử dụng Web Fetch API. Host production cần CORS phù hợp cho WebView.

Khi domain production được chốt, nên chuyển transport sang `@tauri-apps/plugin-http` và scope capability đúng domain đó. Không cấp HTTP permission rộng cho mọi HTTPS origin chỉ để tránh CORS.

SHA-256 bảo vệ khỏi payload hỏng hoặc không khớp manifest nhưng không chứng minh ai là người phát hành manifest. Nếu cần chống giả mạo mạnh hơn, bước nâng cấp tiếp theo là ký manifest bằng public-key signature và nhúng public key xác minh trong app.
