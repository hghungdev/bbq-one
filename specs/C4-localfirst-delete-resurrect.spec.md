# SPEC C4 — Entry tạo offline rồi xóa → resurrect qua pushLocalToCloud

> **Đối chiếu source (2026-07-03):** line numbers verify trên tree hiện tại.
>
> **Failing test:** `specs/C4-localfirst-delete-resurrect.test.mjs`
>
> **Liên đới:** C3 (offline delete commit) và C6 (mid-push clear) là finding riêng — xem
> `specs/C3-C4-C6-C7-sync-hardening.spec.md`. PR này chỉ scope C4.

---

## PHẦN A — SPEC

### Root cause (1 câu)

`notes.service.ts:69-73` và `calendarEvents.service.ts:99-103`: nhánh authenticated chỉ gọi
`supabase.delete` rồi **return sớm**, không dọn bản sao trong `bbqone_local_*` — entry LocalFirst
sống sót → `pushLocalToCloud` upsert lại → item đã xóa "hồi sinh" trên cloud.

### Bằng chứng bất đối xứng (pattern đúng đã có ở entity khác)

`noteBodies.service.ts:87-93` và anonymous branch của cùng 2 service **đều** gọi local delete.
Chỉ nhánh authenticated của notes + calendar_events thiếu — không phải design.

### Call site `delete()` (grep xác nhận — không đổi signature)

| Caller | File:line |
|--------|-----------|
| Undo commit | `notes.ts:494`, `calendarEvents.ts:212` |
| Direct delete (no undo) | `notes.ts:432` |
| SW pending-delete flush | `pendingDeleteCommit.service.ts:110,113` |

Tất cả đi qua service layer → fix 2 file service là đủ.

### Thay đổi 1/2 — `src/services/notes.service.ts`

Hiện tại (verbatim, `:69-76`):

```ts
  async delete(id: string): Promise<void> {
    if (await isAuthenticated()) {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
      return
    }
    await localNotesService.delete(id)
  },
```

Diff:

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

Hiện tại (verbatim, `:99-106`):

```ts
  async delete(id: string): Promise<void> {
    if (await isAuthenticated()) {
      const { error } = await supabase.from('calendar_events').delete().eq('id', id)
      if (error) throw error
      return
    }
    await localCalendarEventsService.delete(id)
  },
```

Diff:

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

`localNotesService.delete` / `localCalendarEventsService.delete` filter theo id — **no-op an toàn**
nếu row chỉ tồn tại trên cloud (chưa từng ghi LocalFirst).

### Reproduction (deterministic)

1. Đăng nhập → offline tạo calendar event (ghi `bbqone_local_calendar_events`).
2. Có mạng → xóa event (undo window commit → `calendarEventsService.delete`).
3. Supabase delete no-op (row chưa từng push) — **trước fix:** LocalFirst entry còn.
4. `pushLocalToCloud` / autoSync → upsert → event quay lại.

Sau fix: bước 3 xóa cả LocalFirst → bước 4 không resurrect.

### KHÔNG được đổi

- KHÔNG sửa `folders.service.ts` / `noteBodies.service.ts` (ngoài scope audit C4; có thể finding riêng).
- KHÔNG đụng stores, undoToast, syncEngine, push order.
- KHÔNG throw nếu local delete no-op (local service không throw khi id absent).

---

## PHẦN B — FAILING TEST

File: `specs/C4-localfirst-delete-resurrect.test.mjs`

Transpile + thực thi CODE THẬT của 2 service file, mock:
- `isAuthenticated` → `true`
- `supabase.from().delete().eq()` → `{ error: null }`
- recorder trên `localNotesService.delete` / `localCalendarEventsService.delete`

Case:
- **C4.1** authenticated `notesService.delete(id)` → local delete được gọi cùng id
- **C4.2** authenticated `calendarEventsService.delete(id)` → local delete được gọi
- **C4.3** static: authenticated branch có `localNotesService.delete` trước `return`
- **C4.4** static: tương tự calendar

RED trên code hiện tại: C4.1 + C4.2 + C4.3 + C4.4 fail.

## PHẦN C — RED→GREEN CRITERIA

Test PASS khi cả 2 service gọi local delete sau supabase delete thành công ở nhánh authenticated.

Regression batch (khi ship C3+C6+C7 sau):

```
node specs/C4-localfirst-delete-resurrect.test.mjs
node specs/C3-C4-C6-C7-sync-hardening.test.mjs   # C4a/C4b pass; C3/C6/C7 vẫn RED
```
