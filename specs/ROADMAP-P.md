# ROADMAP P-series — 2.0.1 "tối ưu trước, không thêm chức năng" (2026-10-29)

> **Yêu cầu của Sir (2026-10-29):** "version 2.0.1 sẽ không thêm mới chức năng mà tối ưu hệ thống trước để trải
> nghiệm dùng tốt hơn"; đồng ý làm **Sao lưu ra file**; "các việc nhỏ, làm nhanh → đánh giá mức độ và lên plan".
> Quy ước như C/N/S/U: mỗi mục = spec + failing test trong `specs/`, commit `docs(Px)` (RED) rồi `perf/fix(Px)`
> (GREEN). Nghiệm thu chung: test GREEN, mọi harness khác PASS, `vue-tsc` sạch, build OK, **đo lại bằng
> `scripts/measure-popup-perf.mjs` và ghi số trước / sau vào bảng Trạng thái**.

## Số đo 2.0.0 (Chromium thật, không đăng nhập, popup 800 × 600)

Đo bằng `scripts/measure-popup-perf.mjs` — dữ liệu giả: 20 thư mục, 30 % ghi chú dồn vào một thư mục, mỗi ghi chú
2 body ~1,7 KB; "longtask" = đoạn chặn luồng chính > 50 ms (UI đơ trong lúc đó).

| Kịch bản | 300 ghi chú | 800 ghi chú | 2.000 ghi chú |
|---|---|---|---|
| Mở popup tới khi thấy lịch (popup rỗng: ~290 ms) | 314 ms | 360–435 ms | **790–880 ms**, đơ 350–410 ms |
| Mở thư mục lớn | 222 ms (90 dòng) | 688 ms (240 dòng) | **3.020 ms** (600 dòng) |
| Tìm "trading" (khớp mọi ghi chú — ca xấu nhất) | 1.136 ms | 2.626 ms | **11.741 ms**, đơ liền 8 s |
| Mỗi lần tự lưu (gõ 24 ký tự) | ghi 2 × ~1 MB | ghi 2,7 + 2,9 MB (~460 ms) | ghi 6,7 MB (1,5 s) |
| Dung lượng `storage.local` | 2,3 MB | 5,9 MB | **14,7 MB** (dữ liệu thật 7,2 MB — lưu 2 bản) |

| Kịch bản khác | Số đo |
|---|---|
| Google Fonts trả chậm 3 s (wifi yếu / mạng công ty) | Popup **trắng 3,2 s** rồi mới vẽ (bình thường 0,2 s) |
| Gói extension `dist/` | **11 MB, 295 file** — ~10 MB là ngôn ngữ / theme Shiki không bao giờ dùng |
| 3.000 bookmark | Mở tab ~0,3 s, tìm ~1,1 s — ổn, **không cần sửa** |

## Nguyên nhân (đã đối chiếu code)

1. **Mỗi dòng ghi chú quét cả kho body.** `NoteItem.vue:56` `computed(() => notes.bodiesForNote(id))` →
   `stores/notes.ts:80` lọc + sắp xếp *toàn bộ* `bodies` cho từng dòng: 600 dòng × 4.000 body. Vue theo dõi từng
   phần tử nên mỗi lần tự lưu một body, **cả 600 dòng tính lại**. `NoteList` vẽ hết mọi dòng một lúc.
2. **Tìm kiếm.** Không đăng nhập: `notes.service.ts:174–177` đọc lại toàn bộ kho từ đĩa (7 MB) ở *mỗi* lần tìm, dù
   RAM đã có đủ; `stores/notes.ts:105–106` lọc thêm lần nữa trên RAM. Lọc trên **HTML thô**
   (`notes.service.ts:201`) → gõ `strong`, `span`, `class`… khớp nhầm thẻ định dạng. Mỗi kết quả lại dựng DOM để
   lấy đoạn trích (`text.ts:108` → `plainTextFromHtml` dùng `innerHTML`) cho mọi body của nó.
3. **Đọc / ghi thừa.** `SyncStatusBadge.vue:39` nghe *mọi* thay đổi storage (kể cả bản nháp ghi chú ghi vào
   `storage.session` khi đang gõ) → mỗi lần đọc lại toàn bộ ghi chú + bản sao lưu bookmark + sự kiện chỉ để đếm
   số mục chưa đồng bộ. Mỗi lần mở popup: đọc `note_bodies_cache` 3 lần + kho local 1 lần, rồi **ghi lại nguyên
   cache dù không có gì đổi**.
4. **Font chặn vẽ.** `index.html:8–12` nạp stylesheet Google Fonts trong `<head>` — trình duyệt chờ nó xong mới vẽ.
   Kèm theo: README ghi chế độ không đăng nhập "No network requests are made" — **chưa đúng**, mỗi lần mở popup
   đều gọi Google (privacy policy thì đã khai đúng).
5. **Shiki nạp cả bộ.** `utils/highlight.ts:35` `import('shiki')` kéo theo ~200 ngôn ngữ + ~60 theme thành 280+
   file trong gói, trong khi chỉ dùng 10 ngôn ngữ + 2 theme.

## 2.0.1 — các mục (không đổi giao diện, không thêm chức năng)

Mức công: **S** ≤ ½ ngày · **M** 1–2 ngày · **L** ≥ 3 ngày.

| # | Việc | Công | Rủi ro | Mục tiêu đo được |
|---|---|---|---|---|
| **P1** | **Font Inter đóng gói kèm** (việc nhỏ số 5): woff2 latin + latin-ext + **vietnamese**, bỏ Google Fonts khỏi `index.html` + CSP (`style-src` / `font-src` / `connect-src`); privacy policy bỏ mục Google Fonts của extension; câu "No network requests" trong README thành đúng | S | Thấp | Font chậm 3 s → popup vẫn vẽ ~0,2 s; 0 request ra ngoài khi không đăng nhập |
| **P2** | **Shiki gọn:** `shiki/core` + import riêng 10 ngôn ngữ + 2 theme. Giữ engine WASM (kết quả tô màu không đổi) | S | Thấp | `dist/` 11 MB / 295 file → ~3 MB / < 60 file |
| **P3** | **Danh sách ghi chú nhanh:** chỉ mục `bodiesByNote` (Map tính 1 lần, O(N)) trong store; NoteItem tra Map; nhớ sẵn plain text theo (body id, `updated_at`); NoteList vẽ dần 50 dòng, cuộn tới đâu vẽ tới đó | M | Thấp | Thư mục 600 ghi chú < 300 ms; tự lưu không làm 600 dòng tính lại |
| **P4** | **Tìm kiếm nhanh + đúng:** tìm trên RAM (bỏ đọc lại kho), tìm trên **chữ** chứ không trên thẻ HTML, đoạn trích lấy từ plain text đã nhớ (P3), kết quả vẽ dần. Đăng nhập: tìm full-text trên server giữ nguyên | M | Thấp–vừa (đổi kết quả: hết khớp nhầm thẻ HTML — ghi rõ trong spec) | 2.000 ghi chú < 300 ms, không đoạn đơ nào > 100 ms |
| **P5** | **Bớt đọc / ghi thừa:** SyncStatusBadge chỉ nghe `local` + key `bbqone_local_*`, gộp nhịp; mở popup không ghi lại cache khi không đổi, bỏ các lần đọc cache trùng | M | Vừa (đụng luồng N4/N5 đọc-gộp-ghi — test đa ngữ cảnh cũ phải vẫn PASS) | Mở popup 2.000 ghi chú ≤ 450 ms; gõ ghi chú → 0 lần đọc toàn kho từ badge |

| **U28** | **Thanh dọc chỉ icon + tooltip** (Sir, 2026-10-29: "không cần bấm vào phóng to ra mà mặc định là những icon category, rê chuột vào sẽ là tooltip"): bỏ ☰ + bảng nổi có chữ; mỗi icon Lịch / Ghi chú / Bookmark có tooltip khi rê chuột hoặc focus bằng bàn phím | S | Thấp | Không còn ☰ / bảng nổi; tooltip hiện khi hover + focus |

| **C16** | **Lỗi có từ bản trên Store** (phát hiện khi smoke test đợt này, tái hiện trên 2.0.0 gốc): **không đăng nhập, xóa ghi chú / section / sự kiện lịch thì dòng không mất** — kho máy đã xóa nhưng cache giữ, mở lại popup vẫn còn. Gốc: N5 giữ row dirty vắng trong snapshot, mà row không đăng nhập luôn dirty. Sửa: store nhớ id mình cố ý xóa, `persistCache` không kéo về | S | Vừa (đụng N5 — harness đa ngữ cảnh phải PASS) | Xóa → mất ngay, hết 5 s + mở lại vẫn mất; hoàn tác vẫn chạy |

| **U29** | **Esc không đóng extension** (Sir, 2026-10-29: "bấm ESC bị tự động tắt … khi nào click chuột ra ngoài extension thì mới đóng"): chặn Esc ở mức trang (`main.ts`, pha capture, không chặn lan truyền); 4 lớp chưa nghe Esc (menu ⚙, 3 hộp thoại đồng bộ) → Esc = hành động bấm ra ngoài | S | Thấp | Popup thật: Esc ở màn hình chính không đóng; Esc chỉ đóng lớp trong cùng |

| **U30** | **Lịch 6 sự kiện / ngày** (Sir, 2026-10-29: "chỉ cho thêm 3 event quá cứng nhắc … show 2 event, nhiều hơn thì tag view more"; chip ngày 5–6 sự kiện "phải hiện đủ, không gom gọn"; "ngày mai trên chip show 3 event + show more"): giới hạn 3 → 6 (không cần migration); ô hiện 2 + nút "+n xem thêm" (mở được cả ngày đã qua); chip: tên vừa hết thì hiện tên, không thì "6 sự kiện" (hết "vài tên + +n"); bảng: Hôm nay đủ, Ngày mai 3 + "Xem thêm n" | S | Thấp (máy còn 2.0.0 vẫn hiện đủ, chỉ chặn thêm khi ngày ≥ 3) | Thêm đủ 6, thứ 7 bị chặn; ô / chip / bảng đúng như trên |

| **U31** | **Hộp thoại không đóng khi bấm ra ngoài** (Sir, 2026-10-29: "đang nhập title … lỡ click ra khỏi popup … popup tắt đi, phải nhập lại — chỉ được tắt bằng X hoặc ESC"): 15 hộp có nền mờ bỏ đóng-khi-bấm-nền; nền chặn mousedown để focus / con trỏ gõ ở nguyên trong hộp; menu / bảng nổi giữ nguyên | S | Thấp | Gõ dở → bấm nền → hộp + chữ còn; ✕ / Esc vẫn đóng; Esc hộp xác nhận không đóng hộp bên dưới |

| **U32** | **Thẻ "+n xem thêm" rộng bằng dòng sự kiện** (Sir, 2026-10-29: "tag này width = với event"): một dòng của danh sách — rộng hết cột, cùng bo góc, chữ thẳng cột tên sự kiện; viền đứt, nền trong, 24 px | XS | Thấp | Cùng mép với pill, chữ thẳng cột, không bị cắt |

| **U33** | **Bookmark: "Sao lưu ngay" thành icon ☁↑ + tooltip** (Sir, 2026-10-29: "button backup now … chuyển qua icon và tooltip, dời qua vị trí khác phù hợp"): bỏ nút chữ đặc trên thanh công cụ; icon màu nhấn ở đầu cột SAO LƯU (như ＋ đầu mục Thư mục / Ghi chú) | XS | Thấp | Thanh công cụ hết nút chữ; ☁↑ cạnh "SAO LƯU · n", bấm → thêm 1 bản |

| **U34** | **Header hết bề ngang, thanh dọc dưới header** (Sir, 2026-10-29: "thanh dọc lùi xuống, thanh ngang đè lên, logo + text ra ngoài bìa, các category dưới logo — nhờ chuyên gia đánh giá"): đánh giá **đồng ý** — góc trên trái về thương hiệu, logo cùng trục cột icon (tâm 28 px), header > thanh dọc > nội dung; nội dung không mất chỗ | S | Thấp (chỉ khung `pages/App.vue`) | Header 0 → 800 px; tâm logo = tâm icon; thanh dọc từ dưới header |

| **U35** | **Bookmark: bỏ hàng thanh công cụ, ô tìm ở đầu cột trình duyệt** (Sir, 2026-10-29: "1 row trống cho 1 chức năng search, kiểu lẻ loi"): ô tìm luôn hiện ngay trên cây / KẾT QUẢ nó lọc (kiểu ô "Tìm trong tất cả ghi chú"), dính đầu khung khi cuộn; "Sao lưu lần cuối" vào tooltip ☁↑; bỏ ✕ trùng ở KẾT QUẢ | XS | Thấp | Hết hàng trống; tìm / Esc / ✕ / Ctrl+F như cũ |

| **U36** | **Chip lịch luôn ghi số từ 2 sự kiện** (Sir, 2026-10-29: chip vẫn hiện "VIB, HSBC, OT - 2 Hours, a, b" — "mình nhờ là đổi là hôm nay có 5 sự kiện"): bỏ kiểu lai của U30 (tên vừa chỗ thì hiện tên) và toàn bộ phần đo chữ; 1 sự kiện vẫn hiện tên; tooltip đủ tên. Vẫn trong 2.0.1 (chưa upload) | XS | Thấp | 5 sự kiện tên ngắn → "Hôm nay 5 sự kiện" |

**Thứ tự:** P1 → P2 (nhỏ, độc lập, ai cũng hưởng) → P3 → P4 (P4 dùng plain text nhớ sẵn của P3) → P5 → U28 → C16.
✅ **R5 (2026-10-29): đã nâng 2.0.1** — phiên bản + README / Store / privacy policy / DESIGN (xem Trạng thái); còn: Sir build bằng `.env` thật, verify tay, upload. **Phát hành 2.0.1:** 5 mục GREEN → `npm run sync-version` (2.0.1) → What's new trong README + mô tả Store →
bảng số đo trước / sau → Sir verify tay → upload `dist/`. Quyền trong manifest **không đổi** (cập nhật không bị
Chrome tạm tắt).

**Để sau, có chủ đích:** tách kho theo từng ghi chú thay vì một mảng lớn (bỏ việc ghi lại 6,7 MB mỗi lần lưu,
bỏ lưu 2 bản) — công **L**, rủi ro cao (đổi định dạng lưu + đồng bộ + chuyển dữ liệu cũ); chỉ đáng làm khi người
dùng thật vượt ~1.000 ghi chú → đo lại sau P3–P5 rồi quyết.

## Quy ước phiên bản (Sir, 2026-10-29)

**Chức năng mới → tăng số giữa** (2.0.1 → 2.1.0); **refactor / nâng cấp lớn ảnh hưởng nhiều → tăng số đầu**;
sửa lỗi / tinh chỉnh → số cuối.

## 2.1.0 — B1 Sao lưu ra file (✅ đã làm — `specs/B1-backup-file.spec.md`; kế hoạch gốc dưới để làm lịch sử)

Để riêng một bản vì là chức năng mới và **ghi dữ liệu** (nhập file) — kiểm riêng cho chắc; Sir muốn sớm hơn thì
gộp vào cuối 2.0.1.

- **Xuất JSON** (Settings › Sao lưu & khôi phục): thư mục, ghi chú, body, sự kiện lịch, bản sao lưu bookmark;
  `{ app: "bbqone", format: 1, exported_at, … }`. Ghi chú trong thư mục bảo mật / tài khoản bật mã hóa giữ
  **nguyên dạng mã hóa** trong file. Dùng quyền `downloads` sẵn có.
- **Nhập JSON** (v1: chế độ không đăng nhập — sau đó đăng nhập thì luồng đẩy dữ liệu máy lên cloud sẵn có lo phần
  còn lại): kiểm định dạng, gộp theo id (bản `updated_at` mới hơn thắng), báo số mục thêm / cập nhật / bỏ qua;
  mục mã hóa và ngày đã đủ 3 sự kiện → bỏ qua có báo.
- **Xuất Markdown:** một file `.md`, ghi chú nhóm theo thư mục; tự chuyển HTML → Markdown cho các khối Tiptap
  đang dùng (không thêm thư viện).
- Công **M–L** (~2–3 ngày), rủi ro vừa: test file hỏng / sai định dạng / rất lớn / hết quota, gộp trùng id.

## 2.1.1 — SEC1 Bản vá bảo mật (✅ đã làm — `specs/SEC1-hardening-2.1.1.spec.md`)

Từ rà soát `specs/SEC-REDTEAM-2026-10-29.md` (Sir duyệt 2026-10-29): SEC-1 (vá thư viện, phần không đổi bản lớn),
SEC-7 (escape `HREF` khi xuất HTML), SEC-8 (lọc `\r` / ký tự điều khiển trong lịch ICS + khi nạp file), SEC-4 (lọc
link `javascript:` / `data:` khi khôi phục bookmark), SEC-6 (đọc HTML trên tài liệu trơ → ảnh không tự tải), SEC-5
(siết CSP). Quyền không đổi. **Sir deploy lại Edge Function `calendar-feed`.** Còn mở: Tiptap v3 (24 cảnh báo vừa),
vite dev, SEC-2 / 3 / 9 / 10 / 11 / 12.

## Ý tưởng chức năng sau (trước gọi "2.1"): CHỈ LÀ ĐÁNH GIÁ, CHƯA DUYỆT

> **Sir (2026-10-29): chưa chốt mục nào trong danh sách này** (bản 2.1.0 là B1). Bảng dưới chỉ ghi mức công để tham khảo — **không làm, không viết
> spec** mục nào cho tới khi Sir yêu cầu cụ thể.

| # | Việc | Công | Ghi chú |
|---|---|---|---|
| F1 | **Tìm từ thanh địa chỉ** (việc nhỏ số 6) — ✅ **Sir chốt + đã làm** (2026-10-29): từ khóa `bbq`, **Enter = mở**, **Alt+Enter = sao chép cả ghi chú**, không tìm lịch | S–M | Xem Trạng thái · spec `F1-omnibox-search.spec.md` (mô tả gốc `F1-omnibox-proposal.md`). Không thêm quyền |
| ~~F2~~ | ~~Dời việc quá hạn sang hôm nay~~ — **BỎ** | — | Sir (2026-10-29): "Vẫn giữ việc overdue ngày setup" — việc quá hạn giữ nguyên ngày đã đặt, không dời |
| F3 | **Sửa / xóa cả chuỗi sự kiện lặp** (số 7a) — ✅ **Sir duyệt (2026-10-29), đã làm** | M | Xem Trạng thái. ✅ **Sir đã chạy `supabase/migrations/018_calendar_series.sql` (2026-10-29)** (upsert đẩy mọi cột). Chuỗi tạo trước F3 không có `series_id` → vẫn sửa / xóa từng cái |
| — | Ghi nhanh từ trang web, giờ + nhắc việc, Side Panel (gợi ý 1–3 hôm 2026-10-29) | M mỗi mục | Nhắc việc cần quyền `notifications` → để ở `optional_permissions`, xin khi bật |

## Trạng thái

| Mục | Commit (docs → perf) | Test | Số đo sau |
|---|---|---|---|
| P1 | `0ba90d0` → (commit này) | ✅ 8/8 (RED 7) | Google chậm 3 s: popup vẽ sau **144–236 ms** (trước 3.184 ms); 0 request ra ngoài; tiếng Việt đúng Inter (subset vietnamese) |
| P2 | `36249c8` → (commit này) | ✅ 4/4 (RED 3) | `dist/` **11 MB / 295 file → 3,2 MB / 42 file** (còn lại: WASM 0,6 MB, font P1 0,46 MB, app 0,45 MB); HTML tô màu giống hệt (10 ngôn ngữ × 2 theme); Chromium: code block tô màu light + dark |
| P3 | `86789b5` → (commit này) | ✅ 18/18 (RED 6) | Thư mục 600 ghi chú **3.020 → 193 ms** (vẽ 60 dòng, cuộn tới đâu vẽ tới đó); gõ ghi chú 0 longtask; mở ghi chú 128 → 74 ms; tìm 2.000 ghi chú 11,7 → 2,8 s (phần còn lại: P4). Vá mock `@/utils/noteBodyIndex` cho S2C1.5 / 1.6 / 1.7 (không đổi assertion) |
| P4 | `0177ab1` → (commit này) | ✅ 8/8 (RED 5) | Tìm 2.000 ghi chú, khớp tất cả: **11.741 ms (đơ 8 s) → ~340 ms**, chỉ lần đầu một đoạn 165 ms (dựng plain text), sau đó 0 đoạn đơ; "kafka" 40 kết quả, "strong" 0 kết quả (trước: khớp mọi ghi chú có chữ đậm). Đăng nhập: hết tải cả kho từ Supabase khi full-text không khớp / lỗi. Giữ W3 của S2C1 (lọc khóa nằm trong `runSearch`); vá mock `@/utils/noteSearch` cho S2C1.5 / 1.6 / 1.7. Sửa kỳ vọng sai của chính test P4 (ca "o" → "e": ghi chú E không có chữ o) |
| P5 | `3571bb4` → (commit này) | ✅ 12/12 (RED 7, 5 ca chốt chặn) | Mở popup ổn định (2.000 ghi chú): **hết ghi lại cache** (trước: `set` 7,2 MB + 267 KB mỗi lần mở), storage ops 27 → 23, đoạn đơ 190 → 122 ms, tới lịch ~505–559 ms (2.0.0: 790–880 ms). Gõ 24 ký tự: đọc lớn **10 → 2** (badge hết đọc lại kho). Vá mock `@/utils/rowsEqual` cho C11, U1-U2, U3, S2C1.5 / 1.6 / 1.7 (không đổi assertion); sửa regex T4.1 của chính test P5 (chữ ký hàm nhiều dòng) |
| U28 | `c92031e` → (commit này) | ✅ 5/5 (RED 4) | Chromium: thanh dọc 3 icon (hết ☰ / bảng nổi), icon đầu thẳng hàng logo (tâm 30 px); rê chuột / Tab → tooltip tên mục bên phải, sáng + tối; không lỗi console. Đổi assertion có chủ đích: U20.2, U20.4, U20.6, U20.7, U22.1, U23.4, U24.2, U26.3 |
| C16 | `eacb85d` → (commit này) | ✅ 9/9 (RED 6) | Chromium, không đăng nhập: xóa ghi chú → mất ngay (trước: vẫn hiện), hết 5 s + mở lại popup vẫn mất (đĩa: kho máy = cache); xóa sự kiện lịch / section tương tự; hoàn tác vẫn chạy; smoke test 7/7, không lỗi console |
| F3 | `6c5d80c` → (commit này) | ✅ 15/15 (RED 15) | Chromium (không đăng nhập): "Họp tuần" hằng tuần × 4 → cùng `series_id`, dấu ↻ cạnh tên; sửa lần 2 "Từ đây về sau" → lần 2–4 đổi, lần 1 giữ ("Sẽ sửa 3 sự kiện"); xóa "Cả chuỗi" → 1 lượt hoàn tác cho 4 sự kiện, hoàn tác về đủ; xóa lại + hết 5 s + mở lại popup → chỉ còn sự kiện đơn; nhãn phạm vi không bị cắt (en / vi, sáng / tối) |
| U29 | `32a9a63` → (commit này) | ✅ 6/6 (RED 6) | Popup thật (CDP): màn hình chính Esc → popup **vẫn mở** (trước: đóng); form Thêm sự kiện → Esc đóng form, Esc lần 2 popup vẫn mở; menu ⚙ → Esc đóng menu, popup còn |
| F1 | `1b79e51` → (commit này) | ✅ 15/15 (RED 7) | Chromium (gọi thẳng sự kiện omnibox trong service worker): `kafka` → "Kafka plan" (khớp tên, in đậm) trước "Other" (khớp nội dung), thư mục bảo mật không hiện; Alt+Enter → clipboard có cả ghi chú (2 section, SQL giữ thụt lề), icon ✓ rồi tự tắt; Enter → BBQOne mở tab Ghi chú đúng ghi chú; Enter dòng mặc định → ô tìm điền sẵn. `dist/manifest.json` có `omnibox.keyword = "bbq"`, quyền không đổi |
| U30 | `2acb886` → (commit này) | ✅ 20/20 (RED 14) | Chromium (không đăng nhập, en / vi, sáng / tối): hôm nay 6 sự kiện → hộp `6/6`, hết nút ＋, "đã đủ tối đa 6"; ô `HSBC T1279 · OT - 2 Hours · +4 xem thêm`; ô ngày đã qua: bấm khoảng trống không mở, bấm "+3 xem thêm" → hộp liệt kê đủ 5; chip `Hôm nay · 6 sự kiện · Ngày mai 4`, 3 tên ngắn vẫn hiện `Gym · VIB · OT`; bảng: Hôm nay 6 dòng, Ngày mai 3 + "Xem thêm 1" → bấm ra đủ 4 (focus ở lại bảng, Esc đóng), mở lại thu về 3; bảng cao 400 px không cuộn; không lỗi console. Đổi assertion có chủ đích: U18 T1–T6 / S1 / S2, U3 T2.1–T2.3, R2.4 |
| U31 | `3f1b88c` → (commit này) | ✅ 62/62 (RED 22 / 47; +15 ca U31.6) | Chromium (vi): form Thêm sự kiện gõ "Họp với khách hàng" → bấm nền 2 lần → hộp còn, gõ tiếp được ("… 2"); ✕ đóng; Esc đóng. Cài đặt: bấm nền không đóng, Esc đóng. Hộp xác nhận xóa: bấm nền → còn, sự kiện còn; Esc chỉ đóng hộp xác nhận, hộp ngày còn (C12). Hộp tạo thư mục: bấm nền → chữ còn, Esc đóng. Không lỗi console. Bổ sung test của chính U31 trước GREEN: chỉ bỏ `@click.self` thì focus rơi về `<body>` (Esc hộp tạo thư mục thôi chạy, Esc hộp xác nhận đóng luôn hộp ngày) → thêm U31.6 nền chặn mousedown, chốt chặn U31.4 cho phép `@mousedown(.self).prevent` trơn |
| U32 | `1272fec` → (commit này) | ✅ 5/5 (RED 4) | Chromium (vi, sáng / tối): thẻ cùng mép trái / phải với pill (75–165 px), chữ thẳng cột tên sự kiện (86 px = 86 px, lề trái 10 px bù vạch màu 3 px của pill); "+4 xem thêm" đủ chữ trong ô hôm nay (đậm 600 / lề phải 8 px tràn 0,2 px → "+4 xem th…"; chốt 500 / 6 px, dư ~2,4 px); hàng không cắt; rê chuột viền + chữ màu nhấn |
| U33 | `7a98647` → (commit này) | ✅ 4/4 (RED 3) | Chromium (vi sáng / en tối): thanh công cụ hết nút chữ (chỉ còn "Sao lưu lần cuối" khi có + 🔍); ☁↑ cạnh "BẢN SAO LƯU · 0", tooltip / aria "Sao lưu ngay" / "Backup now"; bấm → "· 1" + dòng manual_backup_…; Tab tới được (vòng focus); không lỗi console. Đổi assertion có chủ đích: U11 C1, U15 M3 |
| U34 | `8ffa4ff` → (commit này) | ✅ 5/5 (RED 4) | Chromium (vi, sáng / tối): header x 0 → 800, cao 59; logo tâm x 28 = thanh dọc tâm 28 = icon Lịch tâm 28; thanh dọc y 59 → 600 (mục đầu y 71); cột nội dung giữ nguyên (x 56, y 59, 744 × 541); tooltip thanh dọc hiện trên nội dung; bảng chip lịch phủ lên lưới; 3 tab bình thường; không lỗi console. Các test khung cũ (U20.1 thanh dọc trước cột nội dung, U23 / U26 / U28) PASS không cần đổi |
| U35 | `eb76034` → (commit này) | ✅ 7/7 (RED 7) | Chromium (vi sáng / en tối): hết hàng thanh công cụ — hai cột bắt đầu y 71 (dưới header 12 px); ô tìm luôn hiện đầu cột trình duyệt, chữ gợi ý "Tìm trong bookmark và bản sao lưu…"; cuộn cây 400 px → ô tìm dính đầu khung, nằm trên cây; Ctrl+F focus ô; "mail" → KẾT QUẢ · 1 ngay dưới ô; Esc 1 xóa chữ (focus còn ở ô), Esc 2 rời ô; ✕ trong ô → về cây; ☁↑ tooltip "Sao lưu ngay" → sau khi sao lưu "Sao lưu ngay · Sao lưu lần cuối: …"; không lỗi console. Đổi assertion có chủ đích: U5.9, U11 C1, U15 M3, U33.1 / U33.2 / U33.4 |
| R5 | `2265bc1` → (commit này) | ✅ 7/7 (RED 6) | Phiên bản 2.0.1: manifest / package.json / package-lock.json; `dist/manifest.json` 2.0.1, quyền = 2.0.0 + khóa `omnibox` (không cảnh báo); `dist/` 3,2 MB / 42 file. README "What changed in 2.0.1"; Store: "Release 2.0.1 (highlights)" + "WHAT'S NEW IN 2.0.1"; permissions doc v2.0.1; privacy policy áp dụng từ 2.0.1 + đoạn Address bar search; DESIGN.md sơ đồ khung mới. Đổi assertion có chủ đích: R1.1–R1.5 (phiên bản hiện tại thay cứng 2.0.0), R2.1 / R2.2 / R2.4 |
| U36 | `9a86634` → (commit này) | ✅ 7/7 (RED 5) | Chromium: 5 sự kiện tên ngắn (như ảnh Sir) → `Today 5 events` / `Hôm nay 5 sự kiện · Ngày mai 2` (trước: tên); 1 sự kiện → tên; chỉ ngày mai 3 → `Ngày mai 3 sự kiện`; tooltip đọc đủ tên; không lỗi console. Đổi assertion có chủ đích: U18 T0–T6 / S1, U30.4–U30.8 / U30.15. Từ U36: làm thẳng trên `main` (Sir) |
| B1 | `17d89bc` → (commit này) | ✅ 40/40 (RED 12) | Phiên bản **2.1.0**. Chromium (không đăng nhập): mở popup có dữ liệu → tự tải file (counts đúng), mở lại cùng ngày → không tải thêm; công tắc tắt / bật lưu đúng; "Sao lưu ngay" → `bbqone-backup-…json`; file không phải JSON / app khác → báo lỗi, không ghi; **file độc** (script, `<img onerror>`, iframe, `onclick`/`style`, link `javascript:`, envelope giả, `__proto__`, id `../../etc/passwd`, 8 sự kiện / ngày, màu `url()`, bookmark `javascript:` / `data:`) → xem trước báo bỏ 3 mục + 3 bookmark; sau 2 lần xác nhận: nội dung chỉ còn `<p>`/`<strong>`/`<pre><code>`, envelope thật giữ nguyên, 6 sự kiện, màu `null`, chỉ còn link https, Object.prototype sạch, không `alert` nào chạy, không lỗi console; tiêu đề độc hiện thành chữ; bản an toàn trước khôi phục chứa dữ liệu cũ; Esc trong hộp xem trước không đóng Cài đặt. File 6,9 MB (2.000 ghi chú + 11 bản bookmark): xem trước 1,0 s, ghi + tải lại 2,5 s. Lỗi bắt được khi kiểm: mảng thành object (Proxy Vue) → `shallowRef` + bản thuần JSON; 6,4 s → 1,0 s (dựng schema một lần). Đổi assertion có chủ đích: R1.4, R2.2, R5.1 / R5.3 / R5.5 / R5.6 / R5.7, U36.6 / U36.7 |
| SEC1 | `3df95b5` → (commit này) | ✅ 16/16 (RED 13) | Phiên bản **2.1.1**. `npm audit --omit=dev`: 9 cao → **0 cao** (prosemirror-view 1.42.8, vue 3.5.44, Tiptap 2.27.3 đồng bộ…). Chromium (không đăng nhập, CSP mới): font Inter + logo tải, code SQL tô màu Shiki (9 span); ghi chú có `<img src=https://evil.example/…>` → editor không có ảnh, tìm "tracking" ra đúng; dán HTML có `<img>` + `<iframe>` ngoài → chỉ còn chữ; **0 request ra ngoài**, 0 vi phạm CSP, console không nhắc evil.example; khôi phục bản bookmark có `javascript:` + `data:` → hộp xác nhận báo "2 bookmark dạng javascript: / data: sẽ không được khôi phục", cây Chrome sau đó chỉ còn link https; xuất HTML `HREF="https://good.example/?a=1&amp;b=%222%22"`; B1 xem trước file độc vẫn chạy; không lỗi console. Đổi assertion có chủ đích: B1.30 / B1.31 / B1.32 (phiên bản hiện tại thay cứng 2.1.0) |
