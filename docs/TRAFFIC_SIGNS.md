# Kiến thức và catalog biển báo giao thông

Module `Kiến thức biển báo` có hai lớp dữ liệu độc lập:

1. kiến thức 5 nhóm cơ bản bundle cùng binary, luôn đọc được;
2. catalog từng biển là remote dataset `VN_TRAFFIC_SIGNS`, tách hoàn toàn khỏi bộ 600 câu.

## Source of truth

Catalog production bám `QCVN 41:2024/BGTVT`, ban hành kèm `Thông tư 51/2024/TT-BGTVT`, hiệu lực từ `01/01/2025`.

Provenance nằm tại:

```text
data/traffic-signs/source/source-manifest.json
```

Nguồn được tách thành:

```text
legalBasis
└── CSDL VBPL / Thông tư 51/2024/TT-BGTVT

technicalSource
└── Công báo Chính phủ — 5 phần chính thức
    ├── 1359+1360
    ├── 1361+1362
    ├── 1363+1364
    ├── 1365+1366
    └── 1367+1368
```

`technicalSource.sourceSha256` **không** phải SHA-256 của PDF ghép. Nó là canonical bundle hash của đúng 5 part-hash theo thứ tự trên:

```text
1|1359+1360|<part-1-sha256>\n
2|1361+1362|<part-2-sha256>\n
...
5|1367+1368|<part-5-sha256>\n
        ↓ SHA-256
technicalSource.sourceSha256
```

PDF ghép `qcvn-41-2024-bgvt-full.pdf` chỉ dùng cho text/image extraction. Hash của nó được lưu riêng ở `technicalSource.combinedSha256`.

Không dùng website/app luyện thi bên thứ ba làm source of truth. `candidateReference` chỉ là typing aid và không thể đi qua production gate.

## Source acquisition / verification

Cài PyMuPDF bằng requirements chung của data tooling:

```powershell
python -m pip install -r tools/dataset/requirements.txt
```

Tải nguồn:

```powershell
pnpm signs:source:download
```

Tool:

- tải legal-basis PDF;
- đọc registry Công báo Chính phủ;
- yêu cầu đúng 5 issue đã khai báo;
- chỉ chấp nhận technical PDFs/redirect trong `*.chinhphu.vn`;
- tải/hash từng part;
- ghép PDF local cho parser;
- ghi `sourceSha256` canonical bundle + `combinedSha256`.

Sau đó xác minh nội dung:

```powershell
pnpm signs:source:verify -- --reviewer "<reviewer>"
```

Verifier yêu cầu đầy đủ QCVN và kiểm tra marker của Phụ lục B–F cùng các mã đại diện. Chỉ sau bước này `verificationStatus` mới thành:

```text
verified-official-full-source
```

## Candidate extraction

Text candidate:

```powershell
pnpm signs:candidates:official
```

Output local:

```text
data/traffic-signs/raw/official-candidates.json
```

Candidate extractor map:

```text
Appendix B → PROHIBITION
Appendix C → WARNING
Appendix D → MANDATORY
Appendix E → INDICATION
Appendix F → SUPPLEMENTARY
```

Nó hỗ trợ mã biến thể, bao gồm các mã có dấu phẩy như `S.H,3`. Nếu section không detect được code, production gate dừng để reviewer sửa candidate metadata thay vì đoán.

Ảnh candidate:

```powershell
pnpm signs:candidates:images
```

Tool render vùng graphic gần caption `Hình B.x/C.x/...` từ chính PDF QCVN đã verify vào:

```text
data/traffic-signs/raw/image-candidates/
```

Ảnh này vẫn chỉ là candidate.

## Manual review workflow

Chuẩn bị review:

```powershell
pnpm signs:review:prepare
pnpm signs:review:workspace
```

Mở:

```text
data/traffic-signs/raw/review-workspace.html
```

Workspace hỗ trợ:

- search/filter theo nhóm và trạng thái;
- sửa tên, ý nghĩa, nhận biết, phạm vi, ngoại lệ, note, keywords;
- ghi `sourceSection`, `sourcePages`, reviewer và thời điểm verify;
- xem candidate text;
- xem gallery candidate image;
- chọn một candidate image;
- hoặc nhập manual crop trực tiếp từ PDF QCVN bằng `page + x0,y0,x1,y1`;
- export lại `manual-review.json`.

### Quy trình ảnh hai bước

Chọn candidate/manual crop **không đồng nghĩa ảnh đã được xác minh**.

Sau khi export `manual-review.json` về:

```text
data/traffic-signs/raw/manual-review.json
```

chạy:

```powershell
pnpm signs:review:images
pnpm signs:review:workspace
```

`signs:review:images` sẽ:

- candidate mode: kiểm tra candidate thuộc đúng official section/code rồi copy vào processed assets;
- manual crop mode: render trực tiếp crop từ PDF QCVN đã verify;
- ghi image provenance gồm canonical source hash, section, page, crop và processed asset;
- reset `imageVerified=false` khi lựa chọn/crop thay đổi.

Sau đó reviewer mở lại workspace, xem **processed asset**, rồi mới bật `imageVerified=true` nếu ảnh đúng.

## Production record contract

Ví dụ record có ảnh:

```json
{
  "code": "P.102",
  "name": "<official-name>",
  "groupCode": "PROHIBITION",
  "meaning": "<verified-meaning>",
  "recognition": "<optional>",
  "scope": "<optional>",
  "exceptions": [],
  "notes": "<optional>",
  "image": "signs/p.102.png",
  "imageVerified": true,
  "imageSelection": {
    "method": "official-qcvn-candidate",
    "sourceSha256": "<canonical-five-part-source-sha256>",
    "sourceSection": "B.x",
    "page": 123,
    "crop": [10.0, 20.0, 100.0, 120.0],
    "candidateFile": "image-candidates/b.x-1.png",
    "processedAsset": "signs/p.102.png"
  },
  "keywords": [],
  "sourceVersion": "QCVN 41:2024/BGTVT",
  "sourceSection": "B.x",
  "sourcePages": [123, 124],
  "verifiedBy": "<reviewer>",
  "verifiedAt": "<ISO-8601>"
}
```

Manual crop dùng:

```json
"method": "official-qcvn-manual-crop"
```

và không có `candidateFile`.

Allowed groups:

```text
PROHIBITION
MANDATORY
WARNING
INDICATION
SUPPLEMENTARY
```

Release/runtime gate yêu cầu per-sign provenance, và với record có ảnh còn yêu cầu image provenance khớp canonical QCVN source bundle.

## Promotion / publish

Sau khi tất cả record và ảnh cần thiết đã verify:

```powershell
pnpm signs:status
pnpm signs:finalize
```

`signs:review:apply` yêu cầu code set của manual review khớp **chính xác** code set trong official candidates. Thiếu một biển hoặc có code ngoài candidate chính thức sẽ fail.

Production workspace:

```text
data/traffic-signs/processed/
├── traffic-signs.json
└── assets/
    └── signs/...
```

Output:

```text
dist/traffic-signs/
├── manifest.json
└── releases/
    └── <version>/
        ├── traffic-signs.json
        └── traffic-sign-assets.zip   # khi có ảnh
```

Root manifest gồm `sourceSha256`, `sourcePartCount`, `signCount`, content hash và asset hash. Publisher không cho thay bytes của cùng một version.

## Dataset isolation / runtime

```text
600 questions
├── env: VITE_QUESTIONS_MANIFEST_URL
├── metadata: dataset_metadata
└── cache: $APPDATA/dataset-assets/<version>/

Traffic signs
├── env: VITE_TRAFFIC_SIGNS_MANIFEST_URL
├── metadata: traffic_sign_metadata
├── table: traffic_signs
└── cache: $APPDATA/traffic-sign-assets/<version>/
```

Traffic-sign update không làm reload/reset 600 câu. Runtime còn verify schema, provenance, checksum, `signCount`, asset path và image provenance trước SQLite import.

## Status / local validation

```powershell
pnpm signs:status
pnpm signs:validate
pnpm signs:test
```

`signs:status` báo riêng số official parts downloaded/hash-verified, bundle SHA, combined PDF SHA, candidate sections/images, manual-review progress, image selection/verification, production package và bước tiếp theo.

## R2

Target:

```text
lythuyetlaixe/traffic-signs/
├── manifest.json
└── releases/<version>/...
```

Upload release payload trước và `manifest.json` cuối. Xem [`R2_DEPLOYMENT.md`](./R2_DEPLOYMENT.md).

## Relation to the 600-question bank

Traffic-sign catalog là nội dung học/tra cứu độc lập. Nó **không được dùng để suy luận đáp án** của `VN_GPLX_600`; nhóm `ROAD_SIGNS` trong 600 câu vẫn đi qua answer/image verification pipeline riêng.
