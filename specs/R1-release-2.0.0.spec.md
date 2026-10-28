# R1 — Phát hành 2.0.0 (từ 1.3.3)

> **Failing test:** `specs/R1-release-2.0.0.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** "upgrade tất cả version 1.3.3 ⇒ 2.0.0", "cập nhật thêm privacy-policy.html",
> rồi gộp vào `main`.

## Vì sao là bản lớn (2.0.0)

Bố cục mới (thanh điều hướng dọc U20, ngôn ngữ "ADN popover" U11–U21, bộ icon chung U15), gỡ Bookmark PIN (S3a —
thay đổi dữ liệu / bảo mật), link Google Calendar (G1 — luồng dữ liệu mới ra ngoài), Esc / Hủy / sự kiện lặp…

## Sửa

- Phiên bản: `public/manifest.json` (nguồn — `scripts/sync-extension-version.mjs` đồng bộ `package.json` khi build),
  `package.json`, `package-lock.json`, `README.md`, `DESIGN.md` (YAML token).
- `docs/privacy-policy.html`: 2.0.0 / tháng 10 2026; bỏ "Bookmark có PIN"; thêm mục **link Google Calendar** (token bí
  mật, ai có link đọc được lịch, Google tải theo lịch của Google, tạo mới / tắt, log của Supabase); bên thứ ba có
  Google Calendar (chỉ khi user thêm link); phạm vi mã hóa đúng hiện trạng (S3b — mục bật đang ẩn); lịch không mã hóa
  có chủ đích.
- `README.md`: "What changed in 2.0.0"; bỏ mô tả PIN của Bookmark.
- `docs/CHROME-STORE-LISTING.md`: "Release 2.0.0 (highlights)".
- `docs/CHROME-STORE-PERMISSIONS.md`: quyền **không đổi** ở 2.0.0 (link Google Calendar do Edge Function phục vụ,
  extension không gọi Google) → ghi "v2.0.0".
- Giữ nguyên các nhắc tới "1.3.3" mang tính lịch sử (SECURITY.md, specs S1/S2: "plaintext tồn dư từ bản ≤ 1.3.3").

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK; `dist/manifest.json` = 2.0.0.
2. Settings hiện "BBQOne v2.0.0".
