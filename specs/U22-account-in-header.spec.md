# U22 — Tài khoản lên header (kiểu Gmail); ⚙ Cài đặt ở lại đáy thanh dọc

> **Failing test:** `specs/U22-account-in-header.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "Đăng nhập / đăng xuất dời lên header sẽ phù hợp, giống style của Gmail; còn
> Setting đặt như hiện tại." (ảnh Gmail: avatar tròn góc phải header.)

## Hiện trạng (U20)

Đáy thanh dọc: ⚙ · 👤 (chưa đăng nhập) / ⇥ (đã đăng nhập). Bảng mở rộng (☰) lặp lại 3 mục đó.

## Sửa

1. **`src/components/layout/AccountMenu.vue`** (mới) — đứng **cuối cùng** bên phải header (sau ☀ ☁), như avatar Gmail.
   - **Chưa đăng nhập:** nút viên `👤 Đăng nhập` (icon + chữ, nền nhấn nhạt). Không tô đặc: BBQOne dùng được không
     cần tài khoản — mời, không ép. Bấm → hộp đăng nhập (giữ `onGoLogin`).
   - **Đã đăng nhập:** avatar tròn 32px = chữ cái đầu email (nền `--accent`, chữ `--on-accent`); chưa có email
     (phiên offline "mềm") → icon 👤. `aria-haspopup="menu"`, `aria-expanded`, `aria-label` = "Tài khoản <email>".
   - Bấm avatar → **menu** xổ xuống, canh phải (`role="menu"`): avatar lớn + email (cắt `…`, tooltip đủ) + "Đã đăng
     nhập"; dòng `⇥ Đăng xuất` (`role="menuitem"`, icon + chữ — menu dọc theo U15). Mở → focus vào "Đăng xuất".
     **Esc** → đóng + trả focus về avatar; **bấm ra ngoài** / **Tab ra ngoài** → đóng. Bấm "Đăng xuất" → đóng
     + `onLogout` (logic giữ nguyên).
2. **`src/utils/accountAvatar.ts`** — `avatarInitial(email)`: chữ / số đầu tiên (Unicode), viết hoa; rỗng / null → `''`.
3. **App.vue:** đáy thanh dọc chỉ còn ⚙; bảng mở rộng chỉ còn "⚙ Cài đặt" ở đáy. Header phải: ☀ · ☁ · AccountMenu.
4. i18n vi / en: `app.account.aria` ("Tài khoản {email}" / "Account {email}"), `app.account.signedIn`
   ("Đã đăng nhập" / "Signed in").

## Đổi assertion cũ có chủ đích

- **U20.3** — trước: ⚙ 👤 ⇥ ở đáy thanh, header không có đăng nhập / xuất. Nay: đáy thanh chỉ ⚙; 👤 / ⇥ nằm trong
  `AccountMenu` ở header.
- **U17.1 / U17.2** — nút đăng nhập (👤, không ⇤) và ⇥ đăng xuất nay tìm trong `AccountMenu.vue`.
- **U15.M5** — icon `user` / `log-out` đọc từ `App.vue` + `AccountMenu.vue`.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium (light + dark): chưa đăng nhập → header có "👤 Đăng nhập", bấm mở hộp đăng nhập; đã đăng nhập →
   avatar chữ cái, bấm → menu email + Đăng xuất; Esc đóng + focus về avatar; bấm ra ngoài đóng; đáy thanh chỉ ⚙.
