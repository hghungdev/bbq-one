# SPEC C8 — Mất keystroke cuối khi popup đóng (debounce 2s chưa flush)

> **Failing test:** `specs/C8-noteeditor-pagehide-flush.test.mjs`

---

## PHẦN A — SPEC

### Root cause

`NoteEditor.vue:58-69` debounce save 2000ms. `onBeforeUnmount` (`:216-227`) flush khi dirty — **không chạy**
khi MV3 popup bị kill ngay khi mất focus. Không có `pagehide` / `visibilitychange`.

### Fix — `src/components/notes/NoteEditor.vue`

Reuse pattern `useCommitPendingDeletesOnClose.ts:34-37`. Sau `flushSave()` (`:162-170`), thêm:

```ts
function onPopupHideFlush(): void {
  void flushSave()
}

function onVisibilityChangeFlush(): void {
  if (document.visibilityState === 'hidden') onPopupHideFlush()
}

onMounted(() => {
  window.addEventListener('pagehide', onPopupHideFlush)
  document.addEventListener('visibilitychange', onVisibilityChangeFlush)
})
```

Gộp cleanup vào `onBeforeUnmount` hiện có:

```diff
 onBeforeUnmount(() => {
+  window.removeEventListener('pagehide', onPopupHideFlush)
+  document.removeEventListener('visibilitychange', onVisibilityChangeFlush)
   cancelScheduledSave()
   ...
```

Import: thêm `onMounted` vào import vue.

### KHÔNG đổi

- Debounce 2000ms, `flushSave` logic, Ctrl+S tại `App.vue:159`.
- Không đụng `useCommitPendingDeletesOnClose`.

## PHẦN B — TEST

Static: `NoteEditor.vue` có `pagehide` + `visibilitychange` gọi `flushSave`.

## PHẦN C — GREEN

Test PASS khi listeners mount/unmount đúng pattern trên.
