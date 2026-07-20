# SPEC S1 — Plaintext của secure folder bị ghi xuống `chrome.storage.local`

> **Đối chiếu source (2026-07-20, branch `main`, tree sạch, v1.3.3):** mọi `file:line` dưới đây
> đã verify trên code hiện tại.
>
> **Failing test đi kèm:** `specs/S1-secure-cache-leak.test.mjs` — chạy
> `node specs/S1-secure-cache-leak.test.mjs` từ repo root. RED trên code hiện tại,
> GREEN sau khi áp đúng spec này.

---

## PHẦN A — SPEC

### Root cause (1 câu)

Sau khi user unlock secure folder, `refreshDecryptedNotesAfterLoad()` decrypt title/label/content
**thẳng vào state** rồi gọi `notes.persistCache()` (`secureFolder.ts:124`), mà `persistCache()`
(`notes.ts:104-124`) ghi nguyên `notes.value` + `bodies.value` xuống `chrome.storage.local`
**không có bất kỳ guard `is_secure` nào** — nên plaintext của đúng thứ user chủ đích mã hóa
nằm lại trên đĩa sau khi popup đóng.

### Vì sao nghiêm trọng

1. **CryptoKey chết đúng thiết kế, plaintext thì không.** Comment ở `secureFolder.ts:20-23`
   nói rõ ý đồ (verbatim):

   ```ts
   /**
    * CryptoKey chỉ trong RAM (Pinia); không ghi storage.
    * Đóng popup extension → mất key → phải nhập passphrase lại.
    */
   ```

   Key biến mất thật, nhưng plaintext đã kịp chạm đĩa → **thiết kế bị vô hiệu hoàn toàn**.
2. **Không có đường dọn.** `lockAll()` chỉ được gọi ở `onLogout` (`App.vue:254`). Đóng popup
   bình thường (đường đi 99% trường hợp) không dọn gì.
3. **Đúng threat model bị thủng.** Secure folder sinh ra để chống người đọc được đĩa (máy dùng
   chung, backup, malware đọc file) — và đó chính xác là kẻ đọc được
   `%LOCALAPPDATA%\...\Extension State`.
4. **Đã có tiền lệ đúng.** N8 đã vá y hệt vấn đề này cho bookmark backup bằng
   `stripEncryptedBackupTrees()` (`cacheWrite.ts:27-31`). S1 = **bản đối xứng còn thiếu cho notes**.

### Phạm vi rò rỉ — KHÔNG chỉ một hàm

Rò rỉ là **hệ thống**, không riêng `refreshDecryptedNotesAfterLoad`. Mọi đường mutate note đều
theo pattern “encrypt để gửi server → decrypt lại để hiển thị → `persistCache()`”:

| Đường | file:line | State lúc gọi `persistCache()` |
|---|---|---|
| `refreshDecryptedNotesAfterLoad` | `secureFolder.ts:106-121` → `:124` | plaintext |
| `createNote` | `notes.ts:224-234` → `:240` | plaintext |
| `updateNote` | `notes.ts:283` | plaintext |
| `updateBody` | `notes.ts:371-372` | plaintext |
| `createBodyForNote` | `notes.ts:441-447` | plaintext |
| nhánh `catch` offline của `updateNote`/`updateBody` | `notes.ts:297`, `:386-391` | plaintext |

→ Vá từng call site là sai hướng. **Phải chặn tại `persistCache()` — choke point duy nhất.**

### Cái ĐANG đúng — không được phá

`sync.service.ts:114-123` guard push rất chuẩn (verbatim):

```ts
      if (folder?.is_secure) {
        const titlePlain = !isEncryptedEnvelope(n.title)
        const anyBodyPlain = bodies.some(
          (b) =>
            !isEncryptedEnvelope(b.label) || !isEncryptedEnvelope(b.content),
        )
        if ((titlePlain || anyBodyPlain) && !key) {
          continue
        }
      }
```

→ **Cloud chưa bao giờ nhận plaintext.** S1 chỉ đụng ĐĨA LOCAL, không đụng đường push.

### Nguyên tắc fix

> **Invariant S1:** `chrome.storage.local` **không bao giờ** chứa plaintext của row thuộc secure
> folder. RAM (state đang hiển thị sau unlock) **vẫn** giữ plaintext — hai thứ này phải tách nhau.

Thực hiện bằng “niêm phong lúc ghi”: `persistCache()` ghi một **bản sao đã re-encrypt**, state
in-memory không bị đụng tới.

### ⚠ Bẫy ngược chiều — BẮT BUỘC xử lý

`persistCache()` đọc-merge-ghi (N5) và `mergeSnapshotWithStored` **có thể kéo row từ đĩa vào RAM**
(`sync.service.ts:73-79`, verbatim):

```ts
  const out = snapshot.map((mine) => {
    const disk = storedById.get(mine.id)
    if (disk && isDirty(disk) && new Date(disk.updated_at) > new Date(mine.updated_at)) {
      return disk
    }
    return mine
  })
```

Sau fix, đĩa chỉ còn ciphertext → nhánh `return disk` sẽ nhét **envelope** vào `notes.value`, và
UI của folder ĐANG unlock hiện chuỗi `retronote:1:...`. Vì vậy `persistCache()` phải **decrypt lại
sau merge, trước khi seal**. Bỏ bước này = regression UI thấy ngay.

Bẫy có **mặt thứ hai** (leader-audit 2026-07-20): `loadAll()` có 2 nhánh tự nạp RAM từ đĩa mà
KHÔNG bao giờ đi qua `persistCache()` — (a) `hydrateFromCache()` rồi early-return khi
`!isOnline()` (`notes.ts:144-145`); (b) nhánh `catch` đọc lại cache khi fetch fail/timeout
(`notes.ts:156-170`). Hôm nay hai nhánh này hiển thị đúng **nhờ chính cái leak** (đĩa đang có
plaintext). Sau fix, đĩa chỉ còn envelope → unlock khi offline, hoặc mạng chập chờn giữa phiên
(`refreshStoresFromNetwork` ở `pages/App.vue:106`, `stores/sync.ts:81`) là folder đang unlock
hiện `retronote:1:…`, kèm "flash ciphertext" tối đa 12s trong lúc chờ fetch. Xử lý ở **thay
đổi 3b** — thiếu nó thì W5 của harness FAIL.

### Thay đổi 1/4 — file MỚI `src/utils/secureCache.ts`

```ts
import { encryptField, isEncryptedEnvelope } from '@/utils/secureCrypto'

/** Hình dạng tối thiểu cần để niêm phong — khớp Note/NoteBody, không phụ thuộc `@/types`. */
export interface SealableNote {
  id: string
  folder_id: string | null
  title: string
}

export interface SealableBody {
  id: string
  note_id: string
  label: string
  content: string
}

export interface SealResult<N, B> {
  notes: N[]
  bodies: B[]
  /** Số row bị loại khỏi bản ghi cache vì còn plaintext mà không có key (nhánh phòng vệ). */
  dropped: number
}

/**
 * S1: `chrome.storage.local` KHÔNG được chứa plaintext của row thuộc secure folder.
 *
 * Trả về BẢN SAO đã niêm phong để ghi xuống đĩa. State RAM (đang hiển thị cho user sau khi
 * unlock) giữ nguyên plaintext và KHÔNG bị mutate — UI phụ thuộc vào điều này.
 *
 * Quy tắc cho row thuộc secure folder:
 *   - đã là envelope        → giữ nguyên (KHÔNG encrypt chồng — sẽ hỏng dữ liệu)
 *   - plaintext + CÓ key    → `encryptField`
 *   - plaintext + KHÔNG key → loại row khỏi bản ghi cache
 *
 * Nhánh cuối là phòng vệ, không đạt tới trong luồng thường (plaintext chỉ xuất hiện khi folder
 * đang unlock, tức luôn có key). Chọn mất một edit chưa sync còn hơn ghi plaintext xuống đĩa.
 */
export async function sealSecureRowsForCache<
  N extends SealableNote,
  B extends SealableBody,
>(input: {
  notes: N[]
  bodies: B[]
  isSecureFolder: (folderId: string | null) => boolean
  getKey: (folderId: string) => CryptoKey | null
}): Promise<SealResult<N, B>> {
  const { notes, bodies, isSecureFolder, getKey } = input

  const folderOfNote = new Map<string, string | null>()
  for (const n of notes) folderOfNote.set(n.id, n.folder_id)

  const droppedNoteIds = new Set<string>()
  const outNotes: N[] = []
  let dropped = 0

  for (const n of notes) {
    const folderId = n.folder_id
    if (!folderId || !isSecureFolder(folderId)) {
      outNotes.push(n)
      continue
    }
    if (isEncryptedEnvelope(n.title)) {
      outNotes.push(n)
      continue
    }
    const key = getKey(folderId)
    if (!key) {
      droppedNoteIds.add(n.id)
      dropped++
      continue
    }
    outNotes.push({ ...n, title: await encryptField(n.title, key) })
  }

  const outBodies: B[] = []
  for (const b of bodies) {
    if (droppedNoteIds.has(b.note_id)) {
      dropped++
      continue
    }
    const folderId = folderOfNote.get(b.note_id) ?? null
    if (!folderId || !isSecureFolder(folderId)) {
      outBodies.push(b)
      continue
    }
    const labelPlain = !isEncryptedEnvelope(b.label)
    const contentPlain = !isEncryptedEnvelope(b.content)
    if (!labelPlain && !contentPlain) {
      outBodies.push(b)
      continue
    }
    const key = getKey(folderId)
    if (!key) {
      dropped++
      continue
    }
    outBodies.push({
      ...b,
      label: labelPlain ? await encryptField(b.label, key) : b.label,
      content: contentPlain ? await encryptField(b.content, key) : b.content,
    })
  }

  return { notes: outNotes, bodies: outBodies, dropped }
}
```

### Thay đổi 2/4 — `src/stores/secureFolder.ts`: tách decrypt khỏi persist

Hiện tại (verbatim, `secureFolder.ts:93-125`) — chú ý dòng cuối `await notes.persistCache()`:

```ts
  async function refreshDecryptedNotesAfterLoad(): Promise<void> {
    if (sessionKeys.value.size === 0) return
    const notes = useNotesStore()
    const folders = useFoldersStore()
    for (const [folderId, key] of sessionKeys.value) {
```

*(…thân hàm giữ NGUYÊN…)*

```ts
    }
    await notes.persistCache()
  }
```

Đổi **2 thứ**, không đụng phần thân ở giữa:

1. Đổi tên `refreshDecryptedNotesAfterLoad` → `decryptLoadedSecureRows`.
2. **Xóa dòng `await notes.persistCache()`** (dòng `:124`). Hàm này từ nay là *thuần overlay
   in-place*, không chạm đĩa — nếu giữ lại sẽ thành đệ quy vì `persistCache()` sắp gọi ngược lại nó.

Kết quả:

```ts
  /**
   * S1: decrypt in-place mọi row envelope thuộc folder ĐANG unlock.
   * KHÔNG ghi cache — `persistCache()` gọi hàm này sau merge, gọi ngược lại sẽ thành đệ quy.
   */
  async function decryptLoadedSecureRows(): Promise<void> {
    if (sessionKeys.value.size === 0) return
    // … thân hàm giữ nguyên 100% …
  }
```

Trong block `return { ... }` cuối store: đổi `refreshDecryptedNotesAfterLoad,` thành
`decryptLoadedSecureRows,`.

### Thay đổi 3/4 — `src/stores/notes.ts`

**3a. `persistCache()`** — hiện tại (verbatim, `notes.ts:104-124`):

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

Thay bằng:

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

    // S1: merge có thể kéo row CIPHERTEXT từ đĩa vào RAM (context khác vừa ghi bản niêm phong)
    // → decrypt lại cho folder đang unlock, nếu không UI hiện chuỗi `retronote:1:…`.
    const secure = useSecureFolderStore()
    await secure.decryptLoadedSecureRows()

    // S1: RAM giữ plaintext để hiển thị; ĐĨA chỉ được nhận envelope.
    const folders = useFoldersStore()
    const sealed = await sealSecureRowsForCache({
      notes: notes.value,
      bodies: bodies.value,
      isSecureFolder: folders.isSecureFolder,
      getKey: secure.getKey,
    })

    await safeCacheWrite(
      {
        [NOTES_CACHE_KEY]: sealed.notes,
        [NOTE_BODIES_CACHE_KEY]: sealed.bodies,
      },
      (e) => {
        loadError.value = e instanceof Error ? e.message : 'Cache write failed'
      },
    )
  }
```

Thêm import:

```ts
import { sealSecureRowsForCache } from '@/utils/secureCache'
```

`useSecureFolderStore` và `useFoldersStore` **đã được import sẵn** (`notes.ts:10-11`) — không thêm
import store mới, không sinh circular import mới.

**3b. `loadAll()`** — 3 chỗ, đều trong một hàm:

*3b-1 — overlay sau hydrate.* Hiện tại (verbatim, `notes.ts:144-145`):

```ts
      await hydrateFromCache()
      if (!isOnline()) return
```

Thay bằng:

```ts
      await hydrateFromCache()
      // S1: đĩa chỉ còn envelope — decrypt-overlay ngay cho folder đang unlock.
      // No-op khi chưa unlock (sessionKeys rỗng). PHẢI đứng TRƯỚC early-return offline.
      await useSecureFolderStore().decryptLoadedSecureRows()
      if (!isOnline()) return
```

*3b-2 — bỏ call site cũ.* Hiện tại (verbatim, `notes.ts:154-155`):

```ts
      await persistCache()
      await useSecureFolderStore().refreshDecryptedNotesAfterLoad()
```

Thay bằng (bỏ hẳn dòng 2 — `persistCache()` đã bao gồm decrypt-overlay + seal):

```ts
      await persistCache()
```

*3b-3 — overlay cuối catch.* Trong nhánh `catch` của `loadAll` (`notes.ts:156-170`), SAU hai
`if` gán `notes.value`/`bodies.value` từ cache, thêm dòng cuối:

```ts
      // S1: cache-reload trong catch cũng nạp envelope từ đĩa → overlay lại.
      await useSecureFolderStore().decryptLoadedSecureRows()
```

Vì sao 3b-1/3b-3 bắt buộc: hai nhánh này không bao giờ chạm `persistCache()` nên W2 không cứu
được. Thiếu 3b-1: unlock khi offline (hoặc `lockFolder` một folder khác lúc offline) hiện
`retronote:1:…`; 3b-1 đặt TRƯỚC fetch còn chặn flash ciphertext tối đa 12s và sửa luôn bug
offline-unlock có sẵn. Thiếu 3b-3: fetch timeout giữa phiên với folder đang unlock → cùng triệu
chứng. Overlay idempotent và KHÔNG đệ quy (`decryptLoadedSecureRows` không còn persist — thay
đổi 2/4).

### Thay đổi 4/4 — `SECURITY.md`: ghi invariant

Chèn section sau vào cuối `SECURITY.md`:

```markdown
## Secure folder — invariant lưu trữ (S1)

- `chrome.storage.local` **không bao giờ** chứa plaintext của note thuộc secure folder.
  State in-memory giữ plaintext để hiển thị sau khi unlock; `persistCache()` niêm phong lại
  (`sealSecureRowsForCache`) trước mỗi lần ghi đĩa.
- CryptoKey chỉ sống trong RAM (Pinia) và chết khi popup đóng — cache trên đĩa phải ở dạng
  envelope để invariant đó có ý nghĩa.
- Đường push lên cloud đã được guard riêng tại `sync.service.ts:114-123` (không push plaintext
  khi thiếu key). Hai lớp này độc lập, đừng gộp.
- Plaintext tồn dư từ bản ≤ 1.3.3 (ghi trước khi có invariant) bị ghi đè ở lần `persistCache()`
  thành công đầu tiên sau khi cập nhật — mở app online một lần là đủ. Giới hạn nền tảng:
  `chrome.storage.local` chạy trên LevelDB — giá trị đã bị đè có thể còn nằm trong file `.ldb`
  cũ tới khi compaction; extension API không có cách xóa forensic.
```

### Edge case BẮT BUỘC giữ

1. **Không encrypt chồng.** Row đã là envelope phải đi qua nguyên vẹn. Encrypt lần 2 tạo
   `retronote:1:<iv>:base64("retronote:1:…")` — decrypt một lần ra chuỗi rác, **hỏng dữ liệu
   không hồi phục được**. Đây là failure mode nguy hiểm nhất của spec này.
2. **Không mutate input.** `sealSecureRowsForCache` phải trả bản sao; mutate `notes.value` sẽ
   biến UI của folder đang unlock thành chuỗi envelope ngay lập tức.
3. **Folder thường không bị đụng.** Note ở folder không secure (kể cả `folder_id === null`)
   phải đi qua y nguyên — không tốn crypto, không đổi object.
4. **`hydrateFromCache` (`notes.ts:126-139`) KHÔNG đổi.** Nó nạp envelope vào state; folder khóa
   hiển thị qua `isFolderLocked()` như cũ (`NoteList.vue:44,80`). Trạng thái “cache toàn ciphertext”
   đã tồn tại sẵn hôm nay với user chưa bao giờ unlock — không phải đường mới. Overlay cho folder
   ĐANG unlock nằm ở `loadAll` (3b-1/3b-3), không nằm trong `hydrateFromCache`.
5. **`safeCacheWrite` vẫn không được throw** (N1). Seal chạy TRƯỚC `safeCacheWrite`; nếu seal
   throw thì `persistCache` throw — nên seal **không được** gọi gì có thể throw ngoài
   `encryptField`. Không thêm try/catch nuốt lỗi ở đây: encryptField throw nghĩa là key hỏng,
   phải nổ to.
6. **SW context**: `sync.service.ts:239-247` ghi cache trực tiếp bằng `chrome.storage.local.set`
   nhưng dữ liệu nó cầm là **từ đĩa/server = luôn envelope** (SW không có Pinia session key nên
   không bao giờ có plaintext). Không cần sửa — xem FLAG.

### Trade-off có chủ đích (không phải regression)

- Row thuộc secure folder có **plaintext trong RAM mà không có key** bị loại khỏi bản ghi cache
  (`dropped`). Trạng thái này không đạt tới trong luồng thường. Ưu tiên: không-plaintext-trên-đĩa
  > giữ một edit chưa sync. **KHÔNG “sửa” bằng cách ghi plaintext.**
- Mỗi lần `persistCache` sẽ re-encrypt các row plaintext của folder đang unlock (IV mới mỗi lần).
  Chi phí: AES-GCM trên chuỗi ngắn ≈ vài µs/row; PBKDF2 **không** chạy lại (key đã derive sẵn).
  Với folder 500 note ≈ vài ms mỗi autosave — chấp nhận được.
- Overlay decrypt (3b-1/3b-3 và trong `persistCache`) chạy thêm một lượt khi có folder đang
  unlock — decrypt cùng bậc µs/row với chiều encrypt; khi chưa unlock là no-op
  (`sessionKeys.value.size === 0`, thoát ngay dòng đầu).

### KHÔNG được đổi (chặn over-reach)

- KHÔNG đụng `sync.service.ts` (guard push, `mergeSnapshotWithStored`, `syncFromCache`).
- KHÔNG đụng `hydrateFromCache`, `mergeFreshWithDirtyLocal`, merge-guard, sync flow.
- KHÔNG đổi format envelope, KHÔNG đổi `DEFAULT_PBKDF2_ITERATIONS`, KHÔNG đụng `secureCrypto.ts`.
  (Việc đó là S2 — xem `specs/S2-e2ee-architecture.md`.)
- KHÔNG đổi schema/DB, không thêm dependency.
- KHÔNG chuyển `sessionKeys` sang `chrome.storage.session` để “tiện” — key trong RAM là chủ ý.
- KHÔNG mở rộng sang calendar/folder name trong PR này (đó là S3).

### ⚠ FLAG liên đới

- **`bookmarks.ts`** đã được N8 xử lý bằng `stripEncryptedBackupTrees` — cơ chế khác (strip, không
  seal) vì backup có sẵn cột `encrypted`. Đừng gộp hai đường lại.
- **`calendarEvents.ts` `persistCache()`**: calendar hiện **chưa** có khái niệm secure → chưa rò rỉ.
  Khi S3 mã hóa calendar thì mới cần seal tương ứng. **Đừng tiện tay làm trong PR này.**
- **`stores/folders.ts` `persistCache()`**: `folders.name` hiện lưu plaintext cả trên cloud lẫn
  local — đó là rò rỉ metadata **đã biết và chấp nhận** ở v1.3.3, thuộc scope S3.
- **Harness cũ**: `notes.ts` có import mới (`@/utils/secureCache`). Harness C/N-series nào nạp
  `stores/notes.ts` sẽ báo `Unmocked import in notes.ts: @/utils/secureCache` → thêm mock theo
  đúng pattern sẵn có trong harness đó (`sealSecureRowsForCache: async ({notes, bodies}) => ({ notes, bodies, dropped: 0 })`),
  **KHÔNG sửa assertion**. Dry-run 2026-07-20 đã xác nhận: hiện KHÔNG harness cũ nào nạp
  `stores/notes.ts` qua loadTsModule — 19/19 vẫn PASS với fix áp đủ; đoạn trên chỉ là
  contingency nếu sau này có harness mới.

---

## PHẦN B — FAILING TEST

File: `specs/S1-secure-cache-leak.test.mjs`. Chạy:

```
node specs/S1-secure-cache-leak.test.mjs
```

- **T1 (behavior — thực thi CODE THẬT):** transpile `src/utils/secureCache.ts` bằng package
  `typescript` sẵn có, mock `@/utils/secureCrypto` bằng envelope giả xác định được. RED hiện tại
  vì file chưa tồn tại. Assert: folder thường passthrough; secure+plaintext+key → envelope;
  secure+đã-envelope → **không encrypt chồng**; **không mutate input**; secure+plaintext+không-key
  → loại row; body theo folder của note cha; và bất biến tổng quát “output không còn plaintext nào
  của secure folder”.
- **W1 (wiring):** thân `persistCache` của `notes.ts` gọi `sealSecureRowsForCache(` và **không còn**
  ghi thẳng `[NOTES_CACHE_KEY]: notes.value`.
- **W2 (wiring):** thân `persistCache` gọi `decryptLoadedSecureRows(` (chiều ngược của merge).
- **W3 (wiring):** `secureFolder.ts` có `async function decryptLoadedSecureRows(` và thân hàm đó
  **không** gọi `persistCache`.
- **W4 (wiring):** `secureFolder.ts` export `decryptLoadedSecureRows` trong block return.
- **W5 (wiring):** thân `loadAll` gọi `decryptLoadedSecureRows(` ở **≥ 2** chỗ (sau
  `hydrateFromCache()` — trước early-return offline — và cuối nhánh `catch`), đồng thời
  `notes.ts` **không còn** tham chiếu `refreshDecryptedNotesAfterLoad`.
- **Timeline minh họa** (in ra, không assert): mô phỏng unlock → đóng popup → plaintext còn trên đĩa.

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: `src/utils/secureCache.ts` tồn tại đúng contract
(seal đúng 4 quy tắc, không mutate, không encrypt chồng), `persistCache` của `notes.ts` ghi
**bản đã seal** và decrypt lại sau merge, `loadAll` overlay decrypt ở nhánh offline-return +
`catch` (không còn nhánh nào nạp envelope từ đĩa vào RAM của folder đang unlock mà không
decrypt), và `secureFolder.ts` đã tách `decryptLoadedSecureRows` (không còn tự ghi cache).

**Nghiệm thu bổ sung** (ngoài harness): `node specs/*.test.mjs` toàn bộ vẫn PASS (19 file cũ +
file này = 20) và `npx vue-tsc --noEmit -p tsconfig.app.json` sạch.

### Verify tay (Node không mô phỏng được)

1. Tạo secure folder, thêm 1 note nội dung nhận dạng được (vd `S1PROBE-XYZZY`), unlock.
2. Đóng popup. Mở lại → folder phải **khóa** như cũ, nhập passphrase → nội dung đúng.
3. Với popup đang mở và folder đã unlock, DevTools của popup:
   ```js
   chrome.storage.local.get(null).then(o => console.log(JSON.stringify(o).includes('S1PROBE-XYZZY')))
   ```
   → phải in `false`. Trước fix: in `true`.
4. Mở dashboard-tab + popup cùng lúc, unlock ở cả hai, sửa note ở popup → tab **không** được
   hiện chuỗi `retronote:1:…` (kiểm tra bẫy merge ngược chiều).
5. Unlock folder → DevTools Network **Offline** → lock một folder KHÁC (trigger `loadAll`) →
   folder đang unlock **không** được hiện `retronote:1:…`; bật online lại → vẫn plaintext
   (kiểm tra 3b-1/3b-3 — nhánh offline-return và catch).
6. *(User nâng cấp từ ≤ 1.3.3)* Mở app online một lần, rồi chạy lệnh ở bước 3 với chuỗi mồi
   **CŨ** đã từng lưu trước khi update → phải in `false` (bản seal đầu tiên đã đè plaintext
   tồn dư).
