# SPEC C1 — Pull-overwrite đè mất offline edits (notes + calendar events)

> **Đối chiếu source (2026-07-03, branch `main`, tree sạch):** mọi `file:line` dưới đây đã được
> verify lại trên code hiện tại — KHÔNG lệch so với audit report.
>
> **Failing test đi kèm:** `specs/C1-pull-overwrite.test.mjs` — chạy `node specs/C1-pull-overwrite.test.mjs`
> từ repo root. (Test dùng fallback được phép: unit test thực thi code thật của merge-guard +
> static wiring check + timeline encode hằng số thật — xem PHẦN B vì sao.)

---

## PHẦN A — SPEC

### Root cause (1 câu)

`loadAll()` của notes/calendarEvents gán thẳng mảng fetch được vào state rồi `persistCache()`
vô điều kiện (`notes.ts:133-135`, `calendarEvents.ts:105-106`), và mọi entry point đều **pull
trước khi push** — nên row đang "dirty" (sửa offline, `updated_at > synced_at`, chờ push) bị đè
bằng bản server cũ và mất im lặng.

### 3 scenario phải chặn (và guard nào chặn cái nào)

| Scenario | Diễn biến | Guard chặn |
|---|---|---|
| **A** — popup mở xuyên suốt offline→online | `online` event → `pages/App.vue:176-179` pull ngay (t≈0, fetch ~200ms) trong khi autoSync push mãi **t = ONLINE_STABLE_MS + ONLINE_DEBOUNCE_MS = 2000 + 4000 = 6000ms** (`autoSync.service.ts:13-15`) → pull luôn thắng | **Guard 1** (push-trước-pull) là chính; **Guard 2** (merge) là lưới đỡ khi push lỗi một phần |
| **B** — sửa offline, đóng popup, mở lại khi đã online | `onMounted` (`pages/App.vue:174`) gọi `refreshStoresFromNetwork()` pull-đè trước khi bất kỳ push nào từng chạy (SW ngủ không nhận `online` event) | **Guard 1 + Guard 2** (cùng đường code với A) |
| **C** — sửa offline, restart browser | Session Supabase nằm ở `chrome.storage.session` → mất sau restart → popup boot ở anonymous mode → `loadAll()` đọc local-first store (rỗng) → `notes.value = []` → `persistCache()` ghi **mảng rỗng** đè cache đang chứa dirty edits | **CHỈ Guard 2** chặn được — Guard 1 no-op vì `runBackgroundAutoSync` return sớm khi `isAuthenticated()` = false. Merge-guard PHẢI giữ được dirty row **kể cả khi fresh không chứa id đó** (nhánh "dirty absent from fresh") |

### Thay đổi 1/4 — `src/services/sync.service.ts`: thêm 2 pure helper

Đặt ngay SAU 2 hàm dirty-check sẵn có. Hai hàm sẵn có (verbatim, `sync.service.ts:15-23`) —
**giữ nguyên, không sửa** (đã grep: chỉ dùng nội bộ file này):

```ts
export function isNoteDirty(n: Note): boolean {
  if (!n.synced_at) return true
  return new Date(n.updated_at) > new Date(n.synced_at)
}

export function isCalendarEventDirty(e: CalendarEvent): boolean {
  if (!e.synced_at) return true
  return new Date(e.updated_at) > new Date(e.synced_at)
}
```

Thêm mới (cùng logic dirty nhưng structural-typed để dùng được cho cả `NoteBody` — vốn không có
hàm dirty riêng):

```ts
/** Cùng logic isNoteDirty/isCalendarEventDirty nhưng structural — dùng được cho Note | NoteBody | CalendarEvent. */
export function isRowDirty(row: { updated_at: string; synced_at?: string | null }): boolean {
  if (!row.synced_at) return true
  return new Date(row.updated_at) > new Date(row.synced_at)
}

/**
 * Trộn dữ liệu fetch được (server, hoặc local-first store khi anonymous) với state hiện tại:
 * - row local DIRTY thắng row fresh cùng id (edit offline chưa push không bị đè)
 * - row local DIRTY không còn trong fresh vẫn được GIỮ (chờ push lại — bắt buộc cho scenario C
 *   khi fresh là mảng rỗng của anonymous mode)
 * - row local sạch → fresh thắng (giữ nguyên hành vi pull hiện tại)
 */
export function mergeFreshWithDirtyLocal<T extends { id: string }>(
  fresh: T[],
  local: T[],
  isDirty: (row: T) => boolean,
): T[] {
  const dirtyById = new Map<string, T>()
  for (const row of local) {
    if (isDirty(row)) dirtyById.set(row.id, row)
  }
  if (dirtyById.size === 0) return fresh
  const freshIds = new Set(fresh.map((r) => r.id))
  const merged = fresh.map((row) => dirtyById.get(row.id) ?? row)
  for (const row of local) {
    if (dirtyById.has(row.id) && !freshIds.has(row.id)) merged.push(row)
  }
  return merged
}
```

Không có vòng import: `stores/notes.ts` / `stores/calendarEvents.ts` → `sync.service.ts` →
chỉ import services/utils, không import store nào.

### Thay đổi 2/4 — `src/stores/notes.ts` `loadAll()`

Code hiện tại (verbatim, `notes.ts:123-136`, phần try):

```ts
  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      await hydrateFromCache()
      if (!isOnline()) return
      const [freshNotes, freshBodies] = await withTimeout(
        Promise.all([notesService.getAll(), noteBodiesService.getAll()]),
        NETWORK_LOAD_MS,
        'Load notes timed out',
      )
      notes.value = freshNotes
      bodies.value = freshBodies
      await persistCache()
      await useSecureFolderStore().refreshDecryptedNotesAfterLoad()
```

Diff:

```diff
-      notes.value = freshNotes
-      bodies.value = freshBodies
+      // Không đè row đang dirty (sửa offline chưa push) bằng bản server cũ.
+      notes.value = mergeFreshWithDirtyLocal(freshNotes, notes.value, isRowDirty)
+      bodies.value = mergeFreshWithDirtyLocal(freshBodies, bodies.value, isRowDirty)
       await persistCache()
```

Lưu ý: tại điểm này `notes.value`/`bodies.value` chính là cache đã hydrate ở đầu `loadAll`
(dòng 126 `await hydrateFromCache()`) — đúng nguồn "local" cần so.

Thêm import (notes.ts hiện CHƯA import gì từ sync.service):

```ts
import { isRowDirty, mergeFreshWithDirtyLocal } from '@/services/sync.service'
```

### Thay đổi 3/4 — `src/stores/calendarEvents.ts` `loadAll()`

Code hiện tại (verbatim, `calendarEvents.ts:95-107`, phần try):

```ts
  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      await hydrateFromCache()
      if (!isOnline()) return
      const fresh = await withTimeout(
        calendarEventsService.getAll(),
        NETWORK_LOAD_MS,
        'Load calendar timed out',
      )
      events.value = withNormalizedDates(fresh)
      await persistCache()
```

Diff:

```diff
-      events.value = withNormalizedDates(fresh)
+      // Không đè row đang dirty (sửa offline chưa push) bằng bản server cũ.
+      events.value = mergeFreshWithDirtyLocal(
+        withNormalizedDates(fresh),
+        events.value,
+        isCalendarEventDirty,
+      )
       await persistCache()
```

(Reuse `isCalendarEventDirty` có sẵn — quote ở Thay đổi 1. `CalendarEvent` có `id` nên khớp
generic constraint.)

Thêm import:

```ts
import { isCalendarEventDirty, mergeFreshWithDirtyLocal } from '@/services/sync.service'
```

### Thay đổi 4/4 — `src/pages/App.vue`: push dirty TRƯỚC khi pull

Code hiện tại (verbatim, `pages/App.vue:86-89`):

```ts
  async function refreshStoresFromNetwork(): Promise<void> {
    if (!isOnline()) return
    await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
  }
```

Diff:

```diff
   async function refreshStoresFromNetwork(): Promise<void> {
     if (!isOnline()) return
+    // Push dirty rows + entry local-first LÊN cloud trước, rồi mới pull — tránh pull đè offline edits.
+    await runBackgroundAutoSync('pre-pull')
     await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
   }
```

`runBackgroundAutoSync` an toàn để gọi thẳng ở đây vì nó **tự guard** — verbatim
(`autoSync.service.ts:69-74`):

```ts
export async function runBackgroundAutoSync(reason: string): Promise<number> {
  if (syncInFlight) return 0
  if (!isOnline()) return 0
  if (!(await isAuthenticated())) return 0

  syncInFlight = true
```

và nuốt lỗi bên trong (`autoSync.service.ts:99-104` catch → `console.warn` → return 0) — không
làm `refreshStoresFromNetwork` throw thêm đường mới.

Sửa import hiện có (verbatim, `pages/App.vue:36-39`):

```ts
  import {
    initAutoSyncOnNetworkRestore,
    isAutoSyncCompleteMessage,
  } from '@/services/autoSync.service'
```

thành:

```ts
  import {
    initAutoSyncOnNetworkRestore,
    isAutoSyncCompleteMessage,
    runBackgroundAutoSync,
  } from '@/services/autoSync.service'
```

Ghi chú vòng lặp message: khi push được >0 row, `runBackgroundAutoSync` gửi
`chrome.runtime.sendMessage` (`autoSync.service.ts:91-97`) — sender không nhận message của chính
mình nên popup không tự kích hoạt lại `onAutoSyncMessage`; SW nhận và trả `ok:false` vô hại
(lỗi đã được catch sẵn). Không tạo vòng lặp.

### Cái KHÔNG được đổi (chặn over-reach)

- **KHÔNG** đụng `folders.loadAll()` — folder không có cột `synced_at`, không có khái niệm dirty
  (comment sẵn có tại `folders.ts:120-122`: *"Folder không có cột synced_at trong DB schema hiện
  tại → không thể queue rename offline"*).
- **KHÔNG** đổi `ONLINE_DEBOUNCE_MS` / `ONLINE_STABLE_MS` (`autoSync.service.ts:13-15`) — cơ chế
  debounce network-restore giữ nguyên, chỉ thêm push chủ động ở `refreshStoresFromNetwork`.
- **KHÔNG** sửa `syncFromCache` / `pushLocalToCloud` / conflict flow / `hydrateFromCache` /
  nhánh catch của `loadAll` (fallback đọc cache khi fetch lỗi — đã đúng).
- **KHÔNG** sửa hai hàm `isNoteDirty` / `isCalendarEventDirty` sẵn có (thêm `isRowDirty` mới,
  không thay thế).
- Không thêm dependency, không đổi schema/DB, không đổi kiến trúc hai lớp storage (cache vs
  `bbqone_local_*`).

### ⚠ FLAG liên đới (đọc kỹ — đừng tự "fix thêm")

1. **C5 (poison-pill) lộ ra rõ hơn sau fix này:** merge-guard giữ lại dirty row đã bị xóa trên
   server (từ máy khác). Khi push, `syncDirtyNotesFromList` (`sync.service.ts:44-84`) **không có
   try/catch per-note** → `notesService.update().single()` trên row không tồn tại sẽ throw và
   chặn các note dirty phía sau. Đây là finding C5 riêng, fix riêng (try/catch per-note giống
   loop calendar `sync.service.ts:93-107`) — **KHÔNG gộp vào PR này**, nhưng người review cần
   biết hai fix nên đi gần nhau.
2. **C1 fix KHÔNG thay thế C2 fix:** row được Undo restore (bug C2) là row *sạch*
   (`updated_at ≤ synced_at`) — merge-guard này sẽ không giữ nó khi pull. Hai bug độc lập, cần cả
   hai fix (C2 xem `specs/C2-undo-flush-race.spec.md`).
3. **Side-effect có chủ đích (không phải regression):** event/note tạo offline khi đã đăng nhập
   (nằm trong `bbqone_local_*`, có `synced_at: null` trong cache → dirty) trước đây **biến mất
   khỏi UI** sau pull; sau fix chúng được giữ hiển thị cho tới khi push xong. Đúng kỳ vọng.
4. **Scenario C sau fix:** khi anonymous (sau restart browser), dirty row của tài khoản cũ được
   giữ trong cache và hiển thị cạnh data anonymous cho tới khi user đăng nhập lại → push tự lành.
   Đây là trade-off chấp nhận (bảo toàn data > gọn UI) — không "sửa" bằng cách lọc chúng đi.

---

## PHẦN B — FAILING TEST

File: `specs/C1-pull-overwrite.test.mjs`. Chạy:

```
node specs/C1-pull-overwrite.test.mjs                       # full: behavior + wiring + timeline
node specs/C1-pull-overwrite.test.mjs --module-only <p.ts>  # chỉ chạy behavior test trên 1 bản implement khác
```

**Fallback được chọn (và vì sao):** `loadAll()` sống trong Pinia store import Vue/chrome — không
thực thi được trong Node thuần mà không dựng cả app. Theo đúng phương án fallback cho phép, test gồm:

1. **Behavior test thực thi CODE THẬT** của `src/services/sync.service.ts` (transpile bằng package
   `typescript` sẵn có, mock các import service): RED vì `mergeFreshWithDirtyLocal`/`isRowDirty`
   chưa tồn tại; GREEN khi tồn tại và đúng 6 assert ngữ nghĩa (dirty thắng fresh; sạch thua fresh;
   dirty vắng mặt trong fresh vẫn giữ — chặn scenario C; row fresh-only được thêm; không dirty →
   trả nguyên fresh; `isRowDirty` đúng 3 nhánh).
2. **Static wiring check** trên 3 file thật: `notes.ts` gọi `mergeFreshWithDirtyLocal(` ≥ 2 lần
   (notes + bodies), `calendarEvents.ts` ≥ 1 lần, và trong thân `refreshStoresFromNetwork` của
   `pages/App.vue` có `runBackgroundAutoSync(` đứng TRƯỚC `Promise.all`. (Check theo đúng tên hàm
   spec quy định — đặt tên khác là fail, chủ đích.)
3. **Timeline deterministic** encode hằng số THẬT đọc từ `autoSync.service.ts` bằng regex
   (`ONLINE_STABLE_MS = 2_000`, `ONLINE_DEBOUNCE_MS = 4_000`): chứng minh pull (t≈200ms) luôn
   thắng push (t=6000ms) trên code hiện tại, và in ra chính xác data bị mất (title bản offline
   bị revert về bản server).

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: `sync.service.ts` export `isRowDirty` + `mergeFreshWithDirtyLocal`
đúng ngữ nghĩa (dirty-local thắng, dirty vắng-trong-fresh được giữ, sạch thì fresh thắng), đồng thời
`notes.ts` dùng merge cho cả notes lẫn bodies, `calendarEvents.ts` dùng merge cho events, và
`refreshStoresFromNetwork` trong `pages/App.vue` gọi `runBackgroundAutoSync(...)` trước `Promise.all` pull.
