# SPEC N10+N12+N13 — Autosave nuốt lỗi khi note bị xóa từ máy khác, draft chết vì clock skew, offscreen clipboard race

> **Đối chiếu source (2026-07-13, branch `main`, tree sạch, v1.3.1).**
> **Failing test đi kèm:** `specs/N10-N12-N13-edit-safety.test.mjs`.
>
> **Điều kiện tiên quyết:** N13 dùng `src/utils/webLock.ts` (tạo ở spec N4-N5-N11 hoặc N6-N7).
> Nếu chưa có, xem nội dung file trong `specs/N6-N7-sw-lifecycle-sync.spec.md` Thay đổi 1.

---

## PHẦN A — SPEC

### Root cause (mỗi bug 1 câu)

- **N10:** máy B xóa note X trên server trong khi máy A đang gõ X → mỗi debounce-save 2s
  (`NoteEditor.vue:92-101`) `await notesStore.updateBody(...)` **không có try/catch** → RPC
  NOT FOUND → BBQ_CONFLICT → refetch `.single()` lỗi PGRST116 → `updateBody` rethrow
  (`notes.ts:339-340`) → **unhandled rejection lặp mỗi 2s** — user gõ tiếp tưởng đang lưu,
  không toast, không error, draft bị `clearNoteDraft()`… may là chưa chạy vì updateBody throw
  trước — nhưng cũng không ai báo.
- **N12:** `shouldApplyDraft` so `draft.at` (**đồng hồ client**) với `body.updated_at`
  (**đồng hồ server**, sau C9.1 là timestamp server nguyên văn) — máy lệch −5 phút là draft
  C8.1 bị `clearNoteDraft()` vứt im lặng đúng ca nó sinh ra để cứu (`noteDraft.service.ts:58`).
- **N13:** 2 lệnh copy đồng thời: cả hai qua `getContexts → createDocument → sendMessage →
  closeDocument` không có khóa (`background.ts:143-160`) → "Only a single offscreen document
  may be created" hoặc close của lệnh A giết document trước khi lệnh B kịp sendMessage →
  copy fail ngẫu nhiên.

### Thay đổi N10.1 — `src/utils/syncConflict.ts`: thêm 1 helper detect

Đặt cạnh `isSyncConflictError` (cùng file):

```ts
/** PostgREST .single() trên row không tồn tại — note/body đã bị xóa trên server (máy khác). */
export function isRowMissingOnServerError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  if (code === 'PGRST116') return true
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return /0 rows|no rows|multiple \(or no\) rows/i.test(msg)
}
```

### Thay đổi N10.2 — `src/components/notes/NoteEditor.vue`: catch quanh CẢ 3 đường save

**(a) `scheduleSave`** — hiện tại (verbatim, `NoteEditor.vue:89-102`):

```ts
function scheduleSave(): void {
  cancelScheduledSave()
  const runBodyId = notesStore.activeBodyId
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (!runBodyId || notesStore.activeBodyId !== runBodyId) return
    const ed = editor.value
    if (!ed) return
    await notesStore.updateBody(runBodyId, {
      content: ed.getHTML(),
    })
    void clearNoteDraft()
  }, 2000)
}
```

Thay bằng:

```ts
function scheduleSave(): void {
  cancelScheduledSave()
  const runBodyId = notesStore.activeBodyId
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (!runBodyId || notesStore.activeBodyId !== runBodyId) return
    const ed = editor.value
    if (!ed) return
    try {
      await notesStore.updateBody(runBodyId, {
        content: ed.getHTML(),
      })
      void clearNoteDraft()
    } catch (e) {
      // N10: KHÔNG clearNoteDraft — keystroke còn trong draft. Báo lỗi thay vì chết câm mỗi 2s.
      console.warn('[BBQOne] Autosave failed:', e)
      notesStore.setDirty(true)
      notesStore.loadError = isRowMissingOnServerError(e)
        ? 'Note was deleted on another device — your latest text is kept in the draft.'
        : e instanceof Error
          ? e.message
          : 'Autosave failed'
    }
  }, 2000)
}
```

**(b) `flushSave`** — hiện tại (verbatim, `NoteEditor.vue:196-205`):

```ts
async function flushSave(): Promise<void> {
  cancelScheduledSave()
  const id = notesStore.activeBodyId
  const ed = editor.value
  if (!id || !ed || !notesStore.isDirty) return
  await notesStore.updateBody(id, {
    content: ed.getHTML(),
  })
  void clearNoteDraft()
}
```

Bọc phần `await updateBody … clearNoteDraft` trong `try/catch` với ĐÚNG khối catch như (a)
(caller `void flushSave()` tại `NoteEditor.vue:208` và `pages/App.vue:174` đều fire-and-forget
— catch bên trong là bắt buộc, KHÔNG rethrow).

**(c) watch đổi body** — hiện tại (verbatim, `NoteEditor.vue:177-194`, đoạn giữa):

```ts
    if (oldId && ed && notesStore.isDirty) {
      await notesStore.updateBody(oldId, {
        content: ed.getHTML(),
      })
      void clearNoteDraft()
    }
```

Bọc `try/catch` cùng khối catch như (a) (lỗi save body cũ không được chặn việc mở body mới —
sau catch vẫn tiếp tục `applyBody`).

Import bổ sung cho NoteEditor.vue: `import { isRowMissingOnServerError } from '@/utils/syncConflict'`
(file đã import `clearNoteDraft, saveNoteDraft` từ noteDraft.service — giữ nguyên).

Ghi chú: `notesStore.loadError` là `ref<string | null>` sẵn có (`notes.ts:32`), UI đã render nó
qua `loadErrorLine` (`pages/App.vue:129-136`) — không cần UI mới.

### Thay đổi N12.1 — `src/services/noteDraft.service.ts`: baseline thay vì so đồng hồ chéo

**(a) Interface + validate** — hiện tại (verbatim, `noteDraft.service.ts:3-20`):

```ts
export interface NoteEditorDraft {
  bodyId: string
  noteId: string
  content: string
  /** ISO — thời điểm keystroke cuối (client clock, ms). */
  at: string
}
```

Diff:

```diff
 export interface NoteEditorDraft {
   bodyId: string
   noteId: string
   content: string
   /** ISO — thời điểm keystroke cuối (client clock, ms). */
   at: string
+  /**
+   * N12: updated_at của body TẠI THỜI ĐIỂM gõ (timestamp server từ cache).
+   * Baseline khớp = body chưa đổi từ lúc gõ → draft chắc chắn mới hơn, miễn nhiễm clock skew.
+   * Optional để draft legacy (bản cũ) vẫn đọc được.
+   */
+  baselineUpdatedAt?: string
 }
```

`isValidDraft` (`:11-20`): thêm điều kiện cuối
`&& (d.baselineUpdatedAt === undefined || typeof d.baselineUpdatedAt === 'string')`.

**(b) `shouldApplyDraft`** — hiện tại (verbatim, `noteDraft.service.ts:53-59`):

```ts
export function shouldApplyDraft(
  draft: NoteEditorDraft,
  body: { id: string; updated_at: string } | null | undefined,
): boolean {
  if (!body || body.id !== draft.bodyId) return false
  return new Date(draft.at).getTime() > new Date(body.updated_at).getTime()
}
```

Thay bằng:

```ts
export function shouldApplyDraft(
  draft: NoteEditorDraft,
  body: { id: string; updated_at: string } | null | undefined,
): boolean {
  if (!body || body.id !== draft.bodyId) return false
  // N12: body chưa đổi từ lúc gõ draft → draft là bản mới nhất, bất kể đồng hồ client lệch bao nhiêu.
  if (draft.baselineUpdatedAt && draft.baselineUpdatedAt === body.updated_at) return true
  // Body đã đổi (save khác / máy khác thắng) hoặc draft legacy → heuristic thời gian như cũ.
  return new Date(draft.at).getTime() > new Date(body.updated_at).getTime()
}
```

### Thay đổi N12.2 — `src/components/notes/NoteEditor.vue` `scheduleDraftWrite`

Hiện tại (verbatim, `NoteEditor.vue:72-87`):

```ts
function scheduleDraftWrite(): void {
  if (draftTimer !== null) return
  draftTimer = setTimeout(() => {
    draftTimer = null
    const id = notesStore.activeBodyId
    const ed = editor.value
    if (!id || !ed || !notesStore.isDirty) return
    if (isSecureActiveNote()) return
    void saveNoteDraft({
      bodyId: id,
      noteId: notesStore.activeNoteId ?? '',
      content: ed.getHTML(),
      at: new Date().toISOString(),
    })
  }, 300)
}
```

Diff:

```diff
     void saveNoteDraft({
       bodyId: id,
       noteId: notesStore.activeNoteId ?? '',
       content: ed.getHTML(),
       at: new Date().toISOString(),
+      baselineUpdatedAt: notesStore.activeBody?.updated_at,
     })
```

(`notesStore.activeBody` là computed sẵn có, `notes.ts:42-45`, luôn khớp `activeBodyId`.)

### Thay đổi N13.1 — `src/utils/webLock.ts`: thêm const

```ts
/** N13: serialize luồng copy qua offscreen document (create → sendMessage → close). */
export const OFFSCREEN_CLIPBOARD_LOCK = 'bbqone-offscreen-clipboard'
```

### Thay đổi N13.2 — `src/background.ts`: bọc luồng offscreen trong lock

Hiện tại (verbatim, `background.ts:140-162`, bên trong message handler):

```ts
      const { text } = msg.payload
      const offscreenUrl = chrome.runtime.getURL('offscreen.html')

      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
        documentUrls: [offscreenUrl],
      })
      if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
          url: offscreenUrl,
          reasons: ['CLIPBOARD' as chrome.offscreen.Reason],
          justification: 'Write text to OS clipboard from extension popup.',
        })
      }

      const result = (await chrome.runtime.sendMessage({
        type: 'offscreen-copy',
        text,
      })) as { ok: boolean; error?: string }

      void chrome.offscreen.closeDocument().catch(() => {})

      sendResponse(result)
```

Thay bằng (bọc từ getContexts tới closeDocument; sendResponse nằm NGOÀI lock):

```ts
      const { text } = msg.payload
      const offscreenUrl = chrome.runtime.getURL('offscreen.html')

      const result = await withWebLock(OFFSCREEN_CLIPBOARD_LOCK, async () => {
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
          documentUrls: [offscreenUrl],
        })
        if (existingContexts.length === 0) {
          await chrome.offscreen.createDocument({
            url: offscreenUrl,
            reasons: ['CLIPBOARD' as chrome.offscreen.Reason],
            justification: 'Write text to OS clipboard from extension popup.',
          })
        }
        const r = (await chrome.runtime.sendMessage({
          type: 'offscreen-copy',
          text,
        })) as { ok: boolean; error?: string }
        await chrome.offscreen.closeDocument().catch(() => {})
        return r
      })

      sendResponse(result)
```

Import bổ sung cho background.ts:

```ts
import { OFFSCREEN_CLIPBOARD_LOCK, withWebLock } from '@/utils/webLock'
```

### Edge case BẮT BUỘC giữ

1. **N10:** lỗi conflict "bình thường" (row còn tồn tại) vẫn đi qua retry-once C9.1 bên trong
   service — catch mới chỉ nhận những gì service ĐÃ bó tay; KHÔNG đổi flow trong
   `notes.ts`/`noteBodies.service.ts`.
2. **N10:** trong catch KHÔNG `clearNoteDraft()` — draft là nơi duy nhất giữ keystroke khi save
   chết.
3. **N12:** draft legacy (không có `baselineUpdatedAt`) → fallback so thời gian như cũ; test
   C8.1 hiện hành phải vẫn xanh (nó chỉ assert fallback + shape cơ bản).
4. **N12:** `baselineUpdatedAt` chỉ được lấy từ `notesStore.activeBody.updated_at` (bản cache) —
   KHÔNG gọi mạng trong đường draft 300ms.
5. **N13:** `closeDocument` vẫn được gọi sau MỖI copy (không giữ document sống) — chỉ thêm
   serialize, không đổi lifecycle.

### KHÔNG được đổi (chặn over-reach)

- KHÔNG đụng `notes.ts` `updateBody` (rethrow semantics giữ nguyên — C8/C9 phụ thuộc).
- KHÔNG đụng `maybeRestoreNoteDraft` (`pages/App.vue:316-330`) — logic hiện tại đúng sau khi
  `shouldApplyDraft` được sửa.
- KHÔNG thêm i18n key mới (message tiếng Anh cố định — i18n hóa là follow-up riêng nếu muốn).
- KHÔNG đổi throttle 300ms draft / debounce 2000ms save.
- KHÔNG đụng `offscreen.ts`.

### ⚠ FLAG liên đới

- **Residual N12:** chiều ngược (client NHANH 5 phút) khi body ĐÃ đổi từ máy khác — fallback
  thời gian vẫn có thể áp draft cũ đè (hành vi y như trước fix, không tệ hơn); C9.1 retry +
  conflict stash đỡ phía server. Chấp nhận.
- **N10 nâng cấp sau (ngoài scope):** tự động "hồi sinh" note bị xóa từ máy khác bằng cách
  chuyển row sang `bbqone_local_*` để pushLocalToCloud re-insert — cần quyết định UX, đừng làm
  trong PR này.
- N13 phụ thuộc `webLock.ts` — nếu Sonnet làm spec này TRƯỚC N4/N6, tạo file theo nội dung
  trong `specs/N6-N7-sw-lifecycle-sync.spec.md` Thay đổi 1 rồi thêm const N13.1.

---

## PHẦN B — FAILING TEST

File: `specs/N10-N12-N13-edit-safety.test.mjs`.

- **T-N12 (behavior, CODE THẬT `noteDraft.service.ts`):**
  - **Case chính (RED):** client chậm 5 phút — `body.updated_at = 10:05:00Z` (server),
    `draft.at = 10:00:30Z` (client), `baselineUpdatedAt = 10:05:00Z` (= body chưa đổi từ lúc
    gõ) → `shouldApplyDraft` PHẢI true. Code hiện tại bỏ qua baseline → false → **30 giây
    keystroke cuối bị vứt im lặng**.
  - Case pin: legacy draft (không baseline) + draft.at mới hơn → true; body đã đổi + draft.at
    cũ hơn → false (giữ fallback).
  - Roundtrip save/read giữ nguyên `baselineUpdatedAt` (mock `chrome.storage.session`).
- **T-N10 (behavior, CODE THẬT `syncConflict.ts`):** `isRowMissingOnServerError` — code
  PGRST116 → true; message "multiple (or no) rows returned" → true; SyncConflictError thường /
  network error → false. RED: export chưa tồn tại.
- **W-N10:** trong `NoteEditor.vue`, MỌI `await notesStore.updateBody(` đều nằm trong `try`
  (3 chỗ: scheduleSave, flushSave, watch), file có `isRowMissingOnServerError` và KHÔNG có
  `clearNoteDraft()` trong bất kỳ khối catch nào.
- **W-N12:** `scheduleDraftWrite` có `baselineUpdatedAt:`.
- **W-N13:** `background.ts` có `withWebLock(OFFSCREEN_CLIPBOARD_LOCK` bọc đoạn offscreen;
  `webLock.ts` export `OFFSCREEN_CLIPBOARD_LOCK`.
- In timeline `t=` minh họa vòng chết N10 (mỗi 2s một unhandled rejection).

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: `shouldApplyDraft` ưu tiên baseline-match trước heuristic
thời gian (draft có `baselineUpdatedAt` do `scheduleDraftWrite` ghi), `isRowMissingOnServerError`
tồn tại đúng ngữ nghĩa và cả 3 đường save của NoteEditor catch lỗi (báo qua `loadError`, giữ
dirty, KHÔNG xóa draft), và luồng offscreen copy được serialize bằng OFFSCREEN_CLIPBOARD_LOCK.
