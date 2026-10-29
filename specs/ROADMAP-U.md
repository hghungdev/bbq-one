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
| U12 "Quá hạn" vào chip lịch, bỏ hộp thoại tự bật | `d0e711f` → `293503b` | ✅ 8/8 | chip "· 5 quá hạn"; bảng có mục QUÁ HẠN + "Đánh dấu xong" (U14 đổi "Xem tất cả"); không tự bật hộp thoại khi mở popup |
| S3a gỡ hẳn Bookmark PIN | `ddaa214` → `2aca5d7` | ✅ 10/10 (RED 8) | đăng nhập (session giả, offline): tab Bookmark mở thẳng; Settings chỉ còn Ngôn ngữ / Mật khẩu / Encrypted account |

Đính chính: commit `293503b` ghi "41 harness PASS" — đúng là **40** (U12 là harness thứ 40); sau S3a: 41.
Đổi assertion có chủ đích: C7a/C7b, U10.2 (U12 — bỏ cờ "ẩn nhắc quá hạn").
**Việc của Sir sau S3a:** khi mọi máy đã lên bản mới → chạy `supabase/migrations/016_drop_bookmark_crypto.sql`.

## Đợt 5 (2026-10-28) — U13, U14 (nhánh `claude/ui-adn-redesign`)

| Mục | Commit (docs → feat) | Test | Kiểm tra trên Chromium |
|---|---|---|---|
| U13 hộp thoại sự kiện theo ADN ("Layout popup xấu quá") | `dde689f` → `199990e` | ✅ 15/15 (RED 11) | segmented Lặp lại + ← →; stepper khóa ở 2 / 24; chip ngày, ngày đủ 3 sự kiện gạch đỏ; "Tạo 3 sự kiện" → bỏ qua đúng 1 ngày; mở form focus ô tiêu đề; Sửa có "Xóa"; light + dark |
| U14 ✓ từng việc quá hạn ("xử lý từng record hay hết?") | `7719b6f` → `a93af25` | ✅ 9/9 (RED 6) | ✓ dòng 2 → chỉ việc đó xong, chip 5 → 4; bấm lại hoàn tác; đóng/mở → dòng xong rút đi; "Xem tất cả" → hộp thoại 0 mục chọn |

Kèm: gỡ prop `digitOnly` của `RetroInput` (chỉ PIN dùng — sót từ S3a). 43 harness PASS.
Đổi chữ có chủ đích: `calendar.repeat.none` "Không lặp lại" → "Một lần" (vừa ô segmented);
`calendar.agenda.reviewOverdue` "Đánh dấu xong" → "Xem tất cả" (hết hiểu nhầm "đánh dấu tất cả").

## Đợt 6 (2026-10-28) — U15, C12, U16 (nhánh `claude/ui-adn-redesign`)

| Mục | Commit (docs → feat) | Test | Kiểm tra trên Chromium |
|---|---|---|---|
| U15 ngôn ngữ icon thống nhất ("popup conflict icon / text") | `3d052de` → `6192767` | ✅ 13/13 (RED 12) | Sửa sự kiện 🗑 thay chữ "Delete"; dòng ✎ 🗑; section ghi chú 🗑 (trước ×); Bookmark ⤓ ⟳ 🗑 ở đầu cột TRÌNH DUYỆT, lá cây 🔗; hộp xác nhận xóa phẳng; header ⇤ đăng nhập; light + dark |
| C12 Esc không đóng hộp xác nhận (phát hiện khi kiểm U15) | `1cf1dd6` → `6650120` | ✅ 3/3 (RED 3) | 🗑 → Esc → chỉ hộp xác nhận đóng, hộp Sửa còn, sự kiện còn |
| U16 tab header kiểu viền ("bootstrap không phải outline") | `8a452c6` → `6d73f54` | ✅ 3/3 (RED 3) | tab chọn = viền + chữ màu nhấn; ← → / Home / End; light + dark |

Đổi assertion có chủ đích: U11.C1, U13.S4, U13.S6 (U15). 46 harness PASS.
Quy tắc icon (U15): hành động trên đối tượng = icon + tooltip; quyết định kết thúc hộp thoại (Lưu / Hủy /
Xóa ở hộp xác nhận) và liên kết điều hướng = chữ — xem `specs/U15-icon-language.spec.md`.

**Gộp nhánh (2026-10-28, theo yêu cầu Sir — tổng duyệt trước khi release production):**
`claude/ui-adn-redesign` → `claude/dazzling-wright-m0fqb2` bằng fast-forward (nhánh chính vẫn ở `0ef22ee`,
không có commit riêng → không xung đột, lịch sử giữ nguyên từng commit docs/feat). Từ đây làm tiếp trên
`claude/dazzling-wright-m0fqb2`; `claude/ui-adn-redesign` giữ lại làm mốc, không xóa.

## Đợt 7 (2026-10-28) — U17, U18 (nhánh `claude/dazzling-wright-m0fqb2`, sau khi gộp)

| Mục | Commit (docs → feat) | Test | Kiểm tra trên Chromium |
|---|---|---|---|
| U17 icon 👤 "Đăng nhập" (⇤ trông như ⇥) + bấm tên sự kiện = đánh dấu xong | `da06998` → `97f56b1` | ✅ 5/5 (RED 3) | bấm "HSBC" → is_done đổi, không mở Sửa; ✎ → Sửa |
| U18 chip hiện tên trọn vẹn + "+n" (hết "OT -…") | `c5a380b` → `eebb327` | ✅ 9/9 (RED 7) | 800 px: "HSBC T1279 +1"; tên ngắn: "VIB, UOB"; tên đầu rất dài: "…" + "+1" |

Đổi assertion có chủ đích: U15.T1 + U15.M5 (log-in → user). 48 harness PASS.
Chờ Sir quyết: (a) bỏ nút "Hủy" ở hộp nhập liệu (giữ ✕ + 1 nút chính); (b) thanh điều hướng dọc
(navigation rail) thay 3 tab trên header.

## Đợt 8 (2026-10-28) — U19, quyết định mã hóa, G1 (nhánh chính) + U20 (nhánh thử)

| Mục | Nhánh | Commit (docs → feat) | Test | Kiểm tra |
|---|---|---|---|---|
| U19 bỏ "Hủy" trong hộp nhập liệu | `claude/dazzling-wright-m0fqb2` | `2567b4d` → `7153fcb` | ✅ 12/12 (RED 8) | ‹ về danh sách ngày; Thư mục bảo mật / Bật mã hóa có ✕ |
| Quyết định: Lịch KHÔNG mã hóa (chỉ Ghi chú + Bookmark) | `claude/dazzling-wright-m0fqb2` | `1995935` | — | ROADMAP-S, SECURITY.md, lời giới thiệu Settings |
| G1 link Google Calendar (iCal một chiều) trong Settings | `claude/dazzling-wright-m0fqb2` | `f9b2d83` → `ddeddec` | ✅ 18/18 (RED 8) | Supabase giả: tạo / tạo mới / tắt link; file .ics mẫu đúng RFC 5545 |
| U20 thanh điều hướng dọc | **`claude/ui-nav-rail`** (thử) | `db35029` → `6cf17c2` | ✅ 7/7 (RED 7) | chip 273 → 553 px; ☰ bảng nổi đè; ↑ ↓; light + dark |

Đổi assertion có chủ đích: U13.S4 (U19); U16, U17.1 (U20 — chỉ trên nhánh thử).
**Việc của Sir cho G1:** chạy `supabase/migrations/017_calendar_feeds.sql`, rồi
`supabase functions deploy calendar-feed --no-verify-jwt --project-ref <ref>` (xem
`supabase/functions/calendar-feed/README.md`).
**U20:** Sir duyệt trên `claude/ui-nav-rail` → ưng thì gộp vào nhánh chính (merge, không xung đột dự kiến).

**Gộp U20 (2026-10-28, theo yêu cầu Sir — tổng duyệt trước release):** `claude/ui-nav-rail` → nhánh chính bằng
merge commit `f810bf0` (không xung đột; i18n tự gộp). Bản gộp: 51 harness PASS, `vue-tsc` sạch, build OK;
Chromium: thanh dọc 3 mục, ⚙ / ⇥ ở đáy, Settings › Google Calendar chạy đủ luồng. `claude/ui-nav-rail` giữ làm mốc.

## Đợt 9 (2026-10-28) — U21, S3b, R1 2.0.0 → `main`

| Mục | Commit (docs → feat) | Test | Kiểm tra |
|---|---|---|---|
| U21 ☀ ☁ phẳng + chip "Ngày mai 3" | `0ca93bb` → `db4410d` | ✅ 4/4 (RED 4) | header chỉ còn 2 icon phẳng; chip đủ chữ |
| S3b tạm ẩn Mã hóa tài khoản (S3 hoãn) | `3f1a033` → `8413b98` | ✅ 5/5 (RED 4) | Settings: Ngôn ngữ / Mật khẩu / Google Calendar |
| R1 phát hành 2.0.0 + privacy policy | `25846a1` → `f3be3ab` | ✅ 5/5 (RED 5) | "BBQOne v2.0.0"; privacy policy có mục Google Calendar |

54 harness PASS. Gộp vào `main` theo yêu cầu Sir (fast-forward — `main` là tổ tiên trực tiếp). Không gộp
`20260418_backup` (nhánh sao lưu tháng 4, rẽ khỏi `main`, còn code từ điển đã gỡ).

## Đợt 10 (2026-10-28) — G1 chạy thật + G1b sổ tay làm lại

**G1 đã chạy thật:** Sir chạy `016_drop_bookmark_crypto.sql` + `017_calendar_feeds.sql` (SQL Editor), deploy
`calendar-feed` bằng **Dashboard › Edge Functions › Via Editor** (dán 1 file gộp), tắt **"Verify JWT with legacy
secret"** ở tab Settings của function.

| Mục | Commit (docs → feat) | Test | Kiểm tra |
|---|---|---|---|
| G1b sổ tay làm lại (Dashboard / CLI / project mới / server khác) + `npm run calendar-feed:bundle` | `cc97306` → (commit này) | ✅ 13/13 (RED 12) | file gộp trùng code đã deploy; chạy thử với Supabase / Deno giả: 404 / 200 `text/calendar` |

Sổ tay: `supabase/functions/calendar-feed/README.md`. 55 harness PASS.

## Đợt 11 (2026-10-28) — U22 tài khoản lên header, U23 logo mới

| Mục | Commit (docs → feat) | Test | Kiểm tra |
|---|---|---|---|
| U22 tài khoản lên header kiểu Gmail (avatar + menu), ⚙ ở lại thanh dọc | `58614b9` → `9f99d92` | ✅ 8/8 (RED 8) | ẩn danh "👤 Đăng nhập"; avatar "H" → menu email + Đăng xuất; Esc / bấm ngoài / Tab đóng |
| U23 logo mới: header logo + tên (kiểu Gmail), icon Chrome bản transparent | `d661171` → (commit này) | ✅ 5/5 (RED 4) | logo 28 px tải đúng (light + dark, bảng ☰); `dist/icon-*.png` = bản transparent |

Đổi assertion có chủ đích: U20.3, U17.1/U17.2, U15.M5 (icon tài khoản nay ở `AccountMenu.vue`).
Bộ icon của Sir (`design/navy`, `design/transparent`, commit `f82e756` trên `main`) gộp vào nhánh làm việc bằng merge
commit. Ghi nhận: hộp Đăng nhập (`LoginModal`) chưa đóng bằng Esc — có từ trước, ngoài phạm vi U22.
57 harness PASS.

**U24 (cùng đợt):** ⚙ Cài đặt lên header kiểu Gmail (☀ · ☁ · ⚙ · tài khoản), thanh dọc chỉ còn ☰ + 3 mục, bảng ☰ chỉ
logo + 3 mục. Test 5/5 (RED 5). Đổi assertion có chủ đích: U20.3, U22.1. Sir đồng ý icon Chrome bản transparent (U23).
58 harness PASS. Gộp vào `main` theo yêu cầu Sir (fast-forward — `main` là tổ tiên trực tiếp).

**U25 (cùng đợt — Sir: "icon mới nhỏ hơn icon khác trên Chrome, vào trong app nữa"):** bản transparent chỉ lấp 86–88 %
ngang / 76–81 % dọc khung → `scripts/make-brand-icons.py` cắt sát viền (lề 1,5 %), xuất `design/transparent-tight/`
→ `public/icon-*` + logo header; logo header 28 → 32 px. Test giải mã PNG thật (≥ 94 % ngang). Đổi assertion có chủ
đích: U23.1, U23.3, U23.4, U23.5. 59 harness PASS.

**U26 (Sir thử bản `346782f`):** ☀ ☁ xuống đáy thanh dọc (header chỉ ⚙ · tài khoản); logo header "vỡ" do dải giấy
trắng trùng nền sáng + ảnh 64 → 32 tự thu ở màn 1x → viền tóc `--brand-logo-edge` (chỉ giao diện sáng) + `srcset`
32 / 64; icon Chrome cắt bớt 50 % phần ngang dư (16 × 14 → lấp ~94 % dọc), logo header giữ dáng. Đổi assertion có chủ
đích: U22.1, U22.2, U24.1, U24.4, U24.5, U23.3, U23.4, U25.1, U25.2. 60 harness PASS.

**R2 + U27 (rà soát cuối trước khi lên Store):** R2 — mô tả Chrome Web Store viết lại cho 2.0.0 (bỏ PIN Bookmark,
"retro", "your Supabase project"; thêm Google Calendar, lặp sự kiện; What's new 2.0.0). U27 — Sir: "Dark/Light ›
Setting › User": ☀ về header trước ⚙, đáy thanh dọc chỉ ☁. Đổi assertion có chủ đích: U26.1, U26.2, U24.4.
Rà soát cuối: 62 harness PASS, `vue-tsc` sạch, build OK, `dist/manifest.json` 2.0.0 + 4 icon cắt sát, quyền không
đổi; Chromium (ẩn danh + đăng nhập, sáng + tối): 3 mục thanh dọc, tạo + đánh dấu xong sự kiện, chip, ☀, ⚙ + Esc,
bảng ☰, ☁ đồng bộ, menu tài khoản + đăng xuất — không lỗi console. Gộp vào `main` (fast-forward).

**C13–C15 (trước khi lên Store — Sir: "cần fix không, mình chưa release"):** C13 nhãn Section không còn dính chữ giữa
các khối (`spaceBlockBoundaries`); C14 Esc đóng hộp Đăng nhập + focus vào ô Email; C15 cây Bookmark bỏ nút gốc không
tên "(no name)" khi hiển thị / đường dẫn tìm kiếm (`unwrapBookmarkRoot`). S3a thêm mock cho import mới (không đổi
assertion). Ảnh Store `design/store/` chụp lại. 63 harness PASS.


**R4 (2026-10-29 — Sir: "Extension đã đưa release lên chrome store rùi"):** README trỏ tới listing Store — link ở mục
Install (bỏ "when the listing is published") + badge tĩnh đầu trang; link không mang `authuser` / `hl`. Test 3/3
(RED 3). 65 harness PASS.
