# Rà soát bảo mật kiểu "hacker" — BBQOne 2.1.0 (2026-10-29) — CHỈ LIỆT KÊ, CHỜ SIR DUYỆT

> Sir: "Đóng vai hacker 35+ năm kinh nghiệm tìm mọi cách hack vào hệ thống BBQOne extension, liệt kê các case quan
> trọng trước". Phạm vi: extension (popup / tab / service worker / offscreen), Supabase (RLS, Edge Function
> `calendar-feed`), thư viện phụ thuộc. Chưa sửa gì ngoài B1 — Sir chọn mục nào thì viết spec + failing test như thường.

## Cách kẻ tấn công nhìn BBQOne

Mục tiêu đáng giá nhất: **nội dung ghi chú** (người dùng hay lưu mật khẩu, SQL, key API), **bookmark**, **lịch**. Đường
vào: (1) chạy mã trong trang extension (có quyền `bookmarks`, `downloads`, `storage`…); (2) chiếm tài khoản Supabase →
đọc + cài nội dung độc đồng bộ xuống mọi máy; (3) đọc trộm dữ liệu nằm trên đĩa (mã độc đánh cắp trình duyệt rất phổ
biến); (4) thư viện bên thứ ba có lỗ hổng; (5) lừa người dùng nạp / mở file.

## Bảng tóm tắt (ưu tiên từ trên xuống)

> **2026-10-29:** SEC-1 (phần vá), 4, 5, 6, 7, 8 đã làm trong **2.1.1** — `specs/SEC1-hardening-2.1.1.spec.md`.
> Phần còn lại (SEC-1 Tiptap 3, SEC-2, 3, 9, 10, 11, 12 + vite) → kế hoạch chi tiết `specs/ROADMAP-SEC.md`.

| # | Mức | Tình huống | Trạng thái | Công |
|---|---|---|---|---|
| SEC-1 | **Cao** | Thư viện trình soạn có lỗ hổng đã công bố (XSS khi dán — prosemirror-view; `__proto__` — Tiptap) | ✅ 2.1.1 phần vá (0 cao); còn Tiptap v3 | S (vá) + L (Tiptap v3) |
| SEC-2 | **Cao** | Chiếm tài khoản (đoán / lộ mật khẩu) → đọc hết + cài nội dung độc lên mọi máy | Mở một phần | M |
| SEC-3 | **Cao** | Mã độc trên máy đọc trộm kho Chrome + file sao lưu tự động (chữ thường) | Mở | M–L |
| SEC-4 | Vừa | Khôi phục bản sao lưu bookmark tạo lại link `javascript:` (bookmark độc tồn tại lâu dài) | ✅ 2.1.1 (SEC1) | S |
| SEC-5 | Vừa | CSP thiếu `img-src` / `frame-src` / `base-uri` / `form-action` → HTML lọt vào DOM tải được tài nguyên ngoài | ✅ 2.1.1 (SEC1) | S |
| SEC-6 | Vừa | Phân tích HTML trên tài liệu "sống" (innerHTML) → ảnh trong ghi chú / nội dung dán tự tải (lộ IP, theo dõi) | ✅ 2.1.1 (SEC1) | S |
| SEC-7 | Vừa | Xuất bookmark HTML không escape `HREF` → file xuất mở ra chạy mã | ✅ 2.1.1 (SEC1) | XS |
| SEC-8 | Vừa | Tên sự kiện có ký tự CR (`\r`) chèn được thuộc tính vào link Google Calendar (ICS) | ✅ 2.1.1 (SEC1) | XS |
| SEC-9 | Vừa | PBKDF2 310.000 vòng cho thư mục bảo mật — dưới mức khuyến nghị 600.000 (dò mật khẩu offline khi lộ DB) | Mở | M |
| SEC-10 | Vừa | Chuỗi cung ứng: 33 cảnh báo `npm audit`, không có kiểm tra tự động | Mở | S |
| SEC-11 | Thấp | "Xóa tất cả bookmark của Chrome" chỉ cách 1 lần xác nhận | Mở | S |
| SEC-12 | Thấp | Gợi ý thanh địa chỉ (`bbq`) hiện tên + đoạn ghi chú khi chia sẻ màn hình | Mở | S |
| ✓ | — | Đã ổn: không content script, không `externally_connectable`, RLS đúng mọi bảng, token feed 256 bit, escape khi `v-html`, B1 lọc file | Đã kiểm | — |

## Chi tiết

### SEC-1 (Cao) — Lỗ hổng đã công bố trong thư viện trình soạn

- **Bằng chứng:** `npm audit --omit=dev` (2026-10-29): 33 cảnh báo (9 cao, 24 vừa). Liên quan trực tiếp tới bản đóng gói:
  - `prosemirror-view < 1.42.3` — **XSS khi dán** (GHSA-c8x8-7fp4-3x9w). Trình soạn ghi chú dùng ProseMirror.
  - `@tiptap/core ≤ 3.30.3` — `mergeAttributes()` biến khóa `__proto__` thành thuộc tính DOM chạy được
    (GHSA-cp6q-959q-f8rh); bản vá chỉ có ở **Tiptap 3.32+** (đang dùng 2.27 → nâng cấp lớn).
  - `vue ≤ 3.5.41` (XSS ở render phía server — BBQOne không dùng SSR), `markdown-it` / `linkify-it` (treo CPU — không
    gọi tới), `ws`, `postcss`, `nanoid`, `source-map-js` (chỉ lúc build).
- **Kịch bản:** nạn nhân sao chép nội dung từ một trang web độc rồi dán vào ghi chú → HTML dán khai thác lỗi paste.
- **Đang được đỡ bởi:** CSP MV3 chặn script inline / thuộc tính `on*` → khả năng chạy mã thấp, nhưng không được dựa vào
  một lớp duy nhất.
- **Sửa:** `npm audit fix` (không đổi bản lớn: prosemirror-view, vue, markdown-it, linkify-it, ws, postcss, nanoid,
  source-map-js) → chạy lại toàn bộ test + kiểm trình soạn trên Chromium. Mục riêng: **nâng Tiptap 2 → 3** (đổi API,
  công L).

### SEC-2 (Cao) — Chiếm tài khoản Supabase

- **Kịch bản:** dò mật khẩu từ các vụ lộ dữ liệu khác (credential stuffing) / lừa đảo → đăng nhập → đọc mọi ghi chú
  (trừ thư mục bảo mật), lịch, bản sao lưu bookmark; **cài nội dung độc** (bookmarklet trong bản sao lưu, ghi chú) đồng
  bộ xuống mọi máy; tạo lại link Google Calendar.
- **Hiện có:** RLS đúng (`auth.uid() = user_id`, đọc + ghi) trên `folders`, `notes`, `note_bodies`, `bookmark_backups`,
  `calendar_events`, `calendar_feeds`, `user_crypto`; chỉ email + mật khẩu; **không có 2FA** (code không có MFA). Cấu hình
  đăng ký / giới hạn đăng nhập nằm ở dashboard Supabase — repo không thấy được, Sir kiểm giúp.
- **Sửa:** bật trong Supabase: chặn mật khẩu đã lộ (HaveIBeenPwned), giới hạn đăng nhập sai / captcha, xác nhận đổi
  email; thêm **2FA (TOTP)** tùy chọn; mật khẩu tối thiểu mạnh hơn. Công M (phần lớn là cấu hình + một màn hình 2FA).

### SEC-3 (Cao) — Đọc trộm dữ liệu trên máy

- **Kịch bản:** mã độc đánh cắp thông tin (rất phổ biến, nhắm vào hồ sơ Chrome) sao chép thư mục profile →
  `chrome.storage.local` của BBQOne là **chữ thường** (ghi chú, bookmark, lịch). Thêm: file tự sao lưu B1 trong
  `Tải xuống/BBQOne` cũng chữ thường — nhiều máy đồng bộ thư mục Tải xuống lên OneDrive / Google Drive.
- **Hiện có:** chỉ ghi chú trong **thư mục bảo mật** được mã hóa (AES-GCM, khóa chỉ ở RAM).
- **Sửa (chọn):** (a) tùy chọn **mã hóa file sao lưu bằng mật khẩu**; (b) nhắc dùng thư mục bảo mật cho dữ liệu nhạy
  cảm; (c) mã hóa toàn kho bằng mật khẩu khi mở app (S3 — đang hoãn). Công M–L.

### SEC-4 (Vừa) — Khôi phục bookmark tạo lại link `javascript:`

- **Bằng chứng:** `src/services/bookmarks.service.ts:273` — `chrome.bookmarks.create({ …, url: node.url })` không lọc
  scheme. (B1 đã lọc khi **nạp file**, nhưng bản sao lưu đến từ Supabase / kho máy thì chưa.)
- **Kịch bản:** sau khi chiếm tài khoản (SEC-2), cài một bookmarklet `javascript:` vào bản sao lưu → nạn nhân bấm "↶ Khôi
  phục" → bookmark độc vào Chrome, bấm vào là chạy mã trên trang đang mở (đánh cắp phiên trang ngân hàng…).
- **Sửa:** cùng danh sách trắng `http(s) / ftp / file` như B1 khi khôi phục; báo số bookmark bị bỏ (bookmarklet thật của
  người dùng → hỏi lại). Công S.

### SEC-5 (Vừa) — CSP còn hở

- **Bằng chứng:** `public/manifest.json` — `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self'
  'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://*.supabase.co` — không có `default-src`,
  `img-src`, `frame-src`, `base-uri`, `form-action`.
- **Kịch bản:** HTML nào lọt vào DOM (dán, nội dung đồng bộ) có thể tải ảnh / iframe từ máy chủ ngoài → lộ IP, theo dõi
  lúc mở, gửi dữ liệu qua URL ảnh nếu kết hợp lỗi khác.
- **Sửa:** thêm `default-src 'self'; img-src 'self' data: blob:; frame-src 'none'; base-uri 'none'; form-action 'none';
  object-src 'none'` → kiểm mọi màn hình (logo, cờ ngôn ngữ, Shiki). Công S.

### SEC-6 (Vừa) — innerHTML trên tài liệu "sống"

- **Bằng chứng:** `src/utils/text.ts` (`plainTextFromHtml`, `htmlToClipboardPlain`), `src/utils/pastePlainText.ts:75,
  134` — `document.createElement('div').innerHTML = html`. Phần tử thuộc tài liệu đang mở → `<img src=…>` **tự tải**
  dù không hiển thị.
- **Kịch bản:** ghi chú (đồng bộ từ tài khoản bị chiếm / nội dung dán) chứa ảnh theo dõi → mỗi lần tìm kiếm / sao chép,
  extension gọi ra máy chủ của kẻ tấn công.
- **Sửa:** phân tích bằng `new DOMParser().parseFromString(...)` (tài liệu trơ — đã dùng cho B1). Công S.

### SEC-7 (Vừa) — Xuất bookmark HTML không escape `HREF`

- **Bằng chứng:** `src/services/bookmarks.service.ts:149` — `` `<A HREF="${n.url}">` `` (tên có `escHtml`, link thì không).
- **Kịch bản:** bookmarklet chứa `"` (vd `javascript:…"><script>…`) → file xuất, mở bằng trình duyệt (file://), chạy mã.
- **Sửa:** `escHtml(n.url)`. Công XS.

### SEC-8 (Vừa) — Chèn thuộc tính vào link Google Calendar (ICS)

- **Bằng chứng:** `supabase/functions/calendar-feed/ics.ts:31` — `escapeText` chỉ xử lý `\r?\n`; ký tự `\r` đơn lẻ lọt
  qua. Tên sự kiện / mô tả không chặn ký tự điều khiển (kể cả khi nạp file B1).
- **Kịch bản:** sự kiện có tên `Họp\rURL:https://phish…` / `\rBEGIN:VALARM…` → trình đọc lịch dễ dãi coi là dòng mới →
  thêm link lừa đảo / nhắc giả vào Google Calendar của nạn nhân.
- **Sửa:** `escapeText` bỏ mọi ký tự điều khiển trừ xuống dòng; B1 + form sự kiện bỏ ký tự điều khiển trong tên. Công XS.

### SEC-9 (Vừa) — PBKDF2 310.000 vòng

- **Bằng chứng:** `src/utils/secureCrypto.ts:3` — `DEFAULT_PBKDF2_ITERATIONS = 310_000` (SHA-256). Muối + bộ kiểm mật
  khẩu lưu trên Supabase.
- **Kịch bản:** lộ DB / chiếm tài khoản → dò mật khẩu thư mục bảo mật offline bằng GPU; mật khẩu ngắn rơi nhanh.
- **Sửa:** thư mục mới 600.000 vòng (OWASP 2023), đo độ mạnh mật khẩu khi đặt, nâng số vòng khi mở khóa thành công. Công M.

### SEC-10 (Vừa) — Chuỗi cung ứng

- 33 cảnh báo, không chạy `npm audit` tự động; nhiều gói `^` (tự lên bản mới khi cài lại không có lockfile).
- **Sửa:** CI chạy `npm ci` + `npm audit --omit=dev --audit-level=high`; Dependabot; xem kỹ gói mới trước khi thêm. Công S.

### SEC-11 (Thấp) — "Xóa tất cả bookmark" quá dễ

- Một lần xác nhận là xóa sạch bookmark của Chrome. **Sửa:** tự sao lưu ☁↑ trước khi xóa + gõ chữ xác nhận. Công S.

### SEC-12 (Thấp) — Lộ qua gợi ý thanh địa chỉ

- Gõ `bbq …` khi chia sẻ màn hình → tên + đoạn ghi chú hiện ra; chữ gõ có thể nằm trong lịch sử omnibox.
  **Sửa:** công tắc tắt tìm từ thanh địa chỉ; không hiện đoạn trích (chỉ tên). Công S.

## Đã kiểm — đang ổn

- **Không content script**, không `externally_connectable`, không `web_accessible_resources` → trang web không nói chuyện
  được với extension.
- Quyền tối thiểu: host chỉ `https://*.supabase.co/*`.
- **RLS** bật + đúng ở mọi bảng (cả đọc và ghi); hàm `SECURITY DEFINER` có `search_path`.
- Edge Function `calendar-feed`: token 256 bit ngẫu nhiên, sai / tắt đều cùng 404 (không dò được), `tz` được kiểm.
- Không có khóa bí mật trong repo (chỉ anon key — công khai theo thiết kế; service role chỉ ở Edge Function).
- Mọi `v-html` (tiêu đề, đường dẫn, đoạn trích) đi qua `escapeHtml`; gợi ý omnibox escape XML.
- B1: file sao lưu kiểm từng trường, lọc HTML theo schema, chặn `__proto__`, link bookmark độc, giới hạn kích thước —
  đã thử bằng file độc trên Chromium.
- CSP MV3 chặn script inline / `javascript:` trong trang extension.

## Đề xuất thứ tự

1. **SEC-1 (vá thư viện), SEC-7, SEC-8, SEC-4, SEC-6, SEC-5** — nhỏ, rủi ro thấp, đóng được các đường chạy mã / theo dõi →
   gom một bản **2.1.1**.
2. **SEC-2** (cấu hình Supabase ngay hôm nay — không cần ra bản) + 2FA sau.
3. **SEC-9, SEC-3 (mã hóa file sao lưu)** — bản chức năng sau.
4. **SEC-10** CI; **Tiptap v3** (SEC-1 phần 2) — kế hoạch riêng.
