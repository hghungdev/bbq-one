# S11 — "Xóa tất cả bookmark": tự sao lưu trước + gõ chữ xác nhận (SEC-11, 2.2.0)

> **Failing test:** `specs/S11-delete-all-guard.test.mjs`.
> **Nguồn:** `specs/ROADMAP-SEC.md` mục 4 (S11). **Sir (2026-10-30):** làm đợt 2.2.0.

## Vấn đề

Nút 🗑 (tab Bookmark) → `RetroConfirm` một nút → `bm.deleteAllFromBrowser()` → xóa sạch con của Bookmarks bar / Other /
Mobile. Chrome **không có thùng rác bookmark** → một cú bấm nhầm (hoặc kẻ lừa người dùng bấm) là mất hết, không hoàn tác.

## PHẦN A — Store (`src/stores/bookmarks.ts`)

`deleteAllFromBrowser(): Promise<{ deleted: number; label: string } | null>`:
1. `tree = bookmarksService.getFromBrowser()`; `label = buildBookmarkBackupLabel('before-delete')`.
2. `bookmarksService.saveBackup(tree, label)` **trước**. Lỗi (mạng, Supabase, quota…) → `error = t('bookmark.deleteAllBackupFailed')`,
   trả `null`, **không xóa gì**.
3. Bản mới `unshift` vào `backups` + `persistBackupsCache()`.
4. `deleted = countBookmarkUrls(tree)` (đếm trước khi xóa) → `bookmarksService.deleteAllFromBrowser()` → `loadLive()`.
5. Trả `{ deleted, label: saved.label ?? label }`.

`src/utils/bookmarkBackupLabel.ts`: `BookmarkBackupLabelSource` thêm `'before-delete'` → nhãn
`before-delete_backup_YYYY-MM-DD_HH-mm`. `src/utils/bookmarkTree.ts`: `countBookmarkUrls(nodes)` (đếm nút có `url`).

## PHẦN B — Gõ chữ xác nhận

- `src/utils/deleteAllConfirm.ts`: `deleteAllWord(lang)` = `XOA` (vi) / `DELETE` (en); `isDeleteAllWordTyped(input, lang)` —
  bỏ dấu (NFD), bỏ mọi khoảng trắng, không phân biệt hoa thường → vi nhận `xoa`, `XÓA`, ` x ó a `; en nhận `delete`.
- `src/components/ui/RetroConfirm.vue`: prop `confirmDisabled?: boolean` → nút xác nhận `:disabled="confirmDisabled"`;
  `confirm()` thoát sớm khi bị khóa.
- `src/components/bookmarks/BookmarkTab.vue`: hộp xóa tất cả = `RetroConfirm` `variant="danger"`, tiêu đề
  `bookmark.deleteAll`, nút "Xóa tất cả" (`bookmark.deleteAllConfirmBtn`), slot có `RetroInput v-model="deleteAllTyped"` +
  dòng "Nhập **XOA** để xác nhận:" (dùng lại `bookmark.deleteBackup.instrPre/instrPost`). `:confirm-disabled="!deleteAllWordOk"`.
  Mở hộp → xóa chữ đã gõ (`deleteAllTyped.value = ''`). Esc / ✕ giữ như U31.
- Xong → dòng báo (role="status") `bookmark.deleteAllDone` `{ n, label }`: "Đã xóa n bookmark. Đã lưu bản sao «label» trước
  khi xóa — chọn bản đó rồi bấm Khôi phục để lấy lại." Ẩn khi bấm làm mới / mở lại hộp xóa.

## PHẦN C — i18n (vi + en)

`bookmark.deleteAllBackupFailed`, `bookmark.deleteAllDone` (`{n}`, `{label}`),
`bookmark.deleteAllConfirmBtn`; `bookmark.confirmDeleteAll` đổi: nói rõ BBQOne **tự sao lưu trước khi xóa** (bỏ câu "không
thể hoàn tác").

## PHẦN D — Test

| Ca | Kiểm |
|---|---|
| S11.1 | Store thật: `saveBackup` (nhãn `before-delete_backup_…`) chạy trước `deleteAllFromBrowser`; trả `{ deleted: 3, label }`; bản mới ở đầu `backups` |
| S11.2 | `saveBackup` lỗi → không gọi xóa, trả `null`, `error` = `bookmark.deleteAllBackupFailed` |
| S11.3 | `isDeleteAllWordTyped`: 7 ca đúng mở, 7 ca sai khóa (gồm `DELETE` khi đang vi, `xoa` khi đang en) |
| S11.4 | Nhãn `before-delete_backup_YYYY-MM-DD_HH-mm`; kiểu nguồn có `'before-delete'` |
| S11.5 | `RetroConfirm` `confirmDisabled` → `:disabled` + `confirm()` thoát sớm |
| S11.6 | `BookmarkTab`: danger, ô gõ, `:confirm-disabled`, xóa chữ khi mở lại, báo kết quả bằng `res.deleted` / `res.label` |
| S11.7 | `countBookmarkUrls` đếm 3 link trong cây mẫu (bỏ thư mục, thư mục rỗng) |
| S11.8 | i18n đủ hai thứ tiếng; `deleteAllDone` có `{n}` + `{label}`; `confirmDeleteAll` nói sao lưu |

## KHÔNG được đổi

- `bookmarksService.deleteAllFromBrowser` (giữ folder gốc Chromium), `restoreToChrome` + lọc link (SEC-4 / SEC1.6),
  `DeleteBackupModal`, các nơi khác dùng `RetroConfirm` (prop mới mặc định không khóa).

## FLAG liên đới

- Đang đăng nhập: xóa xong, auto-backup (background, debounce 4 s) sẽ tạo thêm một bản `auto_backup_…` **rỗng** — hành
  vi cũ, vô hại (bản `before-delete_…` vẫn còn, không có cơ chế tự xóa bản cũ).
- Đăng nhập mà mất mạng → sao lưu lỗi → **không xóa được** (cố ý: an toàn hơn tiện).

## Nghiệm thu

Harness PASS; Chromium: tạo 3 bookmark → 🗑 → nút khóa tới khi gõ `xoa` → xóa → danh sách sao lưu +1 (`before-delete_…`),
cây Chrome trống, dòng báo "Đã xóa 3 bookmark…" → khôi phục bản đó → đủ 3.
