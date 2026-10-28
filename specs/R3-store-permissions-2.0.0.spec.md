# R3 — Lý do quyền trên Chrome Web Store khớp code 2.0.0

> **Failing test:** `specs/R3-store-permissions-2.0.0.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "re-check lại các quyền mô tả đã phù hợp chưa" (ảnh form Store: Mục đích duy nhất +
> lý do 9 quyền + quyền máy chủ — chép từ `docs/CHROME-STORE-PERMISSIONS.md`).

## Sai so với code (đã đối chiếu)

| Ô trên Store | Đang ghi | Thực tế |
|---|---|---|
| Mục đích duy nhất | Bookmark "with optional client-side AES-GCM encrypted secure folders"; "unified by a single search bar" | Thư mục bảo mật là của **Ghi chú**; mỗi tab có ô tìm riêng (U5) |
| storage | session "used **only** to hold the Supabase auth session token" | session còn giữ bản nháp ghi chú đang sửa (lưới đỡ) và khóa đã mở của tài khoản bật mã hóa ghi chú (tới khi tự khóa) |
| alarms (form) | 3 alarm | 4: + tự khóa 30 phút cho tài khoản bật mã hóa (`ACCOUNT_AUTOLOCK_ALARM`); doc còn ghi 1 alarm |
| clipboardWrite | chỉ "Copy note" | + nút ⧉ sao chép link Google Calendar (Settings) |
| offscreen | "triggered from the service worker" | popup thử `navigator.clipboard` trước; lỗi → service worker mở offscreen (CLIPBOARD) ghi rồi đóng |
| bookmarks | "store sensitive bookmark snapshots inside encrypted secure folders" | Sai — PIN / mã hóa Bookmark đã gỡ (S3a). Thiếu: **Khôi phục** ghi lại cây bookmark (chỉ khi user bấm + xác nhận) |
| Quyền máy chủ | "bookmarks (optionally encrypted)"; "their Supabase project" | Bookmark không mã hóa; người dùng Store dùng backend Supabase của BBQOne; thiếu link Google Calendar (tạo / đổi / tắt qua cùng host) |

Giữ nguyên (đúng): unlimitedStorage, contextMenus (`contexts: ['action']`, "Open Dashboard"), downloads (xuất HTML).

## Sửa

`docs/CHROME-STORE-PERMISSIONS.md`: mỗi mục có một khối ```text dán thẳng vào ô tương ứng (≤ 1 000 ký tự), nội dung
khớp code ở trên; danh sách quyền khớp `public/manifest.json`.
