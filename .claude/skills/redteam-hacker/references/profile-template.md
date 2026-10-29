# Mẫu `REDTEAM-PROFILE.md` (hồ sơ dự án — tạo sau lần rà soát đầu, cập nhật mỗi lần)

Mục đích: lần sau chỉ cần đọc file này + chạy `recon.sh`, không phải dò lại cả repo. Ngắn gọn, có file:dòng.

```markdown
# Hồ sơ red team — <tên dự án>

## Quy ước
- Ngôn ngữ báo cáo / trả lời: <vi | en>; xưng hô: <…>.
- Báo cáo để ở: <đường dẫn>, đánh số SEC-n tiếp theo.
- Quy trình khi được duyệt vá: <vd spec + failing test → code; commit thẳng main / qua PR; quy ước phiên bản>.
- Lệnh: build `<…>`, test `<…>`, chạy cục bộ `<…>`, audit `<…>`.

## Stack & ranh giới tin cậy
- <frontend / backend / extension / BaaS / LLM…>
- Ranh giới: <client ↔ server, người dùng ↔ người dùng, tenant, extension ↔ trang web…>

## Tài sản cần bảo vệ
- <dữ liệu người dùng, phiên, khóa, tiền, quyền admin…>

## Cửa vào (nguồn không tin cậy)
| Nguồn | Ai điều khiển | Chỗ code |
|---|---|---|

## Lớp phòng thủ đã kiểm (có bằng chứng)
- <CSP …, RLS …, bộ lọc HTML …, danh sách trắng URL … — file:dòng>

## Kịch bản PoC
- Lệnh: `node <skill>/references/poc-browser.mjs … --scenario <file>`; selector / route chính; dữ liệu mẫu.

## Các lần rà soát
| Ngày | Phạm vi | Báo cáo | Kết quả |
|---|---|---|---|
```
