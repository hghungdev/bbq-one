# ROADMAP N-series — thứ tự gửi file cho Cursor implement

> Cập nhật 2026-07-13 (sau khi verify feedback Bugbot/Cursor về N3).
> Mỗi mục = 1 cặp file trong `specs/`: đưa cho Cursor **file .spec.md** (tự chứa, không cần
> đọc gì khác) + chạy **file .test.mjs** để xác nhận RED→GREEN.
> Quy ước nghiệm thu chung: `node specs/<ID>.test.mjs` GREEN **và** toàn bộ harness còn lại
> vẫn PASS **và** `npx vue-tsc --noEmit -p tsconfig.app.json` sạch.

## Đã implement xong (verify 2026-07-13 — tất cả GREEN)

| # | Spec | Nội dung | Trạng thái |
|---|------|----------|-----------|
| 1 | `N1-storage-quota` | unlimitedStorage + safeCacheWrite + strip plaintext bookmark backup (N8) | ✅ GREEN |
| 2 | `N2-pull-pagination` | fetchAllRows phân trang 4 getAll — hết cap 1.000 rows | ✅ GREEN |
| 3 | `N3-account-switch-guard` | ownership + stash/purge/restore tại SIGNED_IN | ✅ GREEN — **nhưng xem N3.1** |
| 4 | `N4-N5-N11-multi-context` | respect-expiry mọi call site + alarm orphan + suppress; persist read-merge-write; Web Locks queue | ✅ GREEN |
| 5 | `N6-N7-sw-lifecycle-sync` | alarm autosync-retry 5'; SYNC_LOCK cross-context; auth.lock; manual sync đủ phạm vi | ✅ GREEN |
| 6 | `N3.1-ownership-hardening` | ownership gate MỌI push path + stale-context reload + suppress-persist + errors[] + folders quota. Verify độc lập 2026-07-13: 17/17 harness PASS, vue-tsc 0, code guard khớp spec ở cả 3 điểm (syncEngine :61, sync.service :236, App.vue :40-48/:102) | ✅ GREEN — **N3 tới đây mới đủ "xong privacy"** |

| 7 | `N10-N12-N13-edit-safety` | 3 đường save catch qua `onAutosaveFailed` (giữ draft, set loadError); draft `baselineUpdatedAt` miễn nhiễm clock skew; `OFFSCREEN_CLIPBOARD_LOCK`. Verify độc lập 2026-07-13: 7/7 GREEN, 18 harness khác PASS, vue-tsc 0, soi code khớp spec | ✅ GREEN |

## Chờ implement — MỤC CUỐI CÙNG

| Thứ tự | Spec | Vì sao thứ tự này | Test hiện tại |
|--------|------|-------------------|---------------|
| **8** | `N14-manifest-cws-polish` | Gỡ WAR `<all_urls>`, `minimum_chrome_version: 127`, bỏ `wss` thừa, đồng bộ docs. Làm CUỐI vì đụng manifest → sau GREEN phải `npm run build` + kiểm tra dist/manifest.json — gói trọn một lần trước khi release 1.3.2. | 🔴 RED (5 fail) |

## Checklist đóng N-series sau khi N14 GREEN (cho release 1.3.2)

1. `npm run build` → mở `dist/manifest.json` xác nhận: KHÔNG còn `web_accessible_resources`,
   CÓ `minimum_chrome_version`, connect-src KHÔNG còn `wss://`, permissions CÓ `unlimitedStorage`.
2. Chạy lại đủ 20 harness (`for f in specs/*.test.mjs; do node "$f"; done`) + `vue-tsc` sạch.
3. **Commit theo nhịp workflow** (toàn bộ N-series hiện là 1 working tree chưa commit — tách ra
   để giữ lịch sử red→green): mỗi cặp spec một cặp commit
   `docs(Nx): spec + failing test — <slug>` rồi `feat/fix(Nx): <slug>`; cuối cùng
   `chore(release): 1.3.2` (bump version qua `npm run sync-version`).
4. Verify tay (Node không mô phỏng được): (a) đổi account A→B trên cùng profile → dashboard-tab
   của A tự reload, data A không xuất hiện ở B; (b) xóa note ở dashboard-tab rồi mở popup trong
   5s → Undo ở tab vẫn cứu được note; (c) gõ note → kill popup <2s → mở lại → nội dung còn
   (draft baseline); (d) chỉnh đồng hồ máy lệch −5' rồi lặp lại (c).

## Backlog có chủ đích (KHÔNG có spec — đừng tự làm)

- **N9 (phần còn lại):** batch push thay vì 1 RPC/row (500 dirty ≈ 3'20" hiện tại). Phần
  conflict-noise đã được SYNC_LOCK (N6/N7) xử lý. Cần thiết kế RPC mảng phía Supabase — để sau.
- **N15:** search quét full corpus + NoteList không virtualize + FTS `.in()` >1.000 id. Perf
  project riêng.
- **N10 nâng cấp:** tự hồi sinh note bị xóa từ máy khác (re-insert qua local-first) — cần quyết
  định UX trước.
- **Self-host font Inter** (bỏ Google Fonts) — nâng cấp offline/privacy, cần tải asset.
- **supabaseAuthLock acquireTimeout:** accepted risk (Web Locks tự release khi context chết) —
  đã ghi lý do trong spec N3.1, không làm.

## Ghi chú vận hành harness

- Harness cũ (C-series) đã được vá 2 lần theo import mới của source: mock `@/utils/webLock`,
  `@/utils/supabaseFetchAll` (2026-07-13), và builder Postgres-sim thêm `.range()`. N3.1 sẽ
  yêu cầu vá lần 3 (mock `dataOwner.service` + `getCurrentUserId`) — hướng dẫn nằm ngay trong
  spec N3.1, mục "Cập nhật HARNESS cũ".
- Khi Cursor báo "Unmocked import in <file>: <specifier>" ở harness cũ: đó là tín hiệu source
  có import mới — thêm mock theo đúng pattern sẵn có trong harness đó, KHÔNG sửa assertion.
