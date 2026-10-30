# S12 — Gợi ý thanh địa chỉ: chế độ Tên + đoạn trích / Chỉ tên / Tắt (SEC-12, 2.2.0)

> **Failing test:** `specs/S12-omnibox-privacy.test.mjs`.
> **Nguồn:** `specs/ROADMAP-SEC.md` mục 4 (S12). **Sir chốt (2026-10-30): mặc định "Tên + đoạn trích"** (giữ như F1).

## Vấn đề

Gõ `bbq …` trên thanh địa chỉ → `background.ts` `chrome.omnibox.onInputChanged` → mỗi gợi ý =
`omniboxDescription` (`utils/omniboxNotes.ts`): `Tên — Thư mục · …đoạn trích…`. Chia sẻ màn hình / quay phim lúc gõ →
lộ nội dung ghi chú. (Thư mục bảo mật + ghi chú mã hóa đã bị loại từ F1 — giữ nguyên.)

## PHẦN A — Chế độ

- `constants/storage.ts`: `BBQ_OMNIBOX_MODE_KEY = 'bbqone_omnibox_mode'` (`chrome.storage.local`).
- `utils/omniboxNotes.ts`: `type OmniboxMode = 'full' | 'title' | 'off'`; `DEFAULT_OMNIBOX_MODE = 'full'`;
  `parseOmniboxMode(v)` — giá trị lạ / thiếu → mặc định.
- `omniboxDescription(hit, folderName, query, untitled, mode = 'full')`:
  - `'full'` = như F1 (tên + thư mục + đoạn trích).
  - `'title'` = **chỉ tên** (chữ khớp vẫn in đậm) — bỏ cả đoạn trích **và tên thư mục** (tên thư mục cũng có thể nhạy cảm,
    và đúng nghĩa nhãn "Chỉ tên"). Vẫn tìm trong cả nội dung, chỉ không **hiện**.

## PHẦN B — `background.ts`

- `OMNIBOX_KEYS` thêm `BBQ_OMNIBOX_MODE_KEY` → đổi trong Cài đặt là cache gợi ý tự làm mới (listener `storage.onChanged`
  sẵn có). `OmniboxData.mode = parseOmniboxMode(r[BBQ_OMNIBOX_MODE_KEY])`.
- `onInputChanged`: `mode === 'off'` → `setDefaultSuggestion(omnibox.off)` + `suggest([])`, **không tìm**. Còn lại →
  `omniboxDescription(…, data.mode)`.
- `onInputEntered`: `mode === 'off'` → `openPopupAt('/dashboard')` — **không** mang chữ đã gõ vào BBQOne, không sao chép
  (Alt+Enter), trước `resolveOmniboxNoteId`.

## PHẦN C — Cài đặt

`components/layout/OmniboxSettingsSection.vue` (gắn vào `SettingsModal.vue` ngay sau mục Ngôn ngữ): mục "Tìm từ thanh địa
chỉ (bbq)", 3 radio **Tên + đoạn trích** (mặc định) / **Chỉ tên** / **Tắt**; đọc kho bằng `parseOmniboxMode`, chọn → ghi
`chrome.storage.local.set({ [BBQ_OMNIBOX_MODE_KEY]: mode })`. Ghi chú: "Chrome có thể nhớ chữ bạn gõ trên thanh địa chỉ
trong lịch sử của Chrome — BBQOne không xóa được."

i18n (vi + en): `omnibox.off`, `settings.omnibox.title`, `settings.omnibox.desc`, `settings.omnibox.full`,
`settings.omnibox.titleOnly`, `settings.omnibox.off`, `settings.omnibox.chromeHistory`.

## PHẦN D — Test

| Ca | Kiểm |
|---|---|
| S12.1 | `parseOmniboxMode` 3 giá trị hợp lệ giữ nguyên; `undefined` / `null` / `'FULL'` / `'all'` / số / object → `'full'` |
| S12.2 | `'full'` và không truyền mode = như F1 (chốt chặn — PASS cả trước khi làm) |
| S12.3 | `'title'`: còn `<match>Kafka</match> plan`, không đoạn trích, không tên thư mục, không `<dim>` |
| S12.4 | Khóa kho |
| S12.5 | `OMNIBOX_KEYS` + `mode: parseOmniboxMode(…)` |
| S12.6 | `onInputChanged` nhánh `off` trước `searchNotesForOmnibox`, `suggest([])`, `omnibox.off`; truyền `data.mode` |
| S12.7 | `onInputEntered` nhánh `off` trước `resolveOmniboxNoteId`, `openPopupAt('/dashboard')` |
| S12.8 | `OmniboxSettingsSection`: radio `v-for`, ghi kho, `parseOmniboxMode`, ghi chú lịch sử Chrome; gắn vào `SettingsModal` |
| S12.9 | i18n đủ hai thứ tiếng |

## KHÔNG được đổi

- `searchNotesForOmnibox` (loại thư mục bảo mật / ghi chú mã hóa), `omniboxContent` / `resolveOmniboxNoteId`, Enter mở /
  Alt+Enter sao chép ở chế độ `full` / `title`. Test F1 (`specs/F1-omnibox-search.test.mjs`) PASS nguyên.

## Nghiệm thu

Harness PASS; Chromium: Cài đặt hiện 3 lựa chọn, mặc định "Tên + đoạn trích"; chọn "Chỉ tên" / "Tắt" → kho có
`bbqone_omnibox_mode` đúng; tải lại Cài đặt vẫn giữ lựa chọn.
