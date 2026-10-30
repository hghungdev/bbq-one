# SEC-13 — Đổi khóa thư mục bảo mật nguyên tử (2.3.1)

> **Failing test:** `specs/SEC13-atomic-rekey.test.mjs`. **Nguồn:** `specs/SEC-REDTEAM-2026-10-30.md` SEC-13 (Cao, có PoC).
> **Sir (2026-10-30):** "Vá SEC-13 trước … vá giúp mình".

## Vấn đề

`stores/secureFolder.ts` `rekeyFolder` (Nâng cấp, Đổi mật khẩu) và `enableSecureFolder` ghi **từng** ghi chú / section
(`notesService.update`, `noteBodiesService.update`) rồi **sau cùng** mới ghi thư mục (salt, số vòng, verifier). Mạng rớt
giữa chừng → các ghi chú đã ghi mang bản mã của khóa dẫn từ salt **không được lưu** → không mật khẩu nào mở được → mất
vĩnh viễn sau lần đồng bộ kế tiếp (PoC 2026-10-30). Bật bảo mật cũng vậy: ghi chú đã mã hóa nằm trong thư mục chưa
`is_secure`.

## PHẦN A — Client: tính hết trước, ghi một lần

`rekeyFolder` / `enableSecureFolder`:
1. Kiểm mật khẩu / độ mạnh như cũ.
2. **Tính sẵn trong RAM** mọi bản mã mới (tiêu đề, nhãn + nội dung section, verifier) — chưa ghi gì.
3. **Một** lần `secureRekeyService.apply({ folderId, expectedSalt, secure: { salt, iterations, verifier }, notes, bodies })`.
   Lỗi → ném, **không** đổi RAM / khóa / thư mục (thử lại an toàn).
4. Thành công → `setKey(khóa mới, salt mới)` (trước khi thư mục mới vào store — giữ cờ `rekeying` của S9) → gán thư mục trả về
   → RAM: dòng đang là bản rõ giữ bản rõ, dòng đang là bản mã nhận bản mã mới; `updated_at` / `synced_at` theo kết quả →
   `persistCache` → `loadAll`.

## PHẦN B — `src/services/secureRekey.service.ts`

- Đã đăng nhập (`isAuthenticated()`): `supabase.rpc('bbq_rekey_secure_folder', { p_folder_id, p_expected_salt, p_salt,
  p_iterations, p_verifier, p_notes: [{ id, title }], p_bodies: [{ id, label, content }] })` → `{ folder, notes: [{ id,
  updated_at, synced_at }], bodies: […] }`.
- Chưa đăng nhập (local-first): đọc `bbqone_local_folders / _notes / _note_bodies`, kiểm salt hiện tại = `expectedSalt` và
  **mọi** ghi chú / section của thư mục có trong payload (thiếu → lỗi, không ghi), sửa trong bộ nhớ rồi **một**
  `chrome.storage.local.set({ folders, notes, note_bodies })` (một lô ghi).

## PHẦN C — Máy chủ: `supabase/migrations/020_secure_folder_rekey.sql` (Sir chạy)

`public.bbq_rekey_secure_folder(...) returns jsonb` — `SECURITY INVOKER` (RLS `user_id` + policy aal2 của 019 vẫn áp),
`set search_path = ''`, một giao dịch:
- `select … from public.folders where id = p_folder_id for update` (khóa dòng: hai máy cùng đổi → máy sau chờ rồi thấy salt
  đã đổi).
- `secure_salt is distinct from p_expected_salt` → `BBQ_REKEY_STALE` (đổi ở máy khác — client nạp lại thư mục).
- Thiếu ghi chú / section của thư mục trong payload (vd vừa tạo ở máy khác) → `BBQ_REKEY_INCOMPLETE` (không mã hóa sót).
- Số vòng ngoài 100.000–5.000.000 → lỗi.
- Cập nhật ghi chú, section (`synced_at = now()` — cùng `now()` với trigger `updated_at` → dòng sạch, không bị đẩy lại),
  thư mục (`is_secure = true`, salt, số vòng, verifier).
- Trả `{ folder, notes, bodies }`. `revoke … from public, anon`; `grant execute … to authenticated`. Không đọc schema `auth`.

## PHẦN D — Test

| Ca | Kiểm |
|---|---|
| SEC13.1 | Nâng cấp không còn gọi ghi từng dòng; đúng một `apply` |
| SEC13.2 | `apply` lỗi → báo lỗi, thư mục giữ salt / 310k, RAM giữ bản rõ, khóa cũ dùng được (chốt chặn) |
| SEC13.3 | Thành công: payload `expectedSalt` = salt cũ, đủ ghi chú + section, 600k; mọi bản mã + verifier mở bằng mật khẩu + salt mới; RAM bản rõ + `updated_at` mới |
| SEC13.4 | Đổi mật khẩu khi đang khóa: một `apply`, mở được bằng mật khẩu mới |
| SEC13.5 | Bật bảo mật: một `apply`, `expectedSalt = null` |
| SEC13.6 | Service đã đăng nhập gọi RPC đúng tham số |
| SEC13.7 | Service chưa đăng nhập: salt lệch / thiếu ghi chú → lỗi, 0 lần ghi; hợp lệ → đúng 1 `set` gồm 3 khóa, dòng thư mục khác giữ nguyên |
| SEC13.8 | Migration: invoker, search_path rỗng, `for update`, stale / incomplete / số vòng, `synced_at = now()`, grant, không đọc `auth` |

**Đổi có chủ đích:** harness S9 — mock `foldersService` / `notesService` / `noteBodiesService` không còn được dùng khi đổi
khóa; thêm mock `@/services/secureRekey.service` ghi vào **cùng** mảng `folderUpdates` / `noteUpdates` (và phát `onChanged`
như local-first) → assertion S9 giữ nguyên.

## KHÔNG được đổi

Mật mã (AES-GCM, PBKDF2, envelope), chốt salt S9, `verifyPassphrase`, `sameKey`, độ mạnh mật khẩu, đường ghi ghi chú thường.

## FLAG

- Payload lớn (thư mục rất nhiều ghi chú dài) = một request lớn; Supabase chấp nhận vài MB — thư mục > ~20 MB nội dung cần
  chia (để sau, ghi nhận).
- Máy chưa chạy migration 020 → RPC báo "function not found" → **không đổi gì** (an toàn), báo lỗi; Sir chạy 020 trước khi
  phát hành 2.3.1.

## Nghiệm thu

Harness PASS; Chromium (local-first): nâng cấp / đổi mật khẩu / 2 tab như S9; Sir chạy 020 + đoạn kiểm trong giao dịch
(`rollback`) ở cuối file migration.
