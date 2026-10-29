# Module: Web frontend (SPA / SSR — Vue, React, Next, Nuxt, Svelte, Angular…)

## Kiểm

1. **XSS** — mọi chỗ render HTML thô: `v-html`, `dangerouslySetInnerHTML`, `{@html}`, `[innerHTML]` +
   `bypassSecurityTrust*`, Markdown → HTML (thư viện có tắt HTML thô? có lọc bằng DOMPurify?), trình soạn rich text
   (Tiptap / ProseMirror / Quill / Slate — schema có chặn `<a href=javascript:>`, `<img onerror>`, `<iframe>`?).
   SSR: dữ liệu nhúng vào `<script>window.__STATE__ = …</script>` có escape `</script>` / `<!--`?
2. **URL do người dùng cung cấp** trong `href` / `src` / `window.open` / router push → danh sách trắng scheme;
   `target="_blank"` cần `rel="noopener noreferrer"`. Open redirect qua `?next=` / `?redirect=`.
3. **`postMessage`**: listener kiểm `event.origin`; gửi với `targetOrigin` cụ thể (không `*`) khi có dữ liệu nhạy cảm.
4. **Token / phiên**: `localStorage` / `sessionStorage` (XSS đọc được) vs cookie `HttpOnly`; token trong URL (lộ qua
   Referer, lịch sử); đăng xuất xóa sạch cache / IndexedDB / service worker cache?
5. **CSP & header** (đặt ở server / CDN / meta): `script-src` không `unsafe-inline` / `unsafe-eval`, nonce / hash;
   `frame-ancestors`; `object-src 'none'`; `base-uri 'none'`. Trang lỗi / 404 có phản chiếu input?
6. **Bí mật trong bundle**: biến `VITE_*` / `NEXT_PUBLIC_*` / `REACT_APP_*` đều **công khai** — có khóa bí mật nào bị
   đặt nhầm tiền tố? Source map công khai lộ code + comment?
7. **Logic chỉ ở client**: ẩn nút ≠ phân quyền; giá / số lượng / quyền tính ở client mà server tin.
8. **Tài nguyên ngoài**: script CDN có `integrity` (SRI)? Font / analytics / ảnh ngoài → theo dõi, lộ IP; widget bên
   thứ ba (chat, captcha) chạy JS trong trang.
9. **Service worker / PWA**: cache trang có dữ liệu riêng cho người dùng khác (máy dùng chung); phạm vi SW.
10. **Dán / kéo thả / nhập file**: HTML dán vào trình soạn đi qua lọc nào; phân tích trên document sống (ảnh tự tải)
    hay tài liệu trơ (`DOMParser` / `createHTMLDocument`).

## PoC

`references/poc-browser.mjs --url http://localhost:<port>` (server dev cục bộ) với `--scenario` gõ / dán payload từ
`payloads.md` vào form, đếm alert, request ra ngoài, vi phạm CSP. Thêm `--allow-host api.example.local` cho API thật của
app để không bị tính là "ra ngoài".
