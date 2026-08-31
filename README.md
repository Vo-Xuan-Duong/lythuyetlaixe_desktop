# Lý Thuyết Lái Xe — Desktop

Ứng dụng desktop học và thi thử lý thuyết lái xe Việt Nam, phát triển theo hướng **Windows Desktop trước, Android sau** bằng Tauri 2.

> Trạng thái hiện tại: learning, critical practice, review engine, exam engine, statistics, settings, remote dataset/assets và Windows installer foundation đã được code. Blocker production chính còn lại là hoàn thiện bộ 600 câu + hình ảnh đã xác minh và kiểm tra runtime local.

## Stack

- Tauri 2 + Rust.
- React 19 + TypeScript.
- Vite.
- SQLite qua `@tauri-apps/plugin-sql`.
- AppData asset cache qua `@tauri-apps/plugin-fs`.
- pnpm.

## Trạng thái và kế hoạch

- Roadmap dài hạn: [`KE_HOACH.md`](./KE_HOACH.md)
- Trạng thái code/runtime hiện tại: [`docs/STATUS.md`](./docs/STATUS.md)
- Remote dataset: [`docs/REMOTE_DATASET.md`](./docs/REMOTE_DATASET.md)
- Dataset pipeline: [`tools/dataset/README.md`](./tools/dataset/README.md)
- Local Windows release: [`docs/LOCAL_RELEASE.md`](./docs/LOCAL_RELEASE.md)
- Update/version policy: [`docs/UPDATE_STRATEGY.md`](./docs/UPDATE_STRATEGY.md)

## Yêu cầu môi trường Windows

Cần cài:

1. Node.js phiên bản đáp ứng yêu cầu của Vite hiện hành.
2. pnpm.
3. Rust stable MSVC.
4. Microsoft C++ Build Tools / Visual Studio Build Tools theo prerequisite của Tauri.
5. WebView2.

Kiểm tra môi trường khi bạn muốn:

```powershell
rustc --version
cargo --version
node --version
pnpm --version
```

## GitHub Actions

Workflow `Validate` hiện **manual-only** (`workflow_dispatch`). Push và pull request không tự chạy test/build.

Validation mặc định được thực hiện local trên máy phát triển theo quyết định của maintainer.

## Cấu hình remote dataset

Production build không chứa trực tiếp bộ 600 câu hoặc hình biển báo/sa hình. App kiểm tra một manifest cố định và chỉ tải payload khi máy chưa có dữ liệu hoặc version/checksum thay đổi.

Tạo `.env.production` từ `.env.example` trước build production:

```env
VITE_DATASET_MANIFEST_URL=https://data.example.com/lythuyetlaixe/dataset-manifest.json
```

Luồng lần chạy đầu:

```text
manifest
   ↓
questions.json → SHA-256 → validate
   ↓
assets.zip (nếu có ảnh) → SHA-256 → safe unzip → AppData
   ↓
transaction import SQLite
```

Sau đó ứng dụng dùng SQLite + asset cache local và có thể hoạt động offline.

## Chạy frontend

```powershell
pnpm install
pnpm dev
```

Frontend browser dùng dữ liệu demo cho những phần cần native SQLite/Tauri.

## Chạy app Tauri

Khi chạy Tauri và máy chưa có dataset local, cần cấu hình `VITE_DATASET_MANIFEST_URL` tới endpoint hợp lệ.

```powershell
pnpm install
pnpm tauri:dev
```

## Dataset pipeline

Luồng chính:

```text
PDF chính thức
  ↓ download / extract
parse questions
  ↓
resolve đáp án bằng underline geometry
  ↓
manual answer review
  ↓
extract graphics trước đáp án đầu tiên
  ↓
manual image review
  ↓
promote + validate
  ↓
publish remote package
```

Các lệnh:

```powershell
pnpm dataset:download
pnpm dataset:extract
pnpm dataset:parse
pnpm dataset:resolve
pnpm dataset:review
pnpm dataset:images
pnpm dataset:promote
pnpm dataset:validate
pnpm dataset:publish
```

Không dùng AI để suy đoán đáp án chính thức. Các trường hợp geometry không chắc chắn phải được kiểm tra trực tiếp từ nguồn chính thức.

## Publish dataset

Sau khi `data/processed/questions.json` đã vượt qua production validator, ảnh nằm dưới `data/processed/assets/` với path tương ứng `question.image`.

```powershell
pnpm dataset:publish
```

Lệnh tạo:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip              # chỉ sinh khi dataset tham chiếu ảnh
```

Upload payload (`questions.json`, `assets.zip`) trước và thay `dataset-manifest.json` sau cùng. Manifest chứa SHA-256, size và fileCount để app xác minh trước khi kích hoạt version mới.

## SQLite và asset cache

Database local:

```text
sqlite:lythuyetlaixe.db
```

Ảnh local:

```text
$APPDATA/dataset-assets/<version>/images/...
```

Migration tạo schema cho:

- dataset metadata;
- categories;
- questions/answers;
- license mappings;
- user progress;
- bookmarks;
- exam sessions/history.

Runtime source of truth sau khi tải là SQLite local. Dataset JSON chỉ được dùng trong quá trình download/verify/import. `questions.image_path` lưu relative path, repository chuyển thành Tauri asset URL khi đọc câu hỏi.

## Build Windows installer local

Dự án đã bật Tauri NSIS bundle target.

```powershell
pnpm release:windows:local
```

Output dự kiến:

```text
src-tauri/target/release/bundle/nsis/
```

Không chạy build tự động qua GitHub Actions.

## Versioning

Application version và dataset version độc lập:

```text
App:     0.1.0 → 0.2.0 → 1.0.0
Dataset: 2025.06 → version mới khi dữ liệu chính thức thay đổi
```

Sửa câu hỏi/ảnh trong contract hiện tại chỉ cần phát hành dataset mới. Thay đổi code/schema/UI cần installer app version mới.

## Android sau này

Sau khi Desktop + production dataset được xác nhận ổn định local, khởi tạo Android:

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Domain, repository contracts, SQLite schema và remote dataset contract được giữ độc lập platform để hạn chế viết lại.

## Cấu trúc hiện tại

```text
src/
├── app/                 # app state + navigation/bootstrap
├── components/
├── data/                # demo browser data
├── domain/
├── features/
│   ├── critical/
│   ├── dashboard/
│   ├── exam/
│   ├── learning/
│   ├── review/
│   ├── settings/
│   └── statistics/
├── infrastructure/
│   ├── assets/
│   ├── database/
│   ├── preferences/
│   ├── repositories/
│   └── runtime/
└── styles/

src-tauri/
├── capabilities/
├── src/
├── Cargo.toml
└── tauri.conf.json

tools/dataset/
```

## Quy tắc dữ liệu

- Source of truth phải là tài liệu chính thức.
- AI không được tự suy đoán đáp án chính thức.
- Dataset phải có version, checksum và validator.
- Dataset version đã phát hành là bất biến.
- Payload mới chỉ được kích hoạt sau khi JSON và assets đều verify thành công.
- Update dataset không được xóa progress/bookmark/exam history.
- UI không hard-code quy định thi.
