# Kiến thức biển báo giao thông

Module `Kiến thức biển báo` là kiến thức nền được bundle cùng application binary và **không phụ thuộc** production dataset 600 câu.

## Nguồn

Nội dung phân loại hiện bám theo:

- `QCVN 41:2024/BGTVT`;
- ban hành kèm `Thông tư 51/2024/TT-BGTVT`;
- hiệu lực từ `01/01/2025`;
- Điều 11: phân loại biển báo hiệu.

Provenance machine-readable nằm tại:

```text
data/source/traffic-signs-knowledge-source.json
```

## 5 nhóm cơ bản

1. Biển báo cấm.
2. Biển hiệu lệnh.
3. Biển báo nguy hiểm và cảnh báo.
4. Biển chỉ dẫn.
5. Biển phụ, biển viết bằng chữ.

UI hiện trình bày cho mỗi nhóm:

- mục đích;
- đặc điểm nhận biết chủ yếu;
- mẹo ghi nhớ;
- ví dụ loại nội dung thường gặp.

Các hình dạng/màu sắc trong UI là minh họa phân loại, không thay thế hình biển chính thức và không được dùng làm nguồn đáp án sát hạch.

## Quan hệ với dataset 600 câu

Module kiến thức này tách khỏi production dataset:

```text
Built-in knowledge
    ↓
QCVN 41:2024/BGTVT

600-question dataset
    ↓
PDF/Công văn chính thức của Cục CSGT
```

Không được dùng nội dung built-in để tự suy đoán đáp án của câu hỏi production. Nhóm câu `ROAD_SIGNS` trong bộ 600 câu vẫn phải đi qua answer/image verification pipeline như các câu khác.

## Hướng mở rộng sau

Sau khi production assets ổn định, có thể mở rộng thành catalog từng biển:

```text
TrafficSign
├── code        # ví dụ mã biển theo quy chuẩn
├── group
├── name
├── image
├── meaning
├── scope
├── exceptions
├── relatedSigns
└── sourceVersion
```

Ưu tiên tiếp theo nếu triển khai catalog đầy đủ:

1. ingest danh mục/mã biển từ QCVN hiện hành;
2. dùng hình ảnh có provenance rõ ràng;
3. search theo mã/tên;
4. filter theo 5 nhóm;
5. trang chi tiết từng biển;
6. liên kết sang câu hỏi `ROAD_SIGNS` khi dataset 600 câu đã sẵn sàng;
7. version knowledge theo quy chuẩn để cập nhật khi văn bản thay đổi.
