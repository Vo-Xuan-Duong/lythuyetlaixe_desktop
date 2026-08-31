# Lý Thuyết Lái Xe — Desktop

Ứng dụng desktop học và thi thử lý thuyết lái xe Việt Nam, phát triển theo hướng **Windows Desktop trước, Android sau** bằng Tauri 2.

> Trạng thái hiện tại: core learning/exam flow đã có; production dataset 600 câu đang được hoàn thiện và sẽ được phân phối từ remote storage thay vì bundle trong app.

## Stack

- Tauri 2 + Rust.
- React 19 + TypeScript.
- Vite.
- SQLite qua `@tauri-apps/plugin-sql`.
- pnpm.

## Kế hoạch

Roadmap và Definition of Done cho từng phase nằm trong [`KE_HOACH.md`](./KE_HOACH.md).

## Yêu cầu môi trường Windows

Cần cài:

1. Node.js phiên bản đáp ứng yêu cầu của Vite hiện hành.
2. pnpm.
3. Rust stable MSVC.
4. Microsoft C++ Build Tools / Visual Studio Build Tools theo prerequisite của Tauri.
5. WebView2 (Windows 10 thường cần kiểm tra; Windows 11 đã tích hợp rộng rãi).

Kiểm tra Rust:

```powershell
rustc --version
cargo --version
```

Kiểm tra Node/pnpm:

```powershell
node --version
pnpm --version
```

## Cấu hình remote dataset

Production build không chứa trực tiếp bộ 600 câu. App kiểm tra một manifest cố định và chỉ tải dataset khi máy chưa có dữ liệu hoặc version/checksum thay đổi.

Tạo `.env` từ `.env.example`:

```env
VITE_DATASET_MANIFEST_URL=https://data.example.com/lythuyetlaixe/dataset-manifest.json
```

Luồng lần chạy đầu:

```text
manifest → download questions.json → SHA-256 → validate → import SQLite
```

Sau đó ứng dụng dùng SQLite local và có thể hoạt động offline. Chi tiết nằm trong [`docs/REMOTE_DATASET.md`](./docs/REMOTE_DATASET.md).

## Chạy frontend

```powershell
pnpm install
pnpm dev
```

Frontend browser vẫn dùng dữ liệu demo để phát triển UI.

## Chạy app Tauri

Khi chạy Tauri và máy chưa có dataset local, cần cấu hình `VITE_DATASET_MANIFEST_URL` tới endpoint hợp lệ.

```powershell
pnpm install
pnpm tauri:dev
```

## Build frontend

```powershell
pnpm build
```

## Build Tauri

Bundle installer đang được để `active: false` trong foundation. Phase Desktop Production sẽ bổ sung bundle target và workflow release.

```powershell
pnpm tauri:build
```

## Publish dataset

Sau khi `data/processed/questions.json` đã vượt qua production validator:

```powershell
pnpm dataset:publish
```

Lệnh tạo:

```text
dist/dataset/
├── dataset-manifest.json
└── questions.json
```

Upload hai file này vào cùng một thư mục trên remote storage/CDN. Khi cập nhật dataset, upload `questions.json` trước và thay `dataset-manifest.json` sau cùng.

## SQLite

Database local:

```text
sqlite:lythuyetlaixe.db
```

Migration đầu tiên tạo schema cho:

- dataset metadata;
- categories;
- questions/answers;
- license mappings;
- user progress;
- bookmarks;
- exam sessions/history.

Không nhập dữ liệu câu hỏi không được kiểm chứng vào migration. Runtime source of truth sau khi tải là SQLite local; JSON remote chỉ dùng trong quá trình download/verify/import.

## Android sau này

Tauri 2 hỗ trợ mobile target. Sau khi desktop foundation và data layer ổn định, dự án sẽ khởi tạo Android target:

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

Business logic/domain/database contract phải giữ độc lập platform để hạn chế viết lại khi chuyển sang Android.

## Cấu trúc hiện tại

```text
src/
├── app/                 # app state + navigation/bootstrap
├── components/          # shell/components dùng chung
├── data/                # dữ liệu demo cho browser development
├── domain/              # entity/domain types
├── features/            # feature UI
├── infrastructure/      # SQLite + remote dataset adapters
└── styles/

src-tauri/
├── capabilities/
├── src/                 # Rust + database migrations
├── Cargo.toml
└── tauri.conf.json
```

## Quy tắc dữ liệu

- Source of truth phải là tài liệu chính thức.
- AI không được tự suy đoán đáp án chính thức.
- Dataset phải có version, checksum và validator.
- Dataset version đã phát hành là bất biến; thay đổi dữ liệu phải tạo version mới.
- UI không hard-code quy định thi.
