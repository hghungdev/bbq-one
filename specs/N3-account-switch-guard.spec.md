# SPEC N3 — Đổi tài khoản cùng profile: data account A bị push lên cloud account B

> **Đối chiếu source (2026-07-13, branch `main`, tree sạch, v1.3.1):** mọi `file:line` dưới đây
> đã verify trên code hiện tại.
>
> **Failing test đi kèm:** `specs/N3-account-switch-guard.test.mjs` — chạy
> `node specs/N3-account-switch-guard.test.mjs`. Test thực thi CODE THẬT của
> `dataOwner.service.ts` (mới), `localStore.service.ts`, `syncEngine.service.ts`.

---

## PHẦN A — SPEC

### Root cause (1 câu)

Không có bất kỳ bản ghi "dữ liệu local thuộc user nào": `logout()` cố ý giữ nguyên cache +
`bbqone_local_*` (`auth.service.ts:35` — comment *"Không gọi local.clear()"*), còn
`detectSyncConflicts()` **luôn trả `totalConflicts: 0`** (`conflictDetector.ts:33-38`) nên khi
account B đăng nhập cùng profile, `runSyncFlow` → `pushLocalToCloud('use-local')` upsert thẳng
`{ ...rest, user_id: B }` (`syncEngine.service.ts:112-114`) — note/event/bookmark của A nằm
vĩnh viễn trong account B trên server (vừa bug vừa privacy leak).

### Kịch bản đầy đủ (phải chặn cả 3 đường)

1. **Đường server-leak:** A tạo note offline (nằm `bbqone_local_notes`, `__synced: false`) →
   logout → B login → SIGNED_IN → `runSyncFlow` (`src/App.vue:124-128`) → push dưới `user_id: B`.
2. **Đường UI-leak:** cache `notes_cache` còn nguyên notes của A → B login → merge-guard C1 giữ
   row dirty của A hiển thị trong UI của B; `syncFromCache` push chúng → RPC NOT FOUND →
   BBQ_CONFLICT → nội dung của A bị stash vào `bbqone_conflict_backups` → hiện trong
   ConflictBackupsDialog **của B**.
3. **Đường queue:** `bbqone_pending_delete_commits` của A được flush bằng client của B →
   RLS chặn → entry lỗi bị giữ retry vĩnh viễn.

### Nguyên tắc fix

Ghi **owner user id** của local data. Khi SIGNED_IN với user khác owner:
**không push**, **quarantine** (stash) phần chưa-sync của owner cũ vào 1 key riêng,
**purge** cache + local-first + queue + conflict backups, rồi chỉ pull data account mới.
Khi owner cũ đăng nhập lại: tự động **restore** stash vào `bbqone_local_*` để flow push
sẵn có tự lành. **Không mất dữ liệu của bất kỳ account nào, không cần UI mới.**

Luồng anonymous → login lần đầu (onboarding local-first) **giữ nguyên**: owner chưa có (`null`)
thì push như hiện tại rồi ghi owner.

### Thay đổi 1/4 — `src/constants/storage.ts`: thêm 2 key

Thêm vào cuối file:

```ts
/** User id sở hữu local data hiện tại (cache + bbqone_local_*). null/absent = anonymous/chưa từng login. */
export const BBQ_DATA_OWNER_USER_ID_KEY = 'bbqone_data_owner_user_id'
/** Quarantine data chưa-sync của owner cũ khi user KHÁC đăng nhập: Record<userId, ForeignStash>. */
export const BBQ_FOREIGN_STASH_KEY = 'bbqone_foreign_stash_v1'
```

### Thay đổi 2/4 — file MỚI `src/services/localFirst/dataOwner.service.ts`

Nội dung đầy đủ (các key cache import đúng nguồn: `CALENDAR_EVENTS_CACHE_KEY` nằm ở
`@/constants/calendar`, các key khác ở `@/constants/storage`; `BBQ_CONFLICT_BACKUPS_KEY`
export sẵn tại `syncConflict.ts:61`):

```ts
import {
  BBQ_DATA_OWNER_USER_ID_KEY,
  BBQ_FOREIGN_STASH_KEY,
  BBQ_PENDING_DELETE_COMMITS_KEY,
  BOOKMARKS_CACHE_KEY,
  FOLDERS_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  NOTES_CACHE_KEY,
} from '@/constants/storage'
import { CALENDAR_EVENTS_CACHE_KEY } from '@/constants/calendar'
import { BBQ_CONFLICT_BACKUPS_KEY } from '@/utils/syncConflict'
import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type {
  LocalBookmark,
  LocalCalendarEvent,
  LocalFolder,
  LocalNote,
  LocalNoteBody,
} from '@/types/localFirst'

export interface ForeignStash {
  stashedAt: string
  notes: LocalNote[]
  noteBodies: LocalNoteBody[]
  folders: LocalFolder[]
  bookmarks: LocalBookmark[]
  calendarEvents: LocalCalendarEvent[]
}

export interface OwnershipCheckResult {
  status: 'first-login' | 'same-owner' | 'foreign-stashed'
  /** true = stash của CHÍNH user này (từ lần bị đổi account trước) đã được trả về bbqone_local_*. */
  restoredOwnStash: boolean
}

/** Cache account-scoped bị purge khi đổi owner (KHÔNG gồm theme/lang/tab — đó là per-device). */
const ACCOUNT_SCOPED_KEYS = [
  NOTES_CACHE_KEY,
  NOTE_BODIES_CACHE_KEY,
  FOLDERS_CACHE_KEY,
  CALENDAR_EVENTS_CACHE_KEY,
  BOOKMARKS_CACHE_KEY,
  BBQ_PENDING_DELETE_COMMITS_KEY,
  BBQ_CONFLICT_BACKUPS_KEY,
]

async function readStashMap(): Promise<Record<string, ForeignStash>> {
  const chunk = await chrome.storage.local.get(BBQ_FOREIGN_STASH_KEY)
  const raw = chunk[BBQ_FOREIGN_STASH_KEY]
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, ForeignStash>) : {}
}

/** Append entries chưa có id trùng vào local-first store. */
async function restoreArray<T extends { id: string }>(key: string, entries: T[]): Promise<void> {
  if (entries.length === 0) return
  const current = await localStore.getArray<T>(key)
  const existing = new Set(current.map((e) => e.id))
  const merged = [...current, ...entries.filter((e) => !existing.has(e.id))]
  await localStore.setArray(key, merged)
}

async function restoreOwnStash(userId: string): Promise<boolean> {
  const stashMap = await readStashMap()
  const stash = stashMap[userId]
  if (!stash) return false
  await restoreArray(LOCAL_STORAGE_KEYS.folders, stash.folders ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.notes, stash.notes ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.noteBodies, stash.noteBodies ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.bookmarks, stash.bookmarks ?? [])
  await restoreArray(LOCAL_STORAGE_KEYS.calendarEvents, stash.calendarEvents ?? [])
  delete stashMap[userId]
  await chrome.storage.local.set({ [BBQ_FOREIGN_STASH_KEY]: stashMap })
  return true
}

const notSynced = <T extends { __synced?: boolean }>(arr: T[]): T[] =>
  arr.filter((e) => !e.__synced)

/**
 * Gọi khi SIGNED_IN, TRƯỚC mọi push. Đảm bảo local data thuộc đúng user hiện tại:
 * - owner null (anonymous/fresh) → nhận owner, push như cũ (onboarding local-first giữ nguyên).
 * - owner === user → như cũ (kèm restore stash nếu có).
 * - owner !== user → stash phần chưa-sync của owner cũ, PURGE cache/local/queue/backups,
 *   nhận owner mới, restore stash của user mới nếu có.
 */
export async function ensureLocalDataOwnership(
  currentUserId: string,
): Promise<OwnershipCheckResult> {
  const chunk = await chrome.storage.local.get(BBQ_DATA_OWNER_USER_ID_KEY)
  const owner = (chunk[BBQ_DATA_OWNER_USER_ID_KEY] as string | undefined) ?? null

  if (owner === null || owner === currentUserId) {
    const restoredOwnStash = await restoreOwnStash(currentUserId)
    await chrome.storage.local.set({ [BBQ_DATA_OWNER_USER_ID_KEY]: currentUserId })
    return { status: owner === null ? 'first-login' : 'same-owner', restoredOwnStash }
  }

  // owner !== currentUserId → quarantine phần chưa-sync của owner cũ
  const [notes, noteBodies, folders, bookmarks, calendarEvents] = await Promise.all([
    localStore.getArray<LocalNote>(LOCAL_STORAGE_KEYS.notes),
    localStore.getArray<LocalNoteBody>(LOCAL_STORAGE_KEYS.noteBodies),
    localStore.getArray<LocalFolder>(LOCAL_STORAGE_KEYS.folders),
    localStore.getArray<LocalBookmark>(LOCAL_STORAGE_KEYS.bookmarks),
    localStore.getArray<LocalCalendarEvent>(LOCAL_STORAGE_KEYS.calendarEvents),
  ])
  const stashMap = await readStashMap()
  stashMap[owner] = {
    stashedAt: new Date().toISOString(),
    notes: notSynced(notes),
    noteBodies: notSynced(noteBodies),
    folders: notSynced(folders),
    bookmarks: notSynced(bookmarks),
    calendarEvents: notSynced(calendarEvents),
  }
  await chrome.storage.local.set({ [BBQ_FOREIGN_STASH_KEY]: stashMap })

  // PURGE: local-first store + cache account-scoped + queue + conflict backups
  await localStore.clearAllLocal()
  await chrome.storage.local.remove(ACCOUNT_SCOPED_KEYS)

  await chrome.storage.local.set({ [BBQ_DATA_OWNER_USER_ID_KEY]: currentUserId })
  const restoredOwnStash = await restoreOwnStash(currentUserId)
  return { status: 'foreign-stashed', restoredOwnStash }
}
```

### Thay đổi 3/4 — `src/App.vue` `runSyncFlow()`: gate ownership TRƯỚC push

Hiện tại (verbatim, `src/App.vue:81-102`):

```ts
async function runSyncFlow(): Promise<void> {
  try {
    const overflow = await detectCalendarDayOverflow()
    if (overflow.days.length > 0) {
      calendarOverflowReport.value = overflow
      calendarOverflowVisible.value = true
      return
    }
    await finishPushLocalSync()
  } catch (e) {
    console.error('[BBQOne] Sync pre-flight failed:', e)
    try {
      const result = await pushLocalToCloud('use-local')
      syncResult.value = result
      await reloadAfterSync()
      toastVisible.value = true
      setTimeout(() => (toastVisible.value = false), 5000)
    } catch (err) {
      console.error('[BBQOne] Sync fallback failed:', err)
    }
  }
}
```

Diff — chèn gate **trước** khối try (QUAN TRỌNG: không đặt trong try, vì nhánh catch của try
fallback sang `pushLocalToCloud('use-local')` — nếu ownership check lỗi mà rơi vào đó thì
vẫn push nhầm):

```diff
 async function runSyncFlow(): Promise<void> {
+  // N3: xác định chủ local data TRƯỚC mọi push. Fail-safe: không xác định được → KHÔNG push.
+  let ownership: OwnershipCheckResult
+  try {
+    const { data: { user } } = await supabase.auth.getUser()
+    if (!user) return
+    ownership = await ensureLocalDataOwnership(user.id)
+  } catch (e) {
+    console.error('[BBQOne] Ownership check failed — skip auto-push:', e)
+    return
+  }
+  if (ownership.status === 'foreign-stashed' && !ownership.restoredOwnStash) {
+    // Data local thuộc account khác — đã stash + purge. Chỉ pull data account mới.
+    await reloadAfterSync()
+    return
+  }
   try {
     const overflow = await detectCalendarDayOverflow()
```

Thêm import (App.vue đã import `supabase` sẵn ở dòng 4):

```ts
import {
  ensureLocalDataOwnership,
  type OwnershipCheckResult,
} from '@/services/localFirst/dataOwner.service'
```

### Thay đổi 4/4 — không có (auth.service.ts `logout()` GIỮ NGUYÊN)

`logout()` tiếp tục **không** xóa local data — đó là hành vi đúng (offline edits của A còn chờ
push khi A quay lại). Ownership guard ở SIGNED_IN là điểm chặn duy nhất cần thiết.

### Edge case BẮT BUỘC giữ

1. **Anonymous onboarding:** owner `null` → `first-login`, KHÔNG stash/purge — data tạo trước
   khi đăng ký tài khoản vẫn push lên account đầu tiên đăng nhập (hành vi chủ đích hiện tại).
2. **A → B → A:** lần A quay lại, `status = 'foreign-stashed'` (owner đang là B) NHƯNG
   `restoredOwnStash = true` → runSyncFlow **tiếp tục flow push bình thường** — stash của A đã
   nằm lại trong `bbqone_local_*`, `pushLocalToCloud` đẩy đúng lên account A. Tự lành, không UI.
3. **Chỉ entry `__synced: false` được stash** — entry `__synced: true` là bản mirror server của
   account cũ, drop an toàn.
4. **Purge KHÔNG đụng key per-device:** `ui_lang`, `bbqone_ui_theme`, `bbqone_utc_offset_hours`,
   `active_tab`, `bbq_pending_route`, `bbq_auth_logged_in`, `bookmark_last_tree_hash` giữ nguyên.
5. Fail-safe: `ensureLocalDataOwnership` throw → **skip push hoàn toàn** (return), không rơi
   xuống fallback `pushLocalToCloud`.

### KHÔNG được đổi (chặn over-reach)

- KHÔNG sửa `pushLocalToCloud` / `detectSyncConflicts` / `_clearSyncedEntries` — guard nằm
  NGOÀI, tại `runSyncFlow`.
- KHÔNG sửa `logout()` (`auth.service.ts:31-43`).
- KHÔNG đụng `setupAutoSyncOnLogin` (`syncEngine.service.ts:261-276`) — hàm legacy không được
  App.vue dùng (App.vue tự đăng ký listener :124-128); đừng "tiện tay" xóa.
- KHÔNG thêm dialog/UI mới; không thêm dependency; không đổi schema/DB.
- KHÔNG đổi hành vi C1 scenario C (anonymous sau restart — owner KHÔNG đổi nên guard không
  kích hoạt; cache giữ nguyên như spec C1 chấp nhận).

### ⚠ FLAG liên đới

- **C4/C6 specs** mô tả local-first clear sau login — guard này chạy TRƯỚC các flow đó và không
  thay đổi chúng khi cùng-owner. Test C3-C4-C6-C7 hiện hành không seed owner key → owner null →
  `first-login` → hành vi cũ giữ nguyên (đã kiểm: các test cũ không đụng key mới).
- **N1 (quota):** stash chiếm thêm storage — với `unlimitedStorage` (N1) thì không vấn đề;
  nếu ship N3 trước N1, stash của dataset lớn có thể chạm quota → thêm lý do ship N1 trước.
- Trường hợp B login khi popup của A còn mở tab khác (multi-context) thuộc scope N4/N5 —
  ownership guard này không giải quyết race đó.

---

## PHẦN B — FAILING TEST

File: `specs/N3-account-switch-guard.test.mjs`.

- Thực thi CODE THẬT: `dataOwner.service.ts` (RED — chưa tồn tại), `localStore.service.ts`,
  `types/localFirst.ts`, `syncEngine.service.ts` (mock supabase recorder + authMode).
- **T1** first-login: owner unset, local có 1 note anonymous → `ensure('user-a')` → status
  `first-login`, owner = user-a, local GIỮ NGUYÊN.
- **T2** same-owner: `ensure('user-a')` lần 2 → `same-owner`, local giữ nguyên.
- **T3** foreign: seed note chưa-sync của A + caches + queue + conflict backups →
  `ensure('user-b')` → `foreign-stashed`, local-first RỖNG, 7 key account-scoped bị xóa,
  stash[user-a] chứa đúng note chưa-sync (KHÔNG chứa entry `__synced: true`), owner = user-b,
  key per-device (`ui_lang`) còn nguyên.
- **T4** A quay lại: `ensure('user-a')` → `foreign-stashed` + `restoredOwnStash: true`, note của
  A nằm lại trong `bbqone_local_notes`, stash[user-a] bị xóa.
- **T5** integration: sau T3, chạy **`pushLocalToCloud('use-local')` THẬT** với
  `getCurrentUserId → 'user-b'` → recorder phải ghi nhận **0 upsert** chứa note id của A.
- **Timeline minh họa** (in, không assert): pipeline HIỆN TẠI không có guard — push note A
  dưới `user_id: 'user-b'` bằng chính code `syncEngine.service.ts` thật.
- **W1**: `runSyncFlow` trong `src/App.vue` gọi `ensureLocalDataOwnership(` TRƯỚC
  `detectCalendarDayOverflow` và có nhánh `foreign-stashed`.
- **W2**: `constants/storage.ts` export 2 key mới.

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: `dataOwner.service.ts` tồn tại đúng contract 4 trạng thái
(first-login / same-owner / foreign-stashed / restore-own-stash) với stash-chưa-sync + purge đúng
7 key account-scoped + không đụng key per-device, VÀ `runSyncFlow` (src/App.vue) gate ownership
trước push với fail-safe skip-push.
