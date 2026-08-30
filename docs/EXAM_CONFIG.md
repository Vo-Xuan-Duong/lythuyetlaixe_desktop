# Exam configuration provenance

Exam Engine không hard-code cấu trúc thi trong React component. Mọi cấu hình được resolve theo hạng GPLX, dataset version và khoảng thời gian hiệu lực.

## Dataset 2025.06 — giai đoạn đến 28/02/2027

Nguồn cấu trúc đề: Công văn 2262/CSGT-P5 ngày 07/05/2025 của Cục CSGT về việc sử dụng bộ 600 câu hỏi sát hạch lái xe cơ giới đường bộ.

Nguồn chính thức:

- Hướng dẫn/Công văn 2262: https://cuccsgt.bocongan.gov.vn/upload/services/2071319603_H%C6%B0%E1%BB%9Bng%20d%E1%BA%ABn%20s%E1%BB%AD%20d%E1%BB%A5ng%20b%E1%BB%99%20c%C3%A2u%20h%E1%BB%8Fi%20s%C3%A1t%20h%E1%BA%A1ch%20GPLX%20%28CV%202262.07.5.2025%29.pdf
- Thông tư 108/2026/TT-BCA: https://vanban.chinhphu.vn/?docid=218725&pageid=27160

Cấu hình engine hiện hỗ trợ:

| Hạng | Số câu | Thời gian | Điểm đạt | Điểm liệt | Quota thường (không tính câu điểm liệt) |
| --- | ---: | ---: | ---: | ---: | --- |
| B | 30 | 20 phút | 27 | 1 | Quy tắc 8, Văn hóa 1, Kỹ thuật 1, Cấu tạo 1, Biển báo 9, Sa hình 9 |
| C1 | 35 | 22 phút | 32 | 1 | Quy tắc 10, Văn hóa 1, Kỹ thuật 2, Cấu tạo 1, Biển báo 10, Sa hình 10 |
| C | 40 | 24 phút | 36 | 1 | Quy tắc 10, Văn hóa 1, Kỹ thuật 2, Cấu tạo 1, Biển báo 14, Sa hình 11 |
| D1/D2/D/BE/C1E/CE/D1E/D2E/DE | 45 | 26 phút | 41 | 1 | Quy tắc 10, Văn hóa 1, Kỹ thuật 2, Cấu tạo 1, Biển báo 16, Sa hình 14 |

Engine chọn câu điểm liệt từ pool `critical=true` riêng, sau đó chọn các quota còn lại chỉ từ câu `critical=false`. Cách này bảo đảm không trùng ID và không vô tình tính câu điểm liệt hai lần trong quota chủ đề.

## Mốc 01/03/2027

Thông tư 108/2026/TT-BCA đưa vào cấu trúc sát hạch lý thuyết mới với số câu/thời gian/điểm đạt thay đổi và bỏ cơ chế câu điểm liệt trong format mới.

Dự án **không tự động dùng dataset 2025.06 để mô phỏng cấu trúc mới**. `resolveExamConfig()` hiện trả `null` sau 28/02/2027 cho các config dựa trên bộ 600 phiên bản 2025.06.

Chỉ thêm config từ 01/03/2027 khi đồng thời xác minh được:

1. dataset/question format tương thích;
2. nguồn chính thức cho cấu trúc lựa chọn câu;
3. các loại câu hỏi mới nếu có;
4. validator và UI hỗ trợ đầy đủ format mới.

Điều này ngăn ứng dụng hiển thị một bài “thi chuẩn” nhưng thực tế sử dụng sai bộ câu hỏi hoặc sai cấu trúc.
