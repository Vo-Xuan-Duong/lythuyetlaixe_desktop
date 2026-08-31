# Traffic signs source

Thư mục này dành riêng cho provenance của catalog biển báo, tách hoàn toàn khỏi bộ 600 câu.

Nguồn production hiện là `QCVN 41:2024/BGTVT`, ban hành kèm `Thông tư 51/2024/TT-BGTVT`, hiệu lực từ `01/01/2025`.

Machine-readable provenance:

```text
source-manifest.json
```

## Hai lớp nguồn

`legalBasis` lưu văn bản ban hành chính thức từ CSDL VBPL.

`technicalSource` là source of truth cho nội dung từng biển và được lấy từ Công báo Chính phủ dưới dạng đúng 5 phần:

```text
1359+1360
1361+1362
1363+1364
1365+1366
1367+1368
```

Không dùng PDF Thông tư ngắn hoặc website luyện thi bên thứ ba làm provenance cho nội dung từng biển.

## Download + provenance

```powershell
pnpm signs:source:download
pnpm signs:status
```

Downloader tìm đúng 5 PDF trên registry Công báo, chỉ chấp nhận HTTPS thuộc `chinhphu.vn`, lưu từng part local, tính SHA-256 từng part rồi ghép một PDF local để parser/reviewer sử dụng.

Production source identity:

```text
SHA(part 1..5 + issue/order)
          ↓
canonical bundle sourceSha256
```

PDF ghép có `combinedSha256` riêng và **không** được dùng thay `sourceSha256` production.

Source PDF/raw bị `.gitignore`; chỉ provenance manifest được commit.

## Human verification gate

Sau download:

```powershell
pnpm signs:source:verify -- --reviewer "<name>"
```

Verifier kiểm tra bundle đúng 5 part, PDF ghép đủ nội dung/phụ lục và các marker cần thiết. Chỉ sau đó `verificationStatus` mới trở thành:

```text
verified-official-full-source
```

Mọi record production phải được đối chiếu nguồn này, có `sourceSection`, `sourcePages`, `verifiedBy`, `verifiedAt`. Ảnh production cũng phải truy được về cùng canonical `sourceSha256` cùng page/crop provenance.

Chi tiết workflow: [`../../../docs/TRAFFIC_SIGNS.md`](../../../docs/TRAFFIC_SIGNS.md).
