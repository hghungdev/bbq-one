# ROADMAP U-series (UI) — đợt 2026-10-27

> Yêu cầu của Sir (2026-10-27), làm sau đợt S2C1.2 → S2C1.4. Quy ước như C/N/S: mỗi mục = spec +
> test trong `specs/`, commit `docs` (RED) rồi `feat/fix` (GREEN). Nghiệm thu chung: test GREEN,
> mọi harness khác PASS, `vue-tsc` sạch, build OK.

## U1 — Bỏ icon đồng hồ trên header

**Hiện trạng:** `pages/App.vue` có `IconButton.shell__clock-btn` cạnh nút theme: chỉ hiện tooltip giờ
hiện tại + UTC offset, không có hành động. Kèm `headerClock` + `setInterval` 1 s chạy suốt đời popup.
Settings đã có mục **Múi giờ** (`SettingsModal.vue` — chọn UTC offset, hiện offset đang dùng).

**Giải pháp:** xóa nút + timer + computed liên quan + CSS. Không đụng `appTimezone` store, Settings
giữ nguyên mục Múi giờ (đó là nơi chỉnh). i18n `app.aria.clock` xóa nếu không còn ai dùng.

## U2 — Calendar: thu ô tìm kiếm vào nút kính lúp

**Hiện trạng:** tab Calendar luôn hiện `SearchBar` toàn chiều ngang trên header (≈ 60 px) + hàng
`CalendarMonthNav` riêng → lưới lịch bị thu hẹp.

**Giải pháp — tìm kiếm nằm ngay trong hàng điều hướng tháng:**

```
mặc định:   [◀] [ Tháng 10 2026 ] [▶]                       [🔍] [HÔM NAY]
bấm 🔍:     [◀] [ Tháng 10 2026 ] [▶] [ Tìm sự kiện…    ✕ ] [HÔM NAY]
```

- `App.vue`: không render `SearchBar` khi `activeTab === 'calendar'` (Notes/Bookmark giữ nguyên).
- `CalendarInlineSearch.vue` (mới) đặt vào slot `actions` của `CalendarMonthNav`: thu gọn = nút 🔍;
  mở = ô nhập chiếm phần trống của hàng, tự focus, debounce 300 ms → `calendar.setSearchQuery`.
  ✕ hoặc Esc = xóa query + thu gọn. Còn query (vd quay lại tab) → mở sẵn.
- Ctrl+F ở tab Calendar → mở + focus (qua `calendar.requestSearchFocus()` trong store).
- `CalendarSearchPanel` (danh sách kết quả) giữ nguyên — chỉ hiện khi có query.

Tiết kiệm nguyên một hàng header; không mất tính năng nào.

## U3 — Sự kiện lặp lại (tuần / tháng / năm)

**Mô hình dữ liệu — chọn "tạo sẵn từng lần lặp" (materialize):** mỗi lần lặp là một
`calendar_events` row bình thường.

| Phương án | Ưu | Nhược | Kết luận |
|---|---|---|---|
| **Tạo sẵn N lần lặp** | Không cần migration; chạy được offline/local mode; search, đánh dấu xong *từng lần*, sync, giới hạn 3/ngày, lịch sử… dùng lại y nguyên | Sửa/xóa cả chuỗi phải làm từng cái | ✅ **Chốt cho v1** |
| Lưu quy tắc (RRULE) + sinh ảo khi hiển thị | Sửa cả chuỗi 1 chỗ | Cần migration + đổi sync/search/done (done phải lưu theo từng lần → bảng ngoại lệ) — rủi ro cao | Để sau nếu cần |

**UI (chỉ khi tạo mới):** dưới Tiêu đề thêm **Lặp lại** `[Không lặp lại | Hằng tuần | Hằng tháng |
Hằng năm]`; chọn khác "Không" → hiện **Số lần** (gồm lần đầu; mặc định tuần 4 · tháng 6 · năm 3;
tối đa tuần 52 · tháng 24 · năm 10) + dòng xem trước *"Sẽ tạo 4 sự kiện: 30/10, 06/11, 13/11,
20/11"* và cảnh báo ngày đã đủ 3 sự kiện sẽ bị bỏ qua. Sửa một sự kiện có sẵn: không có tùy chọn
lặp (chỉ sửa đúng lần đó).

**Quy tắc ngày (`utils/calendarRecurrence.ts`, thuần, có test):**
- Tuần: +7 ngày mỗi lần (qua năm mới bình thường).
- Tháng: cùng ngày-trong-tháng của **ngày gốc**; tháng thiếu ngày → ngày cuối tháng
  (31/01 → 28/02 → **31/03** → 30/04 — không trôi dần về 28).
- Năm: cùng ngày/tháng; 29/02 → 28/02 ở năm không nhuận.

**Store:** `createRecurringEvents(input, { freq, count })` gọi `createEvent` cho từng ngày (mỗi lần
tự lo offline / local-first như cũ); ngày đã đủ 3 sự kiện → bỏ qua, trả về danh sách ngày bị bỏ
qua để modal báo lại cho user.

**Theo sau (chưa làm):** "sửa/xóa cả chuỗi" cần cột `series_id` (migration) — chỉ làm khi Sir thấy
cần sau khi dùng thử.

## Thứ tự

U3 → U2 → U1 (U2/U1 đụng `pages/App.vue` — làm sau khi review bảo mật đợt S2C1.x xong).

## Trạng thái (2026-10-27)

| Mục | Commit (docs → feat) | Test | Kiểm tra trên Chromium (extension thật, local mode) |
|---|---|---|---|
| U3 | `eb7c39c` → `474e569` | ✅ 20/20 (RED 6 trên `23ebf85`) | "Họp tuần" hằng tuần × 4 → 4 thứ Ba liên tiếp |
| U1 + U2 | `8a4a9ef` → `791b86a` | ✅ 12/12 (RED 11 trên `474e569`) | header hết đồng hồ; tab Calendar hết hàng search; 🔍 lọc đúng; Esc / Ctrl+F đúng; tab Notes giữ SearchBar |

Chờ Sir verify tay theo mục "Nghiệm thu" của hai spec.
