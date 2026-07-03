# SPEC C3+C4+C6+C7 — Sync/delete hardening (một PR)

> **Đối chiếu source (2026-07-03):** line numbers verify trên tree hiện tại (đã có fix C1/C2/C5).
>
> **Failing test:** `specs/C3-C4-C6-C7-sync-hardening.test.mjs`
>
> **C4 đã ship riêng:** `specs/C4-localfirst-delete-resurrect.spec.md` + test — C4a/C4b trong
> batch test sẽ PASS sau khi C4 merged.
>
> **Phụ thuộc đã ship:** C1 merge-guard (làm C5 poison-pill dễ gặp — đã fix), C2 queue
> `expiresAt` (C3 offline-delete dựa vào entry queue còn sống khi commit throw).

---

## C3 — Authenticated + offline: delete tự hồi sinh sau undo window 🔴 HIGH

### Root cause

`deleteNote` / `deleteEvent` commit catch **restore snapshot cho mọi lỗi**, kể cả network
(`notes.ts:492-508`, `calendarEvents.ts:210-220`). Offline + authenticated → `notesService.delete`
gọi Supabase → `Failed to fetch` → item quay lại UI; user đóng popup trước khi thấy → tưởng đã xóa.

### Nguyên tắc fix

Reuse `isNetworkError` (`utils/networkErrors.ts`) — pattern đã có ở update/create catch trong cùng
2 store (`notes.ts:274`, `calendarEvents.ts:165`).

**Network error khi commit delete:**
1. **KHÔNG** restore snapshot (UI giữ trạng thái đã xóa).
2. **Throw lại** error → `undoToast.commit()` (`undoToast.ts:55-56`) không chạy tới
   `unregisterPendingDeleteCommit` → entry queue từ `schedule()` (`undoToast.ts:78`) **vẫn còn**
   → `flushOrphanedPendingDeleteCommits` retry khi online (force mount / respect-expiry orphan).

**Lỗi thật (RLS, 4xx không phải network):** giữ restore hiện tại.

### Thay đổi 1/2 — `src/stores/notes.ts` commit trong `deleteNote`

Hiện tại (verbatim, `:492-508`):

```ts
      commit: async () => {
        try {
          await notesService.delete(id)
        } catch (e) {
          restoreNoteSnapshot(note, noteIndex, noteBodies)
          ...
          loadError.value = e instanceof Error ? e.message : 'Delete note failed'
          await persistCache()
          return
        }
```

Diff:

```diff
       commit: async () => {
         try {
           await notesService.delete(id)
         } catch (e) {
+          if (isNetworkError(e)) {
+            loadError.value = e instanceof Error ? e.message : 'Delete note failed'
+            throw e
+          }
           restoreNoteSnapshot(note, noteIndex, noteBodies)
           ...
```

(`isNetworkError` đã import tại `notes.ts:15`.)

### Thay đổi 2/2 — `src/stores/calendarEvents.ts` commit trong `deleteEvent`

Mirror diff tại `:210-220` (import `isNetworkError` đã có `:14`).

### KHÔNG đổi

- KHÔNG sửa `undoToast.ts` (throw từ commit đủ để skip unregister).
- KHÔNG restore khi network error.
- Undo path (`undo:` callback) giữ nguyên.

---

## C4 — LocalFirst không dọn khi delete authenticated → resurrect 🔴 HIGH

### Root cause

`notes.service.ts:69-73` và `calendarEvents.service.ts:99-103`: nhánh authenticated chỉ
`supabase.delete`, **return sớm** không gọi `localNotesService.delete` /
`localCalendarEventsService.delete`. Entry trong `bbqone_local_*` sống sót → `pushLocalToCloud`
upsert lại → event/note "hồi sinh".

### Thay đổi 1/2 — `src/services/notes.service.ts`

```diff
   async delete(id: string): Promise<void> {
     if (await isAuthenticated()) {
       const { error } = await supabase.from('notes').delete().eq('id', id)
       if (error) throw error
+      await localNotesService.delete(id)
       return
     }
     await localNotesService.delete(id)
   },
```

### Thay đổi 2/2 — `src/services/calendarEvents.service.ts`

```diff
   async delete(id: string): Promise<void> {
     if (await isAuthenticated()) {
       const { error } = await supabase.from('calendar_events').delete().eq('id', id)
       if (error) throw error
+      await localCalendarEventsService.delete(id)
       return
     }
     await localCalendarEventsService.delete(id)
   },
```

Local delete là filter no-op nếu id không có — an toàn khi row chỉ tồn tại trên cloud.

### KHÔNG đổi

- KHÔNG đụng `syncEngine`, stores, undo flow.
- Anonymous branch giữ nguyên.

---

## C6 — clearAllLocal() xóa entry tạo mid-push 🟡 MEDIUM

### Root cause

`pushLocalToCloud` happy path (`syncEngine.service.ts:205-207`) gọi `clearAllLocal()` xóa **cả
key**. Push chạy tuần tự qua mạng (vài giây); entry mới ghi vào LocalFirst trong lúc đó chưa push
nhưng bị xóa theo. Nhánh partial-error đã dùng `_clearSyncedEntries` (`:210-216`) — đúng.

### Thay đổi — `src/services/localFirst/syncEngine.service.ts`

```diff
   // 6. Cleanup
   if (result.errors.length === 0) {
-    // Tất cả thành công → clear toàn bộ local data
-    await localStore.clearAllLocal()
+    // Chỉ xóa entry đã push thành công — entry mới ghi mid-push vẫn còn để retry
+    await _clearSyncedEntries(
+      syncedFolderIds,
+      syncedNoteIds,
+      syncedBodyIds,
+      syncedBookmarkIds,
+      syncedCalendarIds,
+    )
   } else {
```

Nhánh `strategy === 'use-cloud'` (`:53-56`) vẫn `clearAllLocal()` — đúng semantics "bỏ local".

### KHÔNG đổi

- KHÔNG export `_clearSyncedEntries`.
- Loop push per-entity try/catch giữ nguyên.

---

## C7 — Overdue reminder miss khi auth chậm / cache stale 🟡 MEDIUM

### Root cause

`pages/App.vue:177-185`: `void refreshStoresFromNetwork()` fire-and-forget; `maybeShowOverdueReminder()`
chạy ngay sau trên cache hydrate (có thể rỗng/cũ). `auth.init()` timeout 1.5s
(`router/index.ts:9`) → mount với `isAuthenticated=false` → skip reminder; init xong sau không
re-check.

### Thay đổi — `src/pages/App.vue`

**1. Gọi reminder SAU refresh hoàn tất (thay check đồng bộ lúc mount):**

```diff
     dataReady.value = true
-    void refreshStoresFromNetwork()
+    void refreshStoresFromNetwork().then(() => maybeShowOverdueReminder())
     stopAutoSyncListener = initAutoSyncOnNetworkRestore()
     ...
-    if (isAuthenticated.value) {
-      void maybeShowOverdueReminder()
-    }
```

**2. Re-check khi auth init xong sau mount:**

```diff
   watch(utcOffsetHours, () => {
     tickHeaderClock()
   })
+
+  watch(isAuthenticated, (authed) => {
+    if (authed) void maybeShowOverdueReminder()
+  })
```

`maybeShowOverdueReminder()` (`:269-274`) đã guard `dataReady`, `isAuthenticated`, dismiss,
duplicate — không cần thêm logic.

`onLoginSuccess` (`:219`) đã gọi `maybeShowOverdueReminder()` — giữ nguyên.

### KHÔNG đổi

- KHÔNG mở reminder cho anonymous (audit S2 — design).
- KHÔNG đụng `calendarOverdueReminder.service.ts`.

---

## PHẦN B — FAILING TEST

File: `specs/C3-C4-C6-C7-sync-hardening.test.mjs`

| Case | Bug | RED trên code hiện tại |
|------|-----|------------------------|
| **C3a** | static | `notes.ts` commit delete không có `isNetworkError` trước restore |
| **C3b** | static | `calendarEvents.ts` tương tự |
| **C4a** | behavior | `notesService.delete` authenticated không gọi local delete |
| **C4b** | behavior | `calendarEventsService.delete` tương tự |
| **C6** | behavior | happy-path push gọi `clearAllLocal` thay vì selective clear |
| **C7a** | static | mount không chain `maybeShowOverdueReminder` sau refresh |
| **C7b** | static | thiếu `watch(isAuthenticated` → `maybeShowOverdueReminder` |

## PHẦN C — RED→GREEN CRITERIA

Toàn bộ case PASS khi 4 fix trên được áp đúng diff. Chạy regression:

```
node specs/C3-C4-C6-C7-sync-hardening.test.mjs
node specs/C1-pull-overwrite.test.mjs
node specs/C2-undo-flush-race.test.mjs
node specs/C5-poison-pill.test.mjs
```
