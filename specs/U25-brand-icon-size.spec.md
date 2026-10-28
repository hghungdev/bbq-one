# U25 — Logo / icon BBQOne bị nhỏ hơn icon khác (Chrome + header) → cắt sát viền

> **Failing test:** `specs/U25-brand-icon-size.test.mjs`.
> **Phản hồi (Sir, 2026-10-28):** "Icon mới của mình khá bị nhỏ hơn so với các icon khác trên Chrome" (ảnh thanh công cụ
> + trang Extensions) — "vào trong app nữa" (ảnh header).

## Nguyên nhân (đo)

`design/transparent/icon*.png` có viền trong suốt rộng: hình chiếm **86–87 % ngang, 76–81 % dọc** khung (1024: hình
ở (69,124)–(953,903)). Icon khác (Google Translate, Docs…) lấp gần kín 16 px → BBQOne trông nhỏ hơn ~15–25 %. Header:
logo 28 px nhưng hình chỉ ~24 × 21 px.

## Sửa

- **`scripts/make-brand-icons.py`** (Pillow): cắt bản gốc 1024 theo vùng có hình (alpha > 0), chừa lề 1,5 % mỗi bên,
  đặt giữa khung vuông, thu nhỏ Lanczos (≤ 32 px làm nét nhẹ). Xuất:
  `design/transparent-tight/icon{16,32,48,64,128}.png` → `public/icon-{16,32,48,128}.png` + `src/assets/brand/bbqone-logo.png` (64).
  Bản gốc `design/transparent/` của Sir giữ nguyên.
- Hình rộng hơn cao (~888 × 782) → sau khi cắt: lấp ~97 % ngang, ~85 % dọc (giữ đúng tỉ lệ, không kéo méo).
- Header: khung logo 28 → **32 px** (cùng cỡ avatar và các nút 32 px của header) — cộng với cắt sát, hình rộng
  ~24 → ~31 px.
- 128 px cũng cắt sát (không theo gợi ý 96 + 16 px lề của Web Store): trang Extensions ở màn 2x dùng bản 128 → nếu chừa
  lề thì lại nhỏ như cũ.

## Đổi assertion cũ có chủ đích

- **U23.1 / U23.3** — trước: `public/icon-*` và logo app trùng `design/transparent/…`. Nay: trùng
  `design/transparent-tight/…` (sinh từ `design/transparent/icon1024.png` bằng script).
- **U23.4 / U23.5** — logo header 28 → 32 px (thuộc tính `width` / `height` + CSS).

## Nghiệm thu

1. Test GREEN (giải mã PNG thật: hình lấp ≥ 94 % ngang, ≥ 80 % dọc ở mọi cỡ); mọi harness khác PASS; build OK.
2. Ảnh so sánh cũ / mới trên thanh công cụ Chrome sáng / tối; Chromium: header logo to hơn, light + dark.
