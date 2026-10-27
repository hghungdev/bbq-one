# U1 + U2 — Bỏ icon đồng hồ header · Thu ô tìm kiếm Calendar vào nút kính lúp

> **Failing test:** `specs/U1-U2-header-clock-calendar-search.test.mjs`
> **Thiết kế:** `specs/ROADMAP-U.md` § U1, § U2. Gộp một cặp vì cả hai cùng sửa header `pages/App.vue`.

## U1 — Bỏ icon đồng hồ

`pages/App.vue`: `IconButton.shell__clock-btn` (cạnh `ThemeModeToggle`) chỉ hiện tooltip giờ +
UTC offset, không có hành động; kéo theo `headerClock`, `headerClockTooltip`, `headerClockAria`,
`tickHeaderClock`, `setInterval(…, 1000)` + `clearInterval`, `watch(utcOffsetHours)`.

**Thay đổi:** xóa nút, timer, computed, watch, CSS `.shell__clock-btn` và import không còn dùng;
gỡ i18n `app.aria.clock` (vi/en). **Giữ** mục Múi giờ trong `SettingsModal.vue` và store
`appTimezone` (lịch/ngày vẫn dùng offset).

## U2 — Tìm kiếm Calendar trong hàng điều hướng tháng

1. **`pages/App.vue`** — `<SearchBar v-if="activeTab !== 'calendar'" …>`; `search-mode` chỉ còn
   notes/bookmarks. Ctrl+F: tab Calendar → `calendarEvents.requestSearchFocus()`, tab khác như cũ.
2. **`stores/calendarEvents.ts`** — `searchFocusRequest` (số đếm) + `requestSearchFocus()` (tăng
   để kích watch; không đụng query).
3. **`components/calendar/CalendarInlineSearch.vue` (mới)** — mặc định nút 🔍
   (`calendar.search.open`). Bấm / Ctrl+F → ô nhập (`search.placeholderCalendar`), tự focus,
   debounce 300 ms → `setSearchQuery`. ✕ (`calendar.search.close`) hoặc Esc → `clearCalendarSearch()`
   + thu gọn. Mở sẵn khi `searchQuery` còn giá trị.
4. **`components/calendar/CalendarMonthNav.vue`** — nhóm cuối hàng `<slot name="actions" />` +
   nút Hôm nay (`margin-left: auto` chuyển sang nhóm).
5. **`components/calendar/CalendarTab.vue`** — `<template #actions><CalendarInlineSearch /></template>`.
6. **i18n vi/en** — `calendar.search.open`, `calendar.search.close`.

`CalendarSearchPanel` (danh sách kết quả, chỉ hiện khi có query) giữ nguyên.

## KHÔNG đổi

- SearchBar của Notes / Bookmark; logic lọc `eventsMatchingSearchForDate` / `calendarSearchMatches`.
- `appTimezone` store, mục Múi giờ trong Settings.

## Nghiệm thu

1. Test GREEN; trên `474e569` RED 11 fail. Mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Verify tay: header không còn icon đồng hồ; Settings → Múi giờ vẫn chỉnh được. Tab Calendar:
   không còn hàng search; bấm 🔍 → ô nhập hiện trong hàng tháng, gõ "họp" → lưới + danh sách kết
   quả lọc; Esc → đóng và bỏ lọc; Ctrl+F ở tab Calendar mở ô tìm; tab Notes vẫn có SearchBar.
