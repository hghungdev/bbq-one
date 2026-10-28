# U8 — Gỡ mục Múi giờ (UTC) khỏi Settings; ngày folder/note theo giờ của máy

> **Failing test:** `specs/U8-remove-timezone-setting.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** hôm qua bỏ icon đồng hồ trên header nhưng chưa bỏ mục Timezone trong
> Settings — bỏ luôn. (U1 hiểu nhầm là "giữ Múi giờ trong Settings" — U1.3 đổi theo.)

## Hiện trạng

`stores/appTimezone.ts` giữ một độ lệch UTC tự chọn (mặc định **UTC+0**, lưu
`bbqone_utc_offset_hours`), chỉ dùng cho ngày `YYYY/MM/dd` dưới tên folder / note
(`formatListUpdatedAt`). Mọi chỗ khác (Calendar, banner/chip lịch, overdue) đã dùng giờ máy → hai
"đồng hồ" khác nhau: ở VN (UTC+7) note sửa lúc 6 giờ sáng hiện ngày **hôm trước**.

## Sửa

- `SettingsModal.vue`: bỏ cả mục "MÚI GIỜ (UTC)" + code liên quan.
- `utils/appDateTime.ts`: `formatListUpdatedAt(iso)` dùng giờ của máy (như Calendar); bỏ phần độ lệch
  UTC (`formatAppDateTime` của đồng hồ header cũng không còn ai dùng).
- Xóa `stores/appTimezone.ts` (+ `init()` trong `main.ts`, `FolderItem` / `NoteItem`).
- i18n: gỡ `settings.timezone*`, `settings.utcOffsetCurrent`.
- Giá trị cũ `bbqone_utc_offset_hours` trong `chrome.storage.local` không còn ai đọc (vài byte) — để
  nguyên, không cần migration.

## Đổi assertion test cũ (có chủ đích — theo yêu cầu)

- **U1.3** "Settings vẫn giữ mục Múi giờ" → "Settings **không** còn mục Múi giờ".

## Nghiệm thu

1. Test GREEN; trên `7320254` RED. Mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Verify tay: Settings không còn mục Timezone; ngày dưới tên note trùng ngày trên lịch của máy (sửa
   một note lúc sáng sớm → hiện ngày hôm nay).
