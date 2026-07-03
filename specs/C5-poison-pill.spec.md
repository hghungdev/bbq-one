# SPEC C5 — Poison-pill: một note dirty lỗi push chặn cả loop syncDirtyNotesFromList

> **Liên đới C1:** merge-guard giữ dirty row đã bị xóa trên server (từ máy khác). Push qua
> `syncDirtyNotesFromList` sẽ gọi `notesService.update().single()` trên row không tồn tại → throw
> → **các note dirty phía sau không bao giờ được push**.
>
> **Failing test:** `specs/C5-poison-pill.test.mjs` — chạy `node specs/C5-poison-pill.test.mjs`

---

## PHẦN A — SPEC

### Root cause (1 câu)

`syncDirtyNotesFromList` (`sync.service.ts:75-115`) loop dirty notes **không có try/catch
per-note**, trong khi `syncDirtyCalendarEventsFromList` ngay bên dưới (`:124-139`) đã có — nên
một row poison (đã xóa cloud, merge-guard C1 vẫn giữ local dirty) làm throw cả function và chặn
mọi note phía sau.

### Thay đổi duy nhất — `src/services/sync.service.ts`

Code hiện tại (verbatim, vòng `for (const n of dirty)` — phần push sau secure-skip):

```ts
      for (const b of bodies) {
        let label = b.label
        let content = b.content
        if (folder?.is_secure && key) {
          if (!isEncryptedEnvelope(label)) label = await encryptField(label, key)
          if (!isEncryptedEnvelope(content)) {
            content = await encryptField(content, key)
          }
        }
        await noteBodiesService.update(b.id, {
          label,
          content,
          synced_at: ts,
        })
      }
      let title = n.title
      if (folder?.is_secure && key) {
        if (!isEncryptedEnvelope(title)) title = await encryptField(title, key)
      }
      await notesService.update(n.id, {
        title,
        folder_id: n.folder_id,
        tags: n.tags,
        synced_at: ts,
      })
      count++
```

Thay bằng (mirror calendar loop `:125-138`):

```ts
      try {
        for (const b of bodies) {
          let label = b.label
          let content = b.content
          if (folder?.is_secure && key) {
            if (!isEncryptedEnvelope(label)) label = await encryptField(label, key)
            if (!isEncryptedEnvelope(content)) {
              content = await encryptField(content, key)
            }
          }
          await noteBodiesService.update(b.id, {
            label,
            content,
            synced_at: ts,
          })
        }
        let title = n.title
        if (folder?.is_secure && key) {
          if (!isEncryptedEnvelope(title)) title = await encryptField(title, key)
        }
        await notesService.update(n.id, {
          title,
          folder_id: n.folder_id,
          tags: n.tags,
          synced_at: ts,
        })
        count++
      } catch {
        /* offline / row đã bị xóa cloud — skip, retry lần sau */
      }
```

**Giữ nguyên** nhánh `continue` secure-folder (không có key) — nằm **ngoài** try/catch, hành vi
cũ không đổi.

### Call site (grep xác nhận — không đổi signature)

| Caller | File |
|--------|------|
| `syncFromCache` | `sync.service.ts:167` |
| `runManualSync` | `stores/sync.ts:54` |

### KHÔNG được đổi

- KHÔNG sửa `syncDirtyCalendarEventsFromList` (đã đúng — test pin invariant P3).
- KHÔNG xóa row poison khỏi cache trong fix này (retry lần sync sau; dọn local là scope riêng).
- KHÔNG đụng merge-guard C1, C2 queue, autoSync debounce.

---

## PHẦN B — FAILING TEST

File: `specs/C5-poison-pill.test.mjs`

- **P1 (RED):** 2 dirty notes; `notesService.update('n-poison')` throw → assert function không throw,
  `n-good` vẫn được update, `count === 1`.
- **P2:** body update throw trên note poison → note phía sau vẫn push.
- **P3:** pin calendar loop invariant (đã có try/catch).
- **P4:** static check try/catch bọc `notesService.update` trong for-loop notes.

## PHẦN C — RED→GREEN CRITERIA

Test PASS khi `syncDirtyNotesFromList` bọc toàn bộ push per-note (bodies + note update + count++)
trong try/catch, semantics giống calendar loop: skip poison, tiếp tục note tiếp theo.
