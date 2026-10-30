# T1 + T2 — Thư viện sạch cho 2.1.2: Tiptap 3 + vite 6 (SEC-1 phần 2)

> **Failing test:** `specs/T1-tiptap-v3.test.mjs`.
> **Nguồn:** `specs/ROADMAP-SEC.md` mục 3 (T1, T2) — đã chạy thử trên bản sao 2026-10-29 (audit 0, build OK, Chromium OK).
> **Sir (2026-10-30):** "Nhờ chuyên gia hỗ trợ giúp phần security còn dang dở" → làm đợt 2.1.2.

## Vì sao

- Tiptap 2.27.3: 24 cảnh báo **vừa** (`mergeAttributes` + `__proto__`, GHSA-cp6q-959q-f8rh) — chỉ vá ở Tiptap 3.
- vite 5.4.21 / esbuild 0.21.5: lỗ hổng **máy chủ dev** (`npm run dev`) — vite ≤ 6.4.3 cao, esbuild ≤ 0.24.2 vừa.
- Sau mục này: `npm audit` = **0** (cả bản đóng gói lẫn công cụ build).

## PHẦN A — Gói

```bash
npm uninstall @tiptap/starter-kit @tiptap/vue-3
```
```bash
npm install @tiptap/starter-kit@^3.32.1 @tiptap/vue-3@^3.32.1 @tiptap/core@^3.32.1 @tiptap/pm@^3.32.1
```
```bash
npm install -D vite@^6.4.5
```

Gỡ trước (cài đè thẳng → `ERESOLVE`). Khai thẳng `@tiptap/core` + `@tiptap/pm` vì code import trực tiếp
(`noteHtmlSanitize.ts`, `NoteEditor.vue`). Mọi `@tiptap/*` trong lock **cùng một bản** (SEC1.2).

## PHẦN B — Code

1. `src/components/notes/NoteEditor.vue` (`applyBody`, ~dòng 124 và 132) — Tiptap 3 đổi tham số 2 thành object:
   ```ts
   ed.commands.setContent('<p></p>', { emitUpdate: false })
   ed.commands.setContent(content || '<p></p>', { emitUpdate: false })
   ```
   **Bắt buộc `emitUpdate: false`** — mặc định 3.x là phát update → mở ghi chú nào cũng bị coi là sửa → tự lưu + đồng bộ thừa.
2. `src/utils/noteEditorExtensions.ts` — trong `StarterKit.configure({ … })`:
   ```ts
   // Tiptap 3: StarterKit thêm sẵn link / underline / trailingNode — tắt để schema giữ y như 2.x.
   link: false,
   underline: false,
   trailingNode: false,
   ```
   Bảo mật: bật `link` thì `<a href>` từ dán / đồng bộ / file sao lưu **sống sót qua bộ lọc B1** (`noteHtmlSanitize.ts`
   dùng chung schema). `trailingNode` tắt để mở ghi chú kết thúc bằng khối code **không** tự thêm đoạn trống → không tự lưu.
3. Bỏ import gói không khai (`prosemirror-*`) → `@tiptap/pm/*` (cùng một bản ProseMirror với Tiptap; hai bản →
   `instanceof` sai → dán lỗi âm thầm):
   - `src/components/notes/NoteEditor.vue:17` → `import type { EditorView } from '@tiptap/pm/view'`
   - `src/utils/pastePlainText.ts:1` → `import { DOMParser as PMDOMParser } from '@tiptap/pm/model'`
   - `src/utils/pastePlainText.ts:2` → `import type { EditorView } from '@tiptap/pm/view'`

## PHẦN C — Test (`specs/T1-tiptap-v3.test.mjs`)

| Ca | Kiểm | Trước (2.x) |
|---|---|---|
| T1.1 | `package.json` 4 gói `^3.32.1`; mọi `@tiptap/*` trong lock cùng bản ≥ 3.32.1 | FAIL |
| T1.2 | `getSchema(noteEditorExtensions())` (gói thật + TS transpile): nodes `blockquote, bulletList, codeBlock, doc, hardBreak, heading, horizontalRule, listItem, orderedList, paragraph, text`; marks `bold, code, italic, strike` — **đúng bằng** | PASS (chốt chặn: sau nâng cấp mà quên tắt `link` / `underline` → FAIL) |
| T1.3 | Không còn `setContent(…, false)` / `clearContent(false)` trong `src/`; NoteEditor có ≥ 2 `setContent(…, { emitUpdate: false })` | FAIL |
| T1.4 | Không `from 'prosemirror-…'` trong `src/`; `pastePlainText.ts` + `NoteEditor.vue` dùng `@tiptap/pm/*` | FAIL |
| T1.5 | Không quy tắc `parseDOM` nào của schema nhận `<a> <u> <img> <iframe> <script> <style> <form> <svg>…` → bộ lọc B1 bỏ chúng (kiểm thật trên Chromium: PoC hồi quy) | PASS (chốt chặn) |
| T1.6 | `devDependencies.vite = ^6.4.5`; lock vite ≥ 6.4.4 và < 7; esbuild ≥ 0.25.0 | FAIL |

## Đổi assertion có chủ đích

- `SEC1.1` (`specs/SEC1-hardening-2.1.1.test.mjs`): `markdown-it` / `linkify-it` **không còn trong lock** (Tiptap 3 bỏ) =
  đạt; còn thì vẫn phải ≥ bản vá.

## KHÔNG được đổi

- HTML ghi chú đã lưu (định dạng giữ nguyên → revert commit là về 2.x an toàn, dữ liệu hai chiều đọc được).
- `noteHtmlSanitize.ts`, `parseBackup`, CSP, quyền manifest.
- Không nhảy vite 7 / 8, không đổi `@crxjs/vite-plugin` / `@vitejs/plugin-vue` (đều nhận vite 6).

## FLAG liên đới

- Ctrl+Z ngay sau khi gõ ```` ``` ```` + cách: 3.x trả lại chữ ```` ``` ```` (hoàn tác quy tắc gõ tắt), 2.x xóa luôn khối.
  Chấp nhận (đúng chuẩn ProseMirror).
- Bundle +~93 KB (+3,5 %): thêm `@floating-ui/*` (peer của `@tiptap/vue-3`), bỏ `@popperjs/core`, `markdown-it`, `linkify-it`.
- `npm run dev` (HMR crxjs trên vite 6) chưa chạy thử — Sir chạy một lần.

## Nghiệm thu

`node specs/T1-tiptap-v3.test.mjs` PASS; mọi harness khác PASS; `vue-tsc` sạch; `npm audit` 0; build OK; PoC hồi quy
(`specs/REDTEAM-PROFILE.md`) in "✅ Không thấy dấu hiệu khai thác". Kiểm tay: mở ghi chú cũ có code, gõ, Ctrl+B, danh sách,
khối code, Ctrl+Z / Ctrl+Shift+Z, dán từ web (có ảnh → chỉ còn chữ), dán code từ VS Code (giữ thụt lề), thư mục bảo mật.
