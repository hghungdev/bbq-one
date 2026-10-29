# R5 — Phát hành 2.0.1 — phiên bản ở mọi nơi + tài liệu phát hành khớp hành vi thật

> **Failing test:** `specs/R5-release-2.0.1.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29):** "Update version luôn giúp mình, mình sẽ release lên Google Store". Migration
> `018_calendar_series.sql` (F3) Sir đã chạy trên Supabase.

## Nội dung 2.0.1 (từ `main` → nhánh này)

- **Nhanh hơn** (P1–P5): thư mục 600 ghi chú 3.020 → ~190 ms; tìm 2.000 ghi chú 11,7 s → ~0,34 s; mở popup không ghi lại
  cache; `dist/` 11 MB → 3,2 MB; font Inter đóng gói kèm (không gọi Google Fonts — không đăng nhập thì 0 request).
- **Mới:** tìm ghi chú từ thanh địa chỉ (`bbq` + Space — Enter mở, Alt+Enter sao chép cả ghi chú) (F1); sửa / xóa cả
  chuỗi sự kiện lặp (F3).
- **Lịch:** tối đa 6 sự kiện / ngày; ô hiện 2 + "+n xem thêm"; chip header hiện đủ tên hoặc số sự kiện (U30, U32).
- **Giao diện:** header hết bề ngang, logo góc trái, thanh dọc chỉ icon + tooltip (U28, U34); Bookmark: ☁↑ ở đầu cột
  Sao lưu, ô tìm ở đầu cột trình duyệt (U33, U35).
- **Hộp thoại:** Esc chỉ đóng lớp trong cùng, không bao giờ đóng extension; bấm ra ngoài hộp không đóng hộp (U29, U31).
- **Sửa lỗi:** không đăng nhập — xóa ghi chú / section / sự kiện không còn hiện lại (C16).

## Sửa

1. `public/manifest.json` 2.0.1 → `npm run sync-version` (package.json); `package-lock.json` (`version` +
   `packages[""].version`).
2. README: `**Version:** 2.0.1`; mục **What changed in 2.0.1** (đầu danh sách, có trong mục lục).
3. DESIGN.md: token `version: 2.0.1`; sơ đồ khung theo bố cục mới (header hết bề ngang + thân = thanh dọc 56 px + nội
   dung).
4. Privacy policy: "applies to extension version **2.0.1** and later" (từ 2.0.1 mới không còn Google Fonts — không đăng
   nhập thì không request mạng); thêm đoạn **Address bar search** (chữ gõ sau `bbq` chỉ tới BBQOne, tìm trên dữ liệu
   trong máy, không gửi đi, không lưu).
5. Store: `CHROME-STORE-LISTING.md` thêm **Release 2.0.1 (highlights)** (trên 2.0.0);
   `chrome-store-detailed-description.txt` mục **WHAT'S NEW IN 2.0.1** thay 2.0.0 (chỉ giữ bản mới nhất);
   `CHROME-STORE-PERMISSIONS.md` ghi **v2.0.1** — quyền không đổi, khóa `omnibox` không hiện cảnh báo → cập nhật không
   bị Chrome tạm tắt.

## Đổi assertion có chủ đích

- **R1** (2.0.0): R1.1 / R1.2 / R1.3 / R1.4 / R1.5 kiểm phiên bản **hiện tại** (đọc từ manifest, ≥ 2.0.0) thay vì cứng
  2.0.0; phần lịch sử 2.0.0 (mục README, "Release 2.0.0 (highlights)") vẫn kiểm.
- **R2** R2.2: "WHAT'S NEW IN 2.0.x" (bản mới nhất) thay vì cứng 2.0.0.

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK; `dist/manifest.json` = 2.0.1, quyền như 2.0.0 + `omnibox`.
**Sir build bản phát hành bằng `.env` thật** (bản build trong phiên này dùng `.env.example`, không dùng để upload).
