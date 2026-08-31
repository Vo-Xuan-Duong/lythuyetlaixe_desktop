# Local Windows release

Dự án không tự chạy GitHub Actions khi push/PR. Validation và release được thực hiện local trên máy Windows.

## 1. Chuẩn bị hai endpoint production

Tạo `.env.production` từ `.env.example`:

```env
VITE_QUESTIONS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/traffic-signs/manifest.json
```

Installer không chứa production 600 câu hoặc catalog biển báo đầy đủ. Mỗi dataset tải/import độc lập vào SQLite/AppData.

## 2. Kiểm tra local trước release

```powershell
pnpm install
pnpm test
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

Question dataset:

```powershell
pnpm dataset:test
pnpm dataset:validate
```

Traffic-sign dataset:

```powershell
pnpm signs:validate
```

## 3. Build installer NSIS

```powershell
pnpm release:windows:local
```

Output:

```text
src-tauri/target/release/bundle/nsis/
```

## 4. Versioning

Application version phải đồng bộ ở:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Hai dataset có version độc lập với binary và với nhau:

```text
App:           0.1.0
Questions:     2025.06
Traffic signs: 2025.01
```

## 5. Release checklist

- `.env.production` có đúng hai HTTPS manifest URL.
- First-run tải/import bộ 600 câu thành công.
- First-run catalog biển báo tải/import độc lập.
- SQLite migration v2 tạo `traffic_sign_metadata` và `traffic_signs`.
- Mất mạng sau first-run vẫn học/thi/tra cứu biển báo được.
- Question assets đọc từ `$APPDATA/dataset-assets/<version>/`.
- Traffic-sign assets đọc từ `$APPDATA/traffic-sign-assets/<version>/`.
- Update questions giữ progress/bookmark/exam history và không xóa traffic signs.
- Update traffic signs không chạm bộ 600 câu.
- Runtime Diagnostics kiểm tra riêng cả hai dataset.
- Installer install/upgrade/uninstall được trên Windows 10/11.

## 6. Security trước public release

- R2/custom domain chỉ public read.
- CORS GET/HEAD phù hợp.
- Scope CSP `connect-src` về đúng custom domain thay vì generic `https:`.
- Không nhúng R2 API secret vào app.

## 7. Không dùng Actions tự động

`.github/workflows/validate.yml` là manual-only. Validation mặc định thực hiện local.
