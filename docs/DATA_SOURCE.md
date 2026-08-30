# Nguồn dữ liệu bộ 600 câu

## Source of truth

Dữ liệu production của ứng dụng chỉ được tạo từ tài liệu chính thức của Cục Cảnh sát giao thông (Bộ Công an).

### Bộ 600 câu hỏi

- Cơ quan: Cục Cảnh sát giao thông — Bộ Công an.
- Tên: **600 câu hỏi dùng cho sát hạch lái xe cơ giới đường bộ**.
- Năm: 2025.
- URL chính thức:
  `https://www.csgt.vn/upload/services/273963059_B%E1%BB%99%20600%20c%C3%A2u%20h%E1%BB%8Fi%20d%C3%B9ng%20cho%20s%C3%A1t%20h%E1%BA%A1ch%20l%C3%A1i%20xe%20c%C6%A1%20gi%E1%BB%9Bi%20%C4%91%C6%B0%E1%BB%9Dng%20b%E1%BB%99.pdf`

### Hướng dẫn sử dụng

- Công văn: **2262/CSGT-P5**.
- Ngày: **07/05/2025**.
- Áp dụng bộ 600 câu từ: **01/06/2025**.
- URL chính thức:
  `https://www.csgt.vn/upload/services/2071319603_H%C6%B0%E1%BB%9Bng%20d%E1%BA%ABn%20s%E1%BB%AD%20d%E1%BB%A5ng%20b%E1%BB%99%20c%C3%A2u%20h%E1%BB%8Fi%20s%C3%A1t%20h%E1%BA%A1ch%20GPLX%20%28CV%202262.07.5.2025%29.pdf`

## Bố cục được dùng để validate

| Nhóm | Khoảng câu | Số câu |
| --- | ---: | ---: |
| Quy định chung và quy tắc giao thông | 1–180 | 180 |
| Văn hóa giao thông, đạo đức, PCCC, cứu hộ/cứu nạn | 181–205 | 25 |
| Kỹ thuật lái xe | 206–263 | 58 |
| Cấu tạo và sửa chữa | 264–300 | 37 |
| Báo hiệu đường bộ | 301–485 | 185 |
| Sa hình và xử lý tình huống | 486–600 | 115 |

Tổng: **600 câu**.

Công văn xác định có **60 câu về xử lý tình huống mất an toàn giao thông nghiêm trọng**. Sai câu này trong đề sát hạch được tính là điểm liệt.

## Quy tắc nhập dữ liệu

1. Không crawl đáp án từ app/web bên thứ ba để làm dữ liệu gốc.
2. Không dùng AI để đoán đáp án.
3. Phần đáp án đúng trong tài liệu chính thức phải được đối chiếu trước khi dataset được đánh dấu `validated`.
4. Hình biển báo/sa hình phải gắn đúng `questionId`.
5. Mỗi dataset phải có `version`, `validFrom` và thông tin nguồn.
6. Dataset chưa qua validator không được seed vào database production.
7. Khi tài liệu nhà nước thay đổi, tạo dataset version mới; không sửa lịch sử dataset cũ tại chỗ.

## Pipeline mục tiêu

```text
Official PDF
    |
    +--> text/image extractor
    |
    +--> raw JSON
    |
    +--> manual/automated verification
    |
    +--> normalized JSON
    |
    +--> validator
    |
    +--> SQLite importer
```

## Trạng thái

Hiện repository mới có contract + validator foundation. **Chưa có dữ liệu 600 câu production trong repo.**
