# S2 — Xác thực 2 bước TOTP (tùy chọn) + chặn ở máy chủ (SEC-2, 2.3.0)

> **Failing test:** `specs/S2-mfa-totp.test.mjs` (Supabase giả có trạng thái aal1 / aal2 + factor; store + service thật).
> **Nguồn:** `specs/ROADMAP-SEC.md` mục 5. **Sir chốt (2026-10-30): 2FA TÙY CHỌN** (người dùng tự bật).
> **Cần trước:** A3 — dashboard › Authentication › Multi-Factor › **TOTP bật**.

## Vì sao

Lộ mật khẩu (lừa đảo, dùng lại mật khẩu ở chỗ khác) = đọc hết ghi chú / lịch / bookmark trên cloud. TOTP (Google
Authenticator, 1Password…) thêm một lớp. **Phải chặn ở máy chủ** — chỉ có màn hình nhập mã thì kẻ có mật khẩu gọi thẳng REST
API bằng phiên `aal1` là qua.

## PHẦN A — `src/services/mfa.service.ts` (bọc `supabase.auth.mfa`)

- `isPending()`: `getAuthenticatorAssuranceLevel()` (không truyền JWT → chỉ đọc phiên đã lưu, **không gọi mạng** — chạy
  được trong service worker khi offline): `nextLevel === 'aal2' && currentLevel !== 'aal2'`. Lỗi / không phiên → `false`.
- `listVerifiedTotp()` (`listFactors().totp` — gọi mạng), `verify(code, factorId?)` (factor TOTP **đã xác minh** đầu tiên →
  `challengeAndVerify`; lỗi → ném), `enrollTotp()` (gỡ factor TOTP **dở dang** trước — Supabase không cho trùng / để rác →
  `enroll({ factorType: 'totp', friendlyName })` → `{ factorId, qrCode, secret }`), `unenroll(factorId)`.

## PHẦN B — Phiên `aal1` chờ mã = CHƯA đăng nhập

- `services/localFirst/authMode.ts` `isAuthenticated()` (mọi service dual-mode + service worker hỏi hàm này): có phiên mà
  `mfaService.isPending()` → `false` → không đồng bộ, không ghi cloud (RLS cũng chặn — PHẦN E).
- `services/bookmarkAutoBackup.service.ts`: `runBookmarkAutoBackup` + `bootstrapBookmarkBaseline` bỏ qua khi chờ mã.
- `stores/auth.ts`: `mfaPending` (ref), `isAuthenticated = !!session && !mfaPending`; cờ `bbq_auth_logged_in` (menu chuột
  phải + mở offline) chỉ ghi `true` khi đã qua bước 2. `init()` + `onAuthStateChange` tính lại `mfaPending`.
  - `login()` → `{ mfaRequired }`. `verifyMfa(code)`, `cancelMfa()` (= đăng xuất phiên aal1), `refreshMfa()` (đọc factor
    từ máy chủ: phát hiện 2FA vừa bật ở máy khác), `mfaEnabled` (có TOTP đã xác minh).
  - Cài đặt: `startTotpEnroll()`, `confirmTotpEnroll(factorId, code)`, `cancelTotpEnroll(factorId)`, `disableMfa(code)`
    (**hỏi mã trước** rồi mới gỡ — người ngồi máy đang mở không tắt được 2FA nếu không có điện thoại).

## PHẦN C — Đổi mật khẩu (`auth.service.ts` `changePassword`)

Kiểm mật khẩu cũ bằng `signInWithPassword` → phiên **mới aal1** → khi bật 2FA phải `verify(mfaCode)` **ngay** rồi mới
`updateUser`. Store: bật 2FA mà thiếu mã → `mfa.err.codeRequired` **trước** khi đăng nhập lại (không đẩy phiên về aal1).
Form đổi mật khẩu (SettingsModal) hiện ô mã khi `auth.mfaEnabled`.

## PHẦN D — Giao diện

- `components/auth/MfaChallengeForm.vue`: ô 6 số (`inputmode="numeric"`, `autocomplete="one-time-code"`), Xác nhận →
  `auth.verifyMfa`, Hủy → `auth.cancelMfa()`; ghi chú mất điện thoại (`mfa.lostPhone`).
- `LoginModal.vue` + `pages/Login.vue`: `auth.mfaPending` → hiện form mã thay cho email / mật khẩu.
- `pages/App.vue`: `watch(() => auth.mfaPending)` → mở hộp đăng nhập (mở lại popup giữa chừng / 2FA vừa bật ở máy khác).
- `components/account/MfaSettingsSection.vue` (Cài đặt, khi đăng nhập): trạng thái; **Bật** → QR (`<img :src>` — `qr_code`
  là `data:image/svg+xml`, CSP `img-src 'self' data:` cho phép) + chuỗi bí mật (nút sao chép, khuyên lưu vào trình quản lý
  mật khẩu = cách lấy lại khi mất điện thoại) + ô mã → bật; **Tắt** → ô mã → tắt.

## PHẦN E — Máy chủ: `supabase/migrations/019_mfa_enforce.sql` (Sir chạy, KHÔNG tự chạy)

Policy **RESTRICTIVE** `mfa_aal2_if_enrolled` cho **mọi bảng `public` có cột `user_id`** (duyệt `information_schema.columns`
— không sót bảng): `auth.jwt()->>'aal'` phải là `aal2` khi user có factor `verified` trong `auth.mfa_factors`, còn không thì
`aal1` / `aal2` đều được. `drop policy if exists` trước → chạy lại an toàn. RPC `bbq_update_*_if_current` là SECURITY INVOKER
→ áp luôn. Edge Function `calendar-feed` dùng service role → không đổi. Trigger `bbq_trim_bookmark_backups` (DEFINER) chỉ chạy
sau INSERT đã qua RLS.

## PHẦN F — Test

| Ca | Kiểm |
|---|---|
| S2.1–S2.3 | `mfa.service`: isPending 4 trạng thái (không gọi listFactors); verify dùng factor đã xác minh; enroll dọn factor dở |
| S2.4 | `authMode.isAuthenticated`: aal1 chờ mã → false; aal2 → true |
| S2.5 | bookmarkAutoBackup bỏ qua khi chờ mã (2 chỗ) |
| S2.6–S2.9 | Store: đăng nhập có 2FA → chờ, chưa đăng nhập, không cờ; mã sai / đúng; không 2FA như cũ; init phiên aal1 → chờ |
| S2.10 | Đổi mật khẩu: thiếu mã → lỗi trước signIn; có mã → signIn → verify → updateUser |
| S2.11 | Bật (enroll → mã) / tắt (mã sai giữ nguyên, đúng gỡ) |
| S2.12–S2.15 | Form mã, Cài đặt, migration (restrictive, information_schema, aal2, idempotent), i18n |

## KHÔNG được đổi

PKCE, kho phiên, đăng nhập không 2FA, luồng local-first khi chưa đăng nhập, CSP.

## FLAG / thứ tự triển khai (ghi rõ cho Sir)

1. Dashboard: bật TOTP (A3). 2. Phát hành 2.3.0, **mọi máy lên 2.3.0**. 3. Chạy migration 019. 4. Mới bật 2FA trong Cài đặt.
- Bản < 2.3.0 không có bước nhập mã → với tài khoản đã bật 2FA, RLS trả **0 dòng** (dữ liệu trên máy chủ không mất, nhưng máy
  cũ thấy trống / báo lỗi đồng bộ) → cập nhật mọi máy trước khi bật.
- 2FA vừa bật ở máy A: máy B (đang đăng nhập aal1) bị RLS chặn tới khi phiên làm mới (≤ 1 giờ) / mở lại popup (`refreshMfa`)
  → hiện bước nhập mã.
- Mất điện thoại mà không lưu chuỗi bí mật: admin (Sir) xóa factor ở dashboard › Authentication › Users › người dùng › MFA.
- Supabase có loại factor `recovery_code` (mã khôi phục) — chưa dùng, để sau.

## Sự cố 2026-10-30 — `permission denied for table mfa_factors` (S2.16)

Sir chạy bản 019 đầu tiên trên Supabase thật → **mọi truy vấn của người đã đăng nhập lỗi** ("Load notes failed", "Load
calendar failed", "Account encryption status check failed: permission denied for table mfa_factors"). Nguyên nhân: policy
đọc **thẳng** `auth.mfa_factors`, mà role `authenticated` trên dự án **không có quyền SELECT** bảng đó (mẫu trong tài liệu
Supabase giả định có). Đã gỡ ngay bằng khối "Gỡ" ở cuối file (dữ liệu không mất).

**Sửa:** hàm `public.bbq_mfa_aal_ok()` — `SECURITY DEFINER`, `set search_path = ''`, `stable`, đọc `auth.mfa_factors` bằng
quyền chủ hàm (postgres); `revoke all … from public` + `grant execute … to authenticated`. Policy chỉ gọi
`(select public.bbq_mfa_aal_ok())`. Trả `true` khi JWT `aal2` hoặc user không có factor `verified`. Chạy lại 019 (idempotent:
`create or replace` + `drop policy if exists`).

**Kiểm sau khi chạy (SQL Editor):** `select public.bbq_mfa_aal_ok();` → `true` (không lỗi quyền); mở popup đã đăng nhập →
ghi chú / lịch tải bình thường. Lỗi thì chạy khối "Gỡ" ngay.

**Bài học:** SQL chạm schema `auth` phải chạy thử trên dự án thật (hoặc nhánh dev) trước — harness chỉ đọc chữ.
