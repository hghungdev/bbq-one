# F1 — Tìm ghi chú từ thanh địa chỉ (gõ `bb …`) + sao chép thẳng — BẢN MÔ TẢ, CHỜ SIR DUYỆT

> **Trạng thái: chưa làm.** Sir (2026-10-29): "Tìm từ thanh địa chỉ … mình thực hiện như thế nào", "có copy được
> không", "nhờ bạn mô tả giúp" — đã chọn hướng **cách 2: Enter = sao chép thẳng**. Khi Sir chốt các câu hỏi ở cuối →
> viết spec + failing test như thường lệ.

## 1. Tóm tắt

Từ bất kỳ trang web nào: gõ `bb` + khoảng trắng trên thanh địa chỉ → gõ từ khóa → chọn một gợi ý → **Enter: nội dung
đã nằm trong clipboard**, dán ngay vào chỗ đang làm. Không mở popup, không bấm chuột. Muốn xem / sửa ghi chú thì
**Alt+Enter** mở BBQOne đúng chỗ đó.

## 2. Cách dùng

1. Bấm vào thanh địa chỉ (hoặc **Ctrl+L**), gõ `bb` rồi nhấn **Space** (hoặc **Tab**).
2. Đầu thanh địa chỉ hiện nhãn **BBQOne** → chữ gõ tiếp chỉ tìm trong BBQOne, không gửi Google.
3. Gõ từ khóa, vd `kafka` → bên dưới hiện các đoạn ghi chú khớp.
4. **↑ ↓** chọn → **Enter** = sao chép · **Alt+Enter** = mở trong BBQOne.

```
 ┌───────────────────────────────────────────────────────────────┐
 │ [BBQOne]  kafka                                               │
 ├───────────────────────────────────────────────────────────────┤
 │ 🔎 Tìm "kafka" trong BBQOne                                    │  ← Enter ở dòng này: mở BBQOne, ô tìm điền sẵn
 │ 📝 Kafka plan › Query — Work · …SELECT * FROM kafka_offsets…  │  ← Enter: sao chép section "Query"
 │ 📝 Kafka plan › Draft — Work · …Release kafka on Friday…      │
 │ 📝 Kafka consumer — Dev · …commit offset mỗi 5s…              │
 └───────────────────────────────────────────────────────────────┘
                     Enter → ✓ hiện trên icon BBQOne ~1,5 giây (đã sao chép)
```

## 3. Hành vi chi tiết

| Tình huống | Kết quả |
|---|---|
| Gõ từ khóa | Mỗi **section** khớp là một dòng: `Tên ghi chú › Nhãn section — Thư mục · …đoạn trích…`, chữ khớp in đậm. Khớp tên trước, rồi nội dung; mới sửa trước. Chrome chỉ hiện vài dòng (khoảng 5) |
| **Enter** trên một gợi ý | Sao chép **chữ thường** của section đó (giống nút ⧉ trong editor — code / SQL giữ nguyên xuống dòng). Icon BBQOne trên thanh công cụ hiện **✓** ~1,5 giây. Trang đang xem không đổi |
| **Alt+Enter** trên một gợi ý | Mở popup BBQOne đúng ghi chú + section đó (không mở được popup → mở BBQOne trong tab mới) |
| Enter ở dòng đầu "Tìm … trong BBQOne" | Mở BBQOne, ô tìm ghi chú điền sẵn từ khóa |
| Không có kết quả | Một dòng "Không thấy ghi chú nào khớp" |
| Ghi chú trong thư mục bảo mật / đang mã hóa | Không hiện (nội dung đang khóa) |
| Không đăng nhập / đã đăng nhập | Đều chạy — tìm trên dữ liệu đã có trong máy, **không gọi mạng** |

## 4. Riêng tư & quyền

- Chữ gõ sau `bb` chỉ đến BBQOne (Chrome không gửi cho Google khi đang ở chế độ BBQOne).
- **Không thêm quyền**: khóa `omnibox` trong manifest không hiện cảnh báo; sao chép dùng `clipboardWrite` + `offscreen`
  đã có (nút ⧉ đang dùng) → cập nhật lên Store, Chrome **không** tạm tắt extension của người dùng.
- Trang Store: thêm một dòng giới thiệu tính năng trong mô tả.

## 5. Lưu ý / giới hạn

- Gợi ý của Chrome chỉ hiện chữ một dòng (không định dạng, không tô màu code).
- Khi di bằng ↑ ↓, ô địa chỉ hiện chữ của gợi ý đang chọn — cách Chrome hoạt động, không đổi được.
- Từ khóa `bb` cố định trong extension (đổi phải ra bản mới); nếu trùng lối tắt tìm kiếm Sir tự đặt trong Chrome thì
  nên chọn chữ khác.
- Phím mở trên Mac (tương đương Alt+Enter) — kiểm lại trên Chrome Mac khi làm.

## 6. Kỹ thuật (tóm tắt)

- `manifest.json`: `"omnibox": { "keyword": "bb" }`.
- Service worker: `chrome.omnibox.onInputChanged` — đọc `notes_cache` + `note_bodies_cache` (nhớ trong bộ nhớ, làm mới
  khi storage đổi), lọc như P4 (chữ, không thẻ HTML) — đổi HTML → chữ **không cần DOM** (service worker không có
  `document`); mô tả gợi ý phải escape XML (`&`, `<`, `>`) và dùng `<match>` / `<dim>` của Chrome.
- `onInputEntered(content, disposition)`: `currentTab` → sao chép qua offscreen (có sẵn) + `chrome.action.setBadgeText('✓')`;
  `newForegroundTab` / `newBackgroundTab` (Alt+Enter) → `BBQ_PENDING_ROUTE_KEY` = route mở thẳng ghi chú + section
  (route mới) rồi `chrome.action.openPopup()` (cách menu chuột phải đang dùng).
- Test: harness cho bộ lọc / thứ tự / định dạng + escape gợi ý; Chromium: gõ trên thanh địa chỉ thật, kiểm clipboard.
- Ước lượng: **~1–1,5 ngày**.

## 7. Câu hỏi để Sir chốt

1. Từ khóa: **`bb`** hay `bbq`?
2. **Enter = sao chép, Alt+Enter = mở** — đồng ý?
3. Sao chép **section khớp** (đề xuất — đúng đoạn SQL cần) hay **cả ghi chú** (mọi section)?
4. Tìm thêm **sự kiện lịch** không? (đề xuất: không — giữ gọn, bookmark thì Chrome tự tìm)
