---
name: bbqone-audit-workflow
description: "BBQOne audit workflow — Claude viết spec + failing test trong specs/, Sonnet trong Cursor implement fix; user giao tiếp tiếng Việt"
metadata: 
  node_type: memory
  type: project
  originSessionId: dbc036ee-4ee8-4948-8166-13b48b7ee0ca
---

Quy trình audit BBQOne (Chrome Extension MV3, Vue 3 + TS + Pinia + Supabase, local-first):
Claude audit → với mỗi finding tạo cặp file trong `specs/`: `<ID>-<slug>.spec.md` (spec tự chứa,
quote verbatim code + file:line, có PHẦN A/B/C và mục "KHÔNG được đổi" + "FLAG liên đới") và
`<ID>-<slug>.test.mjs` (harness standalone chạy `node`, transpile code THẬT bằng package
`typescript`, mock chrome.storage, in timeline t=, exit 1 khi fail). Người implement là Sonnet
trong Cursor — chưa đọc audit report nên spec phải copy-làm-theo được.

Nhịp commit: `docs(<ID>): spec + failing test` trước, rồi `fix/feat(<ID>): ...` sau (red→green
được chứng minh bằng thứ tự commit). Tính đến 2026-07-13 (v1.3.1): toàn bộ C1–C10, C8.1, C9.1,
C9.2, R4 đã đóng; 11/11 harness pass; vue-tsc sạch; flag `C9_OPTIMISTIC_RPC_ENABLED = true`
(đã bật lại sau C9.1). Việc còn treo duy nhất: checklist verify tay trong PHẦN C của C8.1
(popup-kill không mô phỏng được bằng Node) và nâng cấp tùy chọn decrypt-preview cho secure
folder trong stash restore (C9.2 FLAG #2, deferred có chủ đích).

Re-audit 2026-07-13 (đợt 2, scale-up + MV3): extension là MV3 thuần — KHÔNG bị ảnh hưởng đợt gỡ
MV2 31/08/2026. Tìm ra loạt finding mới N1–N15 chưa fix, nặng nhất: N1 quota 10MB storage.local
(unlimitedStorage đã bị gỡ ở 4f80eee, không nơi nào catch QuotaExceeded → mất offline edit im
lặng ~1.900 notes); N2 PostgREST cap 1000 rows (getAll không .range → row sạch ngoài fresh bị
merge-guard drop → data "biến mất" khỏi UI khi >1000 rows); N3 logout giữ bbqone_local_* + login
account khác push data account cũ lên cloud account mới (conflictDetector luôn trả 0 conflict);
N4 force-flush pending delete giết undo window của dashboard-tab context khác; N5 persistCache
đè toàn-mảng cross-context; N7 auto-sync network-restore chết theo SW lifecycle (online event
không đánh thức MV3 SW). Chi tiết đầy đủ trong báo cáo turn 2026-07-13.

Đợt 3 (2026-07-13, cùng ngày): Cursor đã implement N1–N7/N11 (working tree, chưa commit),
review Bugbot trả 6 finding — verify lại: 4 CONFIRMED (ownership chỉ gate runSyncFlow;
stale-context persist lại data account cũ; suppress không persist; runManualSync bỏ errors[]),
2 Low (folders quota — vá luôn; supabaseAuthLock timeout — accepted risk có lý do). Đã tạo
`specs/N3.1-ownership-hardening` (spec+test RED) vá cả 5; `N10-N12-N13` test + `N14` spec+test
(RED); `specs/ROADMAP-N.md` = thứ tự gửi Cursor: N3.1 → N10-N12-N13 → N14. Bài học harness:
source thêm import mới (webLock, supabaseFetchAll, dataOwner) làm harness cũ "Unmocked import"
— vá mock theo pattern sẵn, KHÔNG sửa assertion; Postgres-sim builder cần thêm `.range()` sau
N2. Đã bắt 1 defect Cursor bỏ sót: vue-tsc fail vì generic stripEncryptedBackupTrees khai
`encrypted: boolean` (phải optional) — sửa cacheWrite.ts + spec N1. ĐÓNG SỔ N-SERIES (2026-07-13): release 1.3.2 hoàn tất — 4 commit (c694fe1 docs / d0e9560
test-harness / 3eb4c52 feat / 60c6395 chore-release), version đồng bộ package+public+dist,
19/19 harness PASS, vue-tsc 0, verify tay a-d user xác nhận PASS. Còn treo phía user: git push
(ahead origin 4) + upload zip dist/ lên CWS. Backlog đợt sau: N9-batch, N15-perf, self-host
Inter (specs/ROADMAP-N.md).

Đợt 4 (2026-07-13): Cursor implement N3.1, N10-N12-N13, N14 — tất cả verify độc lập OK.
N-series ĐÓNG về harness: 19/19 PASS, vue-tsc 0, dist/manifest.json đạt 5 tiêu chí (no WAR,
minChrome 127, sạch wss, giữ wasm-unsafe-eval + unlimitedStorage). Còn lại: commit (khuyến nghị
batch TRUNG THỰC 4 commit: docs-all → test-harness-patch → feat-all → chore(release) 1.3.2 SAU
verify tay — KHÔNG dựng chuỗi per-spec red→green giả từ tree đã hoàn thiện vì 15+ file share
giữa các spec, phải git add -p hunk-level, rủi ro commit trung gian vỡ; bằng chứng red→green đã
nằm trong spec + hội thoại). Bump version = sửa package.json rồi `npm run sync-version`.
4 mục verify tay trong specs/ROADMAP-N.md.

**Why:** user hay resume session bằng cách paste lại ROLE prompt cũ — cần đối chiếu git log
trước khi làm lại việc đã xong.
**How to apply:** trước khi viết spec/test mới, chạy `node specs/*.test.mjs` và xem `git log
--oneline` để biết finding nào đã đóng; giữ đúng style harness/spec ở trên cho finding mới.
