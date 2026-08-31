# Processed dataset

Production working set được tạo local tại:

```text
data/processed/
├── questions.json
└── assets/
    └── images/
        ├── q301.png
        └── ...
```

Không tạo hoặc commit một dataset production giả chỉ để UI chạy.

Trước khi phát hành cần:

- extract đủ 600 câu từ nguồn chính thức;
- xác minh đáp án;
- đúng đủ 60 câu điểm liệt;
- xử lý và review hình biển báo/sa hình;
- không còn `needsVerification=true`;
- mỗi câu có đúng 1 đáp án đúng;
- mọi `question.image` tồn tại dưới `data/processed/assets/`;
- chạy validator local thành công khi maintainer chủ động kiểm tra.

Sau đó:

```powershell
pnpm dataset:publish
```

Publisher tạo remote distribution package dưới:

```text
dist/dataset/
├── dataset-manifest.json
├── questions.json
└── assets.zip
```

Production app **không đọc trực tiếp `data/processed/` và không bundle bộ 600 câu**. Installer chỉ chứa application code/schema. App tải distribution package từ endpoint cố định, verify, cache assets vào AppData và import questions vào SQLite.

Browser development vẫn có thể dùng `src/data/demo.ts`; Tauri production dùng SQLite local sau bootstrap.
