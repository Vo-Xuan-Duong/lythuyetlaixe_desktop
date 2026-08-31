# Remote dataset lifecycle

## Mục tiêu

Ứng dụng dùng **hai dataset production độc lập**:

```text
VN_GPLX_600
  → bộ 600 câu + ảnh câu hỏi

VN_TRAFFIC_SIGNS
  → catalog từng biển + ảnh biển báo
```

Hai dataset có manifest URL, version, checksum, SQLite metadata/table và AppData asset cache riêng. Update một dataset không được làm reload/import dataset còn lại.

## Cấu hình build

```env
VITE_QUESTIONS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/traffic-signs/manifest.json
```

`VITE_DATASET_MANIFEST_URL` chỉ còn là compatibility fallback cho bộ 600 câu cũ.

Production URL phải HTTPS. HTTP chỉ cho localhost development.

---

# Dataset 1 — 600 câu

## Runtime flow

```text
questions/dataset-manifest.json
        ↓
validate manifest/version/provenance/URL/size
        ↓
questions.json
        ↓
SHA-256 + runtime contract validation
        ↓
assets.zip (nếu có)
        ↓
safe extract → $APPDATA/dataset-assets/<version>/
        ↓
SQLite transaction
        ↓
Learning / Exam / Review / Statistics offline
```

Nếu SQLite import thất bại, asset version mới được rollback. Version cũ vẫn hoạt động.

### Integrity

```text
sourceSha256  = SHA-256 PDF chính thức
contentSha256 = SHA-256 questions.json
assetSha256   = SHA-256 assets.zip
```

Runtime importer kiểm tra:

- đúng `VN_GPLX_600` / production stage;
- source SHA-256 hợp lệ;
- đúng 600 ID;
- category đúng theo khoảng ID;
- đúng chính xác 60 câu điểm liệt;
- sourceVersion;
- 2–4 đáp án A–D và chính xác một đáp án đúng;
- hạng GPLX hợp lệ;
- image path an toàn.

### Publisher

```powershell
pnpm dataset:publish
```

Output:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

Upload payload trước, manifest cuối.

---

# Dataset 2 — Catalog biển báo

## Runtime flow

```text
traffic-signs/manifest.json
        ↓
validate manifest/version/source provenance
        ↓
traffic-signs.json
        ↓
SHA-256 + catalog validation
        ↓
traffic-sign-assets.zip (nếu có)
        ↓
safe extract → $APPDATA/traffic-sign-assets/<version>/
        ↓
SQLite transaction
        ↓
search/filter/detail offline
```

Catalog biển báo không phụ thuộc 600 câu. Nếu catalog chưa được cấu hình/tải, phần kiến thức 5 nhóm built-in vẫn dùng được.

### Integrity

```text
sourceSha256  = SHA-256 tài liệu/quy chuẩn nguồn
contentSha256 = SHA-256 traffic-signs.json
assetSha256   = SHA-256 traffic-sign-assets.zip
```

Runtime importer kiểm tra:

- đúng `VN_TRAFFIC_SIGNS` / production stage;
- version/validFrom hợp lệ;
- `sourceDocument` + source SHA-256;
- code biển unique, path-safe;
- group chỉ thuộc 5 nhóm hỗ trợ;
- name/meaning/sourceVersion bắt buộc;
- exceptions/keywords là string arrays;
- image path relative và extension cho phép.

### Publisher

```powershell
pnpm signs:validate
pnpm signs:publish
```

Input:

```text
data/traffic-signs/processed/
├── traffic-signs.json
└── assets/
```

Output:

```text
dist/traffic-signs/
├── manifest.json
├── traffic-signs.json
└── traffic-sign-assets.zip
```

Không tạo record production bằng suy đoán. Tên/ý nghĩa/phạm vi/ngoại lệ/hình phải có provenance chính thức.

---

# Storage local

```text
SQLite: lythuyetlaixe.db

Question metadata:
  dataset_metadata
Question data:
  categories/questions/answers/question_license_types/...
Question assets:
  $APPDATA/dataset-assets/<version>/

Traffic-sign metadata:
  traffic_sign_metadata
Traffic-sign data:
  traffic_signs
Traffic-sign assets:
  $APPDATA/traffic-sign-assets/<version>/
```

User progress/bookmark/exam history chỉ liên quan bộ câu hỏi và không bị xóa khi catalog biển báo update.

# R2 layout đề xuất

```text
lythuyetlaixe/
├── questions/
│   ├── dataset-manifest.json
│   └── releases/
│       └── <version>/...
└── traffic-signs/
    ├── manifest.json
    └── releases/
        └── <version>/...
```

Có thể đặt cả hai root trên cùng R2 custom domain để đơn giản CORS/CSP. Hai manifest vẫn độc lập.

## Publish an toàn

Cho mỗi dataset:

1. tạo version mới;
2. validate local;
3. upload JSON/assets version mới;
4. kiểm tra public GET;
5. upload/replace manifest **cuối cùng**.

Version đã phát hành là immutable. Same version + checksum khác sẽ không overwrite local snapshot.

# Network / CSP

Hiện production CSP cho `https:` chung vì host cuối chưa chốt. Sau khi cấu hình R2 custom domain, scope `connect-src` về đúng origin, ví dụ:

```text
https://data.example.com
```

Transport hiện dùng Web Fetch API nên R2/custom domain cần CORS GET/HEAD phù hợp.

# Trust model

SHA-256 chứng minh payload khớp manifest. HTTPS + quyền kiểm soát domain/storage là lớp trust hiện tại.

Nâng cấp tùy chọn sau 1.0: signed manifest với private key ở release pipeline và public key verify trong app.
