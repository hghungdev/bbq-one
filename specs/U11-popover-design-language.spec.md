# U11 — Áp "ADN popover" cho toàn bộ layout (nhánh `claude/ui-adn-redesign`)

> **Failing test:** `specs/U11-popover-design-language.test.mjs` (cấu trúc template / CSS chính).
> Giao diện kiểm bằng ảnh chụp Chromium (extension thật) trước / sau, light + dark.
> **Yêu cầu (Sir, 2026-10-28):** bảng "Lịch sắp tới" đẹp và hiện đại — rà toàn bộ layout theo thiết
> kế này. Làm trên nhánh riêng; không ưng thì quay lại `claude/dazzling-wright-m0fqb2` (`0ef22ee`).

## ADN của bảng "Lịch sắp tới" (rút ra để áp chung)

| Yếu tố | Trong popover | Quy tắc chung |
|---|---|---|
| Bề mặt | một tấm `--bg-panel`, bo 16 px, bóng mềm; **không hộp lồng hộp** | bỏ viền/khung bao quanh từng tiêu đề, nút, nhóm nút |
| Tiêu đề mục | `● TODAY · Oct 28, 2026` — chữ in hoa 11 px, giãn chữ, chấm màu, phần phụ mờ | `SectionHeader` dùng chung: nhãn in hoa + phần phụ + hành động bên phải |
| Hành động | "Open calendar" — chữ màu nhấn, không viền | nút chữ (`ds-text-action`), nút icon trong suốt (`ds-icon-action`); chỉ hành động chính mới là nút đặc |
| Dòng | không viền, hover tô nhạt, vạch màu 3 px bên trái | dòng phẳng; dòng đang chọn = nền nhấn nhạt + vạch nhấn 3 px |
| Phân nhóm | đường kẻ mảnh giữa các mục | đường kẻ mảnh / khoảng trắng thay cho khung |
| Chữ nút | "Open calendar" (chữ thường) | nút viết thường ("Hôm nay", "Để sau", "Đóng"); IN HOA chỉ dành cho nhãn mục |

## Câu hỏi 1 — đặt ô tìm ghi chú ở đâu?

Đúng là ô 🔍 ở đầu cột **Ghi chú** dễ hiểu nhầm "tìm trong folder đang mở", trong khi thực tế tìm
**mọi** ghi chú. So sánh:

| Vị trí | Đánh giá |
|---|---|
| Đầu cột Ghi chú (hiện tại) | nằm *bên trong* folder → hiểu là tìm trong folder |
| Trên vùng soạn thảo ("Select a note…") — đề xuất của Sir | vùng này là **một** ghi chú → dễ hiểu là "tìm trong ghi chú đang mở"; lúc tìm, vùng soạn thảo bị ẩn để nhường chỗ cho kết quả → ô tìm sẽ "nhảy"; khi mở ghi chú, hàng này là thanh công cụ của ghi chú |
| **Đầu cột Thư mục (chọn)** | nằm *trên* mọi thư mục → đọc ngay là "tìm tất cả" (cách Apple Notes, Notion, Obsidian làm). Luôn hiện dạng ô nhập "🔍 Tìm trong tất cả ghi chú", Ctrl+F vào thẳng |

Kèm theo: đầu cột Ghi chú ghi rõ phạm vi "GHI CHÚ · v11"; khi đang tìm đổi thành "KẾT QUẢ · 4 · mọi thư
mục", folder đang chọn bớt nổi bật (không còn là phạm vi).

## Câu hỏi 2 — thêm nhóm thông báo mới thì chip co giãn thế nào?

Chip **không bao giờ dài thêm**: nó chỉ hiện **một** thứ quan trọng nhất, phần còn lại thành số.

```
1 nhóm:   [● Hôm nay  HSBC T1279, OT…        · Mai 3 ▾]
3 nhóm:   [● Hôm nay  HSBC T1279, OT…        · +5    ▾]   ← +5 = tổng mục ở các nhóm khác
          ┌ Thông báo ────────────────────────────────┐
          │ ● HÔM NAY · 28/10              Mở lịch    │    mỗi nhóm = một mục (cùng ADN),
          │ ● NGÀY MAI · 29/10             Mở lịch    │    xếp theo độ ưu tiên; mỗi mục tối đa
          │ ● BOOKMARK · chưa sao lưu 7 ngày  Sao lưu │    3 dòng + "Xem thêm"
          └───────────────────────────────────────────┘
Không gì gấp: chip thu về icon 🔔 (chấm màu nếu có mục chưa xem) — không chiếm chữ.
```

Cách làm khi có nhóm thứ hai: mỗi nhóm là một "nguồn" trả về `{ id, priority, tone, label, items, action }`;
chip lấy nguồn ưu tiên cao nhất làm chữ, cộng số mục của các nguồn còn lại; bảng vẽ từng nguồn thành một
mục. `utils/calendarAgenda.ts` đã trả dữ liệu theo từng mục, nên chỉ cần tổng quát hóa — **chưa làm** khi
mới có một nhóm (tránh code thừa); ghi lại đây để làm cùng nhóm mới.

## Sửa

### Dùng chung

- `assets/styles/ds.css` (nạp trong `main.ts`): `ds-label` (nhãn in hoa), `ds-text-action`
  (+ `--danger`), `ds-icon-action`, `ds-row` (+ `--selected`: nền nhấn nhạt + vạch 3 px).
- `components/ui/SectionHeader.vue`: `label`, `meta?`, `tone?` (chấm màu), slot hành động.
- `InlineSearch`: thêm `persistent` — luôn là ô nhập (không thu về 🔍), ✕ chỉ hiện khi có chữ, Esc xóa
  + rời ô.

### A — Ghi chú

- Cột Thư mục: ô "Tìm trong tất cả ghi chú" luôn hiện trên cùng (chuyển từ đầu cột Ghi chú) →
  `SectionHeader` "THƯ MỤC · 8" + nút ＋ (bỏ khối "Add folder" to ở đáy, ~60 px) → danh sách.
- Cột Ghi chú: `SectionHeader` "GHI CHÚ · <tên folder>" + ＋ (bỏ khối "Add note" ở đáy); lúc tìm:
  "KẾT QUẢ · n · mọi thư mục".
- Folder / ghi chú: dòng phẳng (`ds-row`), đang chọn có vạch nhấn; nút ⚙ chỉ hiện khi rê chuột / đang
  chọn / focus bàn phím.
- Vùng soạn thảo: tiêu đề "SECTIONS · n" + ＋ / sao chép dạng icon trong suốt (bỏ khung); danh sách
  section dạng dòng phẳng, × hiện khi rê chuột.

### B — Lịch

- Hàng tháng: bỏ khung; tên tháng là chữ đậm (bỏ pill); ‹ › là icon trong suốt; "Hôm nay" là nút chữ.
- Tên thứ: nhãn in hoa nhỏ. Ngày hôm nay: số ngày trong vòng tròn màu nhấn.
- Sự kiện: nền nhạt + vạch màu 3 px bên trái ở **cả** light (trước chỉ dark có vạch).

### C — Bookmark

- Thanh công cụ: bỏ khung; "Sao lưu ngay" là nút chính (đặc), "Xuất HTML" / "Làm mới" nút chữ, "Xóa tất
  cả" nút chữ màu đỏ, 🔍 bên phải.
- Hai cột: `SectionHeader` "BẢN SAO LƯU · n" / "TRÌNH DUYỆT"; mũi tên cây màu nhạt.

### D — Settings & hộp thoại

- Settings: tiêu đề chữ đậm + email dạng chữ phụ (bỏ khung); mỗi mục = nhãn in hoa + mũi tên, ngăn bằng
  đường kẻ (bỏ hộp); phiên bản là chữ phụ; "Đóng" là nút chữ.
- Nút chữ thường: "Hôm nay", "Để sau", "Đánh dấu xong (n)", "Đóng" (i18n đổi từ IN HOA).

## Đổi assertion test cũ (có chủ đích — thiết kế đổi)

- **U5.8** ô tìm ghi chú: từ `NoteList` sang `Sidebar` (câu hỏi 1).

## KHÔNG đổi

Logic store / service / mã hóa; tên class mà test hành vi dùng; i18n key (chỉ đổi giá trị chữ hoa →
thường); hành vi bàn phím đã có (Ctrl+F, Esc, F2…).

## Nghiệm thu

1. Test GREEN; mọi harness khác PASS; `vue-tsc` sạch; build OK.
2. Ảnh chụp trước / sau (light + dark) từng tab trên Chromium, không lỗi console.
3. Sir xem trên nhánh `claude/ui-adn-redesign`; ưng → gộp vào nhánh chính.
