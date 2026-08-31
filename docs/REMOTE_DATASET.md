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
validate manifest + provenance + URL + size
    ↓
Chưa có local dataset hoặc version khác?
    ├─ Không → dùng SQLite + asset cache local
    └─ Có
       ↓
       GET questions.json
       ↓
       kiểm tra hard size limit + SHA-256
       ↓
       cross-check dataset/version/validFrom/sourceSha256
       ↓
       runtime validate production contract
       ↓
       dataset có image?
       ├─ Không → bỏ qua asset package
       └─ Có
          ↓
          GET assets.zip
          ↓
          kiểm tra hard size limit + SHA-256 + fileCount
          ↓
          kiểm tra path/type/giới hạn giải nén
          ↓
          giải nén vào $APPDATA/dataset-assets/<version>/
       ↓
       transaction import vào SQLite
       ↓
       dùng offline từ SQLite + AppData
```

Asset package được cài **trước** khi SQLite chuyển sang dataset version mới. Nếu SQLite import thất bại, asset version vừa cài được xóa lại. Dataset/progress đang hoạt động trước đó không bị thay đổi. Sau khi import version mới thành công, asset version cũ mới được cleanup.

Các lần mở tiếp theo chỉ tải `dataset-manifest.json` để kiểm tra version/checksum. Nếu version và distribution checksum không thay đổi, app không tải lại 600 câu hoặc asset package.

Nếu mất mạng nhưng SQLite local đã có đủ 600 câu, ứng dụng tiếp tục hoạt động với dataset local. Nếu đây là lần chạy đầu tiên và chưa có dataset local, lỗi tải dữ liệu sẽ chặn các feature phụ thuộc dataset cho đến khi tải thành công.

## Ba checksum khác nhau

Không dùng chung một key cho provenance và distribution integrity.

```text
sourceSha256
  = SHA-256 của PDF nguồn chính thức

contentSha256
  = SHA-256 của đúng file questions.json đã phát hành

assetSha256
  = SHA-256 của assets.zip đã phát hành
```

`sourceSha256` nằm trong production `questions.json` và `dataset-manifest.json`. Bootstrap bắt buộc hai giá trị này khớp nhau.

`contentSha256` không nằm bên trong `questions.json` vì tự hash chính file chứa nó là không khả thi. Giá trị này là `manifest.sha256`, được ghi vào `dataset_metadata.contentSha256` sau khi payload đã được verify.

Các build cũ từng lưu nhầm `manifest.sha256` vào `sourceSha256`. Runtime có migration an toàn: chỉ khi local thiếu `contentSha256` **và** giá trị `sourceSha256` cũ khớp chính xác `manifest.sha256` của cùng version thì hash đó mới được chuyển sang `contentSha256`; provenance PDF cũ bị xóa thay vì suy đoán.

## Nguồn remote cố định

Build production cấu hình:

```env
VITE_DATASET_MANIFEST_URL=https://data.example.com/lythuyetlaixe/dataset-manifest.json
```

URL này được compile vào frontend tại build time. Production endpoint bắt buộc HTTPS. HTTP chỉ được runtime chấp nhận cho `localhost`, `127.0.0.1` hoặc `::1` phục vụ development local.

Khi host production được chốt, nên thay `connect-src https:` trong CSP bằng đúng hostname cần thiết.

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

Ví dụ manifest:

```json
{
  "dataset": "VN_GPLX_600",
  "version": "2025.06",
  "validFrom": "2025-06-01",
  "stage": "production",
  "datasetUrl": "questions.json",
  "sha256": "<questions.json sha256>",
  "sourceSha256": "<official PDF sha256>",
  "sizeBytes": 1234567,
  "assets": {
    "url": "assets.zip",
    "format": "zip",
    "sha256": "<assets.zip sha256>",
    "sizeBytes": 987654,
    "fileCount": 185
  }
}
```

Các URL trong manifest là relative URL và được resolve theo URL thật cuối cùng của manifest sau redirect. URL có embedded credentials bị từ chối.

Publisher không zip toàn bộ thư mục assets một cách mù quáng. Nó chỉ đưa các file đang được `questions.json` tham chiếu vào archive và fail nếu thiếu file/path không an toàn.

## Runtime validation

Sau khi `questions.json` vượt qua SHA-256, importer vẫn kiểm tra lại contract trước khi ghi SQLite:

- đúng dataset/stage/version/validFrom;
- `sourceSha256` hợp lệ;
- đúng 600 ID;
- đúng category theo khoảng ID;
- đúng chính xác danh sách 60 câu điểm liệt;
- sourceVersion có mặt;
- 2–4 đáp án với key A–D, đúng chính xác 1 đáp án;
- license nằm trong tập hạng app hỗ trợ và không trùng;
- image path relative, không `..`, không absolute/drive path;
- image extension chỉ `.png/.jpg/.jpeg/.webp`.

Production validator ở tooling vẫn là release gate chính; runtime validation là defense-in-depth.

## Update dataset

Khi có dataset mới:

1. Tạo dataset version mới.
2. Chạy validator.
3. Chuẩn bị toàn bộ ảnh tương ứng.
4. Chạy `pnpm dataset:publish`.
5. Upload `questions.json` và `assets.zip` trước.
6. Upload/replace `dataset-manifest.json` sau cùng.

Manifest phải được publish cuối cùng để không quảng bá một version mà payload chưa upload xong.

Version đã phát hành là immutable. Nếu remote thay `questions.json` hoặc `assets.zip` nhưng giữ nguyên version, app giữ bản local thay vì overwrite. Mọi thay đổi production phải tăng version.

## Storage trên máy

```text
SQLite: lythuyetlaixe.db
AppData:
└── dataset-assets/
    └── <version>/
        └── images/
            └── ...
```

Dataset JSON chỉ tồn tại trong memory trong quá trình download/verify/import. Không giữ thêm một bản `questions.json` local.

Metadata local gồm tối thiểu:

- `dataset`
- `version`
- `validFrom`
- `sourceSha256` — PDF provenance
- `contentSha256` — installed questions.json
- `assetSha256` — installed assets.zip hoặc rỗng
- `importedAt`

## Asset security

Archive được kiểm tra ở hai lớp:

### Download

- URL HTTPS, ngoại trừ localhost dev;
- SHA-256 chuẩn 64-hex;
- optional exact `sizeBytes`;
- tối đa 64 MiB compressed asset archive.

### Extract/install

- optional `fileCount`;
- không absolute path hoặc `..` traversal;
- chỉ `.png`, `.jpg`, `.jpeg`, `.webp`;
- tối đa 2.000 files;
- tối đa 128 MiB sau giải nén;
- lỗi giữa chừng xóa version directory chưa hoàn chỉnh.

Tauri filesystem capability chỉ cấp `exists/mkdir/remove/writeFile` và scope:

```text
$APPDATA/dataset-assets
$APPDATA/dataset-assets/**/*
```

Asset protocol cũng chỉ scope tới dataset-assets.

## Network / CSP

Production build bật Content Security Policy. Hiện `connect-src` cho HTTPS vì host dataset cuối cùng chưa được chốt. `devCsp` để null để Vite HMR local hoạt động.

Bootstrap vẫn dùng Web Fetch API; host production cần CORS phù hợp cho WebView. Khi domain production được chốt, có thể cân nhắc `@tauri-apps/plugin-http` và capability scope đúng domain thay vì mở rộng mọi HTTPS origin.

## Giới hạn của SHA-256

SHA-256 chứng minh payload tải về khớp manifest, nhưng không tự chứng minh manifest do ai phát hành. HTTPS + quyền kiểm soát domain/CDN là lớp trust hiện tại.

Nếu sau này cần chống compromise của storage/CDN mạnh hơn, nâng cấp tiếp theo là **signed manifest**: ký manifest bằng private key ở release pipeline và nhúng public key verify trong app.
