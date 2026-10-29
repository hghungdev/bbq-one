# Module: Browser extension (Chrome MV3 / Edge / Firefox WebExtension)

Đọc khi recon thấy `manifest.json` có `manifest_version`.

## Mô hình đe dọa

Extension chạy với quyền cao hơn trang web (đọc tab, bookmark, tải file, gọi mọi host trong `host_permissions`). Kẻ tấn
công muốn: (1) **trang web độc nói chuyện được với extension** → mượn quyền; (2) **chạy mã trong trang extension** (XSS)
→ toàn quyền extension; (3) **dữ liệu độc lưu bền** (bookmark, storage, đồng bộ) → nổ sau; (4) **đọc trộm**
`chrome.storage` (mã độc trên máy, extension khác không đọc được storage của nhau).

## Kiểm

1. **Manifest**
   - `permissions` / `host_permissions` / `optional_*`: thừa? `<all_urls>`, `tabs`, `scripting`, `cookies`,
     `webRequest`, `debugger`, `nativeMessaging` cần lý do rõ.
   - `content_scripts.matches`: chạy trên trang nào; `all_frames`; `world: "MAIN"` (chung JS với trang → trang sửa được
     prototype mà content script dùng).
   - `externally_connectable`: trang / extension nào gửi message được; `matches` rộng = trang bất kỳ gọi API nội bộ.
   - `web_accessible_resources`: tài nguyên trang web nhúng được → dò extension (fingerprint), clickjacking trang
     extension, `use_dynamic_url`.
   - `content_security_policy.extension_pages`: MV3 cấm `unsafe-eval` / script ngoài; vẫn cần siết `default-src 'self'`,
     `img-src`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`; `connect-src` chỉ host
     cần. `wasm-unsafe-eval` chỉ khi thật dùng WASM.
   - `sandbox` pages, `background.type`, `minimum_chrome_version`, `update_url` (tự host = rủi ro chuỗi cung ứng).
2. **Message**
   - `runtime.onMessage` / `onConnect`: kiểm `sender.id === chrome.runtime.id`, `sender.url` / `sender.origin`? Content
     script gửi lên = **dữ liệu từ trang web** (trang điều khiển được DOM content script đọc).
   - `onMessageExternal` / `onConnectExternal`: coi như API công khai — kiểm từng lệnh.
   - `window.postMessage` giữa content script ↔ trang: kiểm `event.source` / `event.origin`, không tin `data`.
3. **Điểm chìm riêng của extension**
   - `chrome.tabs.create / update({ url })`, `chrome.windows.create`: URL từ dữ liệu ngoài → `javascript:` bị chặn ở
     phần lớn chỗ, nhưng `data:`, `file:`, trang lừa đảo vẫn mở được.
   - `chrome.bookmarks.create({ url })`: **bookmarklet `javascript:` tồn tại lâu dài**, chạy trên trang người dùng mở
     lúc bấm — phải lọc scheme khi khôi phục / nhập.
   - `chrome.scripting.executeScript({ func, args })` / `insertCSS`: tham số từ đâu?
   - `chrome.downloads.download({ filename })`: `../`, ký tự điều khiển, tên dành riêng; nội dung file xuất (HTML / ICS
     / CSV) escape chưa.
   - `chrome.omnibox` gợi ý: XML trong `description` phải escape; nội dung hiện ra khi chia sẻ màn hình.
   - `chrome.notifications`, `action.setBadgeText`, `contextMenus` (chữ được chọn = dữ liệu trang web).
   - Offscreen document / sandbox page: nhận gì, trả gì.
4. **Lưu trữ**
   - `chrome.storage.local` là chữ thường trên đĩa (hồ sơ trình duyệt) — mã độc đánh cắp thông tin sao chép cả hồ sơ.
     Dữ liệu nhạy cảm: mã hóa, khóa chỉ trong RAM / `storage.session`.
   - Đọc–gộp–ghi giữa popup / tab / service worker cùng lúc → ghi đè mất dữ liệu.
   - Quota 10 MB (không `unlimitedStorage`) — lỗi ghi có bị nuốt?
5. **Vòng đời MV3**
   - Service worker bị dừng bất kỳ lúc nào: trạng thái bảo mật (khóa, cờ đã mở) để biến toàn cục → mất / hoặc lưu bừa
     vào `storage.local`.
   - Popup đóng khi mất focus (hộp chọn file, Esc) → luồng nhạy cảm dở dang.
   - `alarms` / `onStartup` / `onInstalled` chạy việc gì với dữ liệu chưa kiểm.
6. **Phát hành**: gói zip có lẫn `.env`, source map, file test? Quyền mới khi cập nhật → Chrome tạm tắt extension (ghi
   rõ cho người dùng).

## PoC

`references/poc-browser.mjs --extension <dist>`: nạp extension chưa đóng gói, gieo dữ liệu độc vào `chrome.storage`
(`--seed seed.json`), chạy kịch bản (`--scenario`), đếm alert / request ra ngoài / vi phạm CSP / lỗi. Muốn thử
`onMessageExternal`: mở một trang `http://localhost` có `chrome.runtime.sendMessage(<extId>, …)`.
