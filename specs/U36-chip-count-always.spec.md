# U36 — Chip lịch trên header luôn ghi SỐ sự kiện khi ngày có từ 2 sự kiện

> **Failing test:** `specs/U36-chip-count-always.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29, kèm ảnh chip "Today VIB, HSBC, OT - 2 Hours, a, b"):** "Sao thẻ chip header mình thấy chưa
> thay đổi nhỉ, vẫn còn hiện tên event — mình nhờ là đổi là hôm nay có 5 sự kiện thì phải?" (U30 Sir đã chọn "Chip ghi
> số, bảng liệt kê đủ").

## Hiện trạng (U30)

Chip theo kiểu lai: mọi tên **vừa chỗ** → hiện tên; không vừa → ghi số. Ngày 5 sự kiện tên ngắn vừa chỗ nên chip vẫn
hiện tên — sai ý Sir.

## Sửa

1. `utils/calendarAgenda.ts`: `chipUsesCount(n)` = `n >= 2` — từ 2 sự kiện chip ghi **số** ("Hôm nay · 5 sự kiện" /
   "Today · 5 events"); **1** sự kiện vẫn hiện tên (ghi "1 sự kiện" mất thông tin, CSS cắt "…" khi dài). Bỏ
   `titlesNeedCount`.
2. `CalendarAgendaChip.vue`: `shownTitles` theo `chipUsesCount`; **bỏ toàn bộ phần đo chữ** (canvas `measureText`,
   `ResizeObserver` vùng giữa header, `document.fonts.ready`, `titlesRef`) — không còn phụ thuộc bề rộng nên chip không
   đổi qua lại khi đổi cỡ / ngôn ngữ. Áp dụng cả khi chip đang là Ngày mai (không có sự kiện hôm nay); Quá hạn giữ "n
   việc chưa xong".
3. Tooltip + aria-label vẫn đọc **đủ mọi tên** (rê chuột lên chip là thấy); bảng mở từ chip liệt kê đủ (U30).
4. README (What changed in 2.0.1) + mô tả Store: chip ghi số sự kiện. Phiên bản giữ **2.0.1** (chưa upload Store).

## Đổi assertion có chủ đích

- **U18** T0–T6 + S1: `chipUsesCount` thay `titlesNeedCount`; chip không còn đo chữ.
- **U30** U30.4–U30.8 + U30.15: như trên.

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium: 5 sự kiện tên ngắn → `Hôm nay 5 sự kiện`
(trước: tên); 1 sự kiện → tên; chỉ ngày mai 3 sự kiện → `Ngày mai 3 sự kiện`; tooltip đủ tên; en + vi.
