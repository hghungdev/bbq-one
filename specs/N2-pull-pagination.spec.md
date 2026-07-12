# SPEC N2 — PostgREST cap 1.000 rows: dữ liệu "biến mất" khỏi app khi vượt 1.000 rows

> **Đối chiếu source (2026-07-13, branch `main`, tree sạch, v1.3.1):** mọi `file:line` dưới đây
> đã verify trên code hiện tại.
>
> **Failing test đi kèm:** `specs/N2-pull-pagination.test.mjs` — chạy
> `node specs/N2-pull-pagination.test.mjs` từ repo root. Test transpile và THỰC THI CODE THẬT
> của 4 service, mock supabase client mô phỏng đúng cap 1.000 rows của PostgREST.

---

## PHẦN A — SPEC

### Root cause (1 câu)

Cả 4 hàm `getAll()` (notes / note_bodies / calendar_events / folders) đều `select('*')`
**không có `.range()`/`.limit()`**, trong khi Supabase hosted mặc định `db-max-rows = 1000`
— server chỉ trả 1.000 rows đầu theo `order` của query, phần còn lại **im lặng bị cắt**.

### Vì sao hậu quả là "mất dữ liệu" nhìn từ phía user

Merge-guard C1 (`sync.service.ts:39-55`) chủ đích chỉ giữ row **dirty**; row local *sạch*
không có trong fresh bị drop (doc comment: "row local sạch → fresh thắng"). Kết hợp cap 1.000:

| Bảng | Order hiện tại | Hệ quả khi >1.000 rows |
|---|---|---|
| `notes` | `updated_at desc` (`notes.service.ts:20`) | 1.000 note mới nhất được giữ — **note cũ hơn biến mất khỏi list** sau mỗi `loadAll` |
| `note_bodies` | `note_id asc, position asc` (`noteBodies.service.ts:19-20`) | 1.000 body thuộc các note có **UUID thấp nhất** — không tương quan với 1.000 note mới nhất → phần lớn note hiển thị **mở ra editor rỗng** |
| `calendar_events` | `event_date asc, position asc` (`calendarEvents.service.ts:24-25`) | giữ 1.000 event **cũ nhất** → **tháng hiện tại trống trơn** |
| `folders` | `updated_at desc` (`folders.service.ts:24`) | hiếm khi >1.000 nhưng cùng pattern — sửa luôn cho đồng nhất |

Server KHÔNG mất data — nhưng cache + UI mất, và app không có đường phân trang nào để thấy lại.

### Nguyên tắc fix

Thêm helper phân trang dùng chung, mỗi `getAll()` loop `.range(offset, offset+PAGE-1)` cho tới
khi trang trả về ngắn hơn page size. Kèm **tiebreaker `.order('id')`** để thứ tự ổn định giữa
các trang (order theo cột không-unique như `updated_at` có thể làm row nhảy trang giữa 2 request).

### Thay đổi 1/5 — file MỚI `src/utils/supabaseFetchAll.ts`

Tạo file mới với đúng nội dung:

```ts
/** PostgREST (Supabase hosted) cap mặc định 1.000 rows/response — phải phân trang. */
export const SUPABASE_PAGE_SIZE = 1000

interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * Kéo TOÀN BỘ rows theo trang. `makeQuery` PHẢI trả về một builder MỚI mỗi lần gọi
 * (builder PostgREST là mutable — không reuse được giữa 2 lần .range()).
 * Dừng khi trang trả về ngắn hơn pageSize.
 */
export async function fetchAllRows<T>(
  makeQuery: () => RangeQuery<T>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1)
    if (error) throw error
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < pageSize) return all
  }
}
```

### Thay đổi 2/5 — `src/services/notes.service.ts` `getAll()`

Hiện tại (verbatim, `notes.service.ts:15-23`, nhánh authenticated):

```ts
  async getAll(): Promise<Note[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(acceptServerRow)
    }
```

Thay nhánh authenticated bằng:

```ts
  async getAll(): Promise<Note[]> {
    if (await isAuthenticated()) {
      const data = await fetchAllRows<Note>(() =>
        supabase
          .from('notes')
          .select('*')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true }),
      )
      return data.map(acceptServerRow)
    }
```

(Nhánh local mode `:25-29` giữ nguyên.) Thêm import:

```ts
import { fetchAllRows } from '@/utils/supabaseFetchAll'
```

### Thay đổi 3/5 — `src/services/noteBodies.service.ts` `getAll()`

Hiện tại (verbatim, `noteBodies.service.ts:14-23`, nhánh authenticated):

```ts
  async getAll(): Promise<NoteBody[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('note_bodies')
        .select('*')
        .order('note_id', { ascending: true })
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []).map(acceptServerRow)
    }
```

Thay nhánh authenticated bằng:

```ts
  async getAll(): Promise<NoteBody[]> {
    if (await isAuthenticated()) {
      const data = await fetchAllRows<NoteBody>(() =>
        supabase
          .from('note_bodies')
          .select('*')
          .order('note_id', { ascending: true })
          .order('position', { ascending: true })
          .order('id', { ascending: true }),
      )
      return data.map(acceptServerRow)
    }
```

Thêm import như trên. `listByNoteId` (`:30-44`) **không đổi** (filter theo 1 note, không thể
vượt cap).

### Thay đổi 4/5 — `src/services/calendarEvents.service.ts` `getAll()`

Hiện tại (verbatim, `calendarEvents.service.ts:19-28`, nhánh authenticated):

```ts
  async getAll(): Promise<CalendarEvent[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('event_date', { ascending: true })
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []).map(acceptServerRow) as CalendarEvent[]
    }
```

Thay nhánh authenticated bằng:

```ts
  async getAll(): Promise<CalendarEvent[]> {
    if (await isAuthenticated()) {
      const data = await fetchAllRows<CalendarEvent>(() =>
        supabase
          .from('calendar_events')
          .select('*')
          .order('event_date', { ascending: true })
          .order('position', { ascending: true })
          .order('id', { ascending: true }),
      )
      return data.map(acceptServerRow) as CalendarEvent[]
    }
```

`listByDateRange` (`:38-57`) **không đổi**.

### Thay đổi 5/5 — `src/services/folders.service.ts` `getAll()`

Hiện tại (verbatim, `folders.service.ts:19-27`, nhánh authenticated):

```ts
  async getAll(): Promise<Folder[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(normalizeFolder)
    }
```

Thay nhánh authenticated bằng:

```ts
  async getAll(): Promise<Folder[]> {
    if (await isAuthenticated()) {
      const data = await fetchAllRows<Folder>(() =>
        supabase
          .from('folders')
          .select('*')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true }),
      )
      return data.map(normalizeFolder)
    }
```

### Edge case BẮT BUỘC giữ

1. **Error mid-page:** trang N lỗi → `fetchAllRows` throw ngay (KHÔNG trả về mảng cắt cụt) —
   caller `loadAll` đã có nhánh catch fallback cache (`notes.ts:140-154`), mảng cắt cụt sẽ bị
   merge-guard hiểu nhầm là "server đã xóa" → mất data. Throw là bắt buộc.
2. **`makeQuery` phải tạo builder MỚI mỗi trang** — builder PostgREST mutable, gọi `.range()`
   2 lần trên cùng builder là sai. Signature callback trong helper ép đúng điều này.
3. **Local mode** (anonymous) của cả 4 service giữ nguyên — không có cap, không phân trang.
4. **Thứ tự trả về giữ nguyên semantics cũ** (notes: mới nhất trước; calendar: theo ngày tăng
   dần) — tiebreaker `id` chỉ thêm vào CUỐI chuỗi order, không thay order chính.

### KHÔNG được đổi (chặn over-reach)

- KHÔNG đụng merge-guard (`mergeFreshWithDirtyLocal`) — cap được fix ở tầng fetch, merge giữ
  nguyên semantics C1.
- KHÔNG đụng `searchFullText` / `listByNoteId` / `listByDateRange` / các hàm create/update/delete.
- KHÔNG đổi `SUPABASE_PAGE_SIZE` thành số nhỏ (tăng số round-trip) hoặc quá lớn (vô nghĩa — server
  vẫn cap 1.000).
- KHÔNG thêm dependency, không đổi schema/DB, không đổi setting `db-max-rows` phía Supabase
  (fix phía client để không phụ thuộc config project).

### ⚠ FLAG liên đới

- **N1 (quota storage):** phân trang xong thì user 5.000 notes sẽ pull ĐỦ 5.000 rows về cache →
  cache to hơn → **bắt buộc đi kèm fix N1 (`unlimitedStorage`)**, nếu không N2 làm N1 kích hoạt
  sớm hơn. Thứ tự ship: N1 trước hoặc cùng PR.
- Push path (`sync.service.ts`) không bị cap này (push từng row) — ngoài scope.
- FTS search `.in('id', ids)` với >1.000 id (`notes.service.ts:156-161`) là finding riêng
  (N15) — KHÔNG sửa trong PR này.

---

## PHẦN B — FAILING TEST

File: `specs/N2-pull-pagination.test.mjs`. Chạy: `node specs/N2-pull-pagination.test.mjs`

- Mock supabase client mô phỏng ĐÚNG hành vi PostgREST hosted: mọi response (kể cả `.range()`
  span rộng hơn 1.000) trả **tối đa 1.000 rows**; `.range(from, to)` slice theo offset.
- Transpile + thực thi CODE THẬT 4 service (mock `./supabase`, `authMode` → authenticated,
  `syncConflict`/`localNotes.service`… → stub).
- **T1:** seed 2.500 notes → `notesService.getAll()` phải trả **2.500**. RED hiện tại: 1.000.
- **T2:** seed 5.000 bodies (UUID shuffle) → `noteBodiesService.getAll()` phải trả **5.000**,
  và body của note "mới nhất" phải có mặt. RED: 1.000 + body note mới nhất thiếu (editor rỗng).
- **T3:** seed 1.100 calendar events (3 năm) → `getAll()` phải chứa event của **tháng hiện tại**
  (event cuối theo `event_date`). RED: chỉ 1.000 event cũ nhất, tháng hiện tại trống.
- **T4:** seed 1.500 folders → `foldersService.getAll()` trả 1.500. RED: 1.000.
- **T5 (pin):** error ở trang 2 → helper phải **throw**, không trả mảng cắt cụt (chạy trên
  `src/utils/supabaseFetchAll.ts` thật; RED vì file chưa tồn tại).
- In timeline `t=` minh họa pull 5.000 bodies: 5 trang × RTT giả lập.

## PHẦN C — RED→GREEN CRITERIA

Test chuyển FAIL→PASS khi và chỉ khi: `src/utils/supabaseFetchAll.ts` tồn tại đúng contract
(loop `.range()` builder-mới-mỗi-trang, dừng khi trang < pageSize, throw khi trang lỗi) VÀ cả 4
`getAll()` (notes, noteBodies, calendarEvents, folders — nhánh authenticated) phân trang qua nó
nên trả về đầy đủ rows vượt cap 1.000 của PostgREST.
