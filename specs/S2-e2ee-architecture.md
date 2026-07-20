# S2 — Kiến trúc mã hóa đầu-cuối cho dữ liệu lên Supabase

> **Loại tài liệu:** design/ADR — KHÔNG phải spec implement. Đây là bản chốt kiến trúc + lộ trình;
> mỗi phase sẽ có spec + failing test riêng theo đúng workflow C/N/S-series.
> **Ngày:** 2026-07-20 · **Đối chiếu:** v1.3.3, branch `main`.
> **Đọc trước:** `specs/S1-secure-cache-leak.spec.md` (S1 phải GREEN trước khi bắt đầu S2).

---

## 0. TL;DR — chốt lựa chọn

| Hạng mục | Chốt | Trạng thái |
|---|---|---|
| Cipher | **AES-256-GCM**, IV 96-bit random/message | ✅ đang dùng — GIỮ |
| KDF | **Argon2id** (m=64MiB, t=3, p=1) qua WASM; PBKDF2-SHA256 **600k** làm fallback | ⬆️ nâng từ PBKDF2 310k/120k |
| Phân cấp khóa | **DEK/KEK envelope** (DEK ngẫu nhiên, KEK bọc DEK) | 🆕 thay cho derive-thẳng |
| Tách khóa theo mục đích | **HKDF-SHA256** từ DEK (`content`, `index`) | 🆕 |
| Envelope format | **`bbq:2:<alg>:<kid>:<iv>:<ct>`** — có version + key-id | 🆕 thay `retronote:1:` |
| Encoding | **base64 trong cột TEXT** | ✅ giữ (xem §7.3 — `bytea` tệ hơn) |
| Phạm vi khóa | **1 DEK/account** thay vì 1 key/folder | 🆕 |
| Recovery | **Recovery key 128-bit**, wrap DEK lần 2 | 🆕 **bắt buộc** |
| Auth password | **Passphrase RIÊNG** ở Phase 1; hợp nhất 1 password là Phase 5 (tùy chọn) | xem §5 |

**Không dùng:** pgcrypto / `pgp_sym_encrypt`, pgsodium, Vault TCE. Lý do ở §2.2.

---

## 1. Threat model — chống cái gì, KHÔNG chống cái gì

Không viết rõ mục này thì mọi tranh luận về thuật toán đều vô nghĩa.

| # | Kịch bản | Trong tầm? | Cơ chế |
|---|---|---|---|
| **T1** | Supabase bị chiếm, DB bị dump, nhân viên provider đọc bảng | ✅ **Mục tiêu chính** | Server chỉ thấy ciphertext; key chưa bao giờ rời client |
| **T2** | Đĩa máy user bị đọc (máy chung, backup, malware đọc file, máy bị mất) | ✅ **Mục tiêu chính** | S1 + cache chỉ chứa envelope |
| **T3** | Người nghe lén đường truyền | ✅ | TLS + payload đã mã hóa sẵn |
| **T4** | Sửa trộm ciphertext trong DB để làm hỏng/đầu độc dữ liệu | ✅ | AES-**GCM** là AEAD → decrypt fail chứ không ra rác |
| **T5** | Máy user bị chiếm **khi đang unlock** (keylogger, RAM dump, extension độc) | ❌ **Ngoài tầm** | Không hệ mã hóa nào chống được. Đừng thiết kế cho nó |
| **T6** | Metadata: số lượng note, thời điểm sửa, kích thước nội dung, cấu trúc folder | ⚠️ **Chấp nhận rò rỉ** | Giấu metadata cần padding + ORAM — chi phí không tương xứng |
| **T7** | User quên passphrase | ❌ theo thiết kế | → **bắt buộc** có Recovery key (§6) |

> **Hệ quả T5:** mọi đề xuất kiểu "lưu key vào `chrome.storage.session` cho tiện" đều là đánh đổi
> T2 lấy tiện lợi. Từ chối.

---

## 2. Vì sao KHÔNG mã hóa phía server

### 2.1 Pattern MySQL cũ và vì sao không port sang

```sql
-- MySQL — KHÔNG port sang Postgres
CONVERT(AES_DECRYPT(`col`, 'my-key') USING utf8mb4) AS `col`
```

Hai lỗi độc lập, mỗi lỗi đủ để loại:

1. **Khóa nằm trong câu lệnh.** Nó đi vào query log, slow log, `pg_stat_statements`, network
   trace, core dump, và RAM của tiến trình DB. Server **giải mã được toàn bộ dữ liệu** → thủng
   T1, tức là thủng đúng mục tiêu chính.
2. **`block_encryption_mode` mặc định = `aes-128-ecb`.** ECB không IV, deterministic: cùng
   plaintext → cùng ciphertext. Rò rỉ pattern, và không có tag xác thực → thủng T4.

Đây là "mã hóa chống trộm ổ cứng của DB", không phải "mã hóa chống DB".

### 2.2 Các lựa chọn phía Postgres — đều loại

| Cách | Vì sao loại |
|---|---|
| `pgcrypto` `pgp_sym_encrypt(col, key)` | Y hệt lỗi #1 ở trên — khóa đi trong SQL |
| `pgsodium` + Vault TCE | Supabase **đã deprecate và khuyến cáo không dùng** (phức tạp vận hành, dễ cấu hình sai); đã gỡ khỏi Table Editor |
| Encryption at rest của Supabase | **Đã bật sẵn** — nhưng chỉ chống T2-của-datacenter, không chống T1 |

→ **Mã hóa phải nằm ở client.** Đó chính là thứ `secureCrypto.ts` đang làm. Câu hỏi thật không
phải "dùng công nghệ gì" mà là "mở rộng cái đang có tới đâu và tổ chức khóa thế nào".

---

## 3. Chốt thuật toán

### 3.1 Cipher: AES-256-GCM — giữ nguyên

| Tiêu chí | Đánh giá |
|---|---|
| AEAD (bảo mật + toàn vẹn) | ✅ chống T4 |
| WebCrypto native | ✅ không dependency, không WASM |
| Tăng tốc phần cứng (AES-NI) | ✅ |
| Đã dùng trong codebase | ✅ không rủi ro migration cipher |

**Không đổi sang XChaCha20-Poly1305.** Ưu điểm duy nhất đáng kể là nonce 192-bit (an toàn hơn khi
sinh ngẫu nhiên số lượng cực lớn), nhưng WebCrypto không hỗ trợ → phải kéo libsodium WASM.
Đổi lấy rủi ro migration + bundle size cho một biên an toàn ta không chạm tới (§3.2).

### 3.2 Ngân sách IV — kiểm tra định lượng

IV 96-bit ngẫu nhiên mỗi message. NIST SP 800-38D §8.3 giới hạn **2³² lần mã hóa/khóa** để xác
suất trùng IV dưới 2⁻³².

Ước lượng xấu nhất cho BBQOne: 10.000 note × 100 lần sửa/năm × 10 năm = **10⁷ thao tác**
« 2³² ≈ 4,3 × 10⁹. **Dư 3 bậc độ lớn.** Random IV an toàn. Ghi lại con số này để lần sau không
phải tranh luận lại.

> ⚠️ Ràng buộc phái sinh: **KHÔNG** được đổi sang IV đếm tăng (counter) khi đã multi-device —
> hai thiết bị offline sẽ sinh trùng counter, và trùng nonce trong GCM làm **mất hoàn toàn**
> tính bí mật lẫn toàn vẹn. Random IV là lựa chọn đúng cho local-first.

### 3.3 KDF: Argon2id — nâng cấp

| KDF | Đánh giá |
|---|---|
| PBKDF2-SHA256 310k *(hiện tại — secure folder)* | Đạt chuẩn cũ. **Chỉ tốn CPU** → GPU/ASIC crack rẻ |
| PBKDF2-SHA256 120k *(hiện tại — bookmark PIN)* | ⚠️ **Dưới chuẩn.** Còn tệ hơn vì PIN có entropy rất thấp |
| PBKDF2-SHA256 600k | Mức OWASP hiện hành nếu bắt buộc dùng PBKDF2 |
| **Argon2id m=64MiB, t=3, p=1** | ✅ **Chốt.** Memory-hard → vô hiệu hóa lợi thế GPU/ASIC |

**Khả thi:** CSP hiện tại đã có `'wasm-unsafe-eval'` (đang dùng cho Shiki) — xem
`public/manifest.json`. Không cần sửa CSP.

**Rủi ro phải đo trước khi chốt:** Argon2id 64MiB trong **MV3 service worker** có thể chạm giới
hạn bộ nhớ và bị kill. Bắt buộc benchmark ở cả 3 context (popup / dashboard tab / SW). Nếu SW
không chịu nổi → hạ m=32MiB **hoặc** quy ước "unwrap DEK chỉ xảy ra ở context có UI", SW nhận
DEK qua message. Quyết định sau khi có số đo, ghi vào spec Phase 4.

**Chiến lược an toàn:** tham số KDF lưu trong DB (`kdf`, `kdf_params`) → nâng cấp được mà không
phá dữ liệu cũ. Đây là lý do §4 bắt buộc có cột đó.

### 3.4 Tách khóa theo mục đích: HKDF-SHA256

Không dùng thẳng DEK cho mọi việc. Domain separation:

```
K_content = HKDF-SHA256(DEK, salt = "", info = "bbq:content:v2")
K_index   = HKDF-SHA256(DEK, salt = "", info = "bbq:blind-index:v2")
```

WebCrypto hỗ trợ HKDF native. Lợi ích: lộ `K_index` (bề mặt tấn công rộng hơn vì dùng để tạo
index tìm kiếm) **không** kéo theo lộ nội dung.

---

## 4. Phân cấp khóa — DEK/KEK

### 4.1 Sơ đồ

```
passphrase ──Argon2id(kdf_salt, kdf_params)──► KEK        (RAM, không bao giờ lưu)
                                                │
                              wrapped_dek ◄─────┤ AES-256-GCM wrap
                                    │           │
recovery_key ──HKDF──► RKEK ──► wrapped_dek_recovery      (bản sao thứ 2)
                                    │
                                 unwrap
                                    ▼
                                   DEK          (256-bit ngẫu nhiên, RAM)
                                    │
                            HKDF ───┼─── K_content ──► title, content, label, …
                                    └─── K_index   ──► blind index (Phase 5)
```

### 4.2 Vì sao DEK/KEK — không phải "thêm phức tạp cho vui"

Nó sửa một **bug đang chờ nổ** trong code hiện tại. `changePassphrase`
(`src/stores/secureFolder.ts:282-297`) re-encrypt **từng note một, qua network**:

```ts
    for (const n of list) {
      const titlePlain = await decryptField(n.title, oldKey)
      const title = await encryptField(titlePlain, newKey)
      await notesService.update(n.id, { title }, { row: n, retryOnConflictWithServerState: true })
      // … rồi từng body …
    }
```

Với 1.900 note: hàng nghìn round-trip, **không atomic**, không resume. Mất mạng giữa chừng →
folder lẫn hai khóa khác nhau, **hỏng vĩnh viễn**, không có đường lùi.

Với DEK/KEK: đổi passphrase = derive KEK mới, wrap lại DEK, **1 UPDATE 1 dòng**. Dữ liệu không
bị đụng tới.

| Thao tác | Hiện tại | Sau DEK/KEK |
|---|---|---|
| Đổi passphrase | O(n) round-trip, không atomic | **O(1)**, atomic |
| Thêm thiết bị | derive lại từ passphrase | unwrap DEK |
| Nghi ngờ lộ khóa | không có đường rotate | rotate DEK (nền, resume được) |
| Recovery key | ❌ không có | wrap DEK lần 2 |

### 4.3 Schema

```sql
-- Phase 2. Tiền lệ shape: bảng bookmark_crypto đã có sẵn (salt/verifier).
create table if not exists user_crypto (
  user_id              uuid primary key references auth.users(id) on delete cascade,

  -- tham số KDF: lưu trong DB để nâng cấp được mà không phá dữ liệu cũ
  kdf                  text        not null default 'argon2id',
  kdf_params           jsonb       not null default '{"m":65536,"t":3,"p":1}'::jsonb,
  kdf_salt             text        not null,            -- base64, 16B CSPRNG

  -- DEK được bọc 2 lần: bằng passphrase, và bằng recovery key
  dek_id               text        not null default 'k1',
  wrapped_dek          text        not null,            -- bbq:2:A256GCM:k1:<iv>:<ct>
  wrapped_dek_recovery text,                            -- null = user chưa tạo recovery key

  -- sentinel để kiểm passphrase mà không cần chạm dữ liệu thật
  verifier             text        not null,

  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

alter table user_crypto enable row level security;

drop policy if exists user_crypto_owner on user_crypto;
create policy user_crypto_owner on user_crypto
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

> `kdf_params` là jsonb chứ không phải cột int như `folders.pbkdf2_iterations` — vì Argon2id có
> 3 tham số và sẽ còn đổi. Học từ chỗ `pbkdf2_iterations` đã bị khóa cứng vào một thuật toán.

---

## 5. ⚠️ Quyết định khó nhất: passphrase riêng hay dùng password tài khoản?

Đây là chỗ dễ tự lừa mình nhất — phải nói thẳng.

**Nếu KEK = KDF(password Supabase) thì KHÔNG còn là E2EE.** Vì
`supabase.auth.signInWithPassword({ email, password })` **gửi password lên GoTrue** để verify.
Trong khoảnh khắc đó server thấy password gốc → server derive được KEK → thủng T1, tức mất đúng
thứ ta bỏ công xây.

Ba phương án:

| PA | Cách làm | E2EE thật? | UX | Chi phí |
|---|---|---|---|---|
| **1** | Passphrase **riêng** cho mã hóa (mở rộng mô hình secure folder hiện tại) | ✅ | 2 mật khẩu | Thấp — không đụng auth |
| **2** | 1 password, tách phía client: `auth_secret = HKDF(pw,"auth")` gửi Supabase làm "password"; `KEK = Argon2id(pw,"enc")` giữ lại client (mô hình Bitwarden/Proton) | ✅ | 1 mật khẩu | **Cao** — refactor auth, phá account cũ, **vỡ luồng reset password** |
| **3** | Dùng thẳng password Supabase làm KEK | ❌ | 1 mật khẩu | Thấp — nhưng **vô nghĩa về bảo mật** |

**Chốt: PA 1 cho Phase 1–4.** Lý do: đạt đủ mục tiêu T1/T2, không đụng vào auth (vùng rủi ro
cao nhất của codebase), và migrate được liền mạch từ secure folder hiện có — user đã quen khái
niệm "passphrase riêng".

**PA 2 để dành Phase 5, chỉ làm nếu có phản hồi UX thật.** Cạm bẫy phải giải trước khi làm: email
reset password của Supabase đặt password mới **phía server** → chuỗi KEK đứt → dữ liệu không đọc
được nữa. Bắt buộc phải tắt luồng reset mặc định hoặc buộc dùng recovery key. **Không làm PA 2
trước khi recovery key (§6) đã chạy trong production.**

**PA 3: loại.** Nếu chọn nó thì đừng gọi là mã hóa đầu-cuối.

---

## 6. Recovery key — bắt buộc, không phải tùy chọn

Với E2EE thật, **quên passphrase = mất sạch dữ liệu**. Không admin nào reset được. Ship E2EE mà
không có recovery = ship một quả bom hẹn giờ cho support.

- Sinh 128-bit CSPRNG lúc setup, hiển thị **một lần duy nhất**, dạng nhóm 4 ký tự base32
  (`XXXX-XXXX-…`) để chép tay được.
- `RKEK = HKDF-SHA256(recovery_key, info="bbq:recovery:v2")` → wrap DEK → `wrapped_dek_recovery`.
- Bắt user xác nhận đã lưu (gõ lại một phần) trước khi cho qua.
- Buộc hiện lại cảnh báo nếu `wrapped_dek_recovery IS NULL`.
- **Không** gửi recovery key qua email/cloud. Nếu server có nó thì E2EE lại thành vô nghĩa.

---

## 7. Mã hóa cái gì — phân tầng cụ thể

### 7.1 Bảng phân loại

Ký hiệu: 🔒 mã hóa · ⬜ để nguyên (cần cho sync/sort/query) · ⚠️ có đánh đổi

| Bảng | Cột | | Ghi chú |
|---|---|---|---|
| `notes` | `id`, `user_id`, `folder_id` | ⬜ | Khóa quan hệ — mã hóa là hỏng sync |
| | `title` | 🔒 | Đã làm cho secure folder → mở rộng toàn bộ |
| | `tags` | ⚠️ | Mã hóa → **mất lọc tag phía server**. Phase 1 giữ nguyên; blind index ở Phase 5 |
| | `updated_at`, `synced_at`, `created_at` | ⬜ | **Bắt buộc plaintext** — optimistic guard `bbq_update_note_if_current` so sánh `updated_at` |
| | `fts` | ❌ **DROP** | Không index nổi ciphertext (§7.2) |
| `note_bodies` | `label`, `content` | 🔒 | |
| | `position` | ⬜ | Cần để sắp xếp |
| | `fts` | ❌ **DROP** | |
| `calendar_events` | `title`, `description` | 🔒 | ⚠️ **phải DROP 2 CHECK** — §7.4 |
| | `event_date` | ⬜ | `listByDateRange` dùng `.gte()/.lte()` — mã hóa là mất tính năng lịch |
| | `is_done`, `position`, `color` | ⬜ | Rò rỉ metadata mức thấp, chấp nhận |
| `folders` | `name` | 🔒 | Hiện **plaintext cả cloud lẫn local** — rò rỉ đã biết ở v1.3.3 |
| | `is_secure`, `secure_salt`, `pbkdf2_iterations` | ⬜ | Metadata crypto, không phải bí mật |
| `bookmark_backups` | `tree_json` | 🔒 | Đã làm (PIN) — Phase 3 gộp về DEK chung |
| `user_crypto` | tất cả | ⬜ | Bản thân nó là metadata khóa |

### 7.2 Hệ quả nặng nhất: mất full-text search phía server

`005_note_bodies.sql` có 2 trigger sinh `fts`:

```sql
CREATE TRIGGER notes_set_fts       BEFORE INSERT OR UPDATE OF title, tags ON notes …
CREATE TRIGGER note_bodies_set_fts BEFORE INSERT OR UPDATE OF label, content ON note_bodies …
```

Sau khi mã hóa, `to_tsvector()` chỉ thấy base64 → **index thành rác, tốn dung lượng, không dùng
được**. Cơ chế chính xác (leader-audit 2026-07-20): `notesService.searchFullText()`
(`src/services/notes.service.ts:127-147`) khi đó **không error mà trả 0 row** (token query không
bao giờ khớp fts base64) — nhánh fallback-on-error của nó KHÔNG kích hoạt; search còn sống là
nhờ `runSearch` (`stores/notes.ts:76`) merge thêm kết quả `filterNotesBySubstring` client-side.

> ⚠️ Ràng buộc kéo theo cho spec S2: `runSearch` hiện **loại secure folder khỏi kết quả**
> (`stores/notes.ts:81`). Nếu §13-Q1 chốt "mã hóa toàn account" thì filter này loại... toàn bộ
> kết quả — phải rework thành "loại folder ĐANG KHÓA, giữ folder đã unlock".

**Ba lựa chọn:**

| # | Cách | Phù hợp khi | Đánh giá |
|---|---|---|---|
| 1 | Chỉ search client-side — `filterNotesBySubstring` (**đã có sẵn**) | < ~5.000 note | ✅ **Chốt cho Phase 1–4.** Không code mới. Đúng tinh thần local-first: corpus đã nằm sẵn trong cache |
| 2 | **Blind index**: `token_hashes text[]` = `HMAC(K_index, token)`, GIN index | > 5.000 note | Phase 5. Rò rỉ tần suất token — giảm bằng cách chỉ index token ≥ 3 ký tự |
| 3 | Inverted index mã hóa trong IndexedDB | Corpus rất lớn | Phức tạp cao, để cuối cùng |

> Ghi chú giao với backlog: **N15** (perf search) đã nằm sẵn trong `ROADMAP-N.md`. S2 làm N15
> **cấp thiết hơn** vì bỏ hẳn được FTS server. Nên gộp N15 vào Phase 5.

### 7.3 Encoding: giữ base64 trong cột TEXT

| Cách | Overhead | Kết luận |
|---|---|---|
| base64 trong `text` | ×1,33 | ✅ **Chốt** |
| `bytea` | PostgREST trả về hex `\x…` → **×2** | ❌ tệ hơn |

Overhead thực tế mỗi field: `plaintext + 16B (GCM tag)` → base64 ×1,33, cộng ~40 ký tự prefix+IV.
Ảnh hưởng cả bandwidth lẫn quota `chrome.storage.local` — nhưng `unlimitedStorage` đã bật từ N1.

### 7.4 ⚠️ CHECK constraint sẽ vỡ — bắt lỗi trước khi lên production

`012_calendar_events.sql` (verbatim):

```sql
  title           TEXT NOT NULL CHECK (char_length(title) <= 64),
  description     TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
```

Tính toán độ dài sau mã hóa:

| Field | Plaintext | Sau AES-GCM + base64 + prefix | Constraint | Kết quả |
|---|---|---|---|---|
| `title` | 64 ký tự ASCII | ≈ **137** ký tự | ≤ 64 | ❌ **VỠ** |
| `description` | 5.000 ký tự ASCII | ≈ **6.717** ký tự | ≤ 5.000 | ❌ **VỠ** |

Tiếng Việt còn tệ hơn: `char_length` đếm **ký tự**, nhưng mã hóa chạy trên **byte** — ký tự có
dấu tốn 2–3 byte UTF-8.

→ Migration Phase 3 **bắt buộc** `DROP CONSTRAINT` và chuyển kiểm tra độ dài lên **client**
(validate plaintext trước khi mã hóa). Bỏ sót bước này thì mọi thao tác lưu calendar sẽ fail
với lỗi 23514 khó đọc.

> Tên constraint thật trên DB live (leader-audit 2026-07-20): CHECK của title là
> `calendar_events_title_check` — do `013_calendar_events_title_max_64.sql` DROP + re-create
> (comment trong 013 cho biết bản 012 gốc từng cho 200 ký tự; file 012 trong repo đã được sửa
> hậu kiểm nên đừng tin nó khớp DB live). CHECK của description là auto-name
> `calendar_events_description_check` từ 012. Migration S3 phải `DROP CONSTRAINT` đúng HAI tên
> này. Con số ≈137/≈6.717 ở bảng tính theo prefix v1 (12 ký tự); theo envelope v2
> `bbq:2:A256GCM:k1:` là ≈142/≈6.722 — kết luận VỠ không đổi.

---

## 8. Envelope format v2 — có version

Format hiện tại `retronote:1:<iv>:<ct>` không mang thuật toán lẫn key-id → không rotate được,
không đổi cipher được.

```
bbq:2:A256GCM:k1:<iv_b64>:<ct_b64>
│   │ │       │
│   │ │       └── dek_id — cho phép rotate DEK
│   │ └────────── thuật toán — cho phép đổi cipher sau này
│   └──────────── version format
└──────────────── namespace
```

**Quy tắc đọc/ghi — không thương lượng:**

- **ĐỌC:** chấp nhận **cả `retronote:1:` lẫn `bbq:2:`**, vĩnh viễn. Không bao giờ được xóa code
  đọc v1 — vẫn còn dữ liệu v1 trong backup của user.
- **GHI:** luôn ghi `bbq:2:`.
- `isEncryptedEnvelope()` phải nhận **cả hai** prefix. Đây là hàm quyết định "có mã hóa chưa" ở
  `sync.service.ts:114-123` và `secureCache.ts` (S1) — nhận sai một prefix là **đẩy plaintext lên
  cloud**. Điểm nguy hiểm nhất của toàn bộ Phase 2.

---

## 9. Migration — lazy, resume được, không big-bang

**Nguyên tắc: không có bước nào làm dữ liệu không đọc được, kể cả khi đứt giữa chừng.**

```
Phase 2a  tạo user_crypto + DEK + recovery key       — chưa đụng dữ liệu
Phase 2b  đọc-hai-chiều: decrypt được cả v1 lẫn v2   — chưa đụng dữ liệu
Phase 2c  ghi v2: mọi lần lưu MỚI dùng DEK           — dữ liệu tự chuyển dần
Phase 2d  backfill nền: quét row v1 → ghi lại v2     — resume được, có progress
Phase 2e  báo cáo: đếm row còn v1                     — chỉ để quan sát, không ép
```

Ràng buộc bắt buộc cho backfill:
- **Idempotent** — chạy lại không hỏng (envelope v2 rồi thì bỏ qua).
- **Resume được** — lưu con trỏ; mất mạng/đóng popup thì lần sau chạy tiếp.
- **Tôn trọng optimistic guard** — đi qua `bbq_update_*_if_current`, không bypass. Conflict thì
  bỏ qua row đó, vòng sau làm lại.
- **Không chạy trong service worker** — MV3 giết SW giữa chừng (bài học N7). Chạy ở popup/tab,
  theo lô nhỏ.
- **Không xóa cột `fts`** cho tới khi backfill xong — nếu phải rollback thì FTS vẫn còn.

---

## 10. Rotation

| Tình huống | Xử lý | Chi phí |
|---|---|---|
| Đổi passphrase | Derive KEK mới → wrap lại DEK | **1 UPDATE** |
| Mất recovery key | Sinh cái mới → wrap lại DEK | **1 UPDATE** |
| **Nghi ngờ lộ DEK** | Sinh DEK2 (`dek_id='k2'`) → re-encrypt toàn bộ nền, resume được; đọc chấp nhận cả k1 lẫn k2 | O(n), nhưng **có đường đi** |

Hôm nay tình huống 3 **không có đường xử lý nào cả** — đó là lý do `dek_id` phải có mặt ngay từ
Phase 2, kể cả khi chưa dùng tới.

---

## 11. Rủi ro đã biết

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Argon2id 64MiB bị MV3 SW kill | 🔴 Cao | Benchmark 3 context trước khi chốt tham số; hạ m hoặc unwrap chỉ ở context UI |
| `isEncryptedEnvelope` bỏ sót prefix v2 → **đẩy plaintext lên cloud** | 🔴 Cao | Test riêng cho cả 2 prefix ở **mọi** call site; assert bất biến như `T1.11` của S1 |
| Backfill đứt giữa chừng → lẫn v1/v2 | 🟡 TB | Đọc-hai-chiều là **vĩnh viễn** → lẫn cũng không sao |
| User mất passphrase lẫn recovery key | 🟡 TB | Cảnh báo rõ lúc setup; không hứa hẹn khôi phục |
| Ciphertext ×1,33 làm phình cache | 🟢 Thấp | `unlimitedStorage` đã bật (N1) |
| Mất FTS server làm search chậm ở corpus lớn | 🟡 TB | Phase 5 blind index; gộp với N15 |
| Sửa `secureCrypto.ts` làm hỏng secure folder đang có | 🔴 Cao | **Chỉ thêm, không sửa** hàm v1. `encryptField`/`decryptField` v1 giữ nguyên byte-for-byte |

---

## 12. Lộ trình

| Phase | Nội dung | Phụ thuộc | Ước lượng |
|---|---|---|---|
| **S1** | Bịt rò rỉ plaintext xuống cache local | — | 1 spec, nhỏ ✅ *(đã có spec+test)* |
| **S2** | `user_crypto` + DEK/KEK + recovery key + envelope v2 + đọc-hai-chiều | S1 GREEN | Lớn — nên tách 2 spec |
| **S3** | Mở rộng phạm vi: `folders.name`, calendar title/description (**DROP 2 CHECK**), gộp bookmark PIN về DEK chung | S2 | TB |
| **S4** | Argon2id (sau khi benchmark); nếu hoãn thì **tối thiểu** nâng PBKDF2 lên 600k | S2 | Nhỏ + đo đạc |
| **S5** | Blind index cho search + tag; gộp N15 | S3 | Lớn, tùy corpus |
| **S6** | *(tùy chọn)* Hợp nhất 1 password kiểu Bitwarden (§5 PA 2) | S2 + recovery đã chạy production | Lớn, rủi ro auth |

**Đường tối thiểu để đạt mục tiêu bảo mật: S1 → S2 → S3.** S4/S5/S6 là tối ưu hóa.

---

## 13. Câu hỏi cần chốt trước khi viết spec S2

1. **Phạm vi mặc định:** mã hóa **toàn bộ** note của account, hay giữ mô hình opt-in per-folder?
   → Ảnh hưởng trực tiếp UX (unlock một lần lúc mở app vs unlock từng folder).
   *Khuyến nghị: toàn bộ + unlock một lần. Mã hóa chọn lọc để lộ chính xác thứ đáng chú ý nhất.*
2. **Local mode (chưa đăng nhập):** có mã hóa cache không? Chưa có tài khoản thì passphrase lấy từ
   đâu? *Khuyến nghị: Phase 1 không mã hóa local mode; ghi rõ giới hạn này trong `SECURITY.md`.*
3. **Account đang tồn tại:** có ép migrate không, hay để opt-in? *Khuyến nghị: opt-in kèm banner,
   ép sau 2 release.*
4. **Argon2id trong SW:** cần số benchmark thật trước khi chốt tham số §3.3.
