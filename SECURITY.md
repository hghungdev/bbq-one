# BBQOne — Security (Sprint 4)

## Secrets & environment

- **Không** hardcode `VITE_SUPABASE_URL` hoặc `VITE_SUPABASE_ANON_KEY` trong source; chỉ đọc qua `import.meta.env` (xem `src/services/supabase.ts`).
- Copy `.env.example` → `.env` và điền giá trị thật. File `.env` đã được liệt kê trong `.gitignore` (kèm `.env.*`, trừ `.env.example`).
- **Anon key** vẫn là “public client key” theo thiết kế Supabase; bảo vệ dữ liệu chủ yếu nhờ **RLS** và không commit secret khác (service role, v.v.).

## Content Security Policy (MV3)

CSP cho `extension_pages` nằm trong `public/manifest.json`:

- `script-src 'self' 'wasm-unsafe-eval'` — cho phép bundle extension + WebAssembly (Shiki highlight).
- `style-src` — `'self'`, `'unsafe-inline'` (HTML từ Shiki), và `https://fonts.googleapis.com` (stylesheet IBM Plex Mono).
- `font-src` — `self`, `https://fonts.gstatic.com`, `data:`.
- `connect-src` — Supabase HTTPS/WSS + Google Fonts.

Sau khi đổi CSP, load lại extension từ `dist/` và smoke test login, search, editor (Shiki).

## Row Level Security (Supabase)

1. Bật RLS và policy “owner” cho `folders` và `notes` (xem `supabase/002_rls_policies.sql`).
2. Cột FTS tùy chọn: `supabase/001_notes_fts_column.sql`.

### Kiểm tra RLS (không có JWT người dùng)

Kỳ vọng: **không đọc được** dữ liệu của user (thường là **0 dòng** với `anon` + không gửi `Authorization: Bearer <access_token>`), không phải lỗi 500.

**Cách 1 — REST (curl)**  
Thay `PROJECT_REF`, `ANON_KEY`. Chỉ gửi `apikey`, **không** gửi `Authorization: Bearer <access_token>` của user:

```bash
curl -sS "https://PROJECT_REF.supabase.co/rest/v1/notes?select=id" \
  -H "apikey: ANON_KEY" \
  -H "Prefer: return=representation"
```

Với policy `auth.uid() = user_id`, khi không có JWT session user thì `auth.uid()` là **null** → kết quả hợp lệ là **mảng rỗng** `[]` (không được thấy note của ai). Nếu vẫn thấy dòng dữ liệu, kiểm tra lại RLS/policy hoặc đang dùng service role.

**Cách 2 — SQL Editor (role postgres / service)**  
Chạy với quyền admin để xác nhận policy tồn tại; đừng dùng service role trong extension.

**Cách 3 — Trong app**  
Đăng xuất / xóa session trong `chrome.storage` rồi gọi API: không được thấy notes của user khác.

Nếu **có** dữ liệu khi không đăng nhập, kiểm tra lại policy và không dùng `service_role` trong extension.

## Sprint “Sync + Polish” — audit nhanh

- **Quyền extension**: `storage` (cache notes + session Supabase), `identity` (OAuth), `alarms` (đồng bộ nền mỗi ~24h). Không thêm `downloads` — export `.txt` dùng blob + click trong popup (user gesture).
- **Background**: service worker chỉ gọi `syncService.syncFromCache()` (đọc `notes_cache`, push bản ghi “dirty”, rồi cố gắng `getAll()` để refresh cache khi online). Không log session ra console trong production.
- **Dữ liệu**: anon key + RLS như trên; `synced_at` chỉ cập nhật sau khi push thành công.

### QA thủ công — offline → online

1. Mở popup, đảm bảo đã đăng nhập và có ít nhất một note.
2. Tắt mạng (DevTools → Network → Offline hoặc tắt Wi‑Fi), sửa note và lưu (Ctrl+S) — trạng thái footer: **UNSAVED** khi đang gõ, sau lưu cache local vẫn nhất quán.
3. Bật lại mạng, bấm **[ SYNC ]** — kỳ vọng **SYNCING...** rồi **SYNCED**, note khớp trên Supabase (hoặc tab khác sau refresh).
4. (Tuỳ chọn) Đợi alarm ~24h hoặc tạm đổi `periodInMinutes` trong dev để kiểm tra SW — kỳ vọng không crash và cache cập nhật khi online.
