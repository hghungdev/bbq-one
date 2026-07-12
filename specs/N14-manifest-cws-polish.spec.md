# SPEC N14 — Manifest/CWS polish: gỡ WAR `<all_urls>`, khai `minimum_chrome_version`, bỏ `wss` thừa

> **Đối chiếu source (2026-07-13, branch `main`, working tree sau N1–N7/N11).**
> **Failing test đi kèm:** `specs/N14-manifest-cws-polish.test.mjs`.
>
> Nhóm này KHÔNG phải bug chức năng — là vệ sinh hồ sơ Chrome Web Store + chặn 1 bề mặt
> fingerprinting + khai đúng version floor cho các API đang dùng.

---

## PHẦN A — SPEC

### Root cause (mỗi mục 1 câu)

1. **WAR thừa:** `web_accessible_resources` mở `assets/*` + icon cho `<all_urls>`
   (`public/manifest.json:36-41`) trong khi extension **không có content script nào**
   (grep `content_scripts` toàn repo: 0) → bất kỳ website nào cũng fetch được
   `chrome-extension://<id>/bbq_one-final.png` để fingerprint "user này cài BBQOne".
2. **Thiếu version floor:** code dùng `chrome.runtime.getContexts` (`background.ts` — cần
   Chrome 116+) và `chrome.action.openPopup()` (ổn định cho mọi extension từ 127+) nhưng
   manifest không khai `minimum_chrome_version` → trên Chrome cũ, menu "Open Dashboard" chết
   câm (đã guard `?.().catch?.()` nên không crash, nhưng chức năng im lặng không chạy).
3. **CSP thừa:** `connect-src` khai `wss://*.supabase.co` nhưng repo không dùng
   realtime/WebSocket nào (grep `realtime|channel|subscribe` trong src: không có kết nối wss).

### Thay đổi 1/3 — `public/manifest.json`

Hiện tại (verbatim, `public/manifest.json:34-44`):

```json
  "optional_permissions": [],
  "host_permissions": ["https://*.supabase.co/*"],
  "web_accessible_resources": [
    {
      "resources": ["assets/*", "bbq_one-final.png"],
      "matches": ["<all_urls>"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com"
  }
```

Thay bằng (XÓA hẳn khối `web_accessible_resources`; THÊM `minimum_chrome_version`; BỎ
`wss://*.supabase.co` khỏi connect-src — mọi thứ khác trong CSP giữ NGUYÊN từng ký tự):

```json
  "optional_permissions": [],
  "host_permissions": ["https://*.supabase.co/*"],
  "minimum_chrome_version": "127",
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://*.supabase.co https://fonts.googleapis.com"
  }
```

Vì sao "127": floor thật của tính năng cao nhất đang dùng (`action.openPopup` từ context-menu
handler, `background.ts`). Chrome 127 phát hành 07/2024 — đã 2 năm, không đáng kể về reach;
đổi lại menu "Open Dashboard" được đảm bảo hoạt động trên mọi máy cài được bản mới.

### Thay đổi 2/3 — `docs/CHROME-STORE-PERMISSIONS.md`: đồng bộ tài liệu

Doc là "source of truth" cho form CWS — 2 chỗ đang mô tả sai sau thay đổi trên:

1. Section **Content Security Policy** (`docs/CHROME-STORE-PERMISSIONS.md:155-163`) quote
   nguyên văn CSP — cập nhật đúng chuỗi mới (bỏ `wss://*.supabase.co`).
2. Section **Remote Code** (`:186-188`) có dòng
   `**Supabase REST / Auth / Realtime endpoints** (\`*.supabase.co\`)` — sửa thành
   `**Supabase REST / Auth endpoints** (\`*.supabase.co\`)` (không còn khai realtime).

Thêm 1 dòng vào section **What BBQOne Does NOT Do** (`:138-149`):

```markdown
- **No** web-accessible resources — websites cannot probe for the extension's
  presence (no fingerprinting surface).
```

### Thay đổi 3/3 — KHÔNG đổi (ghi rõ để khỏi over-reach)

- **Google Fonts GIỮ NGUYÊN** (`index.html`, `style-src`/`font-src` trong CSP): fonts không
  phải "remote code" theo định nghĩa CWS, đã disclose trong privacy policy + permissions doc.
  Self-host Inter là nâng cấp UX-offline riêng (cần tải asset), KHÔNG làm trong PR này.
- KHÔNG đụng `permissions`/`host_permissions` (đã đúng, `unlimitedStorage` do N1 thêm giữ nguyên).
- KHÔNG đụng `dist/` bằng tay — dist là sản phẩm build, xem PHẦN C.

### Edge case BẮT BUỘC giữ

1. Icon toolbar/store KHÔNG cần WAR — `action.default_icon`/`icons` hoạt động độc lập; xóa WAR
   không ảnh hưởng hiển thị icon.
2. `assets/*` chỉ được load bởi chính extension pages (`index.html`, `offscreen.html`) —
   same-origin, không cần WAR.
3. CSP mới vẫn phải chứa `'wasm-unsafe-eval'` (Shiki) và `'unsafe-inline'` CHỈ trong
   `style-src` — đừng "tiện tay" siết thêm.

### ⚠ FLAG liên đới

- Sau khi sửa `public/manifest.json`, PHẢI chạy `npm run build` để `dist/manifest.json`
  re-generate (crxjs copy từ public) — test chỉ check bản `public/`, PHẦN C check bản dist.
- Nếu tương lai thêm content script → thêm lại WAR **có scope hẹp** (matches cụ thể +
  `use_dynamic_url: true`), đừng copy lại khối cũ.

---

## PHẦN B — FAILING TEST

File: `specs/N14-manifest-cws-polish.test.mjs` — static checks trên `public/manifest.json` +
`docs/CHROME-STORE-PERMISSIONS.md`:

- **W1 (RED):** manifest KHÔNG còn key `web_accessible_resources`.
- **W2 (RED):** manifest có `minimum_chrome_version` ≥ "116" (khuyến nghị "127").
- **W3 (RED):** `connect-src` không chứa `wss://`.
- **W4 (pin):** CSP vẫn còn `'wasm-unsafe-eval'` trong script-src và `'unsafe-inline'` chỉ
  trong style-src; permissions vẫn còn `unlimitedStorage` (N1) — chống over-reach.
- **W5 (RED):** docs không còn chữ "Realtime" trong section Remote Code và CSP quote trong
  docs khớp CSP manifest (so sánh chuỗi connect-src).

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: `public/manifest.json` bỏ hẳn `web_accessible_resources`,
khai `minimum_chrome_version` (≥116, khuyến nghị 127), `connect-src` sạch `wss`, CSP còn nguyên
các directive khác, và docs permissions đồng bộ. Sau GREEN: chạy `npm run build` và xác nhận
`dist/manifest.json` phản ánh đúng các thay đổi; `vue-tsc` sạch; 19 harness khác vẫn PASS.
