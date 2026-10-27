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
- **S2A** `S2A-envelope-v2-read` — ✅ GREEN 19/19. Commit `dc20459`.
- **S2B** `S2B-user-crypto-dek-kek` — ✅ GREEN 19/19. Commit `d345c11`.
  Migration `015_user_crypto.sql` đã áp lên Supabase thật (Sir xác nhận 2026-07-20).

## Fix sau S2C1

- **S2C1.1** `S2C1.1-account-status-lifecycle` — re-check 2026-10-27: trạng thái encrypted-account
  không theo session (logout giữ row → local mode bị `Account locked`; login qua LoginModal không
  nạp row → ghi plaintext; offline coi như "chưa bật"; lỗi mạng làm sập `onMounted`). ✅ GREEN
  15/15 (RED 8 trên `c2201db`). Còn 3 bước verify tay + **FLAG offline** chờ chọn hướng thiết kế.

## Plan đợt S2C1.2 → S2C1.4 (2026-10-27, Sir chốt thứ tự)

Nguồn: review hướng S2 ngày 2026-10-27 (benchmark Chromium 153 trên code thật). Lõi crypto
(AES-GCM, DEK/KEK, HKDF, recovery, envelope v2) **giữ nguyên**. Đợt này sửa cách áp dụng, phải
xong **trước S2C2 (backfill)**. Mỗi bước = 1 cặp spec + test, commit `docs` (RED) rồi `fix` (GREEN).

### Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| Q1 | **D5 đổi:** sau khi mở khóa, DEK giữ trong `chrome.storage.session`, tự khóa sau **30 phút không dùng**, mất khi đóng trình duyệt / logout / bấm "Khóa ngay". | UI chính là popup — D5 cũ bắt gõ passphrase mỗi lần mở popup, và SW không bao giờ có key. `chrome.storage.session` chỉ ở RAM (không xuống đĩa → T2 không đổi); repo đã tin nó cho refresh token Supabase và khóa bookmark PIN. |
| Q2 | **Hướng 1 (mở khóa offline) dùng `chrome.storage.session`, KHÔNG dùng `chrome.storage.local`.** | Session Supabase cũng nằm ở `chrome.storage.session` → mọi trạng thái "đang đăng nhập" đều có trình duyệt đang mở. Cache row `user_crypto` cùng chỗ là đủ để unlock offline, mà không đưa `wrapped_dek` xuống đĩa (tránh rủi ro dò passphrase offline từ đĩa). |
| Q3 | Đường push không biết trạng thái mã hóa → **fail-closed**: giữ row plaintext ở local (không mất), đẩy sau khi biết trạng thái/mở khóa. | Thà chậm đồng bộ còn hơn đẩy plaintext lên server. |

### S2C1.2 — hiệu năng seal + vá rò rỉ conflict backup

- `utils/secureCache.ts`: nhớ bản mã theo (key, row, field) trong RAM — row không đổi dùng lại
  envelope cũ → mỗi lần `persistCache` chỉ mã hóa row vừa sửa (đo: 2.000 note 0,86 s → vài ms).
  Export hàm mở envelope có nhớ cho overlay.
- `stores/accountCrypto.ts` `decryptLoadedAccountRows`: dùng hàm mở có nhớ (pull về envelope cũ
  → không giải mã lại).
- `services/sync.service.ts`: conflict backup lưu **payload đã mã hóa** (cái vừa định push), không
  lưu row RAM plaintext. Vá cả secure folder (lỗ có từ trước S1).
- `pages/App.vue`: dialog conflict backup giải mã v2 khi account mở khóa để hiển thị/khôi phục;
  field còn là envelope → hiện nhãn "đã mã hóa", **không cho Restore** (tránh mã hóa chồng).

### S2C1.3 — khóa theo phiên trình duyệt + mở khóa offline

- `utils/accountSession.ts` (mới): đọc/ghi `chrome.storage.session` — trạng thái
  `{userId, row}` và DEK `{userId, dekId, dek, expiresAt}`; gia hạn khi dùng; alarm dọn khi hết
  hạn; `resolveAccountForPush(userId)` cho đường push (S2C1.4).
- `stores/accountCrypto.ts`: `refreshStatus` ghi trạng thái vào session; lỗi mạng → dùng bản
  session (unlock offline). `unlock`/`enable`/recovery → ghi DEK vào session.
  `restoreFromSession()` mở khóa im lặng. `lockNow()` = seal đĩa bằng key → bỏ key → nạp lại RAM
  từ đĩa (RAM không còn plaintext). `clearStatus()` xóa luôn dữ liệu session.
- `pages/App.vue`: mount → refresh → restore; kiểm tra hết hạn mỗi phút; nghe
  `chrome.storage.onChanged` (session) để khóa/mở khóa đồng bộ giữa popup và tab.
- Settings: nút **"Khóa ngay"**. `background.ts`: alarm dọn DEK hết hạn. `SECURITY.md` cập nhật D5.

### S2C1.4 — đường push của SW / local-first mã hóa hoặc fail-closed

- `syncFromCache(resolveAccount?)`: mọi caller (`autoSync.service`, `background.ts`) truyền
  `resolveAccountForPush` → có key thì push v2, khóa/chưa biết thì bỏ qua row plaintext.
- `pushLocalToCloud`: ghi chú tạo ở local mode, đẩy lên account đã bật → mã hóa v2 trước khi
  upsert; khóa/chưa biết → giữ lại trong local, không báo lỗi.
- `stores/sync.ts`: trạng thái chưa biết → fail-closed. Mở khóa xong → kích hoạt auto-sync để đẩy
  phần đang chờ.

### Trạng thái (2026-10-27, cuối ngày)

| Bước | Commit (docs → fix) | Test | Ghi chú |
|---|---|---|---|
| S2C1.2 | `f2845a4` → `347b7a0` | ✅ 22/22 (RED 14 trên `ed96f6d`) | Chromium, 2.000 note: autosave 0,86 s → ~6 ms |
| S2C1.3 | `e98f59a` → `3be1edf` | ✅ 35/35 (RED 11 trên `347b7a0`) | commit fix ghi nhầm "30/30" — số đúng là 35 |
| S2C1.4 | `229a443` → `23ebf85` | ✅ 14/14 (RED 11 trên `3be1edf`) | test in ra plaintext thật bị đẩy lên server trên code cũ |

| S2C1.5 | `7c2e24f` → `ead5cf2` | ✅ 25/25 (RED 21 trên `f3ec132`) | vá 8 lỗi từ **review độc lập** đợt S2C1.2–1.4 (2 lỗi cao: draft lên server plaintext khi mở popup; mất session / persist chen giữa lúc khóa ghi plaintext xuống đĩa) |
| S2C1.6 | `47a1ba0` → `81ef518` | ✅ 17/17 (RED 16 trên `8366db7`) | vá lỗi từ **review độc lập lần 2** (nhắm S2C1.5): bỏ chặn-ghi (làm user không bật mã hóa mất quyền sửa) → giữ lại ở máy; thao tác/overlay đang chờ lúc khóa; Undo sau logout. Commit fix ghi nhầm "21/21" — số đúng 17/17 |

Toàn bộ 31 harness PASS, `vue-tsc` 0, build OK. **Chờ Sir verify tay** theo mục "Nghiệm thu" của
từng spec (S2C1.1 a–c, S2C1.2 a–b, S2C1.3 a–e, S2C1.4 a–b, S2C1.5, S2C1.6). FLAG offline của S2C1.1 đã
đóng bởi S2C1.3 (cache trong `chrome.storage.session`).

**Giới hạn đã biết (chấp nhận, ghi lại):** bật mã hóa ở **máy khác** → máy đang mở chỉ biết khi
trạng thái được hỏi lại (≤ 5 phút khi có mạng, hoặc lần mở popup sau); trong khoảng đó ghi chú
sửa ở máy này lên server dạng rõ như ghi chú legacy — backfill S2C2 sẽ mã hóa lại.

### Ngoài phạm vi đợt này

S2C2 (backfill, banner recovery, đổi passphrase, regenerate recovery key) — làm sau khi Sir
verify tay đợt này. S3/S4/S5 giữ nguyên lộ trình.

## Chờ implement

| Thứ tự | Spec | Nội dung | Test hiện tại |
|--------|------|----------|---------------|
| **1** | `S2C1-account-encryption-core` | Encrypted account core: store `accountCrypto.ts` (ceremony 1-upsert, unlock, recovery re-wrap, overlay v2), adapter seal S1 + push guard, write-path ghi v2, search lọc row-đang-khóa, 2 modal UI + i18n. **Chặn bởi S2B GREEN** (đã xong). | 🔴 **RED (16 fail / 3 pass)** |

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
  (T0/W1/W2 — 3 file chưa tồn tại). Cả hai đã **dry-run GREEN** trên tree tạm rồi revert. Đã
  implement + đóng: `dc20459` (S2A), `d345c11` (S2B).
- **Baseline S2C1 (2026-07-20):** RED 16 fail / 3 pass. Ba check PASS sẵn là **guard chống hồi
  quy**, phải giữ xanh suốt: `T-B1` (seal với `account=null` = hành vi S1 nguyên vẹn), `T-C3`
  (account off = push như cũ), `T-C4` (folder secure vẫn dùng folder key v1, account không chen
  vào). Đã **dry-run GREEN**: S2C1 29/29, vue-tsc 0, **23/23 harness** → revert về RED.
  Dry-run bắt được 2 lỗi đã sửa sẵn vào spec/harness trước khi giao: (a) `RetroInput` bắt buộc
  prop `id`; (b) W3 của S2B là guard theo-phase, S2C1 chính thức chuyển nó sang ranh giới tầng.

## Nghiệm thu S2C1

1. `node specs/S2C1-account-encryption-core.test.mjs` GREEN (29 check) **và** đủ **23** harness:
   `for f in specs/*.test.mjs; do node "$f"; done`
2. `npx vue-tsc --noEmit -p tsconfig.app.json` sạch.
3. **Verify tay: 6 bước** ở cuối `S2C1-account-encryption-core.spec.md` — quan trọng nhất là
   bước 2 (chuỗi mồi `S2C1PROBE-XYZZY` KHÔNG còn trong `chrome.storage.local`), bước 3
   (Supabase Table Editor thấy `bbq:2:…`), bước 5 (recovery → ép đặt passphrase mới, pass CŨ
   chết) và bước 6 (secure folder v1 hành vi y hệt trước S2C1).
4. Commit: `fix(S2C1): …` (docs đã commit sẵn).

> ⚠ **Lưu ý cho người review S2C1:** spec có **thay đổi 9/10 đụng harness S2B** (W3 chuyển từ
> "chưa store nào wire" sang ranh giới tầng) — thay đổi này **đã làm sẵn trong commit docs**,
> Cursor không cần và không được sửa thêm bất kỳ harness nào.

## Chờ thiết kế (chưa có spec — ĐỪNG tự làm)

| Phase | Nội dung | Chặn bởi |
|---|---|---|
| **S2C2** | Backfill nền (lô 25, popup/dashboard, resume + progress) + banner recovery-thiếu + đổi passphrase + regenerate recovery key + nút "Khóa ngay" | S2C1 GREEN |
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
