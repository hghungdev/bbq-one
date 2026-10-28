# U4 → U6 — Popup cố định 800 px · Tìm kiếm 🔍 cho Notes/Bookmark · Chip lịch trên header

> **Failing test:** `specs/U4-U6-popup-width-inline-search-agenda.test.mjs` — kiểm cấu trúc
> `global.css` / `App.vue` / component + chạy thật hàm thuần `utils/calendarAgenda.ts`.
> Thiết kế + lý do chọn: `specs/ROADMAP-U.md` mục "Đợt 2". Tương tác (gõ, Esc, Ctrl+F, popover)
> kiểm trên Chromium với extension thật (ghi kết quả trong ROADMAP-U).

## U4 — popup co lại khi tìm bookmark (bug)

- `global.css`: `--popup-width: 800px`; `html { width: var(--popup-width) }` — bỏ
  `min-width: 720px; width: 100%` (để Chrome co giãn theo nội dung).

## U5 — `InlineSearch` dùng chung

- `components/ui/InlineSearch.vue`: props `query` (query hiện tại của store), `focusRequest`,
  `placeholder`, `inputLabel`, `openLabel`, `closeLabel`, `inputId`, `compact?`; emit `search(q)`
  (debounce 300 ms, bỏ qua nếu trùng query sau trim) và `clear()`. Slot `collapsed` (hiện cạnh 🔍 khi
  thu gọn — vd tiêu đề cột) và `suffix` (cạnh ô nhập khi mở — vd số kết quả).
  - Mặc định thu gọn; còn query → mở sẵn. 🔍 → mở + focus. ✕ / Esc → xóa query + thu gọn + trả focus
    về 🔍. Rời ô (focus ra ngoài component) khi ô trống → thu gọn.
  - Đồng bộ từ store chỉ khi khác **sau trim** (không ăn mất dấu cách cuối khi đang gõ).
- Notes: `NoteList` đầu cột = tiêu đề + 🔍 (compact); mở → ô nhập + số kết quả / "…" khi đang tìm.
  Gọi `notes.runSearch` / `notes.clearSearch`.
- Bookmark: cuối thanh công cụ `BookmarkTab` (sau các nút). Gọi `bm.setSearchQuery` /
  `bm.clearBookmarkSearch`.
- Calendar: `CalendarInlineSearch` thành wrapper mỏng của `InlineSearch` (hành vi U2 giữ nguyên, thêm
  "rời ô khi trống → thu gọn").
- `App.vue`: bỏ `SearchBar` (xóa luôn component — không còn ai dùng). Ctrl+F → `requestSearchFocus()`
  của store tab đang mở (`notes` / `bookmarks` / `calendarEvents`; hai store đầu thêm
  `searchFocusRequest` + `requestSearchFocus()` như Calendar).
- i18n: `search.openNotes`, `search.openBookmarks`, `search.close`.

## U6 — chip lịch thay 2 banner

- `utils/calendarAgenda.ts` (thuần):
  - `buildAgenda(eventsForDate, todayKey, tomorrowKey, dismissedTomorrowKey)` → `{ today, tomorrow }`,
    mỗi ngày `{ dateKey, items[] } | null`; item `{ id, title, time, done, color }`; sắp theo
    `position`; bỏ tiêu đề rỗng; ngày mai `null` nếu đã ẩn đúng ngày đó.
  - `agendaChip(agenda)` → `null` | `{ tone: 'today' | 'tomorrow', dateKey, titles, tomorrowCount }`
    (ưu tiên hôm nay; `tomorrowCount` > 0 chỉ khi có cả hai).
- `components/calendar/CalendarAgendaChip.vue`: nút chip (`aria-haspopup="dialog"`,
  `aria-expanded`) + popover (`role="dialog"`); Esc / bấm ra ngoài đóng và trả focus về chip; bấm sự
  kiện hoặc "Mở lịch" → emit `open-calendar(dateKey)`; "Ẩn" → `dismissUpcomingBannerForDate`. Không
  chạy chữ, không tự ẩn theo giờ.
- `App.vue`: chip nằm trong hàng header trên cùng (giữa nhóm tab và nhóm icon); bỏ
  `CalendarTodayBanner` (xóa component); `open-calendar` → tab Lịch + `focusCalendarCellFromSearch`
  đúng ngày được bấm (trước đây luôn nhảy về hôm nay).
- i18n: thêm `calendar.agenda.*`; gỡ `calendar.banner.*` (không còn ai dùng).

## Đổi assertion test cũ (có chủ đích — thiết kế đổi)

- **U2.1** "SearchBar không render ở tab Calendar" → "header không còn `SearchBar` ở **mọi** tab"
  (U5 thay bằng 🔍 trong từng tab — chặt hơn bản cũ).
- **U2.3–U2.5** đọc `CalendarInlineSearch.vue` **cùng** `ui/InlineSearch.vue` (logic debounce / Esc /
  mở sẵn chuyển vào component dùng chung); regex "mở sẵn khi còn query" chấp nhận `props.query`.

## Nghiệm thu

1. Test GREEN; trên `ee9d1e5` RED. Mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Verify tay (reload extension ở `chrome://extensions`):
   - Tab Bookmark gõ tìm → popup **không** đổi bề rộng; chuyển Calendar / Notes / Bookmark bề rộng
     giữ nguyên 800 px.
   - Notes: bấm 🔍 ở đầu cột ghi chú → gõ "trading in" chậm từng chữ → không mất dấu cách; Esc → ô thu
     lại, danh sách về như cũ; Ctrl+F mở ô.
   - Bookmark: 🔍 cuối thanh công cụ, hành vi như Notes; Ctrl+F mở ô.
   - Có sự kiện hôm nay / ngày mai → header chỉ còn **một hàng** có chip; bấm chip → bảng chi tiết;
     bấm sự kiện ngày mai → tab Lịch nhảy đúng ngày mai; "Ẩn" → mất phần ngày mai (còn hôm nay thì
     chip vẫn hiện). Dark mode đọc rõ.
