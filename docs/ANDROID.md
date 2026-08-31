# Android bring-up — chạy local

Ứng dụng được thiết kế Windows trước nhưng domain, SQLite contract, dataset bootstrap, AppData asset cache và preferences đã được giữ platform-neutral để dùng lại trên Android.

> Các lệnh trong tài liệu này dành cho máy local. Repository không tự chạy Android build bằng GitHub Actions.

## 1. Yêu cầu môi trường

Cài đặt:

- Android Studio;
- JDK phù hợp với Android Gradle Plugin/Tauri hiện hành;
- Android SDK;
- Android SDK Platform/Build Tools;
- Android NDK;
- Rust Android targets theo hướng dẫn Tauri;
- thiết bị thật bật USB debugging hoặc Android Emulator.

Tauri hiện hỗ trợ Android từ SDK 24. `src-tauri/tauri.conf.json` đã khóa:

```json
{
  "bundle": {
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

## 2. Khởi tạo Android project

Chỉ cần chạy một lần trên máy phát triển sau khi Android toolchain sẵn sàng:

```powershell
pnpm tauri:android:init
```

Không chỉnh sửa thủ công generated Gradle project trước khi xác định thay đổi nào thực sự cần platform-specific customization.

## 3. Chạy development trên thiết bị/emulator

```powershell
pnpm tauri:android:dev
```

Các điểm phải kiểm tra đầu tiên:

1. SQLite migration tạo `lythuyetlaixe.db` thành công.
2. First-run dataset manifest tải được.
3. `assets.zip` giải nén được vào AppData.
4. Ảnh câu hỏi hiển thị qua asset protocol.
5. Tauri Store đọc/ghi `settings.json`.
6. Android Back quay đúng màn hình.
7. Back trong lúc thi hỏi xác nhận trước khi bỏ đề.
8. App hoạt động offline sau khi dataset đã được cài.

## 4. Navigation / Android Back

Frontend có back-handler stack riêng:

```text
LearningSession       priority 100
Exam session          priority 90
Application section   priority 10
Android system        fallback
```

Quy tắc:

- đang xem câu hỏi → Back về catalog/review trước;
- đang thi → Back hỏi xác nhận trước khi bỏ đề;
- đang xem kết quả → Back về setup thi;
- đang ở feature cấp cao → Back về section trước;
- ở root/dashboard và không có history → không giữ Android Back.

## 5. Storage

### SQLite

```text
sqlite:lythuyetlaixe.db
```

Được quản lý bởi `@tauri-apps/plugin-sql`.

### Dataset assets

```text
AppData/dataset-assets/<dataset-version>/...
```

Được quản lý bằng `BaseDirectory.AppData`, không hard-code đường dẫn Windows.

### Preferences

```text
settings.json
```

Được quản lý bằng `@tauri-apps/plugin-store`. Browser preview vẫn dùng `localStorage` fallback.

## 6. Notification ôn tập

Settings có:

- bật/tắt nhắc ôn;
- giờ nhắc theo local time;
- gửi notification thử;
- xin permission native khi cần.

Implementation dùng `@tauri-apps/plugin-notification` và stable notification ID.

Phần này **bắt buộc kiểm tra trên thiết bị thật** vì behavior schedule/cancel có thể phụ thuộc Android version, battery optimization và implementation của plugin.

Checklist:

- permission prompt trên Android 13+;
- notification test xuất hiện;
- daily schedule xuất hiện đúng giờ;
- app restart không tạo nhiều reminder trùng nhau;
- tắt reminder không còn notification mới;
- reboot thiết bị và kiểm tra lịch còn hoạt động theo behavior của plugin/platform.

## 7. Build APK debug

Sau `android init`:

```powershell
pnpm tauri:android:build:debug
```

Dùng để cài trực tiếp/test nội bộ.

## 8. Build APK release

```powershell
pnpm release:android:apk:local
```

Lệnh này chạy `release:check` trước để đảm bảo version trong:

- `package.json`;
- `src-tauri/tauri.conf.json`;
- `src-tauri/Cargo.toml`

khớp nhau.

## 9. Build AAB release

```powershell
pnpm release:android:aab:local
```

AAB là artifact phù hợp cho Google Play. Cần cấu hình signing/keystore theo quy trình release thực tế trước khi phân phối.

## 10. Release checklist Android

Không đánh dấu Android production-ready trước khi hoàn thành:

- [ ] `tauri android init` thành công;
- [ ] SQL plugin hoạt động trên thiết bị;
- [ ] FS/AppData assets hoạt động;
- [ ] Tauri Store hoạt động;
- [ ] Remote dataset first-run thành công;
- [ ] Offline startup thành công;
- [ ] Android Back đúng ở toàn bộ feature;
- [ ] notification permission/test/schedule thành công;
- [ ] responsive/touch kiểm tra trên ít nhất phone nhỏ + phone lớn;
- [ ] APK debug cài được;
- [ ] APK release/signing kiểm tra được;
- [ ] AAB release tạo được;
- [ ] kiểm tra upgrade app không xóa SQLite/progress/assets.
