# U18 — Chip lịch: tên sự kiện không còn bị cắt giữa chữ ("HSBC T1279, OT -…")

> **Failing test:** `specs/U18-agenda-chip-fit-titles.test.mjs` — code thật `fitTitleCount`
> (`utils/calendarAgenda.ts`) + kiểm cấu trúc chip. Giao diện kiểm bằng ảnh Chromium.
> **Yêu cầu (Sir, 2026-10-28):** "Chip khi show lên mất hết chữ, không gọn gàng chữ nào ra chữ nào — có
> cách nào khắc phục, research tìm solution".

## Vì sao

Chip nối mọi tên bằng dấu phẩy rồi để CSS `text-overflow: ellipsis` cắt ở **bất kỳ ký tự nào** →
"HSBC T1279, OT -…": tên thứ hai mất nửa, không biết còn mấy việc.

## Các cách đã cân nhắc

| Cách | Ví dụ | Đánh giá |
|---|---|---|
| Cắt chữ (hiện tại) | `HSBC T1279, OT -…` | xấu, mất thông tin số lượng |
| Chỉ hiện số | `Hôm nay · 2 việc` | gọn nhưng mất tên — phải mở bảng mới biết việc gì |
| Tên đầu + số | `HSBC T1279 +1` | gọn, nhưng phí chỗ khi 2–3 tên ngắn vừa đủ |
| Chữ chạy (marquee) | | gây xao nhãng, khó đọc, khó truy cập (WCAG 2.2.2) |
| **Vừa bao nhiêu tên trọn vẹn thì hiện, còn lại "+n"** (chọn) | `VIB · HSBC +1` / `HSBC T1279 +1` | cách Gmail / Outlook hiển thị người nhận, Linear / Jira hiển thị nhãn: **không bao giờ cắt giữa tên**, luôn biết còn bao nhiêu |

## Thiết kế

```
rộng:   [● Hôm nay  HSBC T1279 · OT - 2 Hours      │ ● Mai 3 ⌄]
vừa:    [● Hôm nay  HSBC T1279  (+1)               │ ● Mai 3 ⌄]
hẹp:    [● Hôm nay  HSBC T12…  (+1)                │ ● Mai 3 ⌄]   ← chỉ khi CHÍNH tên đầu dài hơn chỗ
```

- Đo chiều rộng thật (canvas `measureText` với đúng font của chip) và chỗ trống thật (bề rộng vùng giữa
  header trừ phần cố định của chip: chấm, nhãn, đoạn "Mai 3", mũi tên, lề). Đo lại khi đổi cỡ (ResizeObserver),
  đổi sự kiện, đổi ngôn ngữ.
- `fitTitleCount(widths, available, sepWidth, moreWidth)` thuần: số tên trọn vẹn tối đa vừa chỗ, **đã tính
  chỗ cho "+n"**; ít nhất 1 (tên đầu quá dài thì riêng nó được cắt "…").
- "+n" là một viên nhỏ chữ phụ. Tooltip / `aria-label` của chip vẫn đọc **đủ** mọi tên; bấm chip → bảng đầy đủ.

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Chromium (cỡ popup 800 px): ngày có 2 tên → "HSBC T1279 +1" (không còn "OT -…"); nới rộng trang → hiện
   đủ 2 tên, không "+n"; tên đầu rất dài → "…" ở tên đầu + "+n". Light + dark.
