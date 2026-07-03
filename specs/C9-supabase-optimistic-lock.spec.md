# SPEC C9 — Cross-device conflict (Supabase optimistic lock) — PLANNING

> **Trạng thái:** Migration 014 deployed + **client wired**.  
> **Migration:** `supabase/migrations/014_optimistic_update_guard.sql`  
> **Test:** `node specs/C9-supabase-optimistic-lock.test.mjs`

---

## Vấn đề (audit C9)

`syncDirtyNotesFromList` / calendar push gọi `.update()` không so `updated_at` với cloud.
Máy A offline (bản cũ) online sau máy B (bản mới) → A đè B im lặng.
`conflictDetector.ts` luôn `totalConflicts: 0` → `SyncConflictDialog` dead path.

## Hướng đã chọn: guard trên Supabase

RPC **conditional UPDATE**: chỉ apply khi `updated_at` server **bằng** `p_expected_updated_at`
(client gửi baseline last-seen từ lần pull/push thành công).

| RPC | Bảng |
|-----|------|
| `bbq_update_note_if_current` | `notes` |
| `bbq_update_note_body_if_current` | `note_bodies` |
| `bbq_update_calendar_event_if_current` | `calendar_events` |

Conflict → `RAISE EXCEPTION ... ERRCODE P0001` (`BBQ_CONFLICT`).

Trigger `retronote_update_updated_at` vẫn chạy — `WHERE updated_at = p_expected` so trên **OLD**
row trước khi trigger bump.

## Client follow-up (PR riêng sau khi migration chạy trên project)

### 1. Baseline `p_expected_updated_at`

Khi row **sạch** (`updated_at ≤ synced_at`): dùng `updated_at` hiện tại làm expected (đã khớp server).

Khi row **dirty**: dùng **`synced_at`** làm expected — đó là mốc server lần cuối client biết chắc.
(Nếu `synced_at` null → row chưa từng push: giữ upsert/insert path, không gọi RPC update.)

### 2. Thay `.update()` bằng RPC

Ví dụ `notes.service.ts`:

```ts
const { data, error } = await supabase.rpc('bbq_update_note_if_current', {
  p_id: id,
  p_expected_updated_at: expectedUpdatedAt,
  p_title: updates.title,
  ...
})
if (error?.code === 'P0001' || error?.message?.includes('BBQ_CONFLICT')) {
  throw new ConflictError(...)
}
```

Áp tại:
- `sync.service.ts` — `syncDirtyNotesFromList`, `syncDirtyCalendarEventsFromList`
- (Tuỳ chọn) `notes.service.update` / `calendarEvents.service.update` online path

### 3. Xử lý conflict trên client

Tối thiểu (không dialog):
- Catch conflict → **skip push** row đó (giống C5 poison-pill)
- `loadAll()` pull bản cloud mới → merge-guard giữ local dirty → user thấy divergence

Nâng cao (reuse UI):
- Populate `conflictDetector` / `SyncConflictDialog` khi catch `BBQ_CONFLICT`

### 4. KHÔNG đổi

- `pushLocalToCloud` upsert (anonymous → login) — last-write-wins chủ đích lúc merge account
- C1 merge-guard, C5 try/catch per-note

## Deploy Supabase

```bash
# SQL Editor hoặc supabase db push
# Chạy supabase/migrations/014_optimistic_update_guard.sql trên project BBQOne
```

Verify:

```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'bbq_update_%';
```

## S1 — tách biệt C9 (đọc trước khi nghĩ Realtime giải quyết hết)

**S1:** `initAutoSyncOnNetworkRestore` trong SW gần như vô dụng khi SW ngủ — **Supabase không
wake service worker**. Migration C9 không sửa S1.

| Hướng S1 | Ghi chú |
|----------|---------|
| Popup `online` + `refreshStoresFromNetwork` | Đã có (C1) — backstop chính khi user mở popup |
| `chrome.alarms` periodic `syncFromCache` | SW wake định kỳ — cần spec riêng |
| Supabase Realtime | Chỉ khi popup/SW đang sống — không thay online event SW ngủ |

C9 Supabase giúp **khi push cuối cùng chạy** (popup mở, alarm, manual sync) — không tự push khi SW ngủ.

## Test (sau client wire)

- Harness: seed note server `updated_at=T2`, client dirty baseline `synced_at=T1` → RPC → conflict
- Regression: cùng expected → update OK, `updated_at` bump

## RED→GREEN criteria (phase client)

Spec test riêng `specs/C9-supabase-optimistic-lock.test.mjs` (TODO) khi wire RPC —
mock supabase.rpc, assert gọi `p_expected_updated_at` từ synced baseline.
