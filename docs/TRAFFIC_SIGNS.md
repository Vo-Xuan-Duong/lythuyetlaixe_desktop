# Kiến thức và catalog biển báo giao thông

Module `Kiến thức biển báo` gồm **hai lớp dữ liệu**:

1. kiến thức 5 nhóm cơ bản được bundle cùng binary để luôn đọc được;
2. catalog từng biển là dataset production **độc lập hoàn toàn** với bộ 600 câu.

## Nguồn

Kiến thức phân loại hiện bám theo `QCVN 41:2024/BGTVT`, ban hành kèm `Thông tư 51/2024/TT-BGTVT`, hiệu lực từ `01/01/2025`.

Provenance của phần kiến thức nhóm nằm tại:

```text
data/source/traffic-signs-knowledge-source.json
```

Catalog từng biển phải có provenance riêng trong:

```text
data/traffic-signs/source/
```

Không dùng website/app luyện thi bên thứ ba làm source of truth.

## Tách khỏi bộ 600 câu

```text
600 questions
├── metadata: dataset_metadata
├── tables: categories/questions/answers/...
├── cache: $APPDATA/dataset-assets/<version>/
└── env: VITE_QUESTIONS_MANIFEST_URL

Traffic signs
├── metadata: traffic_sign_metadata
├── table: traffic_signs
├── cache: $APPDATA/traffic-sign-assets/<version>/
└── env: VITE_TRAFFIC_SIGNS_MANIFEST_URL
```

Version/checksum/update của hai dataset không phụ thuộc nhau.

## Traffic-sign record

Production `traffic-signs.json` có dạng:

```json
{
  "dataset": "VN_TRAFFIC_SIGNS",
  "version": "2025.01",
  "validFrom": "2025-01-01",
  "stage": "production",
  "sourceDocument": "QCVN 41:2024/BGTVT",
  "sourceSha256": "<sha256-source-document>",
  "signs": [
    {
      "code": "<official-code>",
      "name": "<official-name>",
      "groupCode": "PROHIBITION",
      "meaning": "<verified-meaning>",
      "recognition": "<optional>",
      "scope": "<optional>",
      "exceptions": [],
      "notes": "<optional>",
      "image": "signs/<file>.svg",
      "keywords": [],
      "sourceVersion": "QCVN 41:2024/BGTVT"
    }
  ]
}
```

`groupCode` chỉ nhận:

```text
PROHIBITION
MANDATORY
WARNING
INDICATION
SUPPLEMENTARY
```

Không thêm record cụ thể nếu tên/ý nghĩa/phạm vi chưa được đối chiếu nguồn chính thức.

## Local workspace

```text
data/traffic-signs/
├── source/
└── processed/
    ├── traffic-signs.json
    └── assets/
        └── signs/...
```

Validate:

```powershell
pnpm signs:validate
```

Publish:

```powershell
pnpm signs:publish
```

Output:

```text
dist/traffic-signs/
├── manifest.json
├── traffic-signs.json
└── traffic-sign-assets.zip   # chỉ có nếu dataset dùng ảnh
```

## R2 layout đề xuất

```text
lythuyetlaixe/
├── questions/
│   ├── dataset-manifest.json
│   └── releases/<version>/...
└── traffic-signs/
    ├── manifest.json
    └── releases/<version>/...
```

App dùng hai URL khác nhau:

```env
VITE_QUESTIONS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://data.example.com/lythuyetlaixe/traffic-signs/manifest.json
```

## Runtime traffic-sign flow

```text
traffic-signs/manifest.json
        ↓
verify version/source/content SHA-256
        ↓
traffic-signs.json
        ↓
validate code/group/name/meaning/image path
        ↓
traffic-sign-assets.zip
        ↓
safe AppData install
        ↓
SQLite transaction → traffic_signs
        ↓
offline catalog
```

Nếu download/update lỗi nhưng máy đã có version hợp lệ, app giữ catalog local.

## Quan hệ với đáp án 600 câu

Catalog biển báo dùng để học/tra cứu. Nó **không phải nguồn đáp án** cho bộ 600 câu. Nhóm `ROAD_SIGNS` trong bộ 600 câu vẫn phải qua answer/image verification pipeline riêng.
