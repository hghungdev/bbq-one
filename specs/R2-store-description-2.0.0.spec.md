# R2 — Mô tả Chrome Web Store cho 2.0.0

> **Failing test:** `specs/R2-store-description-2.0.0.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "Phần mô tả này mình cần chỉnh sửa lại không chuyên gia" (dán mô tả đang hiện trên
> Store — bản thời 1.2.1).

## Sai / cũ so với hành vi thật (2.0.0)

| Trên Store | Thực tế |
|---|---|
| Bookmark "Optional PIN encryption when signed in"; "PIN-protected bookmarks" được mã hóa | PIN đã gỡ ở 2.0.0 (S3a); bản sao lưu Bookmark lưu dạng thường dưới tài khoản (RLS) |
| "retro-inspired dashboard" | Giao diện phẳng kiểu Gmail: thanh dọc, ⚙ + tài khoản trên header (U11–U26) |
| Lịch: "today/tomorrow banner" | Chip Hôm nay / Ngày mai trên header (U6, U21); lặp tuần / tháng / năm; đánh dấu xong một chạm; tick từng việc quá hạn |
| Không có Google Calendar | Link Google Calendar một chiều, riêng tư (G1) — chỉ khi đăng nhập + tự tạo |
| "talks only to **your** Supabase project" | Người dùng Store dùng backend Supabase của BBQOne, không phải project của họ |
| "WHAT'S NEW IN 1.2.1" | 2.0.0 |

## Sửa

- `docs/chrome-store-detailed-description.txt` (bản dán thẳng vào ô "Detailed description"): viết lại theo bố cục
  Sir đang dùng (khối ═══), nội dung đúng 2.0.0; nói rõ Google tự làm mới link theo lịch của Google; ai có link đọc
  được lịch. ≤ 16 000 ký tự (giới hạn Store).
- Mô tả ngắn (≤ 132 ký tự) thêm Google Calendar.
- `docs/CHROME-STORE-LISTING.md`: bỏ "retro-inspired" / "Vintage terminal"; mô tả ngắn + phần LOOK & FEEL / CALENDAR
  / BOOKMARKS khớp bản txt.

## Nghiệm thu

Test GREEN: không còn PIN / retro / 1.2.1; có 2.0.0, Google Calendar (một chiều, ai có link đọc được), lặp sự kiện,
không content script, không analytics; mô tả ngắn ≤ 132; toàn văn ≤ 16 000.
