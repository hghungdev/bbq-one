# R9 — Phát hành 2.3.2 (F4 + B2)

> **Failing test:** `specs/R9-release-2.3.2.test.mjs`. **Sir (2026-11-03):** "Update version 2.3.2 giúp mình vì 2.3.1 đã
> đưa lên store rồi". Gồm F4 (`specs/F4-omnibox-sections.spec.md`) + B2 (`specs/B2-backup-manual-default.spec.md`).

## Việc

- manifest / package / lock / `DESIGN.md` = **2.3.2**; quyền không đổi.
- README `**Version:** 2.3.2` + "What changed in 2.3.2" (mục lục, trước 2.3.1): thanh địa chỉ mỗi section một gợi ý (Enter
  mở section, Alt+Enter chép section); sao lưu ra file không còn tự tải — chỉ khi bấm "Back up now", tự động mặc định tắt
  (cả máy đã bật trước đó).
- Store: **WHAT'S NEW IN 2.3.2** — 2 dòng mới đứng đầu, rồi "Earlier (2.1 – 2.3.1):" giữ các dòng cũ (người dùng Store giờ
  đã ở 2.3.1, nhưng ai nhảy từ bản cũ vẫn đọc được). Listing "Release 2.3.2 (highlights)" trước 2.3.1. Permissions
  `**v2.3.2**` (+ một câu: quyền không đổi).

## Đổi assertion có chủ đích

`R8.1–R8.3`: phiên bản **hiện tại ≥ 2.3.1** theo manifest; lịch sử 2.3.1 (README "What changed in 2.3.1", "Release 2.3.1
(highlights)", dòng thư mục bảo mật trong WHAT'S NEW) kiểm như cũ.

## Thứ tự (Sir)

Không có migration. `npm run build` → kiểm tay (gõ `bbq` + tên ghi chú nhiều section; mở popup không tải file) → upload
**2.3.2** lên Store, dán lại mô tả (WHAT'S NEW + 2 dòng KEY FEATURES đã đổi) và ô quyền `downloads`.
