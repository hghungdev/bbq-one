# Rà soát bảo mật kiểu kẻ tấn công — 2026-10-30 (BBQOne 2.3.0, `main` = `fec9ac9`) — CHỜ SIR DUYỆT

> Sir: "sử dụng skill Red Hacker để rà soát 1 lần nữa trước khi release production chrome store". Phạm vi: toàn bộ, trọng
> tâm phần mới 2.1.2 → 2.3.0 (2FA TOTP + migration 019, thư mục bảo mật S9, xóa tất cả bookmark S11, thanh địa chỉ S12,
> bỏ lock Supabase N6.1, thư viện Tiptap 3 / shiki 4 / pinia 4 / supabase-js 2.118). Chỉ rà soát + PoC cục bộ, chưa sửa gì.

## Cách kẻ tấn công nhìn BBQOne 2.3.0

- Tài sản: ghi chú (kể cả thư mục bảo mật), lịch + link ICS, bản sao lưu bookmark, cây bookmark Chrome, phiên Supabase.
- Cửa ngoài **không đổi** so với 2.1.1: không content script / `externally_connectable` / `web_accessible_resources`, host
  chỉ `*.supabase.co`, CSP chặt. Trang web vẫn không nói chuyện được với extension.
- Lớp mới đáng kể: **2FA chặn ở máy chủ** (RLS restrictive aal2, đã chạy trên Supabase thật) → mật khẩu lộ không còn đủ để
  đọc dữ liệu.
- Chỗ yếu nhất bây giờ **không phải kẻ tấn công từ xa** mà là (1) **mất dữ liệu thư mục bảo mật khi mạng rớt giữa lúc đổi
  mật khẩu / nâng cấp** (SEC-13), và (2) **người dùng Store vẫn chạy 2.0.1** — chưa có mọi bản vá — trong khi báo cáo lỗ
  hổng nằm công khai trên GitHub (SEC-14).

## Bảng tóm tắt (ưu tiên từ trên xuống)

| # | Mức | Tình huống | Trạng thái | Công |
|---|---|---|---|---|
| SEC-13 | **Cao** | Mạng rớt (hoặc kẻ ở cùng Wi-Fi cắt kết nối) giữa lúc "Nâng cấp" / "Đổi mật khẩu thư mục" → ghi chú đã mã hóa lại bằng salt mới **không được lưu** → **mất vĩnh viễn** sau lần đồng bộ kế tiếp | ✅ 2.3.1 (`specs/SEC13-atomic-rekey.spec.md`, migration 020) | M |
| SEC-14 | **Vừa** | Store vẫn phát **2.0.1** (thiếu vá SEC-1/4/5/6/7/8 — XSS khi dán, link `javascript:` khi khôi phục bookmark, chèn dòng ICS…) trong khi repo **công khai** có báo cáo chi tiết cách khai thác | Mở — cần phát hành | XS |
| SEC-15 | Thấp | Đổi mật khẩu kiểm mật khẩu cũ bằng cách **đăng nhập lại** → phiên tụt về aal1 giữa chừng; nhập sai mã là bị đẩy về bước 2FA | Mở | S |
| SEC-16 | Thấp | 2FA **không có mã khôi phục**: mất điện thoại mà không lưu chuỗi bí mật → chỉ admin gỡ được | Mở | M |
| SEC-17 | Thấp | Action CI ghim theo nhãn `@v7` chứ không theo commit SHA (kiểu vụ tj-actions 2025) | Mở | XS |
| SEC-18 | Thông tin | Hàm `public.bbq_mfa_aal_ok()` lộ qua REST `/rpc/` → người đã có mật khẩu (aal1) biết tài khoản có bật 2FA không | Chấp nhận / tùy | XS |
| ✓ | — | 2FA máy chủ + GoTrue, salt guard 2 tab, S11, S12, N6.1, Shiki 4 escape, Tiptap 3 schema, `npm audit` 0, manifest / CSP không đổi | Đã kiểm | — |

Tình trạng báo cáo trước (2026-10-29): SEC-1 ✅ 2.1.1 + 2.1.2 · SEC-2 ✅ 2.3.0 · SEC-4/5/6/7/8 ✅ 2.1.1 (SEC-8 cần Edge
Function đã deploy — xem "Chưa kiểm được") · SEC-9/11/12 ✅ 2.2.0 · SEC-10 ✅ 2.1.2 · **SEC-3 (file sao lưu chữ thường)
còn mở → 2.4.0**.

## Chi tiết

### SEC-13 (Cao) — Đổi khóa thư mục bảo mật không nguyên tử → mất ghi chú khi mạng rớt

- **Bằng chứng:** `src/stores/secureFolder.ts` `rekeyFolder` — vòng `for (const n of list)` gọi
  `notesService.update(n.id, { title: await encryptField(titlePlain, newKey) }, …)` cho **từng** ghi chú, rồi **sau cùng**
  mới `foldersService.update(folderId, { secure_salt: newSaltB64, pbkdf2_iterations, secure_verifier_enc })`. `newSalt`
  chỉ nằm trong biến cục bộ.
- **Kịch bản:** Sir bấm **Nâng cấp** (dải S9) hoặc **Đổi mật khẩu thư mục** → BBQOne ghi lần lượt N ghi chú lên máy chủ →
  mạng rớt / Wi-Fi quán cà phê chập chờn / kẻ trên cùng mạng chặn gói tin ở ghi chú thứ k → các ghi chú 1…k−1 trên máy chủ
  đã là bản mã của khóa dẫn từ salt mới; thư mục vẫn mang salt cũ → **không khóa nào giải được**. Bản rõ chỉ còn trong RAM
  của popup; đóng popup / lần đồng bộ sau kéo bản máy chủ về → mất hẳn (máy khác cũng không đọc được). Có sẵn từ trước
  (đổi mật khẩu); S9 thêm nút Nâng cấp nên dễ chạm hơn. Thư mục đang **khóa** lúc đổi mật khẩu: RAM giữ bản mã mới → mất
  ngay, không cứu được.
- **Đang được đỡ bởi:** nếu thư mục **đang mở** và người dùng **thử lại ngay** (chưa đóng popup, chưa đồng bộ về), RAM còn bản
  rõ → `rekeyFolder` mã hóa lại toàn bộ bằng khóa mới → khôi phục được. Không có thông báo nào bảo người dùng làm vậy.
- **PoC:** `scratchpad/poc-rekey.mjs` (store thật + WebCrypto thật, mạng giả lỗi ở lần ghi thứ 2): "Nâng cấp: LỖI Failed to
  fetch · thư mục vẫn salt cũ 310k · máy chủ n1: giải bằng khóa cũ → KHÔNG, bằng mật khẩu + salt đang lưu → KHÔNG · sau khi
  kéo bản máy chủ về: The operation failed → **n1 MẤT**".
- **Sửa (đề xuất):** gom **toàn bộ** đổi khóa thành **một giao dịch máy chủ**: client tính sẵn mọi bản mã mới trong RAM, gọi
  RPC `bbq_rekey_secure_folder(folder_id, new_salt, iterations, verifier, notes jsonb, bodies jsonb)` (SECURITY INVOKER →
  RLS + aal2 vẫn áp; kiểm `updated_at` như C9) — hoặc xong hết, hoặc không đổi gì. Chế độ không đăng nhập (local-first): một
  lần `chrome.storage.local.set` cho cả thư mục + ghi chú (nguyên tử theo lần gọi). Thêm test mô phỏng lỗi ở ghi chú thứ k →
  dữ liệu máy chủ không đổi. Trong lúc chờ: chỉ báo Sir/người dùng "Nâng cấp khi mạng ổn định; lỗi thì bấm lại ngay, đừng đóng
  popup". Công **M** (migration + client + test).

### SEC-14 (Vừa) — Bản trên Store chưa vá, báo cáo lỗ hổng công khai

- **Bằng chứng:** Store đang phát **2.0.1** (Sir xác nhận 2026-10-30); repo `hghungdev/bbq-one` **công khai** (`GET
  /repos/hghungdev/bbq-one` → `private: false`); `specs/SEC-REDTEAM-2026-10-29.md` + `specs/ROADMAP-SEC.md` mô tả cách khai
  thác SEC-1 (XSS dán — CVE công khai của prosemirror-view), SEC-4 (bookmarklet độc qua bản sao lưu), SEC-8 (chèn dòng ICS)…
- **Kịch bản:** kẻ tấn công đọc báo cáo → nhắm người dùng 2.0.1 (ví dụ trang web có HTML độc để người dùng sao chép dán vào
  ghi chú; hoặc tài khoản bị chiếm cài bản sao lưu bookmark có `javascript:`).
- **Đang được đỡ bởi:** CSP MV3 mặc định của 2.0.1 chặn script nội tuyến; phần lớn kịch bản cần người dùng thao tác.
- **Sửa:** **phát hành 2.3.0 lên Store ngay** (đã gồm mọi bản vá); cân nhắc để repo riêng tư hoặc chỉ công khai báo cáo
  **sau** khi bản vá lên Store (công bố có phối hợp). Công **XS** (upload).

### SEC-15 (Thấp) — Đổi mật khẩu bằng cách đăng nhập lại (phiên tụt aal1)

- **Bằng chứng:** `src/services/auth.service.ts` `changePassword` — `signInWithPassword({ email, password: currentPassword })`
  để kiểm mật khẩu cũ → phiên mới **aal1** → `mfaService.verify(mfaCode)` → `updateUser`.
- **Kịch bản:** không phải lỗ để tấn công (GoTrue vẫn đòi aal2 để đổi mật khẩu — `internal/api/user.go:106`); rủi ro là
  UX / trạng thái: nhập sai mã → phiên aal1 → app coi như chưa đăng nhập, bật hộp nhập mã. Đăng nhập lại cũng ghi thêm một
  phiên mới mỗi lần đổi mật khẩu.
- **Sửa:** dùng `supabase.auth.updateUser({ password, current_password })` (supabase-js 2.118 có `current_password` —
  `auth-js/dist/main/lib/types.d.ts:438`) + bật "Require current password" ở dashboard; phiên giữ aal2, bỏ bước đăng nhập lại.
  Công **S**.

### SEC-16 (Thấp) — Không có mã khôi phục 2FA

- **Bằng chứng:** `MfaSettingsSection.vue` chỉ có TOTP; khôi phục = chuỗi bí mật tự lưu hoặc admin xóa factor (`mfa.lostPhone`).
  auth-js 2.118 đã có nhóm factor `recovery_code` (`_listFactors`).
- **Sửa:** khi Supabase ổn định loại `recovery_code`: tạo mã khôi phục lúc bật 2FA, hiện một lần, cho tải về. Công **M**.

### SEC-17 (Thấp) — Action CI ghim theo nhãn

- **Bằng chứng:** `.github/workflows/ci.yml` — `actions/checkout@v7`, `actions/setup-node@v7`.
- **Đang được đỡ bởi:** action chính chủ GitHub; `permissions: contents: read`; `persist-credentials: false`; không secret.
- **Sửa:** ghim SHA (`actions/checkout@<sha> # v7`); Dependabot `github-actions` đã bật sẽ tự nâng SHA. Công **XS**.

### SEC-18 (Thông tin) — `bbq_mfa_aal_ok()` gọi được qua REST

- **Bằng chứng:** `supabase/migrations/019_mfa_enforce.sql` — hàm ở schema `public`, `grant execute … to authenticated`.
- **Kịch bản:** người đã có mật khẩu (phiên aal1) gọi `/rest/v1/rpc/bbq_mfa_aal_ok` → `false` = tài khoản có 2FA. Không đọc
  được gì thêm. **Sửa (tùy):** chuyển hàm sang schema riêng không phơi qua REST (vd `private`), policy gọi `private.…`.
  Công **XS** — chỉ làm khi chạy lại 019.

## Đã kiểm — đang ổn

- **2FA phía máy chủ:** 9 bảng có `user_id` mang policy RESTRICTIVE (Sir chạy `pg_policies` 2026-10-30); `select
  public.bbq_mfa_aal_ok()` dưới `set local role authenticated` = `true` (hàm SECURITY DEFINER, `search_path = ''`, không
  còn lỗi quyền — sự cố bản đầu đã gỡ); popup đăng nhập tải bình thường.
- **GoTrue (đọc mã nguồn `supabase/auth`):** đổi email / mật khẩu cần aal2 khi đã bật 2FA (`internal/api/user.go:106`); gỡ
  factor đã xác minh cần aal2 (`internal/api/mfa.go:1073`); "Limit duration of AAL1 sessions" chỉ áp tài khoản có factor
  (`internal/models/sessions.go:228` + `User.HighestPossibleAAL`) → không ảnh hưởng 2.0.1 / người chưa bật 2FA.
- **2FA phía client:** phiên aal1 = chưa đăng nhập ở `authMode.isAuthenticated` (mọi service + service worker), cờ đã đăng nhập
  chỉ bật sau bước 2; E2E Chromium + supabase-js thật với GoTrue giả: bật / đăng nhập / mở lại popup / mã sai / tắt đều đúng.
  QR là `data:image/svg+xml` trong `<img>` (SVG trong `<img>` không chạy script; CSP `img-src 'self' data:`).
- **Edge Function lịch:** chỉ đọc theo token trong đường dẫn; tạo / xoay token qua bảng `calendar_feeds` (RLS + aal2). Link ICS
  đã chia sẻ vẫn đọc được lịch mà không cần 2FA — đúng thiết kế (link bí mật chỉ đọc).
- **Thư mục bảo mật S9:** chốt salt (2 tab trên Chromium: tab B tự khóa, mật khẩu cũ bị từ chối); 600.000 vòng; mật khẩu yếu bị
  chặn; `sameKey` kiểm mật khẩu cũ thư mục không verifier.
- **S11 / S12 / N6.1:** sao lưu trước khi xóa (lỗi → không xóa), Enter cũng phải gõ đúng chữ; chế độ thanh địa chỉ "Tắt" không
  tìm, không mang chữ đã gõ; `escapeXml` giữ nguyên; không còn cảnh báo `lock`.
- **Thư viện:** `npm audit` 0 / 0; Shiki 4.5 escape `<img onerror>` / `<script>` / `<svg onload>` ở html / js / sql / text (đo
  trực tiếp), tên ngôn ngữ có danh sách trắng (`utils/highlight.ts` `safeLang`); Tiptap 3 schema không `link` / `underline`
  (T1.2, T1.5).
- **Manifest / CSP:** quyền và CSP không đổi so với 2.1.1; PoC hồi quy (`specs/redteam/`) trên bản 2.3.0: 0 alert, 0 request
  ra ngoài, 0 vi phạm CSP.
- Không log mới trong mã 2FA / mật mã (`mfa.service`, `stores/auth`, `stores/secureFolder`, `MfaSettingsSection`).

## Chưa kiểm được (cần Sir)

- **Edge Function `calendar-feed` trên production đã deploy bản SEC-8 chưa** (A1) — chưa thì vẫn chèn được dòng vào file ICS.
- Dashboard Supabase (A3): độ dài / độ phức tạp mật khẩu, **Leaked password protection**, rate limit đăng nhập, **Secure email
  change**, Redirect URLs (bỏ `*`), Security Advisor.
- Thử 2FA bằng điện thoại thật trên Supabase thật (đăng xuất / đăng nhập, gọi REST bằng token aal1 → 0 dòng).

## Đề xuất thứ tự

1. **Ngay:** upload **2.3.0** lên Store (SEC-14) — nhưng **sau khi** có cảnh báo cho SEC-13 hoặc vá SEC-13 (xem 3); xác nhận A1.
2. **Bản vá nhỏ 2.3.1** (rủi ro thấp, S): SEC-15 (`current_password`), SEC-17 (ghim SHA).
3. **SEC-13** (M) — nên vá **trước khi** người dùng Store thấy nút Nâng cấp (2.2.0+): RPC đổi khóa nguyên tử + test lỗi giữa
   chừng. Nếu muốn phát hành 2.3.0 ngay, tạm **ẩn dải Nâng cấp** (1 dòng) và ghi chú "đổi mật khẩu thư mục khi mạng ổn định".
4. Để sau: SEC-16 (mã khôi phục), SEC-18 (schema riêng), SEC-3 (file sao lưu mã hóa — 2.4.0).
