# Android bring-up — chạy local

Ứng dụng dùng chung Tauri 2 + React + SQLite trên Windows/Android. Hai dataset production hiện tách độc lập: bộ 600 câu và catalog biển báo.

> Repository không tự chạy Android build bằng GitHub Actions.

## 1. Môi trường

Cần Android Studio, JDK, SDK, Build Tools, NDK, Rust Android targets và thiết bị/emulator.

Tauri Android min SDK của project: `24`.

## 2. Khởi tạo/chạy

```powershell
pnpm tauri:android:init
pnpm tauri:android:dev
```

## 3. SQLite migration

Database:

```text
sqlite:lythuyetlaixe.db
```

Phải verify migration v1 + v2:

```text
v1 → questions/progress/exam tables
v2 → traffic_sign_metadata + traffic_signs
```

## 4. Hai remote dataset

`.env.production`:

```env
VITE_QUESTIONS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/traffic-signs/manifest.json
```

Question flow:

```text
manifest → questions.json/assets.zip → dataset-assets/<version>/ → SQLite
```

Traffic-sign flow:

```text
manifest → traffic-signs.json/traffic-sign-assets.zip → traffic-sign-assets/<version>/ → SQLite
```

Verify update một dataset không xóa/thay đổi dataset còn lại.

## 5. Storage

```text
Question assets:
AppData/dataset-assets/<version>/...

Traffic-sign assets:
AppData/traffic-sign-assets/<version>/...

Preferences:
settings.json
```

Tất cả dùng AppData/platform-neutral APIs, không hard-code Windows path.

## 6. Navigation / Android Back

Frontend có back-handler stack:

```text
LearningSession       priority 100
Exam session          priority 90
Application section   priority 10
Android system        fallback
```

- câu hỏi → Back về collection;
- đang thi → confirm bỏ đề;
- kết quả → về exam setup;
- feature cấp cao → về section trước;
- root không giữ Android Back.

## 7. Notification

Settings hỗ trợ permission/test/daily reminder qua `@tauri-apps/plugin-notification`.

Cần device verification cho Android 13+, battery optimization, restart/reboot, schedule/cancel.

## 8. Runtime Diagnostics

Diagnostics hiện phải hiển thị riêng:

- `VITE_QUESTIONS_MANIFEST_URL`;
- `VITE_TRAFFIC_SIGNS_MANIFEST_URL`;
- 600 câu / 60 critical / category / answer/license integrity;
- question source/content/asset checksums;
- traffic-sign count/version/source/content/asset checksums;
- hai AppData asset roots;
- Store;
- notification state.

## 9. Build

Debug APK:

```powershell
pnpm tauri:android:build:debug
```

Release APK:

```powershell
pnpm release:android:apk:local
```

AAB:

```powershell
pnpm release:android:aab:local
```

Release cần signing/keystore.

## 10. Device checklist

- [ ] `tauri android init` thành công;
- [ ] migration v1/v2 thành công;
- [ ] first-run 600 câu tải/import được;
- [ ] first-run traffic-sign catalog tải/import độc lập;
- [ ] question images hiển thị;
- [ ] traffic-sign images hiển thị;
- [ ] offline học/thi/tra cứu được;
- [ ] question update giữ progress và không xóa traffic signs;
- [ ] traffic-sign update không chạm questions/progress;
- [ ] Store hoạt động;
- [ ] Back toàn bộ flow đúng;
- [ ] notification permission/test/schedule/cancel đúng;
- [ ] responsive/touch kiểm tra trên nhiều kích thước;
- [ ] APK debug cài được;
- [ ] APK/AAB release tạo được;
- [ ] upgrade app giữ SQLite/assets/preferences.
