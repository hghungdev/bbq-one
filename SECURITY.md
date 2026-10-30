# BBQOne — Security (Sprint 4)

## Secrets & environment

- **Không** hardcode `VITE_SUPABASE_URL` hoặc `VITE_SUPABASE_ANON_KEY` trong source; chỉ đọc qua `import.meta.env` (xem `src/services/supabase.ts`).
- Copy `.env.example` → `.env` và điền giá trị thật. File `.env` đã được liệt kê trong `.gitignore` (kèm `.env.*`, trừ `.env.example`).
- **Anon key** vẫn là “public client key” theo thiết kế Supabase; bảo vệ dữ liệu chủ yếu nhờ **RLS** và không commit secret khác (service role, v.v.).

## Content Security Policy (MV3)

CSP cho `extension_pages` nằm trong `public/manifest.json`:

- `script-src 'self' 'wasm-unsafe-eval'` — cho phép bundle extension + WebAssembly (Shiki highlight).
- `style-src` — `'self'`, `'unsafe-inline'` (HTML từ Shiki, style scoped của Vue).
- `font-src` — `'self'`, `data:` — font Inter đóng gói kèm (`src/assets/fonts/inter/`, P1), không gọi máy chủ font ngoài.
- `connect-src` — `'self'` + Supabase HTTPS (see current `public/manifest.json`).
- 2.1.1 (SEC-5) siết thêm: `default-src 'self'`, `img-src 'self' data:`, `object-src 'none'`, `frame-src 'none'`,
  `base-uri 'none'`, `form-action 'none'` — ảnh / iframe / form / `<base>` từ ngoài bị chặn.

Sau khi đổi CSP, load lại extension từ `dist/` và smoke test login, search, editor (Shiki); chạy PoC hồi quy bảo mật
(lệnh trong `specs/REDTEAM-PROFILE.md`). Kế hoạch bảo mật còn lại: `specs/ROADMAP-SEC.md`.

## Phạm vi mã hóa đầu-cuối (Encrypted account)

| Dữ liệu | Mã hóa phía client | Ghi chú |
|---|---|---|
| Ghi chú (tiêu đề + nội dung, ngoài secure folder) | ✅ S2C | secure folder có mật khẩu riêng (S1). **Mục bật trong Settings đang tạm ẩn (S3b)** — tài khoản đã bật vẫn mở khóa bình thường |
| Tên thư mục, bản sao lưu bookmark | ⏳ S3 | Bookmark PIN cũ đã gỡ (S3a) |
| **Lịch** (tiêu đề, mô tả) | ❌ **có chủ đích** | cần dạng đọc được cho link Google Calendar (G1) — quyết định 2026-10-28, xem `specs/ROADMAP-S.md`; chỉ chủ tài khoản đọc qua RLS |

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

- **Quyền extension**: khớp `public/manifest.json` — `storage` + `unlimitedStorage` (cache local-first), `alarms` (đồng bộ nền), `bookmarks` / `downloads` (backup & export), `clipboardWrite`, `offscreen`, `contextMenus`. Không dùng `identity` / content scripts.
- **Background**: service worker chỉ gọi `syncService.syncFromCache()` (đọc `notes_cache`, push bản ghi “dirty”, rồi cố gắng `getAll()` để refresh cache khi online). Không log session ra console trong production.
- **Dữ liệu**: anon key + RLS như trên; `synced_at` chỉ cập nhật sau khi push thành công.

### QA thủ công — offline → online

1. Mở popup, đảm bảo đã đăng nhập và có ít nhất một note.
2. Tắt mạng (DevTools → Network → Offline hoặc tắt Wi‑Fi), sửa note và lưu (Ctrl+S) — trạng thái footer: **UNSAVED** khi đang gõ, sau lưu cache local vẫn nhất quán.
3. Bật lại mạng, bấm **[ SYNC ]** — kỳ vọng **SYNCING...** rồi **SYNCED**, note khớp trên Supabase (hoặc tab khác sau refresh).
4. (Tuỳ chọn) Đợi alarm ~24h hoặc tạm đổi `periodInMinutes` trong dev để kiểm tra SW — kỳ vọng không crash và cache cập nhật khi online.

## Secure folder — invariant lưu trữ (S1)

- `chrome.storage.local` **không bao giờ** chứa plaintext của note thuộc secure folder.
  State in-memory giữ plaintext để hiển thị sau khi unlock; `persistCache()` niêm phong lại
  (`sealSecureRowsForCache`) trước mỗi lần ghi đĩa.
- CryptoKey chỉ sống trong RAM (Pinia) và chết khi popup đóng — cache trên đĩa phải ở dạng
  envelope để invariant đó có ý nghĩa.
- Đường push lên cloud đã được guard riêng tại `sync.service.ts:114-123` (không push plaintext
  khi thiếu key). Hai lớp này độc lập, đừng gộp.
- Plaintext tồn dư từ bản ≤ 1.3.3 (ghi trước khi có invariant) bị ghi đè ở lần `persistCache()`
  thành công đầu tiên sau khi cập nhật — mở app online một lần là đủ. Giới hạn nền tảng:
  `chrome.storage.local` chạy trên LevelDB — giá trị đã bị đè có thể còn nằm trong file `.ldb`
  cũ tới khi compaction; extension API không có cách xóa forensic.

## Secure folder — khóa, salt, số vòng (S9, 2.2.0)

- Khóa dẫn thẳng từ mật khẩu + `secure_salt` (PBKDF2-HMAC-SHA256 → AES-GCM 256). Thư mục mới / đổi mật khẩu:
  **600.000 vòng** (`DEFAULT_PBKDF2_ITERATIONS`); thư mục cũ mở bằng `pbkdf2_iterations` của chính nó, nâng cấp do người
  dùng bấm (giữ mật khẩu).
- **Chốt salt:** khóa trong RAM nhớ salt đã dẫn ra nó; thư mục mang salt khác (đổi mật khẩu ở máy / tab khác) → `getKey`
  trả null ngay (mọi đường ghi từ chối), khóa bị quên, hộp mở khóa báo lý do. Nghe `chrome.storage.onChanged` để ngữ cảnh
  khác (tab / popup / SW) cũng nhận ra. Rủi ro còn lại: máy chưa đồng bộ về salt mới mà **tạo** ghi chú mới → ghi chú đó
  mã hóa bằng khóa cũ (sửa ghi chú cũ bị khóa lạc quan C9 chặn). Muốn đóng hẳn cần máy chủ so salt khi ghi.
- Mật khẩu mới ≥ 10 ký tự, chặn mật khẩu phổ biến (`utils/passwordStrength.ts`).
- **Đổi khóa nguyên tử (SEC-13, 2.3.1):** Bật bảo mật / Nâng cấp / Đổi mật khẩu tính sẵn mọi bản mã rồi ghi **một lần** —
  đã đăng nhập: RPC `bbq_rekey_secure_folder` (`supabase/migrations/020_secure_folder_rekey.sql`, một giao dịch, SECURITY
  INVOKER, khóa dòng thư mục, từ chối salt lệch / thiếu ghi chú); chưa đăng nhập: một `chrome.storage.local.set`. Lỗi →
  không gì đổi (trước đây mất mạng giữa chừng = ghi chú mất vĩnh viễn).

## Xác thực 2 bước (S2, 2.3.0)

- TOTP, **tùy chọn** (người dùng bật trong Cài đặt). Phiên `aal1` của tài khoản đã có factor xác minh = **chưa đăng
  nhập**: `authMode.isAuthenticated()` trả false (không đồng bộ / không ghi cloud, kể cả service worker), cờ
  `bbq_auth_logged_in` chỉ bật sau bước 2.
- **Chặn ở máy chủ:** `supabase/migrations/019_mfa_enforce.sql` — policy RESTRICTIVE `mfa_aal2_if_enrolled` trên mọi bảng
  public có `user_id`: có factor verified thì JWT phải `aal2`.
- **Thứ tự:** dashboard bật TOTP → mọi máy lên 2.3.0 → chạy migration 019 → mới bật 2FA. Bản < 2.3.0 với tài khoản đã bật
  2FA: RLS trả 0 dòng (dữ liệu không mất, máy cũ thấy trống).
- Đổi mật khẩu (đăng nhập lại để kiểm) và tắt 2FA đều hỏi mã. Mất điện thoại: thêm lại bằng chuỗi bí mật đã lưu, hoặc admin
  xóa factor (dashboard › Authentication › Users › MFA). Chưa có mã khôi phục (`recovery_code`) — để sau.

## Encrypted account (S2C1)

- Bật (opt-in) qua ceremony: passphrase (≥10, PBKDF2-SHA256 600k) + recovery key 160-bit hiện
  MỘT lần; commit = một upsert `user_crypto` duy nhất (atomic).
- DEK / `K_content` không bao giờ xuống đĩa. Ghi chú ngoài secure folder được encrypt v2 trước
  khi lên server và trước khi xuống `chrome.storage.local` (qua seal S1).
- **Khóa theo phiên trình duyệt (S2C1.3):** sau khi mở khóa, DEK nằm trong
  `chrome.storage.session` (RAM của trình duyệt — không ghi đĩa, không lộ cho content script)
  để popup mở lại không phải gõ passphrase và service worker mã hóa được khi đồng bộ. Tự khóa
  sau **30 phút không thao tác**, khi đóng trình duyệt, khi reload/update extension, khi logout,
  hoặc khi bấm **Khóa ngay** (Settings). Cùng chỗ với refresh token Supabase.
- **Mở khóa offline (S2C1.3):** row `user_crypto` (salt, DEK đã bọc, verifier — bản giống hệt nằm
  trên server) được cache trong `chrome.storage.session`, không cache xuống `chrome.storage.local`
  → mất mạng vẫn mở khóa được, còn người đọc được ổ đĩa không có gì để dò passphrase.
- Conflict backup (`bbqone_conflict_backups`) lưu bản đã mã hóa (S2C1.2).
- **Chưa biết trạng thái (S2C1.5 → S2C1.6):** đã đăng nhập mà chưa biết account có bật mã hóa
  không → thay đổi được **giữ lại trên máy**, không gửi server (mọi đường push fail-closed); draft
  chưa được áp. Biết trạng thái rồi mới đẩy (có key → mã hóa). Giới hạn: nếu account **đã bật** mà
  lần kiểm tra lỗi, sửa trong lúc đó nằm trên đĩa dạng rõ tới lần mở khóa kế tiếp — đổi lại user
  không bật mã hóa không bao giờ mất quyền sửa khi Supabase trục trặc. "Đã đăng nhập" ở đây tính
  cả lúc `auth.init()` còn treo (S2C1.7): router dùng cờ đăng nhập đã cache như khi offline, để
  store không coi là "chưa đăng nhập" trong khi service đã có session.
- **Khóa (S2C1.5/1.6):** mọi đường khóa (Khóa ngay, tự khóa, logout, mất session) seal đĩa rồi nạp
  lại RAM trong một lượt độc quyền với việc ghi cache; thao tác đang chờ mạng lúc khóa chỉ được để
  lại bản mã hóa. Chỉ bật mã hóa được khi server xác nhận account chưa bật (insert-only — không bao
  giờ đè `wrapped_dek` đã có).
- Quên passphrase: recovery key mở DEK và BẮT BUỘC đặt passphrase mới (re-wrap, 1 UPDATE);
  recovery key cũ vẫn hiệu lực cho tới khi regenerate (S2C2).
- Trạng thái chuyển tiếp (tới khi backfill S2C2 xong): ghi chú cũ chưa từng sửa lại vẫn là
  plaintext trên server — không tệ hơn hiện trạng, thu hẹp dần. Row đã mã hóa không bao giờ
  hiển thị dạng `bbq:2:…` trần (mask ở NoteItem).
