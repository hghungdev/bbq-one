# SPEC S2B — `user_crypto` + DEK/KEK + recovery key (hạ tầng khóa, CHƯA đụng dữ liệu)

> **Đối chiếu source (2026-07-20, branch `main`, tree sạch):** yêu cầu **S2A đã GREEN**
> (`specs/S2A-envelope-v2-read.spec.md`) — spec này import parser/formatter v2 từ đó.
>
> **Failing test đi kèm:** `specs/S2B-user-crypto-dek-kek.test.mjs` — chạy
> `node specs/S2B-user-crypto-dek-kek.test.mjs`. RED hiện tại, GREEN sau khi áp spec.
>
> **Bối cảnh thiết kế:** `specs/S2-e2ee-architecture.md` §4 (DEK/KEK), §6 (recovery 160-bit),
> §13 (đã chốt: opt-in account-level; PBKDF2 600k, Argon2id dời S4).
> **Phase 2a của ADR §9: tạo hạ tầng khóa — KHÔNG store nào, KHÔNG UI nào, KHÔNG data path nào
> được đụng tới trong spec này.** Đó là S2C.

---

## PHẦN A — SPEC

### Sơ đồ (ADR §4.1, nhắc lại phần spec này phủ)

```
passphrase ──PBKDF2-600k(kdf_salt)──► KEK (RAM)
                                       │ AES-GCM wrap
                     wrapped_dek ◄─────┤            = bbq:2:A256GCM:<dek_id>:<iv>:<ct>
recovery 160-bit ──HKDF──► RKEK ──► wrapped_dek_recovery (bản sao 2)
                                       │ unwrap
                                       ▼
                                      DEK 32B (RAM)
                                       │ HKDF ── K_content / K_index
```

### Vì sao DEK/KEK (tóm tắt — chi tiết ADR §4.2)

`changePassphrase` hiện tại (`secureFolder.ts:282-297`) re-encrypt O(n) qua network, không
atomic — đứt giữa chừng là folder lẫn hai khóa, hỏng vĩnh viễn. Với DEK/KEK: đổi passphrase =
wrap lại DEK, **1 UPDATE**. Spec này chỉ dựng hạ tầng; chưa migrate gì.

### Thay đổi 1/3 — file MỚI `supabase/migrations/015_user_crypto.sql`

```sql
-- S2B: hạ tầng khóa account-level (DEK/KEK + recovery). Phase 2a — chưa client nào ghi/đọc
-- cho tới S2C. Chạy trong Supabase SQL Editor sau 014_optimistic_update_guard.sql.
-- Tiền lệ shape: bookmark_crypto (006) — user_id PK, RLS owner.

CREATE TABLE IF NOT EXISTS user_crypto (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- tham số KDF nằm trong DB → S4 nâng Argon2id bằng UPDATE + re-wrap, không phá dữ liệu
  kdf                  TEXT        NOT NULL DEFAULT 'pbkdf2-sha256',
  kdf_params           JSONB       NOT NULL DEFAULT '{"iterations":600000}'::jsonb,
  kdf_salt             TEXT        NOT NULL,            -- base64, 16B CSPRNG

  -- DEK được bọc 2 lần: bằng KEK (passphrase) và bằng RKEK (recovery key)
  dek_id               TEXT        NOT NULL DEFAULT 'k1',
  wrapped_dek          TEXT        NOT NULL,            -- bbq:2:A256GCM:<dek_id>:<iv>:<ct>
  wrapped_dek_recovery TEXT,                            -- NULL = chưa tạo recovery key

  -- sentinel kiểm passphrase không cần chạm dữ liệu thật
  verifier             TEXT        NOT NULL,            -- bbq:2:A256GCM:kek:<iv>:<ct>

  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_crypto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_crypto_owner" ON user_crypto;
CREATE POLICY "user_crypto_owner" ON user_crypto
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_crypto_updated_at ON user_crypto;
CREATE TRIGGER user_crypto_updated_at
  BEFORE UPDATE ON user_crypto
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();
```

### Thay đổi 2/3 — file MỚI `src/utils/accountCrypto.ts`

Toàn bộ hàm **nhận tham số tường minh** (không hằng ẩn) — test được với iterations thấp,
và S4 đổi KDF không phải sửa chữ ký.

```ts
import { ENVELOPE_V2_ALG, formatEnvelopeV2, parseEnvelopeV2 } from '@/utils/secureCrypto'

/** S2B: hạ tầng DEK/KEK account-level (ADR §4, §6, §13). Chưa data path nào dùng — S2C. */

export const ACCOUNT_KDF = 'pbkdf2-sha256'
export const ACCOUNT_PBKDF2_ITERATIONS = 600_000
export const ACCOUNT_VERIFIER_PLAINTEXT = 'bbq:unlock:v2'
/** 160-bit → 32 ký tự base32 → 8 nhóm 4 (ADR §6). */
export const RECOVERY_KEY_BYTES = 20

export interface KdfParams {
  iterations: number
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const HKDF_INFO_RECOVERY = 'bbq:recovery:v2'
const HKDF_INFO_CONTENT = 'bbq:content:v2'
const HKDF_INFO_INDEX = 'bbq:blind-index:v2'

export function generateDekBytes(): Uint8Array {
  const dek = new Uint8Array(32)
  crypto.getRandomValues(dek)
  return dek
}

export function generateKdfSalt(): Uint8Array {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return salt
}

export async function deriveKekFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: params.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Wrap DEK bytes bằng KEK/RKEK → envelope v2 (kid = dek_id, vd 'k1'). */
export async function wrapDek(
  dekBytes: Uint8Array,
  wrappingKey: CryptoKey,
  kid: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, dekBytes)
  return formatEnvelopeV2(ENVELOPE_V2_ALG, kid, bytesToB64(iv), bytesToB64(new Uint8Array(ct)))
}

/** Unwrap → DEK bytes. Sai key/hỏng dữ liệu → throw (GCM auth). */
export async function unwrapDek(wrappedDek: string, wrappingKey: CryptoKey): Promise<Uint8Array> {
  const env = parseEnvelopeV2(wrappedDek)
  if (!env) throw new Error('Malformed wrapped DEK')
  if (env.alg !== ENVELOPE_V2_ALG) throw new Error('Unsupported envelope algorithm')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(env.ivB64) },
    wrappingKey,
    b64ToBytes(env.ctB64),
  )
  return new Uint8Array(plain)
}

export async function makeVerifier(kek: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    new TextEncoder().encode(ACCOUNT_VERIFIER_PLAINTEXT),
  )
  return formatEnvelopeV2(ENVELOPE_V2_ALG, 'kek', bytesToB64(iv), bytesToB64(new Uint8Array(ct)))
}

/** true = đúng passphrase; false = sai (KHÔNG throw — caller phân biệt sai-pass với lỗi khác). */
export async function checkVerifier(verifier: string, kek: CryptoKey): Promise<boolean> {
  const env = parseEnvelopeV2(verifier)
  if (!env) return false
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(env.ivB64) },
      kek,
      b64ToBytes(env.ctB64),
    )
    return new TextDecoder().decode(plain) === ACCOUNT_VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

/** Sinh recovery key 160-bit; display dạng 8 nhóm 4 ký tự base32: XXXX-XXXX-…-XXXX. */
export function generateRecoveryKey(): { display: string; bytes: Uint8Array } {
  const bytes = new Uint8Array(RECOVERY_KEY_BYTES)
  crypto.getRandomValues(bytes)
  const raw = base32Encode(bytes)
  const display = raw.replace(/(.{4})(?=.)/g, '$1-')
  return { display, bytes }
}

/** Chịu lỗi nhập: thường/hoa, thiếu/thừa dấu -, khoảng trắng. Sai độ dài/ký tự → throw. */
export function parseRecoveryKey(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z2-7]{32}$/.test(cleaned)) {
    throw new Error('Invalid recovery key')
  }
  return base32Decode(cleaned)
}

export async function deriveRecoveryKek(recoveryBytes: Uint8Array): Promise<CryptoKey> {
  return hkdfAesKey(recoveryBytes, HKDF_INFO_RECOVERY)
}

export async function deriveContentKey(dekBytes: Uint8Array): Promise<CryptoKey> {
  return hkdfAesKey(dekBytes, HKDF_INFO_CONTENT)
}

export async function deriveIndexKey(dekBytes: Uint8Array): Promise<CryptoKey> {
  return hkdfAesKey(dekBytes, HKDF_INFO_INDEX)
}

async function hkdfAesKey(keyBytes: Uint8Array, info: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(s: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of s) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('Invalid recovery key')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
```

### Thay đổi 3/3 — file MỚI `src/services/userCrypto.service.ts`

Theo đúng pattern `bookmarkCryptoKeys.service.ts` (verbatim tham chiếu: `supabase.auth.getUser()`
→ `.from(...)`, `maybeSingle`, upsert `{ onConflict: 'user_id' }`, error → `throw new Error`):

```ts
import { supabase } from './supabase'

export interface UserCryptoRow {
  kdf: string
  kdf_params: { iterations: number }
  kdf_salt: string
  dek_id: string
  wrapped_dek: string
  wrapped_dek_recovery: string | null
  verifier: string
}

/** null = user chưa bật encrypted account. */
export async function fetchUserCryptoRow(): Promise<UserCryptoRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('user_crypto')
    .select('kdf, kdf_params, kdf_salt, dek_id, wrapped_dek, wrapped_dek_recovery, verifier')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return data as UserCryptoRow
}

export async function upsertUserCryptoRow(row: UserCryptoRow): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('user_crypto').upsert(
    { user_id: user.id, ...row },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(error.message)
}
```

### Edge case BẮT BUỘC giữ

1. **`unwrapDek` sai key phải THROW** (GCM auth) — caller S2C sẽ dịch thành "Wrong passphrase".
   **`checkVerifier` sai key phải trả `false`, KHÔNG throw** — hai semantics khác nhau có chủ đích.
2. **`parseRecoveryKey` chịu lỗi nhập** (hoa/thường, thiếu `-`, khoảng trắng) nhưng **từ chối**
   sai độ dài/ký tự ngoài bảng base32. User chép tay — phải dễ dãi đúng chỗ.
3. **DEK là 32 byte CSPRNG, không bao giờ rời RAM ở dạng thô.** Chỉ `wrapped_*` (envelope v2)
   được phép chạm service/DB.
4. **Tham số KDF luôn đi qua đối số** (`KdfParams`) — không hard-code trong hàm derive; hằng
   `ACCOUNT_PBKDF2_ITERATIONS` chỉ là default cho S2C dùng khi TẠO row mới.
5. **HKDF info strings đúng từng byte** (`bbq:recovery:v2`, `bbq:content:v2`,
   `bbq:blind-index:v2`) — đổi một ký tự là toàn bộ khóa dẫn xuất đổi, dữ liệu không đọc được.

### KHÔNG được đổi (chặn over-reach)

- **KHÔNG đụng bất kỳ store nào** (`src/stores/**` cấm import `accountCrypto` — harness W3
  assert điều này). KHÔNG UI, KHÔNG unlock flow, KHÔNG banner — đó là S2C.
- KHÔNG đụng `secureCrypto.ts` (S2A đã xong phần nó), `secureFolder.ts`, `bookmarkCrypto.ts`.
- KHÔNG gọi `fetchUserCryptoRow`/`upsertUserCryptoRow` từ đâu cả trong PR này — service là
  hạ tầng cho S2C.
- KHÔNG thêm dependency (base32 tự viết ~20 dòng, không kéo lib).

### ⚠ FLAG liên đới

- **Bước tay duy nhất:** Sir chạy `015_user_crypto.sql` trong Supabase SQL Editor (client chưa
  đụng bảng cho tới S2C nên áp lúc nào cũng an toàn — nên áp ngay sau merge để S2C không chờ).
- `bookmark_crypto` (PIN 120k) giữ nguyên — gộp về DEK chung là S3.
- `dek_id` mặc định `'k1'` — rotation (ADR §10) dùng `'k2'`… sau này; kid đã nằm trong envelope
  từ hôm nay nên rotate không cần migration format.

---

## PHẦN B — FAILING TEST

File: `specs/S2B-user-crypto-dek-kek.test.mjs`. Chạy: `node specs/S2B-user-crypto-dek-kek.test.mjs`

- Transpile `accountCrypto.ts` CODE THẬT với dependency `@/utils/secureCrypto` = **bản thật đã
  transpile** (S2A GREEN là điều kiện) — WebCrypto thật, không mock crypto. RED hiện tại vì file
  chưa tồn tại.
- **T1:** wrap→unwrap roundtrip DEK bytes y hệt (iterations thấp cho nhanh).
- **T2:** KEK từ passphrase sai → `unwrapDek` throw.
- **T3:** `wrapped_dek` parse được bằng `parseEnvelopeV2`, alg `A256GCM`, kid truyền qua đúng;
  chuỗi wrap KHÔNG chứa base64 của DEK thô.
- **T4:** verifier roundtrip true; KEK sai → **false, không throw**.
- **T5:** recovery display đúng `^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$`; parse(display) == bytes;
  parse chịu `xxxx xxxx` thường + thiếu dấu `-`; reject sai độ dài/ký tự.
- **T6:** hành trình recovery đầy đủ: RKEK wrap DEK → parse(display) → derive lại RKEK →
  unwrap → DEK y hệt.
- **T7:** domain separation — `K_content` ≠ `K_index` (cùng plaintext + cùng IV cố định →
  ciphertext khác nhau).
- **T8:** tamper 1 ký tự ct của wrapped_dek → unwrap throw (toàn vẹn GCM).
- **T9:** `KdfParams.iterations` có tác dụng — wrap bằng KEK(iter=1000), unwrap bằng
  KEK(iter=2000) → throw.
- **T10:** DEK 32B, salt 16B, hai lần sinh khác nhau (CSPRNG).
- **W1:** `supabase/migrations/015_user_crypto.sql` tồn tại, có đủ cột
  (`kdf`, `kdf_params`, `kdf_salt`, `dek_id`, `wrapped_dek`, `wrapped_dek_recovery`, `verifier`),
  RLS + policy `auth.uid() = user_id`, trigger `retronote_update_updated_at`, default
  `pbkdf2-sha256` + `600000`.
- **W2:** `src/services/userCrypto.service.ts` có `.from('user_crypto')`,
  `supabase.auth.getUser()`, `onConflict: 'user_id'`, và KHÔNG chứa `service_role`.
- **W3 (chặn over-reach):** không file nào trong `src/stores/` import `@/utils/accountCrypto`
  hoặc `userCrypto.service` — Phase 2a chưa được wire.

## PHẦN C — RED→GREEN CRITERIA

FAIL→PASS khi và chỉ khi: 3 file mới tồn tại đúng contract (module crypto pass T1–T10, SQL đủ
cột/RLS/trigger, service đúng pattern), và **không store nào bị wire** (W3).

**Nghiệm thu bổ sung:** toàn bộ `node specs/*.test.mjs` PASS (22 file sau spec này) và
`npx vue-tsc --noEmit -p tsconfig.app.json` sạch.

**Verify tay:** 1 bước — chạy `supabase/migrations/015_user_crypto.sql` trong Supabase SQL
Editor, xong kiểm tra `select * from user_crypto` trả 0 row + RLS bật (Table Editor hiện khiên).
