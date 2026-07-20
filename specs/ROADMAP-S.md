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

## Đã đóng

- **S1** `S1-secure-cache-leak` — ✅ GREEN 17/17, verify tay 6/6 (Sir xác nhận 2026-07-20).
  Commits: `9dddd5e` docs → `449db9c` fix (red→green chứng minh bằng thứ tự commit).

## Chờ implement

| Thứ tự | Spec | Nội dung | Test hiện tại |
|--------|------|----------|---------------|
| **1** | `S2A-envelope-v2-read` | Envelope v2 `bbq:2:<alg>:<kid>:<iv>:<ct>` + đọc-hai-chiều trong `secureCrypto.ts`. **Reader đi trước writer** — chưa gì ghi v2, zero đổi hành vi dữ liệu hiện có. Parser strict 6-segment chống near-miss. | 🔴 **RED (3 fail)** |
| **2** | `S2B-user-crypto-dek-kek` | Hạ tầng DEK/KEK: `accountCrypto.ts` (wrap/unwrap DEK, verifier, recovery key 160-bit base32, HKDF domain separation) + `userCrypto.service.ts` + migration `015_user_crypto.sql`. **Chặn bởi S2A GREEN.** Phase 2a — cấm wire store/UI (harness W3 enforce). | 🔴 **RED (3 fail)** |

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
- **Baseline S2 (2026-07-20, sau khi S1 đóng):** S2A RED 3 fail (exports v2 chưa có; riêng T1
  v1-compat chạy WebCrypto THẬT và PASS sẵn — guard chống regression writer v1); S2B RED 3 fail
  (T0/W1/W2 — 3 file chưa tồn tại; **W3 chặn-overreach PASS sẵn và PHẢI GIỮ NGUYÊN sau GREEN**).
  Cả hai đã **dry-run GREEN** trên tree tạm: S2A + S2B PASS, vue-tsc 0, 22/22 harness →
  revert về RED. Spec chắc chắn GREEN được đúng như viết.

## Nghiệm thu mỗi spec S2A/S2B

1. `node specs/<ID>.test.mjs` GREEN **và** đủ 22 harness: `for f in specs/*.test.mjs; do node "$f"; done`
2. `npx vue-tsc --noEmit -p tsconfig.app.json` sạch.
3. Làm **tuần tự theo thứ tự**: Cursor `fix(S2A): …` GREEN xong mới bắt đầu S2B
   (S2B import parser v2 từ S2A). Commit docs đã có sẵn từ trước.
4. **Verify tay:** S2A không có. S2B có 1 bước — Sir chạy
   `supabase/migrations/015_user_crypto.sql` trong Supabase SQL Editor, kiểm
   `select * from user_crypto` = 0 row + RLS bật (an toàn chạy bất kỳ lúc nào —
   client chưa đụng bảng cho tới S2C).

## Chờ thiết kế (chưa có spec — ĐỪNG tự làm)

| Phase | Nội dung | Chặn bởi |
|---|---|---|
| **S2C** | UI enable/unlock-once + ghi v2 (data path) + backfill nền + banner recovery | S2B GREEN (§13 đã chốt 2026-07-20 — xem ADR) |
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
