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

---

# Đợt 2 (2026-10-28) — U4 → U6

> Phản hồi của Sir sau khi test bản `ee9d1e5` (2 ảnh: tab Bookmark, tab Notes). Hướng tới bản thương
> mại → ưu tiên gọn, nhất quán, không giật layout.

## U4 — Bookmark: gõ tìm kiếm thì popup "thu nhỏ" (bug)

**Nguyên nhân:** popup của extension Chrome tự co giãn theo độ rộng nội dung (giới hạn 800 × 600).
`global.css` để `html { min-width: 720px; width: 100% }` → bề rộng do nội dung quyết định: cây
bookmark có tiêu đề dài kéo popup lên **800 px** (ảnh 1), tab Notes chỉ **~716 px** (ảnh 2); gõ tìm →
cây lọc còn ít dòng ngắn → popup co về 720 px ngay khi đang gõ. Chuyển tab cũng "nhảy" bề rộng.

**Sửa:** cố định `html { width: 800px }` (`--popup-width`, đúng mức tối đa Chrome cho phép) — mọi tab,
mọi trạng thái tìm kiếm cùng một bề rộng; Calendar / Notes được thêm ~80 px.

## U5 — Notes + Bookmark: tìm kiếm thu vào nút 🔍 giống Calendar

Bỏ hẳn hàng `SearchBar` toàn chiều ngang trên header (≈ 56 px). Mỗi tab đặt 🔍 trong **thanh công cụ
của chính nội dung nó lọc** (như Calendar đặt trong hàng điều hướng tháng):

```
Notes:     [ Ghi chú ................ 🔍 ]   →   [ Tìm ghi chú…     4  ✕ ]   (đầu cột danh sách)
Bookmark:  [Backup now][Export HTML][Refresh][Delete all] ........ 🔍   →   … [ Tìm bookmark…  ✕ ]
Calendar:  (giữ nguyên U2)
```

- Một component dùng chung `components/ui/InlineSearch.vue` (Calendar chuyển sang dùng luôn) → hành vi
  giống hệt nhau: bấm 🔍 mở + focus; debounce 300 ms; ✕ / Esc = xóa + thu gọn; rời ô khi trống = thu
  gọn; còn query (quay lại tab) = mở sẵn; Ctrl+F ở tab nào mở ô của tab đó.
- Sửa kèm lỗi cũ của `SearchBar`: store lưu query đã `trim()` → ô nhập bị ghi đè, **mất dấu cách cuối**
  khi gõ chậm ("trading in" → "tradingin"). `InlineSearch` so sánh sau khi trim.
- Đầu cột Notes: khi đang tìm hiện số kết quả cạnh ô nhập (thay chữ "N kết quả" cũ).

## U6 — Thông báo lịch: gom vào một "chip lịch" trên header

**Hiện trạng:** `CalendarTodayBanner` = 2 dải màu xếp chồng (ngày mai + hôm nay) ≈ 90 px — cùng với hàng
search là ~1/4 chiều cao popup 600 px, hiện ở mọi tab.

**Cân nhắc các gợi ý:**

| Phương án | Vấn đề |
|---|---|
| Chữ chạy phải → trái (marquee) | Khó đọc, gây xao nhãng; nội dung chuyển động > 5 s phải có nút dừng (WCAG 2.2.2); vẫn tốn 1 hàng |
| Hiện 10–15 s rồi ẩn | Dễ bỏ lỡ (mở popup chỉ vài giây là chuyện thường); lúc ẩn layout giật lên |
| Icon "!" + chấm đỏ, hover ra tooltip | "!" mang nghĩa lỗi/cảnh báo; thông tin hôm nay bị giấu sau một cú bấm; tooltip không dùng được bằng bàn phím và không chứa được nút (mở lịch, ẩn nhắc) |

**Chốt — chip lịch (glanceable + chi tiết khi cần), 0 px chiều cao thêm:**

```
[BBQOne | Calendar  Notes  Bookmark]   [● Hôm nay · HSBC T1279, OT - 2 Hou… · Mai 3 ▾]  [☀][☁][⚙][⎋]
                                                   │ bấm (hoặc Enter)
                                                   ▼
                                       ┌ Lịch sắp tới ───────────────────────┐
                                       │ ● HÔM NAY · 28/10/2026      Mở lịch │
                                       │   HSBC T1279                         │
                                       │   09:00  OT - 2 Hours                │
                                       │ ● NGÀY MAI · 29/10/2026  Ẩn  Mở lịch │
                                       │   VIB · HSBC · OT - 2 Hours          │
                                       └──────────────────────────────────────┘
```

- Nằm ở khoảng trống sẵn có giữa nhóm tab và nhóm icon của header — không thêm hàng nào.
- Một dòng, không chuyển động; chấm **vàng** = hôm nay, **xanh** = chỉ có ngày mai; tiêu đề dài cắt
  "…"; có cả hai thì thêm "· Mai N".
- Bấm → bảng nhỏ (popover) liệt kê đủ hôm nay + ngày mai (giờ, màu, việc đã xong gạch ngang); bấm một
  sự kiện / "Mở lịch" → tab Lịch, nhảy đúng ngày đó; "Ẩn" = ẩn nhắc ngày mai như nút ✕ cũ. Esc / bấm
  ra ngoài để đóng; điều khiển được bằng bàn phím.
- Không có sự kiện → không hiện gì. Logic chọn ngày / nội dung tách thành hàm thuần
  `utils/calendarAgenda.ts` (có test).

Tổng: header từ ~205 px (hàng tab + 2 banner + hàng search) còn ~60 px → nội dung được thêm ~145 px.

## Thứ tự

U4 → U5 → U6 (U5/U6 cùng đụng header `pages/App.vue`).

## U7 — Hộp thoại "Sự kiện đã qua hạn": chọn hàng loạt

**Hiện trạng:** mỗi sự kiện một checkbox, phải bấm từng cái; nút "HOÀN THÀNH" không cho biết sẽ đánh
dấu bao nhiêu mục, bấm khi chưa chọn gì thì chỉ đóng hộp thoại.

**Giải pháp — mẫu "bulk select" của các app task hiện đại (Gmail, Linear, Todoist):**

```
┌ Sự kiện đã qua hạn ───────────────────────────── ✕ ┐
│ 5 sự kiện trước hôm nay chưa đánh dấu xong.          │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [■] Chọn tất cả                     Đã chọn 3/5  │ │  ← thanh chọn (dính trên cùng khi cuộn)
│ └──────────────────────────────────────────────────┘ │
│ [■] 20/10/2026                                   2   │  ← chọn cả ngày (3 trạng thái)
│     [✓] Shinhan                                      │  ← bấm cả hàng để chọn
│     [✓] Claude                                       │
│ [ ] 26/10/2026                                   1   │
│     [ ] SPLayer                                      │
│ Mẹo: Shift + bấm để chọn liên tiếp · Ctrl+A chọn hết │
│                     [ĐỂ SAU]  [✓ ĐÁNH DẤU XONG (3)]  │
└──────────────────────────────────────────────────────┘
```

- **Chọn tất cả** (3 trạng thái: trống / gạch ngang khi chọn một phần / đủ) + đếm "Đã chọn 3/5".
- **Chọn cả ngày** ở tiêu đề từng ngày (cũng 3 trạng thái).
- **Shift + bấm** chọn liên tiếp từ mục bấm trước; **Ctrl/⌘+A** chọn / bỏ chọn tất cả.
- Bấm vào cả hàng (không chỉ ô vuông) để chọn; hàng đã chọn tô nhạt.
- Nút chính ghi số lượng "ĐÁNH DẤU XONG (3)", mờ khi chưa chọn gì (đóng = "ĐỂ SAU" như cũ).
- Không chọn sẵn gì (tránh lỡ tay đánh dấu xong việc chưa làm) — nhưng chỉ 1 cú bấm "Chọn tất cả".
- Logic chọn tách ra `utils/bulkSelection.ts` (thuần, có test).

**Theo sau (chưa làm, cần Sir quyết):** thêm hành động "Dời sang hôm nay" cho mục chưa làm xong (kiểu
Todoist) — đụng giới hạn 3 sự kiện / ngày nên cần thiết kế riêng.

## Trạng thái đợt 2 (2026-10-28)

| Mục | Commit (docs → feat/fix) | Test | Kiểm tra trên Chromium (extension thật) |
|---|---|---|---|
| U4–U6 | `798d920` → `7320254` | ✅ 31/31 (RED 25 trên `ee9d1e5`) | bề rộng 800 px ở mọi tab / khi tìm; header 205 → 63 px; "trading in" giữ dấu cách; Ctrl+F đúng tab; chip → bảng → Esc / bấm ngoài; mở ngày mai nhảy đúng ô; dark mode |
| U8 | `9499476` → `6c1cbbe` | ✅ 6/6 (RED 5) | Settings không còn mục Múi giờ |
| U7 | `6a50ad0` → `6c61355` | ✅ 10/10 (RED 8) | chọn tất cả / một phần / Ctrl+A / Shift 1–4 / cả ngày → xác nhận 5 mục is_done; dark mode |
| C11 | `a9397af` → `06bb98d` | ✅ 8/8 (RED 8) | lỗi tìm thấy khi kiểm U7 — storage không còn `{0:…}`; cache hỏng cũ + offline vẫn hiện lịch / folder |
| U9 | `b90502c` → `44f5046` + bỏ chữ | ✅ 4/4 | cờ chữ nhật, vòng chọn màu nhấn; light / dark |

Đổi assertion có chủ đích (ghi trong spec từng mục): U2.1, U2.3–U2.5 (U5), U1.3 (U8), U9.4.
Chờ Sir verify tay theo mục "Nghiệm thu" của từng spec.

## Đợt 3 (2026-10-28) — U10, U11 "ADN popover"

| Mục | Nhánh | Commit (docs → feat) | Test | Kiểm tra trên Chromium |
|---|---|---|---|---|
| U10 bỏ "Ẩn" ngày mai | `claude/dazzling-wright-m0fqb2` | `3a7acfa` → `0ef22ee` | ✅ 4/4 (RED 3) | bảng chỉ còn "Mở lịch" |
| U11-A Ghi chú | **`claude/ui-adn-redesign`** | `3bccd29` → `1727d81` | ✅ | ô "tìm tất cả" ở đầu cột Thư mục; kết quả "RESULTS · n · all folders" |
| U11-B/C/D Lịch / Bookmark / Settings + 14 hộp thoại | **`claude/ui-adn-redesign`** | → `3f559c1` | ✅ U11 15/15 | light + dark mọi tab, Settings, Overdue, sự kiện, đăng nhập, tạo thư mục |

U11 nằm trên nhánh riêng theo yêu cầu: ưng → gộp vào `claude/dazzling-wright-m0fqb2`; không → giữ
nhánh cũ (`0ef22ee`), không mất gì. Đổi assertion có chủ đích: U5.8 (ô tìm ghi chú sang Sidebar).

## Đợt 4 (2026-10-28) — U12, S3a (nhánh `claude/ui-adn-redesign`)

| Mục | Commit (docs → feat) | Test | Kiểm tra trên Chromium |
|---|---|---|---|
| U12 "Quá hạn" vào chip lịch, bỏ hộp thoại tự bật | `d0e711f` → `293503b` | ✅ 8/8 | chip "· 5 quá hạn"; bảng có mục QUÁ HẠN + "Đánh dấu xong"; không tự bật hộp thoại khi mở popup |
| S3a gỡ hẳn Bookmark PIN | `ddaa214` → `2aca5d7` | ✅ 10/10 (RED 8) | đăng nhập (session giả, offline): tab Bookmark mở thẳng; Settings chỉ còn Ngôn ngữ / Mật khẩu / Encrypted account |

Đính chính: commit `293503b` ghi "41 harness PASS" — đúng là **40** (U12 là harness thứ 40); sau S3a: 41.
Đổi assertion có chủ đích: C7a/C7b, U10.2 (U12 — bỏ cờ "ẩn nhắc quá hạn").
**Việc của Sir sau S3a:** khi mọi máy đã lên bản mới → chạy `supabase/migrations/016_drop_bookmark_crypto.sql`.
