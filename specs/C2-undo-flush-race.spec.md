# SPEC C2 — SW top-level flush xóa server-side ngay trong undo window 5s

> **Đối chiếu source (2026-07-03, branch `main`, tree sạch):** mọi `file:line` dưới đây đã được
> verify lại trên code hiện tại — KHÔNG lệch so với audit report.
>
> **Failing test đi kèm:** `specs/C2-undo-flush-race.test.mjs` — chạy `node specs/C2-undo-flush-race.test.mjs`
> từ repo root. Test load và thực thi CODE THẬT của `src/services/pendingDeleteCommit.service.ts`
> (transpile bằng package `typescript` có sẵn trong devDependencies), KHÔNG phải bản copy.

---

## PHẦN A — SPEC

### Root cause (1 câu)

`background.ts:107` chạy `flushOrphanedPendingDeleteCommits()` ở **top-level của service worker**
(chạy lại mỗi lần SW cold-start — mà SW bị đánh thức bởi *bất kỳ* `chrome.storage` write nào vì
listener `chrome.storage.onChanged` ở `background.ts:93`), trong khi queue được ghi **ngay lúc MỞ**
undo window (`undoToast.ts:77`) chứ không phải lúc hết hạn — nên SW wake trong 5s undo window sẽ
thực thi delete server-side trước khi user kịp bấm Undo.

Hệ quả đầy đủ: user bấm Undo → chỉ restore bản local (row "sạch": `updated_at ≤ synced_at`) →
không bao giờ được push lại → lần pull kế tiếp xóa nốt bản local → **mất vĩnh viễn dù UI báo undo
thành công**.

### Nguyên tắc fix

Queue entry mang **deadline** (`expiresAt`). Flush có 2 mode:

- `'force'` (mặc định — giữ nguyên hành vi 2 call site không đổi): thực thi mọi entry.
- `'respect-expiry'` (chỉ dùng cho top-level SW): **chỉ** thực thi entry đã quá hạn
  (`Date.now() >= expiresAt + FLUSH_EXPIRY_GRACE_MS`); entry chưa hết hạn giữ nguyên trong queue.

3 call site hiện có và mode của từng cái **sau fix**:

| Call site | Hiện tại | Sau fix | Lý do |
|---|---|---|---|
| `background.ts:107` (top-level SW) | flush tất cả | `'respect-expiry'` | SW wake giữa undo window không được xóa sớm |
| `background.ts:132` (message handler) | flush tất cả | **KHÔNG ĐỔI** (default `'force'`) | Message chỉ gửi khi popup đóng (`useCommitPendingDeletesOnClose.ts:26`) — popup đóng = không còn undo được |
| `pages/App.vue:166` (popup mount) | flush tất cả | **KHÔNG ĐỔI** (default `'force'`) | Popup mới mở = undo window của popup cũ vô nghĩa (pendingActions nằm in-memory popup cũ); flush trước khi pull để tránh row "revert" — đúng comment sẵn có tại `pages/App.vue:165` |

### Thay đổi 1/3 — `src/services/pendingDeleteCommit.service.ts`

**1a. Thêm type + hằng số** (đặt sau `export const FLUSH_PENDING_DELETES_MESSAGE ...`, dòng 8):

```ts
/** Entry trong queue: id hành động + thời điểm undo window hết hạn (epoch ms). */
export interface PendingDeleteCommitEntry {
  id: string
  expiresAt: number
}

export type FlushMode = 'force' | 'respect-expiry'

/** Đệm sau expiresAt trước khi SW tự flush — tránh đua với chính timer commit của popup. */
const FLUSH_EXPIRY_GRACE_MS = 1_000
```

**1b. `readQueue` — normalize entry, legacy string coi như ĐÃ hết hạn.**

Code hiện tại (verbatim, `pendingDeleteCommit.service.ts:40-49`):

```ts
async function readQueue(): Promise<string[]> {
  try {
    const chunk = await chrome.storage.local.get(BBQ_PENDING_DELETE_COMMITS_KEY)
    const raw = chunk[BBQ_PENDING_DELETE_COMMITS_KEY]
    if (!Array.isArray(raw)) return []
    return raw.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}
```

Thay bằng:

```ts
function normalizeQueueEntry(raw: unknown): PendingDeleteCommitEntry | null {
  // Legacy (bản < fix): entry là string actionId → coi như đã hết hạn để flush xử lý ngay.
  if (typeof raw === 'string' && raw.length > 0) return { id: raw, expiresAt: 0 }
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as { id?: unknown; expiresAt?: unknown }
    if (typeof r.id === 'string' && r.id.length > 0) {
      return { id: r.id, expiresAt: typeof r.expiresAt === 'number' ? r.expiresAt : 0 }
    }
  }
  return null
}

async function readQueue(): Promise<PendingDeleteCommitEntry[]> {
  try {
    const chunk = await chrome.storage.local.get(BBQ_PENDING_DELETE_COMMITS_KEY)
    const raw = chunk[BBQ_PENDING_DELETE_COMMITS_KEY]
    if (!Array.isArray(raw)) return []
    return raw
      .map(normalizeQueueEntry)
      .filter((e): e is PendingDeleteCommitEntry => e !== null)
  } catch {
    return []
  }
}
```

**1c. `writeQueue`** — chỉ đổi type tham số: `async function writeQueue(ids: PendingDeleteCommitEntry[])`.
Thân hàm (`:51-61`) giữ nguyên (`ids.length === 0` → remove key; ngược lại → set).

**1d. `registerPendingDeleteCommit` — thêm tham số `expiresAt` (bắt buộc).**

Hiện tại (verbatim, `:64-69`):

```ts
export async function registerPendingDeleteCommit(actionId: string): Promise<void> {
  const queue = await readQueue()
  if (!queue.includes(actionId)) {
    await writeQueue([...queue, actionId])
  }
}
```

Thay bằng:

```ts
export async function registerPendingDeleteCommit(
  actionId: string,
  expiresAt: number,
): Promise<void> {
  const queue = await readQueue()
  if (!queue.some((e) => e.id === actionId)) {
    await writeQueue([...queue, { id: actionId, expiresAt }])
  }
}
```

Caller duy nhất trong repo là `undoToast.ts:77` (đã grep xác nhận) — sửa ở Thay đổi 2/3.

**1e. `unregisterPendingDeleteCommit`** (`:71-75`): đổi filter từ
`queue.filter((id) => id !== actionId)` thành `queue.filter((e) => e.id !== actionId)`.

**1f. `flushOrphanedPendingDeleteCommits` — thêm mode.**

Hiện tại (verbatim, `:99-113` — chú ý pattern retry `remaining` PHẢI GIỮ NGUYÊN cho entry lỗi):

```ts
export async function flushOrphanedPendingDeleteCommits(): Promise<void> {
  const queue = await readQueue()
  if (queue.length === 0) return

  const remaining: string[] = []
  for (const actionId of queue) {
    try {
      await executePendingDelete(actionId)
    } catch (e) {
      console.warn('[BBQOne] Pending delete flush failed:', actionId, e)
      remaining.push(actionId)
    }
  }
  await writeQueue(remaining)
}
```

Thay bằng:

```ts
export async function flushOrphanedPendingDeleteCommits(
  mode: FlushMode = 'force',
): Promise<void> {
  const queue = await readQueue()
  if (queue.length === 0) return

  const now = Date.now()
  const remaining: PendingDeleteCommitEntry[] = []
  for (const entry of queue) {
    // Undo window còn mở → không được xóa sớm; giữ lại chờ lần flush sau.
    if (mode === 'respect-expiry' && now < entry.expiresAt + FLUSH_EXPIRY_GRACE_MS) {
      remaining.push(entry)
      continue
    }
    try {
      await executePendingDelete(entry.id)
    } catch (e) {
      console.warn('[BBQOne] Pending delete flush failed:', entry.id, e)
      remaining.push(entry)
    }
  }
  await writeQueue(remaining)
}
```

`executePendingDelete` (`:77-93`) và `parseUndoDeleteActionId` (`:28-38`): **không đổi**.

### Thay đổi 2/3 — `src/stores/undoToast.ts`

`expiresAt` ĐÃ được tính sẵn cho toast item — reuse đúng giá trị đó. Hiện tại (verbatim, `:59-83`):

```ts
  async function schedule(action: UndoToastAction): Promise<void> {
    if (pendingActions.has(action.id)) {
      await commit(action.id)
    }

    const durationMs = action.durationMs ?? DEFAULT_UNDO_MS
    pendingActions.set(action.id, {
      undo: action.undo,
      commit: action.commit,
    })
    items.value = [
      ...items.value,
      {
        id: action.id,
        message: action.message,
        expiresAt: Date.now() + durationMs,
      },
    ]
    void registerPendingDeleteCommit(action.id)
    timers.set(action.id, setTimeout(() => {
      void commit(action.id).catch((error) => {
        console.error('[BBQOne] Undo toast commit failed', error)
      })
    }, durationMs))
  }
```

Diff (hoist `expiresAt`, truyền vào register):

```diff
     const durationMs = action.durationMs ?? DEFAULT_UNDO_MS
+    const expiresAt = Date.now() + durationMs
     pendingActions.set(action.id, {
       undo: action.undo,
       commit: action.commit,
     })
     items.value = [
       ...items.value,
       {
         id: action.id,
         message: action.message,
-        expiresAt: Date.now() + durationMs,
+        expiresAt,
       },
     ]
-    void registerPendingDeleteCommit(action.id)
+    void registerPendingDeleteCommit(action.id, expiresAt)
```

### Thay đổi 3/3 — `src/background.ts:107`

```diff
-void flushOrphanedPendingDeleteCommits()
+void flushOrphanedPendingDeleteCommits('respect-expiry')
```

Message handler `background.ts:128-135` **không đổi** (verbatim để nhận diện — đừng đụng):

```ts
chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  void (async () => {
    try {
      if (isFlushPendingDeletesMessage(msg)) {
        await flushOrphanedPendingDeleteCommits()
        sendResponse({ ok: true })
        return
      }
```

`pages/App.vue:164-166` **không đổi** (verbatim):

```ts
    // Chốt xóa còn trong queue trước khi pull server — tránh “revert” sau khi đóng popup giữa undo 5s.
    await flushOrphanedPendingDeleteCommits()
```

### Edge case BẮT BUỘC giữ

1. **Legacy string entry** (queue ghi bởi bản đang chạy production, không có `expiresAt`):
   normalize thành `{ id, expiresAt: 0 }` → luôn coi là đã hết hạn → được flush ở mọi mode.
2. **Flush-on-message** (`background.ts:132`) và **flush lúc popup mount** (`pages/App.vue:166`):
   giữ nguyên semantics "xóa ngay" — đạt được bằng default `'force'`, hai call site đó
   **không cần sửa một ký tự nào**.
3. Pattern **retry entry lỗi** (giữ trong `remaining`, `pendingDeleteCommit.service.ts:104-112`)
   phải còn nguyên — đây là cơ chế duy nhất retry delete khi offline.

### KHÔNG được đổi (chặn over-reach)

- KHÔNG xóa/di chuyển lệnh flush top-level `background.ts:107` — nó là đường duy nhất commit
  delete khi popup crash mà message không kịp gửi. Chỉ đổi mode.
- KHÔNG đụng `useCommitPendingDeletesOnClose.ts`, `executePendingDelete`, `parseUndoDeleteActionId`.
- KHÔNG đổi `DEFAULT_UNDO_MS`, không thêm dependency, không đổi schema DB, không đổi kiến trúc queue
  (vẫn 1 key `bbqone_pending_delete_commits` trong `chrome.storage.local`).
- KHÔNG "tiện tay" sửa logic commit/undo trong `undoToast.ts` ngoài diff ở trên (bug C3 — restore
  khi commit fail — là finding riêng, ngoài scope spec này).

### ⚠ FLAG liên đới (đọc trước khi nghĩ tới cách fix khác)

- Fix C2 **không phụ thuộc và không được trông cậy vào fix C1** (merge-guard pull): row được undo
  restore là row *sạch* (`updated_at ≤ synced_at`) nên merge-guard của C1 sẽ KHÔNG giữ nó lại khi
  pull — nếu server đã lỡ xóa thì không cứu được. Phải chặn từ queue như spec này.
- Sau fix, nếu SW wake giữa undo window: entry được giữ lại trong queue (không xóa sớm). Nếu popup
  sau đó bấm Undo → `unregisterPendingDeleteCommit` gỡ entry → không còn gì để flush. Nếu popup
  commit bình thường → cũng unregister. Entry chỉ "orphan" khi popup chết đột ngột — khi đó nó sẽ
  được flush ở lần wake/mở popup kế tiếp sau khi hết hạn. Đúng semantics mong muốn.

---

## PHẦN B — FAILING TEST

File: `specs/C2-undo-flush-race.test.mjs`. Chạy:

```
node specs/C2-undo-flush-race.test.mjs            # chạy trên source thật
node specs/C2-undo-flush-race.test.mjs <path.ts>  # (tuỳ chọn) chạy trên một bản implement khác để smoke-test spec
```

- Test **transpile và thực thi code thật** `src/services/pendingDeleteCommit.service.ts`
  (+ `src/constants/storage.ts` thật để lấy đúng key), mock `chrome.storage.local` in-memory và
  3 service delete (recorder ghi lại `t=` của từng server delete).
- Timing thật được encode: undo window `DEFAULT_UNDO_MS = 5_000` (`undoToast.ts:27`), SW cold-start
  mô phỏng ở t≈120ms (thực tế 50–300ms — evaluate module graph gồm supabase-js). Assertion
  **không phụ thuộc** vào sleep chính xác: chỉ cần flush chạy trước `expiresAt` là đủ deterministic.
- 5 case:
  - **A1 (RED trên code hiện tại):** register(`calendar:aaaa-1111`, now+5000) → t≈120ms SW gọi
    `flushOrphanedPendingDeleteCommits('respect-expiry')` → assert KHÔNG có server delete và entry
    vẫn còn trong queue. Code hiện tại ignore cả `expiresAt` lẫn mode → xóa ngay → FAIL, in rõ
    data bị mất.
  - **A2:** legacy string entry `'note:bbbb'` seed thẳng vào storage → flush `'respect-expiry'`
    PHẢI xóa (legacy = expired). Pass cả trước lẫn sau fix — pin edge case #1.
  - **A3:** register entry đã quá hạn (`expiresAt = now − 2000`) → flush `'respect-expiry'` PHẢI
    xóa (orphan thật vẫn được dọn). Pass cả trước lẫn sau.
  - **A4:** flush **không tham số** (đúng cách gọi của `pages/App.vue:166` + message handler) PHẢI
    xóa entry chưa hết hạn (force). Pass cả trước lẫn sau — pin edge case #2.
  - **A5:** register → unregister → queue rỗng, flush không xóa gì (đường Undo). Pass cả trước lẫn sau.
- Test exit code 1 nếu bất kỳ assert fail, in timeline `t=` như harness audit.

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: queue entry được ghi kèm `expiresAt` qua
`registerPendingDeleteCommit(actionId, expiresAt)`, và `flushOrphanedPendingDeleteCommits('respect-expiry')`
bỏ qua (giữ lại trong queue) entry chưa quá hạn trong khi vẫn thực thi entry legacy-string/đã-quá-hạn,
còn `flushOrphanedPendingDeleteCommits()` không tham số vẫn thực thi tất cả.
