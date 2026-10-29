# P1 — Font Inter đóng gói kèm extension (bỏ Google Fonts)

> **Failing test:** `specs/P1-self-host-inter-font.test.mjs`. Kế hoạch: `specs/ROADMAP-P.md`.
> **Yêu cầu (Sir, 2026-10-29):** 2.0.1 tối ưu trước; "việc nhỏ số 5 — tự host font Inter".

## Hiện trạng (đo bằng `scripts/measure-popup-perf.mjs`)

`index.html:8–12` nạp stylesheet `fonts.googleapis.com/css2?family=Inter…` trong `<head>` — stylesheet **chặn vẽ**:
Google trả chậm 3 s (`FONT_DELAY=3000`) → popup trắng **3,2 s** (bình thường 0,2 s). Mỗi lần mở popup đều gọi
Google, nên câu README "Anonymous … No network requests are made" chưa đúng (privacy policy, tài liệu Store thì khai
Google Fonts là request mạng duy nhất khi không đăng nhập).

## Sửa

- `src/assets/fonts/inter/`: 6 file woff2 của `@fontsource-variable/inter` 5.3.0 (trục `opsz` + `wght`, giống URL
  Google đang dùng `opsz 14..32`) — `latin`, `latin-ext`, `vietnamese` × `normal`, `italic` (~460 KB, chỉ nạp
  file nào có ký tự cần theo `unicode-range`) + `OFL.txt` (SIL Open Font License 1.1 — bắt buộc kèm khi phân phối).
- `src/assets/styles/fonts.css`: 6 `@font-face` tên `'Inter'` (giữ `--font-sans` không đổi), `font-weight: 100 900`,
  `font-display: swap`, `unicode-range` chép từ fontsource; thứ tự vietnamese → latin-ext → latin như Google.
  `main.ts` import trước `global.css`.
- `index.html`: bỏ 2 `preconnect` + stylesheet Google.
- `public/manifest.json` CSP: bỏ `https://fonts.googleapis.com` (style-src, connect-src) và
  `https://fonts.gstatic.com` (font-src). Giữ `'wasm-unsafe-eval'`, `'unsafe-inline'` chỉ ở style-src (N14 W4).
- Tài liệu khớp lại: `docs/CHROME-STORE-PERMISSIONS.md` (ô quyền máy chủ, CSP, Remote code),
  `docs/CHROME-STORE-LISTING.md`, `docs/chrome-store-detailed-description.txt`, `SECURITY.md`, `DESIGN.md`,
  `docs/privacy-policy.html` (bỏ mục Google Fonts khỏi danh sách bên thứ ba của extension; thêm câu font đóng gói
  kèm). README giữ câu "No network requests are made" — giờ đã đúng.

## KHÔNG được đổi

- Giao diện: cùng họ font Inter, cùng trục `opsz` / `wght`; không đổi `--font-sans`.
- Quyền trong manifest (permissions / host_permissions) — cập nhật không làm Chrome tạm tắt extension.
- Phần `<head>` của trang `docs/privacy-policy.html` (trang web trên GitHub Pages, không phải extension).

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK; `dist/index.html` không còn Google, `dist/assets` có
file Inter. Đo lại: `FONT_DELAY=3000` → popup vẽ ~0,2 s; tiếng Việt có dấu (đ, ơ, ư, ạ, ế…) hiện đúng font Inter.
