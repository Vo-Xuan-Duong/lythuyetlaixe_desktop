# Update strategy

Application binary và dataset có version độc lập.

## 1. Application version

Ví dụ:

```text
0.1.0
0.2.0
1.0.0
```

Application version thay đổi khi code/native shell/schema/feature thay đổi.

Version phải đồng bộ ở:

```text
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
```

Kiểm tra local:

```powershell
pnpm release:check
```

Desktop dùng NSIS installer build local:

```powershell
pnpm release:windows:local
```

Binary auto-updater chưa bật ở giai đoạn đầu. App version mới được phân phối bằng installer mới.

## 2. Dataset version

Ví dụ:

```text
2025.06
2026.01
```

Dataset version thay đổi khi nội dung production thay đổi:

- câu hỏi/đáp án;
- metadata/license mapping;
- explanation đã xác minh;
- biển báo/sa hình/assets;
- source/config contract có thay đổi tương thích.

Remote package:

```text
https://<host>/lythuyetlaixe/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

## 3. Integrity / provenance

Không trộn ba loại hash:

```text
sourceSha256  = official PDF SHA-256
contentSha256 = installed questions.json SHA-256
assetSha256   = installed assets.zip SHA-256
```

Manifest chứa `sourceSha256` + `sha256` của `questions.json`; optional `assets.sha256` cho archive ảnh.

Bootstrap cross-check provenance manifest ↔ JSON trước runtime import.

## 4. Dataset activation

```text
manifest
   ↓ validate HTTPS/same-origin/version/hash/provenance
questions.json verify + runtime contract validate
   ↓
assets.zip verify + safe install (nếu có)
   ↓
SQLite transaction
   ↓
activate version mới
   ↓
cleanup asset version cũ
```

Nếu asset đã cài nhưng SQLite import lỗi, asset version mới được rollback. Nếu máy có dataset local hợp lệ thì app tiếp tục dùng version cũ.

## 5. Version bất biến

Không được sửa payload mà giữ nguyên version:

```text
2025.06 checksum A
        ↓ sửa payload
2025.06 checksum B   ← không hợp lệ
```

Phải phát hành version mới:

```text
2025.06
   ↓
2025.07
```

Runtime so `contentSha256 + assetSha256` cho immutable package identity. `sourceSha256` chỉ là provenance PDF, không dùng thay distribution checksum.

## 6. Legacy checksum migration

Một số development build cũ từng lưu nhầm `questions.json` checksum vào metadata `sourceSha256`.

Runtime chỉ migrate khi:

- local cùng dataset version;
- `contentSha256` chưa có;
- giá trị `sourceSha256` cũ khớp chính xác `manifest.sha256`.

Khi đó hash được chuyển sang `contentSha256` và source provenance cũ bị clear. Runtime không tự suy đoán PDF hash.

## 7. Database migration

Dataset content update không đồng nghĩa SQLite schema migration.

Nếu chỉ thay content trong contract hiện tại:

- giữ `user_progress` theo question ID;
- giữ bookmark;
- giữ exam history;
- không thêm SQL migration.

Nếu application version thay schema thì phải thêm migration mới, không sửa migration lịch sử đã phát hành.

## 8. Compatibility

ExamConfig chỉ resolve trong khoảng thời gian/dataset tương thích.

Không dùng dataset cũ để giả lập quy định thi mới nếu source/format mới chưa được xác minh.

## 9. Release decision matrix

| Thay đổi | Dataset release | App installer mới |
| --- | --- | --- |
| Sửa text/đáp án đã xác minh | Có | Không |
| Sửa/thêm ảnh | Có | Không |
| Thêm explanation verified | Có | Không |
| Thay UI | Không | Có |
| Thay SQLite schema | Có thể | Có |
| Thay download/security logic | Không bắt buộc | Có |
| Sửa Tauri/React bug | Không | Có |
| Đổi production dataset host compiled URL | Không | Có |

## 10. Production transport/security

Production dataset URL bắt buộc HTTPS và questions/assets phải cùng origin với manifest.

CSP hiện cho generic `https:` vì host chưa chốt. Trước public release, scope `connect-src` về đúng production origin.

Web Fetch hiện cần CORS. Native HTTP plugin có thể được cân nhắc sau khi host cố định; nếu dùng, capability chỉ cấp đúng host.

SHA-256 + HTTPS là trust model bản đầu. Signed manifest có thể bổ sung sau nếu cần chống compromise storage/CDN mạnh hơn.

## 11. Production recommendation

Trước Desktop release candidate:

1. hoàn thiện 600 câu + assets verified;
2. publish HTTPS package;
3. test first-run/update/offline/rollback local;
4. frontend/Rust checks local;
5. build/test NSIS Windows 10/11;
6. quyết định code signing theo kênh phân phối.

Sau bản offline ổn định mới đánh giá binary auto-update và cloud sync.
