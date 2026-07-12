# SPEC N6+N7 — SW lifecycle: auto-sync network-restore chết theo SW, token-refresh race popup↔SW, manual sync báo "synced" giả

> **Đối chiếu source (2026-07-13, branch `main`, tree sạch, v1.3.1).**
> **Failing test đi kèm:** `specs/N6-N7-sw-lifecycle-sync.test.mjs`.
>
> **Điều kiện tiên quyết:** nên áp SAU `specs/N4-N5-N11-multi-context.spec.md` (dùng chung
> `src/utils/webLock.ts`). Nếu file đó chưa tồn tại, tạo nó với nội dung Thay đổi 1 dưới đây
> (đã bao gồm cả phần N11 cần).

---

## PHẦN A — SPEC

### Root cause (mỗi bug 1 câu)

- **N7a:** `initAutoSyncOnNetworkRestore()` ở top-level SW (`background.ts:106`) dựa vào event
  `online` (`networkReachability.service.ts:30-33`) — event này **không đánh thức** MV3 SW đã bị
  kill, và chuỗi `setTimeout` ONLINE_STABLE_MS 2s → ONLINE_DEBOUNCE_MS 4s
  (`autoSync.service.ts:13-15,45,121`) **chết theo SW** → sửa offline, đóng popup, mạng có lại →
  không gì sync cho tới lần mở popup sau.
- **N7b:** `runManualSync` (`stores/sync.ts:43-66`) chỉ gọi `syncDirtyNotesFromList` — **không
  push** entry local-first (note/event TẠO offline) và **không sync calendar** → badge xanh
  "synced" dù dữ liệu chưa hề lên server.
- **N6:** popup và SW mỗi bên một GoTrueClient chung token trong `chrome.storage.session`;
  auth-js chỉ tự bật `navigator.locks` khi `isBrowser()` (có `window`+`document`) — SW không có
  → refresh token trong SW **không lock** → 2 context cùng refresh → refresh token bị
  rotate/reuse → "Invalid Refresh Token" → user bị đăng xuất ngẫu nhiên (repo đang chữa triệu
  chứng đúng lỗi này tại `supabaseAuthRecovery.service.ts` + `background.ts:29-33`).

### Thay đổi 1/5 — `src/utils/webLock.ts`: thêm SYNC_LOCK + supabaseAuthLock

Nếu file đã tồn tại (từ N11), THÊM vào cuối. Nếu chưa, tạo file với toàn bộ nội dung sau:

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

/** N6/N9: serialize push-sync giữa popup + dashboard-tab + SW (syncInFlight chỉ per-context). */
export const SYNC_LOCK = 'bbqone-sync'

/**
 * N6: lock function cho @supabase/auth-js (GoTrueClient `options.auth.lock`): serialize
 * token refresh giữa popup và service worker. auth-js chỉ tự dùng navigator.locks khi
 * isBrowser() (window+document) — SW không có → phải truyền tường minh.
 */
export async function supabaseAuthLock<R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks
  if (!locks) return fn()
  return locks.request(name, { mode: 'exclusive' }, fn) as Promise<R>
}
```

### Thay đổi 2/5 — `src/services/supabase.ts`: truyền lock cho GoTrueClient

Hiện tại (verbatim, `supabase.ts:20-29`):

```ts
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    /** Extension không có OAuth redirect URL — tránh GoTrue parse hash/query sai. */
    detectSessionInUrl: false,
    storage: chromeSessionStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
  },
})
```

Diff:

```diff
 import { createClient } from '@supabase/supabase-js'
 import { chromeSessionStorageAdapter } from '@/utils/storage'
+import { supabaseAuthLock } from '@/utils/webLock'
 ...
     autoRefreshToken: true,
     persistSession: true,
+    /** N6: popup + SW chung 1 Web Lock khi refresh token — hết race rotate refresh token. */
+    lock: supabaseAuthLock,
   },
 })
```

(`auth.lock` là option chính thức của GoTrueClient — cùng chữ ký với `navigatorLock` mà
auth-js dùng trong browser.)

### Thay đổi 3/5 — `src/services/autoSync.service.ts`

**(a) Export `hasLocalFirstPending`** — hiện là hàm private (verbatim, `autoSync.service.ts:52-64`):

```ts
/** Có entry nào tạo offline (LocalFirst storage còn dữ liệu) cần push lên cloud không? */
async function hasLocalFirstPending(): Promise<boolean> {
```

→ đổi thành `export async function hasLocalFirstPending(...)` (thân giữ nguyên).

**(b) Thêm `hasPendingSyncWork`** (đặt ngay sau `hasLocalFirstPending`):

```ts
/** Có việc cần push không (local-first pending HOẶC row dirty trong cache)? — check local-only, rẻ. */
export async function hasPendingSyncWork(): Promise<boolean> {
  if (await hasLocalFirstPending()) return true
  const chunk = await chrome.storage.local.get([
    NOTES_CACHE_KEY,
    NOTE_BODIES_CACHE_KEY,
    CALENDAR_EVENTS_CACHE_KEY,
  ])
  const anyDirty = (arr: unknown): boolean =>
    Array.isArray(arr) &&
    arr.some((r) => isRowDirty(r as { updated_at: string; synced_at?: string | null }))
  return (
    anyDirty(chunk[NOTES_CACHE_KEY]) ||
    anyDirty(chunk[NOTE_BODIES_CACHE_KEY]) ||
    anyDirty(chunk[CALENDAR_EVENTS_CACHE_KEY])
  )
}
```

Import bổ sung cho autoSync.service.ts:

```ts
import { isRowDirty, syncService } from '@/services/sync.service' // syncService đã import sẵn — thêm isRowDirty
import { NOTE_BODIES_CACHE_KEY, NOTES_CACHE_KEY } from '@/constants/storage'
import { CALENDAR_EVENTS_CACHE_KEY } from '@/constants/calendar'
import { SYNC_LOCK, withWebLock } from '@/utils/webLock'
```

**(c) Serialize cross-context** — `runBackgroundAutoSync` hiện tại (verbatim,
`autoSync.service.ts:69-105`, phần khung):

```ts
export async function runBackgroundAutoSync(reason: string): Promise<number> {
  if (syncInFlight) return 0
  if (!isOnline()) return 0
  if (!(await isAuthenticated())) return 0

  syncInFlight = true
  try {
    let total = 0
    ...
    return total
  } catch (e) {
    console.warn('[BBQOne] auto sync failed:', reason, e)
    return 0
  } finally {
    syncInFlight = false
  }
}
```

Đổi thành (giữ NGUYÊN toàn bộ thân trong try/catch/finally, chỉ bọc từ `syncInFlight = true`
trở xuống trong lock — `syncInFlight` vẫn là guard re-entry nội-context, lock là guard
cross-context):

```ts
export async function runBackgroundAutoSync(reason: string): Promise<number> {
  if (syncInFlight) return 0
  if (!isOnline()) return 0
  if (!(await isAuthenticated())) return 0

  return withWebLock(SYNC_LOCK, async () => {
    syncInFlight = true
    try {
      // ... giữ nguyên 100% thân hiện tại (autoSync.service.ts:76-98) ...
    } catch (e) {
      console.warn('[BBQOne] auto sync failed:', reason, e)
      return 0
    } finally {
      syncInFlight = false
    }
  })
}
```

### Thay đổi 4/5 — `src/background.ts`: alarm retry thay cho online-event (N7a)

`initAutoSyncOnNetworkRestore()` top-level (`background.ts:106`) **GIỮ NGUYÊN** (vẫn hữu ích
khi SW đang sống). THÊM alarm định kỳ làm đường bền:

```ts
const AUTOSYNC_RETRY_ALARM = 'bbqone-autosync-retry'

function ensureAutoSyncRetryAlarm(): void {
  void chrome.alarms.get(AUTOSYNC_RETRY_ALARM, (a) => {
    if (!a) {
      chrome.alarms.create(AUTOSYNC_RETRY_ALARM, { periodInMinutes: 5 })
    }
  })
}
```

- Gọi `ensureAutoSyncRetryAlarm()` tại 3 chỗ giống `ensureDailyAlarm()`: trong
  `onInstalled` (`background.ts:76-83`), `onStartup` (`:85-89`), và top-level.
- Thêm branch vào `chrome.alarms.onAlarm` listener (`background.ts:109-112` — nếu đã áp N4 thì
  listener này đã có branch `PENDING_DELETE_FLUSH_ALARM`; thêm branch mới TRƯỚC check
  `ALARM_NAME`):

```ts
  if (alarm.name === AUTOSYNC_RETRY_ALARM) {
    void (async () => {
      // Chỉ đụng mạng khi thật sự có việc — hasPendingSyncWork đọc local, rẻ.
      if (await hasPendingSyncWork()) await runBackgroundAutoSync('alarm-retry')
    })()
    return
  }
```

Import bổ sung từ autoSync.service (đã import `initAutoSyncOnNetworkRestore` tại
`background.ts:6`): thêm `hasPendingSyncWork`, `runBackgroundAutoSync`.

**Toán độ trễ sau fix:** sửa offline → đóng popup → mạng có lại → tối đa **5 phút** là data lên
cloud (trước fix: vô hạn — chờ user mở popup). `runBackgroundAutoSync` tự guard
online/auth/pending nên alarm nổ lúc offline là no-op không tốn mạng.

### Thay đổi 5/5 — `src/stores/sync.ts` `runManualSync()` (N7b)

Hiện tại (verbatim, `stores/sync.ts:43-66`):

```ts
  async function runManualSync(): Promise<void> {
    if (!isOnline()) {
      markError('Offline')
      throw new Error('Offline')
    }
    const notes = useNotesStore()
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    lastError.value = null
    markSyncing()
    try {
      await syncService.syncDirtyNotesFromList(
        notes.notes,
        notes.bodies,
        folders.folders,
        (id) => secure.getKey(id),
      )
      await notes.loadAll()
      markSynced()
    } catch (e) {
      markError(e instanceof Error ? e.message : 'Sync failed')
      throw e
    }
  }
```

Thay bằng:

```ts
  async function runManualSync(): Promise<void> {
    if (!isOnline()) {
      markError('Offline')
      throw new Error('Offline')
    }
    const notes = useNotesStore()
    const folders = useFoldersStore()
    const secure = useSecureFolderStore()
    const calendarEvents = useCalendarEventsStore()
    lastError.value = null
    markSyncing()
    try {
      // N7b: note/event TẠO offline nằm trong bbqone_local_* — phải push, không thì badge "synced" là giả.
      if ((await isAuthenticated()) && (await hasLocalFirstPending())) {
        await pushLocalToCloud('use-local')
      }
      await syncService.syncDirtyNotesFromList(
        notes.notes,
        notes.bodies,
        folders.folders,
        (id) => secure.getKey(id),
      )
      // N7b: calendar cũng phải sync tay được — trước đây chỉ notes.
      await syncService.syncDirtyCalendarEventsFromList(calendarEvents.events)
      await Promise.all([notes.loadAll(), calendarEvents.loadAll()])
      markSynced()
    } catch (e) {
      markError(e instanceof Error ? e.message : 'Sync failed')
      throw e
    }
  }
```

Import bổ sung cho stores/sync.ts:

```ts
import { useCalendarEventsStore } from '@/stores/calendarEvents'
import { hasLocalFirstPending } from '@/services/autoSync.service'
import { pushLocalToCloud } from '@/services/localFirst/syncEngine.service'
import { isAuthenticated } from '@/services/localFirst/authMode'
```

### Edge case BẮT BUỘC giữ

1. `syncInFlight` per-context guard giữ nguyên (re-entry trong 1 context return 0 ngay,
   không xếp hàng chờ lock).
2. `runBackgroundAutoSync` tiếp tục **nuốt lỗi** (return 0 + warn) — caller
   `refreshStoresFromNetwork` phụ thuộc hành vi này (C1 spec đã ghi). `runManualSync` thì
   **throw** như cũ để badge hiện lỗi.
3. Per-row skip trong `syncDirtyNotesFromList` (`else { continue }`, C5) giữ nguyên —
   `runManualSync` chỉ báo lỗi khi throw thật.
4. `initAutoSyncOnNetworkRestore` + debounce 2s/4s giữ nguyên cho POPUP context (event online
   hoạt động tốt trong popup); alarm là đường bền cho SW.
5. `supabaseAuthLock`/`withWebLock` khi không có `navigator.locks` → chạy thẳng (Node test).

### KHÔNG được đổi (chặn over-reach)

- KHÔNG đổi `ONLINE_DEBOUNCE_MS`/`ONLINE_STABLE_MS`; không xóa listener online.
- KHÔNG đổi `autoRefreshToken: true` / `persistSession` / storage adapter — chỉ THÊM `lock`.
- KHÔNG đụng `supabaseAuthRecovery.service.ts` (lưới đỡ triệu chứng giữ nguyên — defense in depth).
- KHÔNG hạ `periodInMinutes` dưới 5 (SW wake mỗi phút là lãng phí pin/CPU).
- KHÔNG đụng `runAutoSync` (`stores/sync.ts:68-76`).

### ⚠ FLAG liên đới

- Fix này đồng thời **giảm mạnh N9** (double-push → conflict giả + stash rác): SYNC_LOCK
  serialize push giữa popup/SW. Phần còn lại của N9 (batch push thay vì 1 RPC/row) là
  optimization riêng, KHÔNG làm trong PR này.
- Nếu N4 đã merge: `onAlarm` listener có 3 branch (PENDING_DELETE_FLUSH_ALARM,
  AUTOSYNC_RETRY_ALARM, ALARM_NAME) — thứ tự không quan trọng, mỗi branch return riêng.
- Test C3-C4-C6-C7 hiện hành mock module autoSync — không vỡ (đã kiểm: harness cũ mock theo
  specifier, export mới không ảnh hưởng).

---

## PHẦN B — FAILING TEST

File: `specs/N6-N7-sw-lifecycle-sync.test.mjs`.

- **Timeline minh họa** (in, không assert): SW bị kill ở t≈30s sau khi popup đóng → event
  `online` t=60s không đánh thức SW → chuỗi timer 2s+4s không bao giờ chạy → data offline
  kẹt vô hạn; sau fix: alarm 5' nổ → `hasPendingSyncWork()` true → push.
- **T1 (behavior, CODE THẬT autoSync.service.ts):** `hasPendingSyncWork` — local-first có
  entry → true; cache có row dirty → true; tất cả sạch → false. RED: export chưa tồn tại
  (`hasLocalFirstPending` cũng phải được export).
- **T2 (behavior, CODE THẬT, 2 instance module = 2 context):** nạp autoSync.service 2 lần
  (2 bản `syncInFlight` riêng — đúng như popup + SW), `syncFromCache` mock giữ 50ms; gọi
  `runBackgroundAutoSync` đồng thời từ 2 instance → **số runner hoạt động đồng thời tối đa
  phải = 1**. RED hiện tại: = 2 (không có lock cross-context → double-push → conflict giả
  N9). Mock `navigator.locks` mutex thật.
- **T3 (behavior, CODE THẬT webLock.ts):** `supabaseAuthLock` — 2 call đồng thời cùng name
  serialize; không có `navigator.locks` → vẫn chạy fn. RED: file/export chưa tồn tại.
- **W1:** `supabase.ts` có `lock: supabaseAuthLock` trong auth options.
- **W2:** `background.ts` có `bbqone-autosync-retry` + branch onAlarm gọi
  `hasPendingSyncWork` → `runBackgroundAutoSync`, và `ensureAutoSyncRetryAlarm` được gọi ở
  onInstalled + onStartup + top-level (≥3 lần xuất hiện call).
- **W3:** `stores/sync.ts` runManualSync chứa `pushLocalToCloud(` và
  `syncDirtyCalendarEventsFromList(`.

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: autoSync export `hasLocalFirstPending` +
`hasPendingSyncWork` đúng ngữ nghĩa và `runBackgroundAutoSync` được bọc SYNC_LOCK cross-context
(2 instance chạy đồng thời → serialize), `webLock.ts` export `supabaseAuthLock` đúng contract
và `supabase.ts` truyền nó vào `auth.lock`, `background.ts` có alarm retry 5' gọi sync khi có
việc, và `runManualSync` push cả local-first lẫn calendar trước khi báo synced.
