# SPEC N1 (+N8) — Quota 10MB chrome.storage.local: mất offline edit im lặng ở ~1.900 notes

> **Đối chiếu source (2026-07-13, branch `main`, tree sạch, v1.3.1):** mọi `file:line` dưới đây
> đã verify trên code hiện tại.
>
> **Failing test đi kèm:** `specs/N1-storage-quota.test.mjs` — chạy `node specs/N1-storage-quota.test.mjs`
> từ repo root. RED trên code hiện tại, GREEN sau khi áp đúng spec này.

---

## PHẦN A — SPEC

### Root cause (1 câu)

Permission `unlimitedStorage` đã bị gỡ (commit `4f80eee`) nên `chrome.storage.local` bị cap
**QUOTA_BYTES = 10.485.760 bytes** cho TỔNG mọi key, trong khi app cache toàn bộ
notes + bodies + calendar + bookmark-backups vào đó và **không có bất kỳ chỗ nào bắt lỗi quota**
(grep `QUOTA|quota` toàn `src/`: 0 kết quả) — `persistCache()` throw là offline edit chết im lặng.

### Phép toán kích hoạt

- 1 note (row ~350B) + 1 body content 5KB (~5,2KB) ≈ **5,55KB JSON**.
- 10.485.760 / 5.550 ≈ **~1.889 notes** là `chrome.storage.local.set` bắt đầu reject — còn sớm
  hơn vì `bookmarks_cache` (20 bản × nguyên tree), `bbqone_local_*`, `bbqone_conflict_backups`
  chia chung 10MB.
- Đường chết nguy hiểm nhất — **offline edit không bao giờ chạm đĩa**: `updateBody` nhánh catch
  offline ghi edit vào state in-memory rồi `await persistCache()` (`notes.ts:353`) → throw quota
  → caller là `scheduleSave` trong `NoteEditor.vue:92-101` (setTimeout async, **không có
  try/catch** — quote ở dưới) → unhandled rejection → user đóng popup là mất sạch, không toast,
  không log.

### Nguyên tắc fix (2 lớp)

1. **Gỡ trần:** thêm lại permission `unlimitedStorage` vào manifest — hợp lệ vì app là
   local-first đúng nghĩa (toàn bộ dữ liệu user nằm local), và đây là permission
   **không sinh warning prompt** khi cài.
2. **Lưới đỡ:** ghi cache là best-effort — `persistCache` **không bao giờ được throw** nữa
   (kể cả lỗi disk/corruption sau khi đã có unlimitedStorage), nhưng cũng **không được nuốt im**:
   `console.warn` + set `loadError` để UI hiện.
3. **(N8 — security, cùng cụm):** ngừng cache **plaintext tree đã decrypt** của bookmark backup
   mã hóa PIN xuống `chrome.storage.local`.

### Thay đổi 1/6 — `public/manifest.json`: thêm `unlimitedStorage`

Hiện tại (verbatim, `public/manifest.json:25-33`):

```json
  "permissions": [
    "storage",
    "contextMenus",
    "alarms",
    "clipboardWrite",
    "offscreen",
    "bookmarks",
    "downloads"
  ],
```

Diff:

```diff
   "permissions": [
     "storage",
+    "unlimitedStorage",
     "contextMenus",
```

### Thay đổi 2/6 — file MỚI `src/utils/cacheWrite.ts`

Tạo file mới với đúng nội dung (2 export):

```ts
/**
 * Ghi cache best-effort: KHÔNG throw — lỗi quota/disk không được giết thao tác
 * đã thành công (server save, offline edit in-memory). Lỗi được warn + báo qua onError.
 */
export async function safeCacheWrite(
  items: Record<string, unknown>,
  onError?: (e: unknown) => void,
): Promise<boolean> {
  try {
    await chrome.storage.local.set(items)
    return true
  } catch (e) {
    console.warn('[BBQOne] Cache write failed (storage quota/disk?):', e)
    try {
      onError?.(e)
    } catch {
      /* onError không được phép làm safeCacheWrite throw */
    }
    return false
  }
}

/**
 * N8: backup bookmark mã hóa PIN không được cache plaintext tree đã decrypt
 * xuống chrome.storage.local — strip tree trước khi persist.
 */
export function stripEncryptedBackupTrees<
  T extends { encrypted?: boolean; tree_json: unknown },
>(list: T[]): T[] {
  return list.map((b) => (b.encrypted ? { ...b, tree_json: [] } : b))
}
```

> Lưu ý type: `encrypted` phải là **optional** (`encrypted?: boolean`) — `BookmarkBackup`
> khai optional field; dùng `encrypted: boolean` sẽ fail `vue-tsc` tại `bookmarks.ts`
> (đã sửa 2026-07-13 sau lần verify đầu).

```ts
```

### Thay đổi 3/6 — `src/stores/notes.ts` `persistCache()`

Hiện tại (verbatim, `notes.ts:103-108`):

```ts
  async function persistCache(): Promise<void> {
    await chrome.storage.local.set({
      [NOTES_CACHE_KEY]: notes.value,
      [NOTE_BODIES_CACHE_KEY]: bodies.value,
    })
  }
```

Thay bằng:

```ts
  async function persistCache(): Promise<void> {
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

Thêm import (notes.ts hiện chưa import gì từ utils/cacheWrite):

```ts
import { safeCacheWrite } from '@/utils/cacheWrite'
```

`loadError` đã tồn tại sẵn (`notes.ts:32` — `const loadError = ref<string | null>(null)`) và đã
được UI hiển thị; không cần thêm state mới.

### Thay đổi 4/6 — `src/stores/calendarEvents.ts` `persistCache()`

Hiện tại (verbatim, `calendarEvents.ts:85-87`):

```ts
  async function persistCache(): Promise<void> {
    await chrome.storage.local.set({ [CALENDAR_EVENTS_CACHE_KEY]: events.value })
  }
```

Thay bằng (cùng pattern; `loadError` sẵn có tại `calendarEvents.ts:25`):

```ts
  async function persistCache(): Promise<void> {
    await safeCacheWrite({ [CALENDAR_EVENTS_CACHE_KEY]: events.value }, (e) => {
      loadError.value = e instanceof Error ? e.message : 'Cache write failed'
    })
  }
```

Thêm import: `import { safeCacheWrite } from '@/utils/cacheWrite'`

### Thay đổi 5/6 — `src/stores/bookmarks.ts` `persistBackupsCache()` (N8)

Hiện tại (verbatim, `bookmarks.ts:39-45` — chú ý lỗi bị nuốt HOÀN TOÀN im, và
`backups.value` chứa cả `tree_json` **plaintext đã decrypt** của backup mã hóa PIN — xem
`bookmarks.service.ts:67-76`: `decryptBookmarkTree(...)` rồi `out.push({ ..., tree_json: tree, encrypted: true })`):

```ts
  async function persistBackupsCache(): Promise<void> {
    try {
      await chrome.storage.local.set({ [BOOKMARKS_CACHE_KEY]: backups.value })
    } catch {
      /* ignore */
    }
  }
```

Thay bằng:

```ts
  async function persistBackupsCache(): Promise<void> {
    // N8: không cache plaintext tree đã decrypt của backup mã hóa PIN.
    await safeCacheWrite({
      [BOOKMARKS_CACHE_KEY]: stripEncryptedBackupTrees(backups.value),
    })
  }
```

Thêm import:

```ts
import { safeCacheWrite, stripEncryptedBackupTrees } from '@/utils/cacheWrite'
```

(Không truyền `onError` set `error.value` ở đây — cache backup fail không phải lỗi user-facing,
`console.warn` trong `safeCacheWrite` là đủ; giữ đúng UX hiện tại.)

### Thay đổi 6/6 — `docs/CHROME-STORE-PERMISSIONS.md`: thêm justification

Chèn section sau (đặt ngay SAU section `### \`storage\``, trước `### \`contextMenus\``):

```markdown
### `unlimitedStorage`

**Purpose**: BBQOne is a local-first application — the user's complete
notes, calendar events, and bookmark backup history are cached in
`chrome.storage.local` so the extension works fully offline. The default
10MB quota is insufficient for users with large note collections (a few
thousand notes with rich-text bodies exceeds it), and hitting the quota
would silently prevent offline edits from being persisted.

**User-facing functionality**: Reliable offline persistence of all user
data regardless of collection size. No data is collected or transmitted —
this permission only raises the local disk cap.
```

### Edge case BẮT BUỘC giữ

1. `persistCache` sau fix **không throw ở mọi đường** — cả nhánh try (online, sau khi server
   save thành công) lẫn nhánh catch offline (`notes.ts:277-285`, `:338-355`). Hành vi cũ:
   throw xuyên qua `scheduleSave` (`NoteEditor.vue:92-101` — verbatim:

   ```ts
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
   ```

   — không có try/catch) thành unhandled rejection. Sau fix: không còn đường throw từ cache
   write; lỗi hiện qua `loadError`.
2. `hydrateFromCache` (`notes.ts:110-123`) **không đổi** — kể cả khi cache là bản strip
   (backup encrypted có `tree_json: []`), hydrate vẫn hoạt động; xem trade-off bên dưới.
3. Lỗi THẬT từ server (SyncConflictError, non-network) trong `updateNote`/`updateBody` vẫn
   **rethrow như cũ** (`notes.ts:278-279`, `:339-340`) — fix này chỉ đụng cache-write, không
   đụng error-flow của network/save.

### Trade-off có chủ đích (không phải regression)

- Backup bookmark **mã hóa PIN** xem **offline** sẽ không còn nội dung tree (cache chỉ giữ
  metadata + `tree_json: []`). Online mở lại `listBackups()` decrypt như cũ. Bảo mật (không để
  plaintext của dữ liệu user chủ đích mã hóa nằm trên đĩa) > tiện offline. KHÔNG "sửa" bằng cách
  cache lại plaintext.

### KHÔNG được đổi (chặn over-reach)

- KHÔNG chuyển storage sang IndexedDB / không đổi kiến trúc cache 2 lớp (cache vs `bbqone_local_*`).
- KHÔNG đụng `hydrateFromCache`, `loadAll`, merge-guard, sync flow, `localStore.service.ts`.
- KHÔNG thêm dependency, không đổi schema/DB.
- KHÔNG đổi `catch` semantics của `updateNote`/`updateBody` (rethrow conflict + non-network như cũ).
- KHÔNG gỡ `console.warn` trong `safeCacheWrite` — đó là dấu vết duy nhất khi UI không hiện lỗi.

### ⚠ FLAG liên đới

- `sync.service.ts:239-247` (SW `syncFromCache` ghi cache trực tiếp bằng
  `chrome.storage.local.set`) cũng hưởng lợi từ `unlimitedStorage` nhưng **không sửa trong PR
  này** — nó nằm trong scope N5 (persist read-merge-write, spec `N4-N5-N11-multi-context`).
  Đừng tiện tay refactor.
- N2 (PostgREST cap 1.000 rows — spec `N2-pull-pagination`) độc lập với spec này: N1 lo GHI
  cache, N2 lo ĐỌC server. Cần cả hai để an toàn ở >1.000 notes.

---

## PHẦN B — FAILING TEST

File: `specs/N1-storage-quota.test.mjs`. Chạy:

```
node specs/N1-storage-quota.test.mjs
```

- **T1 (behavior — thực thi CODE THẬT):** transpile `src/utils/cacheWrite.ts` bằng package
  `typescript` sẵn có. RED hiện tại vì file chưa tồn tại. Assert: quota error → return false +
  onError được gọi + KHÔNG throw (kể cả khi onError throw); success → return true;
  `stripEncryptedBackupTrees` giữ nguyên backup thường, strip tree backup encrypted, không
  mutate mảng gốc.
- **W1 (wiring):** `public/manifest.json` có `"unlimitedStorage"` trong `permissions`.
- **W2 (wiring):** `docs/CHROME-STORE-PERMISSIONS.md` có section justification `unlimitedStorage`.
- **W3/W4/W5 (wiring):** thân `persistCache` của `notes.ts` + `calendarEvents.ts` gọi
  `safeCacheWrite(` và KHÔNG còn gọi thẳng `chrome.storage.local.set`; thân
  `persistBackupsCache` của `bookmarks.ts` gọi cả `safeCacheWrite(` lẫn
  `stripEncryptedBackupTrees(`.
- **Timeline minh họa** (in ra, không assert): mock storage 10MB quota, mô phỏng pattern ghi
  hiện tại ở 1.900 notes × 5,55KB → in `t=` từng mốc tới lúc set() reject và offline edit chết.

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: manifest có `unlimitedStorage` + docs có justification,
`src/utils/cacheWrite.ts` tồn tại đúng contract (safeCacheWrite không-throw trả bool + gọi
onError; stripEncryptedBackupTrees đúng ngữ nghĩa), và cả 3 store (notes, calendarEvents,
bookmarks) persist cache qua safeCacheWrite (bookmarks kèm strip).
