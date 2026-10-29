# U33 — Bookmark: "Sao lưu ngay" thành icon + tooltip, nằm ở đầu cột Sao lưu

> **Failing test:** `specs/U33-bookmark-backup-icon.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29, kèm ảnh tab Bookmark):** "Còn cái button backup now ở đây nữa — mình đã chuyển qua sử
> dụng icon và tooltip rồi, và dời nó qua vị trí khác phù hợp".

## Hiện trạng

Thanh công cụ tab Bookmark mở đầu bằng nút đặc màu lớn **☁↑ Backup now** (`ds-primary`, U11 / U15) — nút chữ duy nhất
còn lại giữa các tab đã chuyển sang icon (thanh dọc U28, ⤓ ⟳ 🗑 ở đầu cột Trình duyệt, ↶ 🗑 ở dòng sao lưu, ＋ ở đầu
mục Thư mục / Ghi chú / Sự kiện).

## Sửa (`BookmarkTab.vue`)

1. Bỏ nút khỏi thanh công cụ.
2. Đặt **icon ☁↑ (`upload-cloud`) ở đầu cột SAO LƯU**, cạnh số bản sao lưu: `SAO LƯU · 11  ☁↑` — đúng chỗ của hành
   động "thêm một bản sao lưu" (như ＋ ở đầu mục Thư mục / Ghi chú / Sự kiện, U15). Kiểu `ds-icon-action
   ds-icon-action--accent` (icon màu nhấn = hành động chính của cột); tooltip + aria-label "Sao lưu ngay" / "Backup
   now" (`title` như ⤓ ⟳ 🗑 cùng tab); khóa khi đang tải / đang sao lưu (`bm.loading`) như trước.
3. Thanh công cụ còn: dòng "Sao lưu lần cuối: …" (khi có) + 🔍 tìm bookmark.

## Đổi assertion có chủ đích

- **U11** C1: thanh công cụ không còn nút đặc `ds-primary` (nút chính thành icon ở đầu cột Sao lưu).
- **U15** M3: ☁↑ là icon ở đầu cột SAO LƯU thay vì nút chữ trên thanh công cụ.

## KHÔNG được đổi

Nhãn bản sao lưu thủ công (`buildBookmarkBackupLabel('manual')`), sao lưu tự động, ⤓ ⟳ 🗑 cột Trình duyệt, ↶ 🗑 từng
dòng, tìm bookmark.

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium: thanh công cụ hết nút chữ; ☁↑ cạnh "SAO LƯU ·
n", rê chuột / Tab → tooltip "Sao lưu ngay"; bấm → thêm một bản sao lưu (số tăng 1); sáng + tối.
