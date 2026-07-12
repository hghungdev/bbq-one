# SPEC N4+N5+N11 — Multi-context (popup + dashboard-tab + SW): force-flush giết undo window, persistCache đè chéo, queue race

> **Đối chiếu source (2026-07-13, branch `main`, tree sạch, v1.3.1).**
> **Failing test đi kèm:** `specs/N4-N5-N11-multi-context.test.mjs`.
>
> **Điều kiện tiên quyết:** áp dụng SAU `specs/N1-storage-quota.spec.md` (N5 sửa tiếp
> `persistCache` mà N1 đã đổi sang `safeCacheWrite`). Nếu N1 chưa merge, vẫn áp được nhưng
> giữ nguyên phần `chrome.storage.local.set`/`safeCacheWrite` hiện có của persistCache.

## Bối cảnh chung (đọc trước)

App có thể chạy **nhiều UI context đồng thời**: popup + dashboard mở như tab (router có
`/dashboard`, extension page mở tab được) + service worker. Mỗi context là 1 Pinia instance
độc lập, chung 1 `chrome.storage.local`. Ba bug:

- **N4:** flush pending-delete mode `'force'` từ context này giết undo window ĐANG SỐNG của
  context khác → Undo "thành công" trên UI nhưng server đã xóa → mất vĩnh viễn (đúng cơ chế C2
  tái xuất qua đường multi-context).
- **N5:** `persistCache()` ghi đè **toàn mảng** cache bằng snapshot in-memory của riêng context
  đó → offline edit của context kia bị đè mất.
- **N11:** read-modify-write trên queue `bbqone_pending_delete_commits` không atomic — cửa sổ
  race = độ trễ network của flush (hàng trăm ms) → entry đăng ký giữa lúc flush bị nuốt →
  note "đã xóa" hồi sinh sau pull.

---

## N4 — mọi flush đều `'respect-expiry'` + alarm dọn orphan + ẩn row đang chờ xóa khỏi pull

### Root cause (1 câu)

C2 chỉ đổi top-level SW sang `'respect-expiry'`; popup mount (`pages/App.vue:184`) và message
handler (`background.ts:131-132`) vẫn flush `'force'` với giả định "popup cũ đã chết" — sai khi
dashboard mở như tab (undo window của tab vẫn sống).

> **Ghi chú supersede:** spec C2 (`specs/C2-undo-flush-race.spec.md`) từng quy định 2 call site
> này "KHÔNG ĐỔI" — quyết định đó đúng trong mô hình 1-context, nay được N4 **thay thế**.
> Test C2 hiện hành vẫn xanh vì case A4 của nó chỉ pin *default mode* của hàm
> (`flushOrphanedPendingDeleteCommits()` không tham số = force) — default **không đổi**, chỉ
> đổi cách các call site gọi.

### Thay đổi N4.1 — `src/services/pendingDeleteCommit.service.ts`: thêm 2 export

Đặt sau `flushOrphanedPendingDeleteCommits` (`:127-149`). `readQueue`,
`parseUndoDeleteActionId`, `FLUSH_EXPIRY_GRACE_MS` (`:19`) đã có sẵn trong file:

```ts
export const PENDING_DELETE_FLUSH_ALARM = 'bbqone-pending-delete-flush'

/**
 * Entry chưa hết hạn (undo window có thể còn sống ở context khác) —
 * dùng để ẩn row khỏi kết quả pull, tránh "hồi sinh" row đang chờ xóa.
 */
export async function listUnexpiredPendingDeletes(): Promise<
  Array<{ kind: PendingDeleteKind; entityId: string }>
> {
  const queue = await readQueue()
  const now = Date.now()
  return queue
    .filter((e) => now < e.expiresAt + FLUSH_EXPIRY_GRACE_MS)
    .map((e) => parseUndoDeleteActionId(e.id))
    .filter((p): p is { kind: PendingDeleteKind; entityId: string } => p !== null)
}

/**
 * Sau flush respect-expiry còn entry chưa hết hạn → đặt alarm để SW tự dọn sau khi
 * hết hạn (SW timer chết theo SW — chrome.alarms sống qua SW kill).
 */
export async function scheduleOrphanExpiryAlarm(): Promise<void> {
  const queue = await readQueue()
  if (queue.length === 0) return
  const maxExpiry = Math.max(...queue.map((e) => e.expiresAt))
  // MV3 clamp alarm dưới ~30s → floor 30s; orphan bị commit trễ tối đa ~30s là chấp nhận được.
  const when = Math.max(Date.now() + 30_000, maxExpiry + FLUSH_EXPIRY_GRACE_MS)
  chrome.alarms.create(PENDING_DELETE_FLUSH_ALARM, { when })
}
```

### Thay đổi N4.2 — `src/background.ts` (3 chỗ)

**(a)** Top-level (verbatim hiện tại, `background.ts:107`):

```ts
void flushOrphanedPendingDeleteCommits('respect-expiry')
```

→

```ts
void flushOrphanedPendingDeleteCommits('respect-expiry').then(scheduleOrphanExpiryAlarm)
```

**(b)** Alarm listener (verbatim hiện tại, `background.ts:109-112`):

```ts
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return
  void syncService.syncFromCache()
})
```

→

```ts
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PENDING_DELETE_FLUSH_ALARM) {
    void flushOrphanedPendingDeleteCommits('respect-expiry').then(scheduleOrphanExpiryAlarm)
    return
  }
  if (alarm.name !== ALARM_NAME) return
  void syncService.syncFromCache()
})
```

**(c)** Message handler (verbatim hiện tại, `background.ts:131-135`):

```ts
      if (isFlushPendingDeletesMessage(msg)) {
        await flushOrphanedPendingDeleteCommits()
        sendResponse({ ok: true })
        return
      }
```

→

```ts
      if (isFlushPendingDeletesMessage(msg)) {
        await flushOrphanedPendingDeleteCommits('respect-expiry')
        await scheduleOrphanExpiryAlarm()
        sendResponse({ ok: true })
        return
      }
```

Import bổ sung vào block import sẵn có từ `pendingDeleteCommit.service`
(`background.ts:7-10`): thêm `PENDING_DELETE_FLUSH_ALARM`, `scheduleOrphanExpiryAlarm`.

> Vì sao vẫn an toàn khi popup đóng: `useCommitPendingDeletesOnClose.ts:25-28` gọi
> `undoToast.commitAllPending()` — context đóng tự commit + unregister entry CỦA MÌNH ngay;
> message chỉ còn vai trò dọn entry của context đã chết → respect-expiry + alarm là đủ.

### Thay đổi N4.3 — `src/pages/App.vue` (2 chỗ)

**(a)** onMounted (verbatim hiện tại, `pages/App.vue:183-184`):

```ts
    // Chốt xóa còn trong queue trước khi pull server — tránh “revert” sau khi đóng popup giữa undo 5s.
    await flushOrphanedPendingDeleteCommits()
```

→

```ts
    // Chốt xóa ĐÃ HẾT HẠN trước khi pull; entry chưa hết hạn có thể thuộc undo window
    // đang sống ở dashboard-tab khác — không được force (N4).
    await flushOrphanedPendingDeleteCommits('respect-expiry')
```

**(b)** `refreshStoresFromNetwork` (verbatim hiện tại, `pages/App.vue:100-107`):

```ts
  async function refreshStoresFromNetwork(): Promise<void> {
    if (!isOnline()) return
    // Chốt delete còn treo (offline-delete đã hết undo window) trước khi pull — tránh row hiện lại tạm thời.
    await flushOrphanedPendingDeleteCommits('respect-expiry')
    // Push dirty rows + entry local-first LÊN cloud trước, rồi mới pull — tránh pull đè offline edits.
    await runBackgroundAutoSync('pre-pull')
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
  }
```

Diff — thêm bước ẩn row đang chờ xóa SAU khi pull:

```diff
     await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
+    // Row có entry pending-delete chưa hết hạn: server chưa xóa nên pull mang nó về lại —
+    // ẩn khỏi state để không "hồi sinh" trong UI (context sở hữu undo window tự quyết số phận nó).
+    await suppressUnexpiredPendingDeletes()
   }
+
+  async function suppressUnexpiredPendingDeletes(): Promise<void> {
+    const pending = await listUnexpiredPendingDeletes()
+    if (pending.length === 0) return
+    const noteIds = new Set(pending.filter((p) => p.kind === 'note').map((p) => p.entityId))
+    const calendarIds = new Set(
+      pending.filter((p) => p.kind === 'calendar').map((p) => p.entityId),
+    )
+    if (noteIds.size > 0) {
+      notes.notes = notes.notes.filter((n) => !noteIds.has(n.id))
+      notes.bodies = notes.bodies.filter((b) => !noteIds.has(b.note_id))
+    }
+    if (calendarIds.size > 0) {
+      calendarEvents.events = calendarEvents.events.filter((e) => !calendarIds.has(e.id))
+    }
+  }
```

Sửa import sẵn có từ `pendingDeleteCommit.service` trong pages/App.vue: thêm
`listUnexpiredPendingDeletes`.

---

## N5 — persistCache: read-merge-write thay vì ghi đè toàn mảng

### Root cause (1 câu)

`persistCache()` set nguyên key cache bằng snapshot in-memory của riêng context gọi nó
(`notes.ts:103-108`, `calendarEvents.ts:85-87`) và `syncFromCache` của SW set cache bằng merge
với **snapshot đọc từ lúc bắt đầu sync** (`sync.service.ts:239-247`) — mọi edit context khác
ghi vào cache trong khoảng giữa bị đè mất.

### Thay đổi N5.1 — `src/services/sync.service.ts`: thêm pure helper

Đặt ngay SAU `mergeFreshWithDirtyLocal` (`:39-55` — giữ nguyên hàm đó):

```ts
/**
 * Persist read-merge-write (N5): trước khi GHI cache, trộn snapshot in-memory của context
 * này với bản đang nằm trên đĩa (context khác có thể vừa ghi mới hơn):
 * - row đĩa DIRTY và updated_at MỚI HƠN bản của mình → bản đĩa thắng (edit mới hơn của context khác)
 * - row đĩa DIRTY không có trong snapshot của mình → GIỮ (edit offline của context khác;
 *   row sạch không có trong snapshot = mình đã xóa → drop như cũ)
 * - còn lại → snapshot của mình thắng
 */
export function mergeSnapshotWithStored<T extends { id: string; updated_at: string }>(
  snapshot: T[],
  stored: T[],
  isDirty: (row: T) => boolean,
): T[] {
  if (stored.length === 0) return snapshot
  const storedById = new Map(stored.map((r) => [r.id, r]))
  const out = snapshot.map((mine) => {
    const disk = storedById.get(mine.id)
    if (disk && isDirty(disk) && new Date(disk.updated_at) > new Date(mine.updated_at)) {
      return disk
    }
    return mine
  })
  const mineIds = new Set(snapshot.map((r) => r.id))
  for (const disk of stored) {
    if (mineIds.has(disk.id)) continue
    if (isDirty(disk)) out.push(disk)
  }
  return out
}
```

### Thay đổi N5.2 — `src/stores/notes.ts` `persistCache()`

Bản SAU N1 (nếu N1 chưa áp, thay `safeCacheWrite(...)` bằng `chrome.storage.local.set(...)`
tương ứng). Kết quả cuối:

```ts
  async function persistCache(): Promise<void> {
    // N5: đọc-merge-ghi — không đè mất edit mà context khác (popup/tab/SW) vừa persist.
    const stored = await chrome.storage.local.get([NOTES_CACHE_KEY, NOTE_BODIES_CACHE_KEY])
    const diskNotes = Array.isArray(stored[NOTES_CACHE_KEY])
      ? (stored[NOTES_CACHE_KEY] as Note[])
      : []
    const diskBodies = Array.isArray(stored[NOTE_BODIES_CACHE_KEY])
      ? (stored[NOTE_BODIES_CACHE_KEY] as NoteBody[])
      : []
    notes.value = mergeSnapshotWithStored(notes.value, diskNotes, isRowDirty)
    bodies.value = mergeSnapshotWithStored(bodies.value, diskBodies, isRowDirty)
    await safeCacheWrite(
      {
        [NOTES_CACHE_KEY]: notes.value,
        [NOTE_BODIES_CACHE_KEY]: bodies.value,
      },
      (e) => {
        loadError.value = e instanceof Error ? e.message : 'Cache write failed'
      },
    )
  }
```

Import: notes.ts đã import `{ isRowDirty, mergeFreshWithDirtyLocal }` từ
`@/services/sync.service` (`notes.ts:19`) — thêm `mergeSnapshotWithStored` vào đó.

### Thay đổi N5.3 — `src/stores/calendarEvents.ts` `persistCache()` (cùng pattern)

```ts
  async function persistCache(): Promise<void> {
    const stored = await chrome.storage.local.get(CALENDAR_EVENTS_CACHE_KEY)
    const disk = Array.isArray(stored[CALENDAR_EVENTS_CACHE_KEY])
      ? (stored[CALENDAR_EVENTS_CACHE_KEY] as CalendarEvent[])
      : []
    events.value = mergeSnapshotWithStored(events.value, disk, isCalendarEventDirty)
    await safeCacheWrite({ [CALENDAR_EVENTS_CACHE_KEY]: events.value }, (e) => {
      loadError.value = e instanceof Error ? e.message : 'Cache write failed'
    })
  }
```

Import sẵn có tại `calendarEvents.ts:17` — thêm `mergeSnapshotWithStored`.

### Thay đổi N5.4 — `src/services/sync.service.ts` `syncFromCache()` khối ghi cache

Hiện tại (verbatim, `sync.service.ts:233-250`):

```ts
    try {
      const [freshNotes, freshBodies, freshCalendar] = await Promise.all([
        notesService.getAll(),
        noteBodiesService.getAll(),
        calendarEventsService.getAll(),
      ])
      await chrome.storage.local.set({
        [NOTES_CACHE_KEY]: mergeFreshWithDirtyLocal(freshNotes, notes, isRowDirty),
        [NOTE_BODIES_CACHE_KEY]: mergeFreshWithDirtyLocal(freshBodies, noteBodies, isRowDirty),
        [CALENDAR_EVENTS_CACHE_KEY]: mergeFreshWithDirtyLocal(
          freshCalendar,
          calendarEvents,
          isRowDirty,
        ),
      })
    } catch {
      /* offline */
    }
```

Thay bằng (đọc lại đĩa NGAY TRƯỚC khi set — `notes`/`noteBodies`/`calendarEvents` là snapshot
từ đầu sync, có thể đã cũ vài giây):

```ts
    try {
      const [freshNotes, freshBodies, freshCalendar] = await Promise.all([
        notesService.getAll(),
        noteBodiesService.getAll(),
        calendarEventsService.getAll(),
      ])
      // N5: snapshot đầu-sync đã cũ — đọc lại đĩa để không đè edit UI vừa persist trong lúc push.
      const disk = await chrome.storage.local.get([
        NOTES_CACHE_KEY,
        NOTE_BODIES_CACHE_KEY,
        CALENDAR_EVENTS_CACHE_KEY,
      ])
      const diskNotes = Array.isArray(disk[NOTES_CACHE_KEY]) ? (disk[NOTES_CACHE_KEY] as Note[]) : []
      const diskBodies = Array.isArray(disk[NOTE_BODIES_CACHE_KEY])
        ? (disk[NOTE_BODIES_CACHE_KEY] as NoteBody[])
        : []
      const diskCal = Array.isArray(disk[CALENDAR_EVENTS_CACHE_KEY])
        ? (disk[CALENDAR_EVENTS_CACHE_KEY] as CalendarEvent[])
        : []
      await chrome.storage.local.set({
        [NOTES_CACHE_KEY]: mergeSnapshotWithStored(
          mergeFreshWithDirtyLocal(freshNotes, notes, isRowDirty),
          diskNotes,
          isRowDirty,
        ),
        [NOTE_BODIES_CACHE_KEY]: mergeSnapshotWithStored(
          mergeFreshWithDirtyLocal(freshBodies, noteBodies, isRowDirty),
          diskBodies,
          isRowDirty,
        ),
        [CALENDAR_EVENTS_CACHE_KEY]: mergeSnapshotWithStored(
          mergeFreshWithDirtyLocal(freshCalendar, calendarEvents, isRowDirty),
          diskCal,
          isRowDirty,
        ),
      })
    } catch {
      /* offline */
    }
```

---

## N11 — Web Locks: atomic read-modify-write cho queue + conflict backups

### Root cause (1 câu)

`registerPendingDeleteCommit` (read→write, `pendingDeleteCommit.service.ts:89-97`) chạy song
song với `flushOrphanedPendingDeleteCommits` (read → `await` network delete hàng trăm ms →
write `remaining`, `:127-149`) từ 2 context khác nhau → entry đăng ký giữa chừng bị
`writeQueue(remaining)` nuốt mất.

### Thay đổi N11.1 — file MỚI `src/utils/webLock.ts`

```ts
/**
 * Mutex cross-context qua Web Locks API — popup, dashboard-tab và service worker của
 * extension chung origin nên chung lock scope. Môi trường không có Web Locks
 * (unit test Node) → chạy thẳng, không lock.
 */
export async function withWebLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks
  if (!locks) return fn()
  return locks.request(name, fn) as Promise<T>
}

export const PENDING_DELETES_LOCK = 'bbqone-pending-deletes'
export const CONFLICT_BACKUPS_LOCK = 'bbqone-conflict-backups'
```

### Thay đổi N11.2 — `src/services/pendingDeleteCommit.service.ts`: wrap 3 hàm public

Giữ NGUYÊN toàn bộ thân hàm hiện tại, chỉ bọc trong lock. Pattern (áp cho cả 3):

```ts
export async function registerPendingDeleteCommit(
  actionId: string,
  expiresAt: number,
): Promise<void> {
  await withWebLock(PENDING_DELETES_LOCK, async () => {
    const queue = await readQueue()
    if (!queue.some((e) => e.id === actionId)) {
      await writeQueue([...queue, { id: actionId, expiresAt }])
    }
  })
}
```

Tương tự: `unregisterPendingDeleteCommit` (`:99-103`) và
`flushOrphanedPendingDeleteCommits` (`:127-149` — bọc TOÀN BỘ thân, gồm cả vòng for
executePendingDelete; giữ nguyên logic mode/remaining bên trong). Import:

```ts
import { PENDING_DELETES_LOCK, withWebLock } from '@/utils/webLock'
```

### Thay đổi N11.3 — `src/utils/syncConflict.ts`: wrap 2 hàm stash

`stashConflictBackup` (`:119-135`) và `removeConflictBackup` (`:102-112`): bọc thân hàm
(phần trong `try`) bằng `withWebLock(CONFLICT_BACKUPS_LOCK, async () => { ... })` — giữ nguyên
`try/catch { /* best-effort */ }` bên ngoài lock. Import từ `@/utils/webLock`.

---

## Edge case BẮT BUỘC giữ (cả cụm)

1. **Default mode của `flushOrphanedPendingDeleteCommits` vẫn là `'force'`** — test C2 case A4
   pin điều này. Chỉ các call site đổi sang `'respect-expiry'`.
2. **Legacy string entry** (expiresAt=0) vẫn được flush ở mọi mode (C2 case A2).
3. **Retry-remaining** khi delete lỗi network giữ nguyên (C2/C3).
4. `withWebLock` khi **không có** `navigator.locks` phải chạy `fn()` thẳng — unit test Node và
   Chrome cũ không được vỡ.
5. `mergeSnapshotWithStored`: row đĩa **sạch** không có trong snapshot = row mình vừa xóa →
   PHẢI drop (không thì xóa note không bao giờ biến mất). Row đĩa **dirty** không có trong
   snapshot = edit offline context khác → PHẢI giữ.
6. Suppression (N4.3b) chỉ ẩn khỏi **state in-memory**, KHÔNG ghi cache/không gọi
   `persistCache()` — số phận row do context sở hữu undo window + flush quyết định.

## KHÔNG được đổi (chặn over-reach)

- KHÔNG đổi `DEFAULT_UNDO_MS`, `FLUSH_EXPIRY_GRACE_MS`, format actionId `kind:uuid`.
- KHÔNG đụng `undoToast.ts` (schedule/commit/undo/commitAllPending) — điểm chặn nằm ở flush
  call sites, không ở toast.
- KHÔNG đụng `useCommitPendingDeletesOnClose.ts`.
- KHÔNG thay `chrome.storage` bằng cơ chế khác; không thêm dependency (Web Locks là API nền).
- KHÔNG đổi `mergeFreshWithDirtyLocal` (C1) — `mergeSnapshotWithStored` là hàm MỚI bổ sung.
- KHÔNG wrap các hàm đọc-thuần (`listUnexpiredPendingDeletes`, `listConflictBackups`) trong
  lock — chỉ read-modify-write mới cần.

## ⚠ FLAG liên đới

- **Thứ tự ship: sau N1** (persistCache đã đổi sang safeCacheWrite). Test N1 vẫn xanh sau N5
  (check của N1 chỉ yêu cầu `safeCacheWrite(` có mặt và không còn `chrome.storage.local.set`
  trong persistCache — N5 giữ đúng).
- **Test C2 hiện hành vẫn phải xanh** sau N4 (chạy `node specs/C2-undo-flush-race.test.mjs`
  xác nhận — A4 pin default force của HÀM, không pin call site).
- Undo ở context A sau khi context B đã suppress row: UI của B không tự hiện lại row cho tới
  lần pull sau — trade-off chấp nhận (KHÔNG "sửa" bằng cách force flush lại).
- N6/N7 (SW lifecycle) đổi autoSync sang alarm — độc lập, không đụng các hàm ở đây.

---

## PHẦN B — FAILING TEST

File: `specs/N4-N5-N11-multi-context.test.mjs`.

- **T-N11 (behavior, CODE THẬT `pendingDeleteCommit.service.ts` + mock `navigator.locks`
  mutex thật):** flush(force) entry A với delete chậm 60ms; t=15ms context khác register B.
  Sau khi cả hai xong: **B phải còn trong queue** và **B không bị server-delete**. RED hiện
  tại: writeQueue(remaining=[]) nuốt B. In timeline `t=`.
- **T-N5 (behavior, CODE THẬT `sync.service.ts`):** `mergeSnapshotWithStored` — 6 assert:
  disk-dirty-mới-hơn thắng; disk-dirty-cũ-hơn thua snapshot; disk-clean cùng id thua; disk-dirty
  vắng-trong-snapshot được giữ; disk-clean vắng-trong-snapshot bị drop (= mình vừa xóa);
  stored rỗng trả nguyên snapshot. RED: export chưa tồn tại.
- **T-N4 (behavior, CODE THẬT):** `listUnexpiredPendingDeletes` trả entry chưa-hết-hạn đã parse
  (kind/entityId), bỏ entry hết hạn + legacy string (expiresAt=0). RED: export chưa tồn tại.
- **W-N4:** `pages/App.vue` mount gọi `flushOrphanedPendingDeleteCommits('respect-expiry')`
  (không còn call KHÔNG tham số nào trong pages/App.vue); `refreshStoresFromNetwork` có
  `suppressUnexpiredPendingDeletes` sau `Promise.all`; `background.ts` message handler dùng
  `'respect-expiry'`, có `PENDING_DELETE_FLUSH_ALARM` branch trong onAlarm và
  `scheduleOrphanExpiryAlarm` sau top-level flush.
- **W-N5:** persistCache (notes + calendar) chứa `mergeSnapshotWithStored(`; khối ghi cache
  của `syncFromCache` chứa `mergeSnapshotWithStored(`.
- **W-N11:** 3 hàm public queue + 2 hàm stash chứa `withWebLock(`.

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: queue có Web-Lock quanh register/unregister/flush (entry
đăng ký giữa flush sống sót), `mergeSnapshotWithStored` tồn tại đúng 6 ngữ nghĩa và được dùng
ở cả 3 điểm ghi cache, mọi call site flush chuyển `'respect-expiry'` kèm alarm dọn orphan, và
pull ẩn row pending-delete chưa hết hạn — trong khi default mode `force` + legacy entry +
retry-remaining giữ nguyên (test C2 cũ vẫn xanh).
