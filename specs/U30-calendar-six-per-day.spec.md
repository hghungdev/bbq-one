# U30 — Lịch: tối đa 6 sự kiện / ngày; ô hiện 2 + "xem thêm"; chip ghi số khi không vừa

> **Failing test:** `specs/U30-calendar-six-per-day.test.mjs`.
> **Yêu cầu (Sir, 2026-10-29):** "Hiện tại chỉ cho thêm 3 event đang bị quá cứng nhắc, do giao diện mình không được bự
> khi show hiển thị thì 2 event, nếu có nhiều hơn 2 event thêm tag view more bấm vào sẽ thấy được các event → tối đa
> lên 5 hay 6 event" — "thẻ chip trên header khi 1 ngày có 5 or 6 event thì phải hiển thị đủ ra chứ không gom gọn
> lại". Sir chọn: **6 sự kiện**; chip: **"Chip ghi số, bảng liệt kê đủ"**. Thêm: "Sự kiện ngày mai ở trên chip có thể
> show ra 3 event sau đó + show more cũng được".

## Hiện trạng (Chromium, 6 sự kiện hôm nay + 2 ngày mai gài thẳng vào cache)

- Tạo sự kiện thứ 4 → "Tối đa 3 sự kiện mỗi ngày".
- Ô lịch: 3 dòng + chữ "+3" mờ, chật; ô ngày đã qua bấm "+3" không mở được gì.
- Chip: `Hôm nay HSBC T1279, OT - 2 Hours, VIB +3 · Ngày mai 2` — gom "+3", không thấy đủ.

## Sửa

1. **`constants/calendar.ts`:** `CALENDAR_MAX_EVENTS_PER_DAY = 6`; `CALENDAR_CELL_EVENT_LIMIT = 2` (tách khỏi giới
   hạn — ô chỉ đủ chỗ 2 dòng). Mọi nơi kiểm giới hạn đã dùng hằng số (store tạo / lặp, hộp sự kiện `n/6`, kho máy,
   server, hộp gộp khi đăng nhập) → tự theo. **Supabase không có ràng buộc số sự kiện / ngày → không cần migration.**
2. **`CalendarCell.vue`:** quá 2 sự kiện → dòng thứ 3 là nút **"+n xem thêm"** (`+n more`), rê chuột: "Xem cả 6 sự
   kiện". Bấm → mở hộp sự kiện của ngày (liệt kê đủ), **kể cả ngày đã qua** (ô ngày đã qua bấm vào khoảng trống vẫn
   không mở như cũ); không lan lên ô.
3. **Chip header (`CalendarAgendaChip.vue` + `utils/calendarAgenda.ts`):** bỏ kiểu "vài tên + "+n"" (U18):
   - mọi tên **vừa hết** chỗ → hiện đủ tên như cũ;
   - **không vừa hết** (≥ 2 tên) → chữ chính là số: `Hôm nay · 6 sự kiện · Ngày mai 2`;
   - 1 tên dài quá chỗ → vẫn hiện tên, CSS cắt "…" (ghi "1 sự kiện" thì mất thông tin).
   Hàm thuần `titlesNeedCount(widths, available, sepWidth)`; `fitTitleCount` bị bỏ. Tooltip + aria-label vẫn đọc đủ
   mọi tên (U18 S3).
4. **Bảng mở từ chip:** Hôm nay liệt kê **đủ**; **Ngày mai hiện 3 dòng đầu + "Xem thêm n"** — bấm mở đủ ngay trong
   bảng (đóng bảng rồi mở lại thì thu về 3). Hàm thuần `previewItems(items, limit, expanded)`,
   `AGENDA_TOMORROW_PREVIEW = 3`. Bảng cao tối đa `min(520px, 100vh − 72px)` (popup 600 px) thay 380 px, cuộn khi
   dài hơn.
5. **Docs Store:** "up to 6 events per day" (`CHROME-STORE-LISTING.md`, `chrome-store-detailed-description.txt`).
   README mục 1.2.0 ("max 3/day in v1") là lịch sử — giữ.

## Đổi assertion có chủ đích

- **U18** T1–T6 + S1 + S2: thử `titlesNeedCount` / chữ số thay `fitTitleCount` / viên "+n". S3 giữ nguyên.
- **U3** T2.1–T2.3: ngày 06/11 gài đủ `CALENDAR_MAX_EVENTS_PER_DAY` sự kiện (trước: cứng 3).
- **R2** R2.4: "6 events per day".

## KHÔNG được đổi

Bấm sự kiện trong ô → mở hộp của ngày (U8); ô ngày đã qua không mở khi bấm khoảng trống; nhóm Quá hạn trong bảng (3
dòng + "và n việc khác", U12/U14); đoạn "· Ngày mai n" / "· n quá hạn" trên chip; tìm kiếm lịch (ô chỉ đếm sự kiện
khớp tìm).

## Lưu ý phát hành

Máy còn bản 2.0.0 (giới hạn 3) vẫn **hiện đủ** sự kiện đồng bộ về, chỉ không thêm được ngày đã có ≥ 3. Hộp gộp lịch
lúc đăng nhập (chỉ khi máy cũ có sự kiện chưa đồng bộ đúng ngày đó) có thể hỏi giữ 3 — Chrome tự cập nhật extension
trong vài giờ nên hiếm gặp.

## Nghiệm thu

Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK. Chromium: thêm đủ 6 sự kiện, cái thứ 7 bị chặn (`6/6`);
ô hiện 2 + "+4 xem thêm", bấm (cả ngày đã qua) → hộp liệt kê đủ 6; chip `Hôm nay · 6 sự kiện · Ngày mai 4`, tên ngắn
vừa chỗ thì vẫn hiện tên; bảng: Hôm nay đủ 6, Ngày mai 3 + "Xem thêm 1" → bấm ra đủ; sáng + tối, en + vi.
