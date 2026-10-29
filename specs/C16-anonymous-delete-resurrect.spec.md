# C16 — Không đăng nhập: xóa ghi chú / section / sự kiện bị "hồi sinh" (lỗi có từ bản đã lên Store)

> **Failing test:** `specs/C16-anonymous-delete-resurrect.test.mjs`. Phát hiện khi smoke test đợt P (2026-10-29),
> **tái hiện y hệt trên bản 2.0.0 gốc** (`c37ab07`) — không do P1–P5 gây ra.

## Tái hiện (Chromium thật, không đăng nhập)

Tạo thư mục "Work" → 2 ghi chú "Kafka plan", "Second" → ⚙ "Kafka plan" → Xóa → Xác nhận:

| Thời điểm | Danh sách | `bbqone_local_notes` | `notes_cache` |
|---|---|---|---|
| ngay sau Xóa | **Second, Kafka plan** (dòng không mất) | — | — |
| hết 5 s hoàn tác | **Second, Kafka plan** | Second | **Second, Kafka plan** |
| mở lại popup | **Second, Kafka plan** | Second | Second, Kafka plan |

Kho máy đã xóa nhưng cache giữ → ghi chú **không bao giờ biến mất** khỏi giao diện.

## Nguyên nhân

`persistCache()` (N5 đọc-gộp-ghi) gọi `mergeSnapshotWithStored(snapshot, disk, isDirty)` (`sync.service.ts:66`):
row trên đĩa **dirty** mà snapshot của context không có → **GIỮ** (luật bảo vệ sửa offline của context khác).
Không đăng nhập thì mọi row có `synced_at = null` → `isRowDirty` / `isCalendarEventDirty` luôn `true` → row vừa bị
chính context này xóa khỏi RAM được kéo ngược từ đĩa về. Đăng nhập (row đã đồng bộ = sạch) thì không bị, trừ row
sửa offline rồi xóa.

Bị ảnh hưởng: ghi chú (`scheduleDeleteNote` / `deleteNoteImmediately`), section (`deleteBody`), sự kiện lịch
(`deleteEvent`). Thư mục không (`folders.persistCache` ghi thẳng, không gộp).

## Sửa

1. **`sync.service.ts` `mergeSnapshotWithStored(snapshot, stored, isDirty, dropIds?)`**: tham số tùy chọn
   `dropIds: ReadonlySet<string>` — row đĩa có id trong `dropIds` **không** được giữ lại. Không truyền → y như cũ.
2. **`stores/notes.ts`**: `removedIds` (Set id ghi chú + body mà **context này** cố ý xóa): thêm ở
   `scheduleDeleteNote`, `deleteNoteImmediately`, `deleteBody`; `persistCache` truyền nó cho cả notes lẫn bodies;
   **gỡ** khỏi Set khi khôi phục (`restoreNoteSnapshot` — hoàn tác / commit lỗi) để row được ghi lại.
3. **`stores/calendarEvents.ts`**: tương tự cho `deleteEvent` / `restoreEventSnapshot`.

Id là UUID không tái dùng → giữ Set suốt đời context (nhỏ), không cần dọn.

## KHÔNG được đổi

Luật N5 còn lại (row dirty của context khác vắng trong snapshot → giữ; bản đĩa dirty mới hơn → thắng); C1 merge-guard;
luồng pending-delete / hoàn tác 5 s (C2, N4); `suppressUnexpiredPendingDeletes` (N3.1) không ghi vào `removedIds`
(đó là ẩn tạm cho context khác đang giữ hoàn tác, không phải xóa).

## FLAG liên đới (để sau)

- Hai context mở cùng lúc (popup + tab dashboard): context kia vẫn còn row trong snapshot → lần ghi của nó đưa row
  về lại cache ("snapshot thắng"). Có từ trước, N4 che một phần bằng pending-delete khi tải lại.
- Ghi chú "ma" người dùng đã xóa trên bản ≤ 2.0.0 vẫn nằm trong cache: sau bản sửa, **xóa lại lần nữa là mất hẳn**.
  Tự dọn (không đăng nhập: row dirty vắng trong kho máy = đã xóa) cần biết chắc nguồn `fresh` là kho máy — để
  quyết sau.

## Nghiệm thu

Test GREEN; mọi harness khác PASS (C1, C2, C4, N4-N5-N11, N3.1, S2C1.x…); `vue-tsc` sạch; build OK. Chromium (không
đăng nhập): xóa ghi chú → dòng mất ngay; hết 5 s + mở lại popup → vẫn mất; hoàn tác trong 5 s → quay lại; xóa
section / sự kiện lịch tương tự.
