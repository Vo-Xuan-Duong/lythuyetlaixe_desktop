# Traffic signs source

Thư mục này dành riêng cho provenance của catalog biển báo, tách hoàn toàn khỏi bộ 600 câu.

Nguồn catalog hiện hướng tới `QCVN 41:2024/BGTVT`, ban hành kèm `Thông tư 51/2024/TT-BGTVT`, hiệu lực từ `01/01/2025`.

Machine-readable provenance:

```text
source-manifest.json
```

Tải file nguồn chính thức và ghi SHA-256 local bằng:

```powershell
pnpm signs:source:download
pnpm signs:status
```

Tool sẽ lưu file được khai báo ở `localFile` trong thư mục này và cập nhật `sourceSha256`. File PDF/raw bị `.gitignore`; chỉ provenance manifest được commit.

`sourceSha256` chỉ chứng minh catalog được đối chiếu với đúng snapshot tài liệu nguồn đã tải. Trước khi dùng cho production vẫn phải mở/kiểm tra tài liệu đúng quy chuẩn dự kiến.

Không dùng website/app luyện thi bên thứ ba làm source of truth cho mã, tên, ý nghĩa, phạm vi hoặc ngoại lệ của biển.
