# U9 — Cờ ngôn ngữ trong Settings: hình chữ nhật, không bọc trong ô bo tròn

> **Failing test:** `specs/U9-language-flags.test.mjs`.
> **Yêu cầu (Sir, 2026-10-28):** cờ 2 nước để hình chữ nhật đẹp hơn thay vì bo tròn góc rồi bỏ vào box.

## Hiện trạng

`LangFlagIcon` bo góc `--radius-sm` (10 px trên cờ cao 17 px → gần như viên thuốc), lại nằm trong
`RetroButton` dạng pill; ngôn ngữ đang chọn là nút `disabled`.

## Sửa

```
  ┌────────┐   ┌────────┐
  │ ▓▓▓▓▓▓ │   │   ★    │      ← cờ chữ nhật 40×21, góc 2 px; đang chọn = vòng viền màu nhấn
  └────────┘   └────────┘
   English     Tiếng Việt     ← tên ngôn ngữ (viết theo chính ngôn ngữ đó)
```

- `LangFlagIcon`: góc 2 px (hình chữ nhật), viền mảnh để sọc trắng không lẫn nền.
- Settings: bỏ `RetroButton` pill → `role="radiogroup"` + 2 nút `role="radio"` `aria-checked`; nút
  trong suốt, cờ + tên bên dưới; đang chọn: vòng viền màu nhấn quanh cờ + chữ đậm màu nhấn; hover nhẹ;
  focus bàn phím rõ. Không còn `disabled` cho ngôn ngữ đang chọn.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Settings → Language: 2 cờ chữ nhật có tên; bấm đổi ngôn ngữ, vòng chọn chuyển theo; dark mode rõ.
