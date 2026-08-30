# Processed dataset

File production dự kiến:

```text
data/processed/questions.json
```

Không commit dataset hoàn chỉnh vào thư mục này cho đến khi:

- extract đủ 600 câu;
- đối chiếu đáp án;
- đánh dấu đủ 60 câu điểm liệt;
- map hình ảnh;
- chạy `pnpm dataset:validate` thành công.

UI foundation hiện dùng `src/data/demo.ts`, không đọc dữ liệu trong thư mục này.
