# SPEC S2A — Envelope v2 (`bbq:2:`) + đọc-hai-chiều trong `secureCrypto.ts`

> **Đối chiếu source (2026-07-20, branch `main`, sau S1 = commit `449db9c`, tree sạch):** mọi
> `file:line` dưới đây đã verify trên code hiện tại.
>
> **Failing test đi kèm:** `specs/S2A-envelope-v2-read.test.mjs` — chạy
> `node specs/S2A-envelope-v2-read.test.mjs` từ repo root. RED trên code hiện tại,
> GREEN sau khi áp đúng spec này.
>
> **Bối cảnh thiết kế:** `specs/S2-e2ee-architecture.md` §8 (envelope v2) + §13 (đã chốt).
> S2A là bước "**reader đi trước writer**": sau spec này, hệ ĐỌC được cả hai format nhưng
> **chưa có gì ghi v2** — zero thay đổi hành vi với dữ liệu hiện có.

---

## PHẦN A — SPEC

### Vì sao cần (1 đoạn)

Format hiện tại `retronote:1:<iv>:<ct>` (`secureCrypto.ts:12`) không mang thuật toán lẫn key-id
→ không rotate DEK được, không đổi cipher được, không phân biệt được khóa nào mã hóa row nào.
S2B sắp lưu `wrapped_dek` bằng chính format v2 → parser/formatter phải có mặt TRƯỚC. Nguyên tắc
migration của ADR §9: không chuỗi v2 nào được phép tồn tại trong hệ trước khi mọi reader nhận
diện được nó — vì `isEncryptedEnvelope()` là hàm quyết định "đã mã hóa chưa" ở cả push guard
(`sync.service.ts:115-118`) lẫn seal S1 (`secureCache.ts:62,86-87`); nhận sai một prefix là
**đẩy plaintext lên cloud hoặc xuống đĩa**.

### Format v2 — chốt (ADR §8)

```
bbq:2:A256GCM:k1:<iv_b64>:<ct_b64>
│   │ │       │
│   │ │       └── kid — dek_id, cho phép rotate DEK
│   │ └────────── alg — cho phép đổi cipher sau này
│   └──────────── version format
└──────────────── namespace
```

**Predicate nhận diện v2 phải STRICT** (khác v1 chỉ check prefix): đúng **6 segment** khi
`split(':')`, alg khớp `^[A-Z0-9]{4,16}$`, kid khớp `^[a-z0-9_-]{1,32}$`, iv khớp
`^[A-Za-z0-9+/]{16,32}={0,2}$`, ct khớp `^[A-Za-z0-9+/]+={0,2}$`. Lý do: v1 prefix-only đã có
quirk "user gõ đúng chuỗi mồi thì bị coi là ciphertext" — v2 không được nhân đôi xác suất đó
bằng một prefix ngắn dễ gõ trúng.

### Hiện trạng `src/utils/secureCrypto.ts` (verbatim, `:11-13` và `:31-33`)

```ts
/** Bọc ciphertext title/content; cùng lý do giữ literal `retronote:1:` như trên. */
const ENVELOPE_PREFIX = 'retronote:1:'
```

```ts
export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX)
}
```

`decryptField` (`:72-89`) chỉ hiểu v1: slice prefix → tách `iv:ct` → AES-GCM.
`encryptField` (`:61-70`) ghi v1.

### Thay đổi — CHỈ trong `src/utils/secureCrypto.ts`, CHỈ THÊM + mở rộng reader

**1. Thêm hằng + interface + parser/formatter** (đặt ngay dưới `ENVELOPE_PREFIX`):

```ts
/** S2A: envelope v2 — có version/alg/kid để rotate khóa & đổi cipher (ADR §8). */
export const ENVELOPE_V2_PREFIX = 'bbq:2:'
export const ENVELOPE_V2_ALG = 'A256GCM'

export interface EnvelopeV2 {
  alg: string
  kid: string
  ivB64: string
  ctB64: string
}

const V2_ALG_RE = /^[A-Z0-9]{4,16}$/
const V2_KID_RE = /^[a-z0-9_-]{1,32}$/
const V2_IV_RE = /^[A-Za-z0-9+/]{16,32}={0,2}$/
const V2_CT_RE = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * Parse strict: đúng 6 segment + regex từng phần. Trả null nếu không phải v2.
 * Strict để plaintext user gõ dạng `bbq:2:...` gần đúng KHÔNG bị coi là ciphertext.
 */
export function parseEnvelopeV2(value: string): EnvelopeV2 | null {
  if (!value.startsWith(ENVELOPE_V2_PREFIX)) return null
  const parts = value.split(':')
  if (parts.length !== 6) return null
  const [, , alg, kid, ivB64, ctB64] = parts
  if (!V2_ALG_RE.test(alg)) return null
  if (!V2_KID_RE.test(kid)) return null
  if (!V2_IV_RE.test(ivB64)) return null
  if (!V2_CT_RE.test(ctB64)) return null
  return { alg, kid, ivB64, ctB64 }
}

export function formatEnvelopeV2(
  alg: string,
  kid: string,
  ivB64: string,
  ctB64: string,
): string {
  if (!V2_ALG_RE.test(alg)) throw new Error('Invalid envelope alg')
  if (!V2_KID_RE.test(kid)) throw new Error('Invalid envelope kid')
  return `${ENVELOPE_V2_PREFIX}${alg}:${kid}:${ivB64}:${ctB64}`
}
```

**2. Mở rộng `isEncryptedEnvelope`** — nhận CẢ HAI, vĩnh viễn:

```ts
export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX) || parseEnvelopeV2(value) !== null
}
```

**3. Thêm writer v2 (chưa ai gọi trong data path — S2B dùng cho `wrapped_dek`):**

```ts
/** S2A: encrypt → envelope v2. Data path vẫn ghi v1 cho tới S2C. */
export async function encryptFieldV2(
  plaintext: string,
  key: CryptoKey,
  kid: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return formatEnvelopeV2(
    ENVELOPE_V2_ALG,
    kid,
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(ciphertext)),
  )
}
```

**4. Mở rộng `decryptField` — branch theo format, nhánh v1 GIỮ NGUYÊN BYTE-FOR-BYTE:**

```ts
export async function decryptField(envelope: string, key: CryptoKey): Promise<string> {
  const v2 = parseEnvelopeV2(envelope)
  if (v2) {
    if (v2.alg !== ENVELOPE_V2_ALG) {
      throw new Error('Unsupported envelope algorithm')
    }
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(v2.ivB64) },
      key,
      base64ToBytes(v2.ctB64),
    )
    return new TextDecoder().decode(decrypted)
  }
  if (!isEncryptedEnvelope(envelope)) {
    throw new Error('Invalid encrypted payload')
  }
  const rest = envelope.slice(ENVELOPE_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon === -1) throw new Error('Malformed encrypted payload')
  const ivB64 = rest.slice(0, colon)
  const ctB64 = rest.slice(colon + 1)
  const iv = base64ToBytes(ivB64)
  const ciphertext = base64ToBytes(ctB64)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(decrypted)
}
```

### Edge case BẮT BUỘC giữ

1. **`encryptField` (writer v1) KHÔNG đổi một byte** — data path ghi v1 cho tới S2C. Đây là
   ràng buộc "Chỉ thêm, không sửa hàm v1" trong bảng rủi ro ADR §11.
2. **Alg lạ nhưng shape v2 hợp lệ** (vd `bbq:2:XCHACHA20:k1:<iv>:<ct>`): `isEncryptedEnvelope`
   phải trả **true** (nó LÀ ciphertext — guard không được coi là plaintext rồi đẩy đi/encrypt
   chồng), nhưng `decryptField` phải **throw `Unsupported envelope algorithm`** (không âm thầm
   trả rác).
3. **Near-miss KHÔNG được nhận:** `bbq:2:` trần, thiếu segment, sai base64, kid viết hoa —
   tất cả trả false (vẫn là plaintext bình thường của user).
4. **Không đụng call site nào.** `secureCache.ts` (S1) và `sync.service.ts` tự hưởng lợi qua
   `isEncryptedEnvelope` — single source of truth.

### KHÔNG được đổi (chặn over-reach)

- KHÔNG đổi `ENVELOPE_PREFIX`, `SECURE_VERIFIER_PLAINTEXT`, `DEFAULT_PBKDF2_ITERATIONS`,
  `deriveKeyFromPassword`, `generateSalt16`, salt helpers.
- KHÔNG đụng `secureCache.ts`, `sync.service.ts`, stores, services — file MỚI cũng không.
  (S2B mới thêm file.)
- KHÔNG cho bất kỳ writer nào trong data path gọi `encryptFieldV2` — đó là S2C.
- KHÔNG thêm dependency.

### ⚠ FLAG liên đới

- **Quirk có sẵn, KHÔNG mở rộng scope để sửa:** user gõ tay chuỗi bắt đầu `retronote:1:` vào
  note của secure folder → bị coi là ciphertext (prefix-only). V2 strict-shape làm xác suất
  tương tự với `bbq:2:` thấp hơn nhiều. Fix triệt để (per-row try/catch trong overlay decrypt)
  để backlog, không làm ở đây.
- **S1 harness** mock `isEncryptedEnvelope` bằng prefix v1 trong test riêng của nó — không bị
  ảnh hưởng (mock, không load file thật). 20/20 harness cũ phải giữ PASS.

---

## PHẦN B — FAILING TEST

File: `specs/S2A-envelope-v2-read.test.mjs`. Chạy: `node specs/S2A-envelope-v2-read.test.mjs`

- Transpile `src/utils/secureCrypto.ts` (file KHÔNG có import → không cần mock) và chạy bằng
  **WebCrypto thật** của Node (`globalThis.crypto.subtle`, Node ≥ 20).
- **T1 v1-compat:** roundtrip `encryptField`→`decryptField` với key PBKDF2 thật (iterations
  thấp cho nhanh); output vẫn `retronote:1:` + đúng 4 segment. RED-proof: trên code hiện tại
  phần này PASS — RED đến từ T2+.
- **T2 exports mới:** `ENVELOPE_V2_PREFIX`, `ENVELOPE_V2_ALG`, `parseEnvelopeV2`,
  `formatEnvelopeV2`, `encryptFieldV2` tồn tại.
- **T3 nhận diện:** `isEncryptedEnvelope` true cho v1 + output `encryptFieldV2`; **false** cho
  5 near-miss (`bbq:2:`, thiếu segment, 5 segment, sai base64, kid hoa) + plaintext thường.
- **T4 roundtrip v2:** `encryptFieldV2(plain, key, 'k1')` → parse ra alg/kid đúng →
  `decryptField` trả lại plain.
- **T5 sai key:** decrypt v2 bằng key khác → throw.
- **T6 alg lạ:** shape v2 alg `XCHACHA20` → `isEncryptedEnvelope` true NHƯNG `decryptField`
  throw `Unsupported envelope algorithm`.
- **T7 writer v1 bất biến:** `encryptField` output startsWith `retronote:1:`.
- **T8 kid sai:** `encryptFieldV2(..., 'K1 hoa')` / `formatEnvelopeV2` kid sai → throw.
- **T9 parse↔format identity.**
- **W1/W2:** `secureCache.ts` và `sync.service.ts` vẫn import `isEncryptedEnvelope` từ
  `@/utils/secureCrypto` (single source of truth).
- **W3:** `secureCrypto.ts` vẫn còn literal `'retronote:1:'` và `encryptField` vẫn dùng
  `ENVELOPE_PREFIX` (writer v1 không đổi).

## PHẦN C — RED→GREEN CRITERIA

FAIL→PASS khi và chỉ khi: parser strict đúng 6-segment + regex, `isEncryptedEnvelope` nhận cả
hai format, `decryptField` đọc-hai-chiều (v1 byte-for-byte như cũ), `encryptFieldV2` ghi đúng
format, `encryptField` v1 không đổi.

**Nghiệm thu bổ sung:** toàn bộ `node specs/*.test.mjs` PASS (21 file sau spec này) và
`npx vue-tsc --noEmit -p tsconfig.app.json` sạch.

**Verify tay:** không có — mọi hành vi Node mô phỏng được. (Không có UI mới, không SQL.)
