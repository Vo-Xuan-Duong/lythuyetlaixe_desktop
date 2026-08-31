# Local Windows release

Dự án không tự chạy GitHub Actions khi push/PR. Validation và release được thực hiện local trên máy Windows.

## 1. Chuẩn bị endpoint dataset production

Tạo `.env.production` từ `.env.example`:

```env
VITE_DATASET_MANIFEST_URL=https://data.example.com/lythuyetlaixe/dataset-manifest.json
```

URL này được compile vào frontend. Installer không chứa bộ 600 câu; lần mở app đầu tiên sẽ tải manifest, questions và assets về AppData rồi import SQLite.

## 2. Kiểm tra local trước release

Chạy theo nhu cầu trên máy phát triển:

```powershell
pnpm install
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

Dataset tooling khi cần:

```powershell
pnpm dataset:metadata
pnpm dataset:test
pnpm dataset:validate
```

## 3. Build installer NSIS

```powershell
pnpm release:windows:local
```

Tauri build frontend/Rust release và tạo NSIS setup executable. Với target mặc định của dự án, output nằm dưới:

```text
src-tauri/target/release/bundle/nsis/
```

Bản đầu sử dụng NSIS current-user mặc định của Tauri nên không yêu cầu quyền Administrator và cài ứng dụng vào vùng LocalAppData của người dùng.

## 4. Versioning

Trước khi release, đồng bộ cùng một version ở:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Quy ước đề xuất:

```text
0.1.x  development/preview
0.2.x  beta desktop
1.0.0  desktop production
```

Dataset version độc lập app version. Cập nhật câu hỏi/ảnh chỉ cần phát hành dataset version mới trên remote storage; không cần build installer mới nếu application contract không đổi.

## 5. Release checklist

- `.env.production` trỏ đúng HTTPS endpoint.
- Dataset manifest có version/checksum đúng.
- First-run tải dataset thành công.
- Mất mạng sau lần tải đầu vẫn học/thi được.
- Ảnh biển báo/sa hình đọc được từ AppData.
- Update dataset giữ nguyên progress/bookmark/exam history.
- Learning, Critical, Review, Exam, Statistics, Settings chạy được.
- Installer cài/gỡ được trên Windows 10/11.
- Kiểm tra app data sau uninstall/reinstall theo chính sách mong muốn.

## 6. Không dùng Actions tự động

`.github/workflows/validate.yml` chỉ còn `workflow_dispatch`. Không có trigger push hoặc pull request. Việc kiểm tra mặc định được thực hiện local.

## Nguồn Tauri

- Windows installer: https://v2.tauri.app/distribute/windows-installer/
- Tauri config: https://v2.tauri.app/reference/config/
