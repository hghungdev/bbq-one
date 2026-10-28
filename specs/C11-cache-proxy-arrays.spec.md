# C11 — Cache folder / lịch bị lưu thành object `{0:…,1:…}` (mảng reactive của Vue)

> **Failing test:** `specs/C11-cache-proxy-arrays.test.mjs` — chrome.storage giả mô phỏng đúng cách
> Chrome chuyển dữ liệu (Proxy **không** được coi là mảng); code thật `utils/cacheWrite.ts`,
> `stores/folders.ts`, `stores/calendarEvents.ts`.
> **Phát hiện:** khi kiểm U7 trên Chromium (2026-10-28) — `calendar_events_cache` đọc lại thành
> object. Đo trên extension thật: `chrome.storage.local.set({ x: new Proxy([..], {}) })` → đọc lại
> `{"0":…,"1":…}`; quét storage sau một lần mở popup: `folders_cache` + `calendar_events_cache` hỏng,
> `notes_cache` / `note_bodies_cache` đúng (đi qua bước seal tạo mảng mới).

## Lỗi

`folders.persistCache` / `calendarEvents.persistCache` ghi thẳng `folders.value` / `events.value` —
mảng **reactive (Proxy)** của Vue. Mọi chỗ đọc lại dùng `Array.isArray(...)` → cache coi như rỗng:

| Hậu quả | Ai bị |
|---|---|
| Mở popup lúc **offline** (đã đăng nhập) → danh sách folder trống, lịch trống | mọi user cloud |
| Sửa sự kiện có sẵn lúc offline (row dirty trong cache) → `syncFromCache` / `hasPendingSyncWork` không thấy → **không bao giờ lên server**; lần tải online sau ghi đè mất | mọi user cloud |
| `calendarEvents.persistCache` merge với "đĩa" rỗng → mất row dirty do context khác (popup ↔ tab) ghi | nhiều context |

Không lộ dữ liệu: row ghi chú của folder bảo mật đã được seal trong `notes_cache` (cache này không
hỏng); chỉ mất lớp kiểm tra phụ "folder bảo mật" trong đường push.

## Sửa

- `utils/cacheWrite.ts`:
  - `toStorable(v)` — chép sâu mảng + object thường thành dữ liệu thuần (bỏ Proxy), không đụng chuỗi
    / số; `safeCacheWrite` áp cho mọi giá trị trước khi `set` → sửa cho **mọi** cache, kể cả sau này.
  - `readCachedArray<T>(raw)` — mảng → giữ nguyên; object dạng `{0:…,1:…}` (cache hỏng cũ) → mảng
    theo thứ tự chỉ số; còn lại → `null`.
- `stores/folders.ts`, `stores/calendarEvents.ts`: mọi chỗ đọc cache dùng `readCachedArray` → user đang
  có cache hỏng **cứu lại** được row dirty (hydrate → merge với bản server giữ row dirty → ghi lại
  dạng mảng → auto-sync đẩy lên).
- `sync.service` / `autoSync.service` không đổi: sau lần ghi đầu tiên cache đã là mảng.
- Chi phí: chép sâu 2.000 note + 2.000 body (body 2 KB) ≈ 4–10 ms / lần lưu (đo bằng Node) — chấp
  nhận để sửa tập trung một chỗ (bao cả cache bookmark có cây lồng mảng); chuỗi không bị chép.

## Nghiệm thu

1. Test GREEN; trên `6c61355` RED. Mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium (extension thật): sau khi mở popup + sửa lịch, quét `chrome.storage.local` không còn
   giá trị dạng `{0:…}`; seed cache lịch dạng object → mở popup offline → lịch vẫn hiện.
