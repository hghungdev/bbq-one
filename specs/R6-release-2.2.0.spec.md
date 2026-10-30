# R6 — Phát hành 2.2.0 (thao tác an toàn)

> **Failing test:** `specs/R6-release-2.2.0.test.mjs`.
> Gồm: S11 (xóa tất cả bookmark), S12 (gợi ý thanh địa chỉ), S9 (thư mục bảo mật), N6.1 (bỏ `lock` Supabase).

## Việc

- `public/manifest.json` + `package.json` + lock (`version`, `packages[""].version`) = **2.2.0**; `DESIGN.md` `version:
  2.2.0`. Quyền **không đổi** → Chrome không tạm tắt extension khi cập nhật.
- README: `**Version:** 2.2.0`; mục **"What changed in 2.2.0"** (mục lục, trước 2.1.2).
- Store (`docs/chrome-store-detailed-description.txt`): **WHAT'S NEW IN 2.2.0** — 3 dòng mới đứng đầu (xóa bookmark an
  toàn, thanh địa chỉ riêng tư, thư mục bảo mật mạnh hơn), giữ các dòng của 2.1.x (người cập nhật từ bản cũ vẫn thấy sao
  lưu ra file). `docs/CHROME-STORE-LISTING.md`: "Release 2.2.0 (highlights)". `docs/CHROME-STORE-PERMISSIONS.md`:
  `**v2.2.0**` (quyền không đổi).
- `SECURITY.md` (mục Secure folder): chốt salt nhiều máy / nhiều tab, 600.000 vòng, nâng cấp do người dùng bấm.

## Đổi assertion có chủ đích

- `T3.6–T3.8` (`specs/T3-ci.test.mjs`): phiên bản **hiện tại ≥ 2.1.2** theo manifest (thay cho cứng 2.1.2); phần lịch sử
  2.1.2 kiểm như cũ — giống SEC1.14–16 ở 2.1.2.

## Nghiệm thu

Mọi harness PASS; `vue-tsc` 0; `npm audit` 0; build; PoC hồi quy ✅. Sir: build bằng `.env` thật → upload; thử tay mục
"Kiểm tay 2.2.0" trong `specs/ROADMAP-SEC.md` (bảng Trạng thái).
