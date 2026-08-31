# Update strategy

Ứng dụng có hai loại version độc lập và không nên trộn lẫn.

## 1. Application version

Ví dụ:

```text
0.1.0
0.2.0
1.0.0
```

Application version thay đổi khi có thay đổi code/native shell/schema/feature.

Version phải được đồng bộ ở:

```text
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
```

Bản Desktop đầu sử dụng **NSIS installer build local**:

```powershell
pnpm release:windows:local
```

Không bật binary auto-updater ở giai đoạn đầu. Khi có application version mới, phát hành installer mới và người dùng cài bản mới lên bản cũ.

Lý do:

- giảm surface native trước release đầu;
- tránh phải quản lý update signature/server riêng trong lúc production dataset còn đang hoàn thiện;
- dataset vốn đã có cơ chế cập nhật độc lập nên không cần release app chỉ để sửa câu hỏi.

Auto-updater cho binary có thể được bổ sung sau khi desktop 1.0 ổn định.

## 2. Dataset version

Ví dụ:

```text
2025.06
2026.01
```

Dataset version thay đổi khi nội dung chính thức thay đổi:

- câu hỏi;
- đáp án;
- metadata;
- explanation đã được xác minh;
- biển báo / sa hình / image assets;
- phạm vi hạng GPLX nếu dataset contract thay đổi.

Dataset được phát hành qua endpoint cố định:

```text
https://<host>/lythuyetlaixe/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

Ứng dụng kiểm tra manifest khi bootstrap. Nếu version/checksum mới:

```text
manifest
   ↓
questions.json verify
   ↓
assets.zip verify + install AppData
   ↓
transaction import SQLite
   ↓
activate version mới
   ↓
cleanup asset version cũ
```

Nếu update lỗi và máy đã có dataset local hợp lệ thì app tiếp tục dùng version cũ.

## 3. Version bất biến

Một dataset version đã phát hành là immutable.

Không được:

```text
2025.06 checksum A
        ↓ sửa file nhưng vẫn giữ version
2025.06 checksum B
```

Phải tạo version mới:

```text
2025.06
   ↓
2025.07
```

Runtime đã bảo vệ trường hợp cùng version nhưng checksum remote thay đổi: app giữ bản local thay vì tự overwrite.

## 4. Database migration

Dataset update không đồng nghĩa schema migration.

Nếu chỉ thay nội dung câu hỏi với contract hiện tại:

- không đổi migration;
- giữ `user_progress` theo question ID;
- giữ bookmark;
- giữ exam history.

Nếu application version cần thay schema SQLite thì phải thêm Tauri SQL migration mới và giữ migration cũ trong lịch sử.

## 5. Compatibility

ExamConfig phải chỉ resolve trong khoảng thời gian và dataset version tương thích.

Không dùng một dataset cũ để giả lập quy định thi mới nếu source/format mới chưa được xác minh.

## 6. Release decision matrix

| Thay đổi | Dataset release | App installer mới |
| --- | --- | --- |
| Sửa text/đáp án đã xác minh | Có | Không |
| Sửa/thêm ảnh | Có | Không |
| Thêm explanation trong contract hiện tại | Có | Không |
| Thay ExamConfig bằng data/code mới | Có thể | Có nếu code/config bundle thay đổi |
| Thay UI | Không | Có |
| Thay SQLite schema | Có thể | Có |
| Thay download/security logic | Không bắt buộc | Có |
| Sửa bug Tauri/React | Không | Có |

## 7. Production recommendation

Trước Desktop 1.0:

1. hoàn thiện dataset thật;
2. test first-run/update/offline local;
3. build NSIS local;
4. test Windows 10/11;
5. phát hành installer + dataset endpoint.

Sau Desktop 1.0 mới đánh giá thêm binary auto-update và code signing theo kênh phân phối thực tế.
