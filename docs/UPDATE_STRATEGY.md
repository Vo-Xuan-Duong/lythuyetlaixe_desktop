# Update strategy

Application binary, bộ 600 câu và catalog biển báo có version **độc lập**.

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

## 2. Question dataset version

Dataset:

```text
VN_GPLX_600
```

Ví dụ version:

```text
2025.06
2026.01
```

Thay version khi câu hỏi/đáp án/license/explanation/ảnh production thay đổi.

Remote root:

```text
/questions/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

Integrity:

```text
sourceSha256  = official PDF SHA-256
contentSha256 = questions.json SHA-256
assetSha256   = assets.zip SHA-256
```

## 3. Traffic-sign dataset version

Dataset:

```text
VN_TRAFFIC_SIGNS
```

Version độc lập, ví dụ:

```text
2025.01
2026.01
```

Thay version khi catalog từng biển, tên, ý nghĩa, phạm vi, ngoại lệ, keyword hoặc ảnh thay đổi theo nguồn chính thức.

Remote root:

```text
/traffic-signs/
├── manifest.json
├── traffic-signs.json
└── traffic-sign-assets.zip
```

Integrity:

```text
sourceSha256  = source regulation/document SHA-256
contentSha256 = traffic-signs.json SHA-256
assetSha256   = traffic-sign-assets.zip SHA-256
```

## 4. Activation độc lập

Question flow:

```text
question manifest
→ questions.json verify
→ question assets verify/install
→ SQLite question transaction
→ cleanup old question assets
```

Traffic-sign flow:

```text
traffic-sign manifest
→ traffic-signs.json verify
→ sign assets verify/install
→ SQLite traffic_signs transaction
→ cleanup old sign assets
```

Một flow fail không rollback hoặc thay đổi dataset còn lại.

## 5. Version bất biến

Không sửa payload mà giữ nguyên version.

Ví dụ không hợp lệ:

```text
traffic signs 2025.01 checksum A
       ↓ sửa nội dung
traffic signs 2025.01 checksum B
```

Phải phát hành version mới.

Runtime dùng `contentSha256 + assetSha256` làm package identity. `sourceSha256` chỉ là provenance.

## 6. Question legacy checksum migration

Development build cũ từng lưu nhầm `questions.json` checksum vào `dataset_metadata.sourceSha256`.

Runtime chỉ migrate khi cùng version, thiếu `contentSha256` và hash cũ khớp chính xác remote manifest content SHA-256.

Traffic-sign dataset là contract mới nên không có legacy migration này.

## 7. Database migration

Dataset content update không đồng nghĩa SQLite schema migration.

Hiện:

```text
migration v1 → questions/progress/exam
migration v2 → traffic_sign_metadata/traffic_signs
```

Nếu chỉ update content trong contract hiện tại thì không thêm migration.

Nếu app schema thay đổi, phải thêm migration mới; không sửa migration lịch sử đã phát hành.

## 8. User data isolation

Question update phải giữ:

- `user_progress`;
- bookmark;
- exam history.

Traffic-sign update không được đụng các bảng user progress/exam.

Reset user data cũng không được xóa production question/sign datasets.

## 9. Compatibility

ExamConfig chỉ phụ thuộc question dataset phù hợp với quy định thi.

Traffic-sign catalog là kiến thức/tra cứu độc lập và **không được dùng để tự suy đoán đáp án 600 câu**.

## 10. Release decision matrix

| Thay đổi | Questions release | Traffic-sign release | App installer mới |
| --- | --- | --- | --- |
| Sửa câu hỏi/đáp án verified | Có | Không | Không |
| Sửa ảnh câu hỏi/sa hình | Có | Không | Không |
| Thêm explanation verified | Có | Không | Không |
| Sửa tên/ý nghĩa một biển | Không | Có | Không |
| Sửa/thêm ảnh biển báo | Không | Có | Không |
| Quy chuẩn biển báo thay đổi | Không bắt buộc | Có | Có thể nếu contract/UI đổi |
| Thay UI | Không | Không | Có |
| Thay SQLite schema | Có thể | Có thể | Có |
| Thay download/security logic | Không bắt buộc | Không bắt buộc | Có |
| Đổi compiled manifest host | Không | Không | Có |

## 11. Production transport/security

Hai manifest URL production bắt buộc HTTPS.

Questions payload cùng origin với question manifest; traffic-sign payload cùng origin với traffic-sign manifest.

Khuyến nghị đặt cả hai trên cùng R2 custom domain để CORS/CSP đơn giản:

```text
https://data.example.com/lythuyetlaixe/questions/...
https://data.example.com/lythuyetlaixe/traffic-signs/...
```

CSP hiện cho generic `https:` vì host chưa chốt. Trước public release phải scope `connect-src` về exact origin.

SHA-256 + HTTPS là trust model bản đầu. Signed manifests có thể bổ sung sau.

## 12. Production recommendation

Trước Desktop release candidate:

1. hoàn thiện 600 câu + question assets verified;
2. hoàn thiện traffic-sign catalog nếu đưa vào 1.0;
3. publish hai package lên R2;
4. test first-run/update/offline/rollback độc lập;
5. frontend/Rust checks local;
6. Runtime Diagnostics sạch lỗi production;
7. build/test NSIS Windows 10/11.
