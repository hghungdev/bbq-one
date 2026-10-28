# U15 — Ngôn ngữ icon thống nhất (một bộ icon, một nghĩa cho mỗi icon)

> **Failing test:** `specs/U15-icon-language.test.mjs` — code thật `components/ui/icons.ts` + quét mọi
> `.vue` (nguồn icon duy nhất, nút icon có tên + tooltip, hết nhãn kiểu `[ X ]`).
> Giao diện kiểm bằng ảnh Chromium light + dark.
> **Yêu cầu (Sir, 2026-10-28):** hai popup (danh sách ngày / Sửa sự kiện) "conflict về icon và text":
> danh sách xóa bằng 🗑, vào trong lại là chữ "Delete". Thống nhất — dùng icon cho hiện đại — và rà các
> màn khác.

## Rà soát (trước khi sửa)

| Hành động | Chỗ | Hiện tại | Lệch |
|---|---|---|---|
| Xóa | danh sách sự kiện | 🗑 (vẽ riêng, khác hình) | hình 🗑 thứ 3 trong app |
| Xóa | Sửa sự kiện | chữ "Delete" đỏ | **chữ** trong khi danh sách là icon |
| Xóa | section ghi chú | **×** | × là "đóng", không phải "xóa" |
| Xóa | bản sao lưu bookmark | 🗑 đỏ đậm, viền khi rê | kiểu nút riêng (IconDeleteButton) |
| Xóa tất cả | thanh công cụ Bookmark | chữ đỏ "Delete all" | xóa **mọi bookmark trình duyệt** nhưng nằm chung hàng với Sao lưu |
| Đổi tên / Chuyển / Xóa | menu ⚙ thư mục, ghi chú | ✎ ⇄ 🗑 icon | ✅ đúng — làm chuẩn |
| Thêm | Thư mục / Ghi chú / Section | ＋ icon | ✅ |
| Thêm | danh sách sự kiện | "＋ Add event" chữ | lệch với ＋ ở Ghi chú |
| Sao chép | section ghi chú | icon **đặc** (Material) | mọi icon khác là nét |
| Sao chép | recovery key | chữ "Copy" | |
| Xuất / Tải lại | thanh công cụ Bookmark | chữ | |
| Khôi phục / Bỏ | xung đột đồng bộ | `[ RESTORE MY VERSION ]` `[ DISCARD ]` | chữ IN HOA trong ngoặc (kiểu retro cũ), không i18n |
| Đóng | 3 hộp thoại | `[ X ]` chữ | 9 hộp thoại khác dùng ✕ icon |
| OK / Hủy | thư mục bảo mật, mã hóa tài khoản | `[ OK ]` `[ X ]` | |
| Lỗi | Bookmark, Lịch, App | `[LỖI] …` | |
| Khóa / Mở khóa | Settings › Encrypted account | chữ | thư mục bảo mật đã có icon 🔒 |
| Đăng nhập | header | icon 🔒 | trùng nghĩa "đã khóa"; Đăng xuất là ⇥ |
| Chung | 28 file | mỗi file tự vẽ SVG (✕ có 12 bản, 🗑 4 bản, ＋ 4 bản…) | nét / cỡ khác nhau |

## Quy tắc (áp cho mọi màn)

1. **Một bộ icon** — `components/ui/icons.ts` + `AppIcon.vue` (nét 1.75, đầu tròn, khung 24; ≤ 14 px tự
   nét 2). Không file nào tự vẽ icon hành động nữa.
2. **Một icon — một nghĩa:** 🗑 xóa · ✕ đóng / xóa chữ · ＋ thêm · ✎ sửa / đổi tên · ⇄ chuyển · ⧉ sao chép ·
   ↶ khôi phục · ⤓ xuất · ⟳ tải lại · ☁↑ sao lưu · 🔒 khóa · 🔓 mở khóa · ⇥ đăng xuất · ⇤ đăng nhập.
3. **Hành động trên một đối tượng** (dòng, mục, form): **chỉ icon** + tooltip + `aria-label`. Hành động
   trên dòng hiện khi rê chuột / focus. Xóa: icon xám, **đỏ khi rê**.
4. **Quyết định kết thúc hộp thoại** (Lưu, Hủy, Xác nhận xóa, Dùng bản máy này…) và **liên kết điều hướng**
   (Mở lịch, Xem tất cả, Xem cây): **chữ**. Hộp xác nhận xóa giữ chữ "Xóa" — hành động không hoàn tác
   phải ghi rõ bằng chữ (đã có icon 🗑 lớn ở thân hộp).
5. **Hành động chính của tab** (Sao lưu ngay) và **menu dọc** (chuột phải thư mục): icon + chữ.
6. Hành động đặt ở **đầu mục mà nó tác động**: Xuất / Tải lại / Xóa tất cả → đầu cột "TRÌNH DUYỆT" (chúng
   chỉ tác động cây trình duyệt); ✕ xóa tìm → đầu "KẾT QUẢ".

## Sửa

- Mới: `components/ui/icons.ts` (`APP_ICONS`), `components/ui/AppIcon.vue`; `ds.css`: `ds-icon-action--danger`.
- Lịch: danh sách ngày — ✎ + 🗑 trên dòng (hiện khi rê), ＋ icon ở đầu mục; Sửa sự kiện — 🗑 icon thay chữ
  "Delete".
- Ghi chú: section — 🗑 thay ×; ⧉ nét; menu ⚙ dùng AppIcon; menu chuột phải thư mục có icon; 🔒 trạng thái.
- Bookmark: "☁↑ Sao lưu ngay"; ⤓ ⟳ 🗑 ở đầu cột TRÌNH DUYỆT; dòng sao lưu ↶ 🗑 kiểu chung (gỡ
  `IconDeleteButton`, `IconRestoreButton`); ✕ ở đầu KẾT QUẢ.
- Hộp thoại: mọi ✕ dùng AppIcon; `[ X ]` đóng → ✕; `[ X ]` / `[ OK ]` ở chân → "Hủy" / "OK";
  xung đột đồng bộ: dòng ↶ 🗑 icon, mọi chữ qua i18n, chữ thường.
- Settings: "🔓 Mở khóa" / "🔒 Khóa ngay"; mã hóa tài khoản: "⧉ Sao chép".
- Header: Đăng nhập ⇤ (thay 🔒), Đăng xuất ⇥, ⚙ — AppIcon.
- Ô tìm, ‹ › tháng, mũi tên cây / accordion / chip: AppIcon.
- i18n: gỡ `common.bracketOk/Clear/Yes/No`, `common.confirmYnPrompt`; `common.error` → "Lỗi:" / "Error:";
  khóa mới cho tooltip + 2 hộp thoại xung đột.

Giữ nguyên (không phải icon hành động): cờ ngôn ngữ, nút sáng/tối, huy hiệu đồng bộ / offline, vòng ✓
của U14.

## Đổi assertion test cũ (có chủ đích — thiết kế đổi)

- **U11.C1** thanh công cụ Bookmark: "Xóa tất cả" không còn là nút chữ đỏ trên thanh công cụ → icon 🗑 ở đầu
  cột TRÌNH DUYỆT (quy tắc 3 + 6).
- **U13.S4** chân Sửa sự kiện: "Xóa" từ nút chữ đỏ → icon 🗑 (`ds-icon-action--danger`).
- **U13.S6** danh sách ngày: "＋ Thêm sự kiện" từ nút chữ → icon ＋ (giống Ghi chú).

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Ảnh Chromium light + dark: Lịch (danh sách ngày, Sửa), Ghi chú (section, menu ⚙, menu chuột phải),
   Bookmark, Settings, hộp xác nhận xóa. Không lỗi console.
