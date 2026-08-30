# Lý Thuyết Lái Xe — Desktop

Ứng dụng desktop học và thi thử lý thuyết lái xe Việt Nam, phát triển theo hướng **Windows Desktop trước, Android sau** bằng Tauri 2.

> Trạng thái hiện tại: foundation. UI đang dùng dữ liệu demo; bộ 600 câu chính thức chưa được import.

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

## Chạy frontend

```powershell
pnpm install
pnpm dev
```

## Chạy app Tauri

```powershell
pnpm install
pnpm tauri:dev
```

## Build frontend

```powershell
pnpm build
```

## Build Tauri

Bundle installer đang được để `active: false` trong foundation. Phase Desktop Production sẽ bổ sung icon, bundle target và workflow release.

```powershell
pnpm tauri:build
```

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

Không nhập dữ liệu câu hỏi không được kiểm chứng vào migration.

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
├── app/                 # app state + navigation
├── components/          # shell/components dùng chung
├── data/                # dữ liệu demo trong giai đoạn foundation
├── domain/              # entity/domain types
├── features/            # feature UI
├── infrastructure/      # SQLite/Tauri adapters
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
- Dataset phải có version và validator.
- UI không hard-code quy định thi.
