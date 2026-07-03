# SPEC C10 — Trùng position calendar sau delete

> **Failing test:** `specs/C10-calendar-position.test.mjs`

---

## PHẦN A — SPEC

### Root cause

`calendarEvents.ts:128`: `nextPos = siblings.length` — sau delete positions có gap
(vd. `[0,2]`) → event mới cũng nhận `2`.

### Fix — mirror `notes.ts:362`

```diff
-    const nextPos = siblings.length
+    const nextPos =
+      siblings.length === 0 ? 0 : Math.max(...siblings.map((e) => e.position)) + 1
```

Chỉ đổi `createEvent` — offline fallback dùng cùng `nextPos`.

### KHÔNG đổi

- Sort/load logic, `CALENDAR_MAX_EVENTS_PER_DAY` guard.

## PHẦN B — TEST

Pure function test encode cùng công thức + static grep `Math.max` trong `createEvent`.

## PHẦN C — GREEN

Siblings `[pos 0, pos 2]` → nextPos = 3 (không phải 2).
