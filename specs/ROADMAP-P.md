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

**Thứ tự:** P1 → P2 (nhỏ, độc lập, ai cũng hưởng) → P3 → P4 (P4 dùng plain text nhớ sẵn của P3) → P5 → U28.
**Phát hành 2.0.1:** 5 mục GREEN → `npm run sync-version` (2.0.1) → What's new trong README + mô tả Store →
bảng số đo trước / sau → Sir verify tay → upload `dist/`. Quyền trong manifest **không đổi** (cập nhật không bị
Chrome tạm tắt).

**Để sau, có chủ đích:** tách kho theo từng ghi chú thay vì một mảng lớn (bỏ việc ghi lại 6,7 MB mỗi lần lưu,
bỏ lưu 2 bản) — công **L**, rủi ro cao (đổi định dạng lưu + đồng bộ + chuyển dữ liệu cũ); chỉ đáng làm khi người
dùng thật vượt ~1.000 ghi chú → đo lại sau P3–P5 rồi quyết.

## 2.0.2 — B1 Sao lưu ra file (Sir đã đồng ý)

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

## 2.1 — chức năng mới (đánh giá trước, làm sau 2.0.x)

| # | Việc | Công | Ghi chú |
|---|---|---|---|
| F1 | **Tìm từ thanh địa chỉ** (việc nhỏ số 6): gõ `bb <từ khóa>` | S–M (~1 ngày) | Khóa `omnibox` trong manifest — không hiện cảnh báo quyền. Service worker đọc `notes_cache` (bỏ qua mục mã hóa); Enter → mở popup đúng ghi chú qua `BBQ_PENDING_ROUTE_KEY` + `chrome.action.openPopup` (cách menu chuột phải đang dùng) — cần thêm route mở thẳng một ghi chú |
| F2 | **Dời việc quá hạn sang hôm nay** (số 7b, theo sau U7) | S–M (~1 ngày) | Nút trong bảng "Quá hạn"; hôm nay đủ 3 sự kiện → dời tới đâu được tới đó, báo phần còn lại |
| F3 | **Sửa / xóa cả chuỗi sự kiện lặp** (số 7a, theo sau U3) | M (~2 ngày) + migration | Cột `series_id` (migration 018). Đồng bộ đẩy lên bằng upsert mọi cột (`syncEngine.service.ts:258`) → **Sir phải chạy migration trước khi phát hành**, không thì đẩy sự kiện lỗi. Chuỗi tạo trước đó không có `series_id` → chỉ áp cho chuỗi tạo mới |
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
