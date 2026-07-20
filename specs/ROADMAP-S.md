# ROADMAP S-series (Security) — thứ tự gửi file cho Cursor implement

> Tạo 2026-07-20 (v1.3.3, sau khi N-series đã đóng).
> Quy ước giống `ROADMAP-N.md`: mỗi mục = 1 cặp file trong `specs/` — đưa cho Cursor
> **file `.spec.md`** (tự chứa, không cần đọc gì khác) + chạy **file `.test.mjs`** để xác nhận
> RED→GREEN.
> Nghiệm thu chung: `node specs/<ID>.test.mjs` GREEN **và** toàn bộ harness còn lại vẫn PASS
> **và** `npx vue-tsc --noEmit -p tsconfig.app.json` sạch.

## Bối cảnh

N-series lo **tính đúng đắn của dữ liệu** (quota, phân trang, đổi account, đa context, vòng đời SW).
S-series lo **tính bí mật của dữ liệu**. Hai series độc lập; S1 không đụng gì thuộc scope N.

Kiến trúc tổng thể + lý do chọn thuật toán: **`specs/S2-e2ee-architecture.md`** (đọc trước khi
bắt đầu S2).

## Chờ implement

| Thứ tự | Spec | Nội dung | Test hiện tại |
|--------|------|----------|---------------|
| **1** | `S1-secure-cache-leak` | Plaintext của secure folder bị `persistCache()` ghi xuống `chrome.storage.local`. Thêm `src/utils/secureCache.ts` (`sealSecureRowsForCache`), tách `decryptLoadedSecureRows` khỏi persist, ghi bản đã niêm phong, overlay decrypt trong `loadAll` (nhánh offline + catch). | 🔴 **RED (6 fail)** |

## Baseline lúc tạo roadmap (2026-07-20)

- 19/19 harness C/N-series **PASS**.
- `S1-secure-cache-leak.test.mjs` **RED** đúng thiết kế (exit 1): T1.0 + W1 + W2 + W3 + W4 + W5.
- Code tham chiếu trong spec S1 đã được verify độc lập: tạo tạm `src/utils/secureCache.ts` từ
  đúng đoạn code trong spec → **12/12 assertion T1 PASS** → xóa file, trả tree về RED.
  Nghĩa là Sonnet chỉ cần chép đúng spec là T1 xanh; W1–W5 là phần wiring phải tự làm.
- **Leader-audit 2026-07-20 (Fable):** mọi claim gốc tái xác nhận độc lập; phát hiện thêm
  `loadAll` có 2 nhánh nạp RAM từ đĩa KHÔNG qua `persistCache` (early-return `!isOnline()` +
  `catch`) — hôm nay hiển thị đúng nhờ chính leak, sau fix sẽ hiện `retronote:1:…` → spec bổ
  sung thay đổi 3b-1/3b-3, harness thêm W5 (RED giờ 6 fail). Toàn bộ spec (kể cả wiring) đã
  được **dry-run GREEN** trên tree tạm rồi revert — xem mục dưới.

## Sau khi S1 GREEN

1. Chạy lại đủ 20 harness: `for f in specs/*.test.mjs; do node "$f"; done`
2. `npx vue-tsc --noEmit -p tsconfig.app.json` sạch.
3. **Verify tay** (Node không mô phỏng được) — 6 bước ở cuối `S1-secure-cache-leak.spec.md`,
   quan trọng nhất là bước 3 (`chrome.storage.local.get(null)` **không** được chứa chuỗi mồi)
   và bước 5 (offline không được hiện `retronote:1:…` ở folder đang unlock).
4. Commit theo nhịp: `docs(S1): spec + failing test — secure cache leak` → `fix(S1): …`.

## Chờ thiết kế (chưa có spec — ĐỪNG tự làm)

| Phase | Nội dung | Chặn bởi |
|---|---|---|
| **S2** | `user_crypto` + DEK/KEK + recovery key + envelope v2 + đọc-hai-chiều | S1 GREEN + chốt 4 câu hỏi §13 của `S2-e2ee-architecture.md` |
| **S3** | `folders.name`, calendar title/description (**DROP 2 CHECK** — tên thật trên DB live: `calendar_events_title_check` [013 re-create] + `calendar_events_description_check` [012]), gộp bookmark PIN về DEK chung | S2 |
| **S4** | Argon2id — hoặc tối thiểu PBKDF2 310k → 600k | Benchmark MV3 SW |
| **S5** | Blind index cho search/tag (gộp **N15** từ `ROADMAP-N.md`) | S3 |
| **S6** | *(tùy chọn)* Hợp nhất 1 password kiểu Bitwarden | S2 + recovery đã chạy production |

## Ghi chú vận hành harness

- S1 thêm import mới `@/utils/secureCache` vào `src/stores/notes.ts`. Harness C/N-series nào nạp
  `stores/notes.ts` sẽ báo `Unmocked import in notes.ts: @/utils/secureCache` → thêm mock theo
  đúng pattern sẵn có trong harness đó:
  ```js
  '@/utils/secureCache': {
    sealSecureRowsForCache: async ({ notes, bodies }) => ({ notes, bodies, dropped: 0 }),
  },
  ```
  **KHÔNG sửa assertion** — đây là tín hiệu source có import mới, không phải test sai.
  **Dry-run 2026-07-20 đã kiểm chứng thực nghiệm:** áp đủ fix (kể cả import mới) → 19/19 harness
  cũ **vẫn PASS**, không harness nào nạp `stores/notes.ts` qua loadTsModule → hướng dẫn mock ở
  trên chỉ là contingency, nhiều khả năng KHÔNG cần dùng.
- Baseline 19/19 đã chạy trước khi tạo S1, nên mọi FAIL xuất hiện sau đó đều do S1 gây ra.
- **Dry-run GREEN toàn phần (leader-audit 2026-07-20):** toàn bộ spec S1 (bản đã bổ sung 3b/W5)
  được implement tạm đúng từng chữ trên source thật → `S1` GREEN 17/17 (12 T1 + 5 W),
  `vue-tsc` 0 lỗi, 19/19 harness cũ PASS → revert, tree về RED (6 fail). Nghĩa là spec này
  **chắc chắn GREEN được đúng như viết** — nếu Cursor báo vướng, vấn đề nằm ở cách làm, không
  nằm ở spec.
