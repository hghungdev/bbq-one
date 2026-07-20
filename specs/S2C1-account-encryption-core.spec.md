# SPEC S2C1 — Encrypted Account (core): ceremony, unlock, ghi v2, adapters

> **Đối chiếu source (2026-07-20, branch `main`, sau S2B = commit `d345c11`, tree sạch).**
> **Failing test:** `specs/S2C1-account-encryption-core.test.mjs` — `node specs/S2C1-account-encryption-core.test.mjs`.
> RED hiện tại, GREEN sau khi áp đúng spec.
>
> **Nền:** S2A (envelope v2 + đọc-hai-chiều) ✅ · S2B (`accountCrypto.ts` utils + `userCrypto.service.ts` + bảng `user_crypto` đã áp) ✅.
> **UX đã duyệt:** artifact "S2C — Encrypted Account UX" — D1–D7 chốt **theo khuyến nghị**:
> D1 unlock bỏ-qua-được · D2 passphrase ≥ 10 · D3 gõ lại 2 nhóm recovery ngẫu nhiên ·
> D4 không cho tải .txt · D5 khóa chết theo cửa sổ · D6 backfill = S2C2 · D7 tách C1/C2.
>
> **S2C1 = engine + UI tối thiểu đủ dùng.** KHÔNG gồm: backfill, banner giới thiệu/recovery-thiếu,
> đổi passphrase, regenerate recovery (tất cả là **S2C2**); migrate secure folder v1 (**S3**).

---

## PHẦN A — SPEC

### Bức tranh (1 đoạn)

User bật "Encrypted account" qua ceremony 3 bước → **một** `upsert user_crypto` duy nhất ở nút
cuối (thoát giữa chừng = chưa có gì xảy ra). Từ đó: mọi ghi chú **ngoài secure folder** được
encrypt v2 (`bbq:2:A256GCM:k1:…`) bằng `K_content` trước khi rời RAM (lên server, xuống đĩa);
mở app phải unlock một lần (bỏ qua được — note hiện khóa); quên passphrase → recovery key →
**bắt buộc** đặt passphrase mới (re-wrap DEK, 1 UPDATE). Secure folder v1 giữ nguyên tuyệt đối.

### Trạng thái hỗn hợp pre-backfill — nói thẳng, không giấu

Backfill là S2C2, nên sau S2C1 tồn tại row "legacy": **plaintext trên server** (chưa bao giờ
push lại). Semantics chốt:

- Row legacy plaintext: đọc/hiện bình thường (server đã có plaintext — giấu ở client là an ninh
  giả); sửa lần đầu khi unlocked → thành v2 vĩnh viễn.
- **Unlocked**: seal ghi đĩa mã hóa TẤT CẢ những gì có thể (v2) — đĩa sạch hoàn toàn.
- **Locked/chưa unlock**: row legacy plaintext từ server vẫn ghi đĩa plaintext (đúng bằng hôm
  nay, KHÔNG tệ hơn) — thu hẹp dần khi S2C2 backfill chạy. Row đã-v2 thì hiện placeholder khóa,
  **không bao giờ** hiện chuỗi `bbq:2:…` trần.
- Sửa row khi account bật mà đang locked → throw `Account locked` (UI mở unlock modal).

### Thay đổi 1/9 — file MỚI `src/stores/accountCrypto.ts` (engine, code đầy đủ)

```ts
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  ACCOUNT_KDF,
  ACCOUNT_PBKDF2_ITERATIONS,
  type KdfParams,
  checkVerifier,
  deriveContentKey,
  deriveKekFromPassphrase,
  deriveRecoveryKek,
  generateDekBytes,
  generateKdfSalt,
  generateRecoveryKey,
  makeVerifier,
  parseRecoveryKey,
  unwrapDek,
  wrapDek,
} from '@/utils/accountCrypto'
import {
  fetchUserCryptoRow,
  upsertUserCryptoRow,
  type UserCryptoRow,
} from '@/services/userCrypto.service'
import { decryptField, parseEnvelopeV2, saltFromBase64, saltToBase64 } from '@/utils/secureCrypto'
import { useNotesStore } from '@/stores/notes'

export interface EnableOptions {
  kdfParams?: KdfParams
  /** Ceremony sinh recovery key TRƯỚC khi commit (hiện 1 lần, gõ lại 2 nhóm) rồi truyền vào. */
  recoveryBytes?: Uint8Array
}

/**
 * S2C1: khóa account-level. DEK/K_content CHỈ trong RAM — chết theo cửa sổ (D5).
 * Store KHÔNG tự gọi notes.loadAll() sau unlock — component gọi (tránh vòng lặp store↔store).
 */
export const useAccountCryptoStore = defineStore('accountCrypto', () => {
  const row = shallowRef<UserCryptoRow | null>(null)
  const fetched = ref(false)
  const dekBytes = shallowRef<Uint8Array | null>(null)
  const contentKey = shallowRef<CryptoKey | null>(null)
  /** UI: NoteItem/Settings mở modal unlock qua cờ này. */
  const unlockModalOpen = ref(false)

  function isEnabled(): boolean {
    return row.value !== null
  }
  function isUnlocked(): boolean {
    return contentKey.value !== null
  }
  function getContentKey(): CryptoKey | null {
    return contentKey.value
  }
  function getDekId(): string {
    return row.value?.dek_id ?? 'k1'
  }

  async function refreshStatus(): Promise<void> {
    row.value = await fetchUserCryptoRow()
    fetched.value = true
  }

  /** Bước cuối ceremony — MỘT upsert duy nhất. Thoát trước đó = chưa bật gì. */
  async function enableAccountEncryption(
    passphrase: string,
    opts: EnableOptions = {},
  ): Promise<{ recoveryDisplay: string }> {
    if (row.value) throw new Error('Already enabled')
    if (passphrase.length < 10) {
      throw new Error('Passphrase must be at least 10 characters')
    }
    const kdfParams = opts.kdfParams ?? { iterations: ACCOUNT_PBKDF2_ITERATIONS }
    const recovery = opts.recoveryBytes
      ? rebuildRecovery(opts.recoveryBytes)
      : generateRecoveryKey()
    const salt = generateKdfSalt()
    const dek = generateDekBytes()
    const kek = await deriveKekFromPassphrase(passphrase, salt, kdfParams)
    const rkek = await deriveRecoveryKek(recovery.bytes)
    const next: UserCryptoRow = {
      kdf: ACCOUNT_KDF,
      kdf_params: kdfParams,
      kdf_salt: saltToBase64(salt),
      dek_id: 'k1',
      wrapped_dek: await wrapDek(dek, kek, 'k1'),
      wrapped_dek_recovery: await wrapDek(dek, rkek, 'k1'),
      verifier: await makeVerifier(kek),
    }
    await upsertUserCryptoRow(next)
    row.value = next
    dekBytes.value = dek
    contentKey.value = await deriveContentKey(dek)
    return { recoveryDisplay: recovery.display }
  }

  async function unlock(passphrase: string): Promise<void> {
    const r = row.value
    if (!r) throw new Error('Not enabled')
    const kek = await deriveKekFromPassphrase(
      passphrase,
      saltFromBase64(r.kdf_salt),
      r.kdf_params,
    )
    if (!(await checkVerifier(r.verifier, kek))) {
      throw new Error('Wrong passphrase')
    }
    const dek = await unwrapDek(r.wrapped_dek, kek)
    dekBytes.value = dek
    contentKey.value = await deriveContentKey(dek)
  }

  /** Recovery = BẮT BUỘC đặt passphrase mới ngay (D-approved). wrapped_dek_recovery GIỮ NGUYÊN. */
  async function unlockWithRecoveryAndRewrap(
    recoveryInput: string,
    newPassphrase: string,
    opts: { kdfParams?: KdfParams } = {},
  ): Promise<void> {
    const r = row.value
    if (!r) throw new Error('Not enabled')
    if (!r.wrapped_dek_recovery) throw new Error('No recovery key configured')
    if (newPassphrase.length < 10) {
      throw new Error('Passphrase must be at least 10 characters')
    }
    const rkek = await deriveRecoveryKek(parseRecoveryKey(recoveryInput))
    const dek = await unwrapDek(r.wrapped_dek_recovery, rkek)
    const kdfParams = opts.kdfParams ?? { iterations: ACCOUNT_PBKDF2_ITERATIONS }
    const salt = generateKdfSalt()
    const kek = await deriveKekFromPassphrase(newPassphrase, salt, kdfParams)
    const next: UserCryptoRow = {
      ...r,
      kdf_params: kdfParams,
      kdf_salt: saltToBase64(salt),
      wrapped_dek: await wrapDek(dek, kek, r.dek_id),
      verifier: await makeVerifier(kek),
    }
    await upsertUserCryptoRow(next)
    row.value = next
    dekBytes.value = dek
    contentKey.value = await deriveContentKey(dek)
  }

  /** D5: bình thường khóa chết theo cửa sổ; lock() chỉ dùng cho logout (lockAll flow). */
  function lock(): void {
    dekBytes.value = null
    contentKey.value = null
  }

  /**
   * Overlay v2: decrypt in-place mọi row envelope v2 khi account unlocked.
   * KHÔNG ghi cache (persistCache gọi hàm này — gọi ngược = đệ quy).
   * Row v1 (secure folder) là việc của decryptLoadedSecureRows — hai tập row rời nhau tới S3.
   */
  async function decryptLoadedAccountRows(): Promise<void> {
    const key = contentKey.value
    if (!key) return
    const notes = useNotesStore()
    for (let i = 0; i < notes.notes.length; i++) {
      const n = notes.notes[i]
      if (!parseEnvelopeV2(n.title)) continue
      notes.notes[i] = { ...n, title: await decryptField(n.title, key) }
    }
    for (let j = 0; j < notes.bodies.length; j++) {
      const b = notes.bodies[j]
      const labelV2 = parseEnvelopeV2(b.label) !== null
      const contentV2 = parseEnvelopeV2(b.content) !== null
      if (!labelV2 && !contentV2) continue
      notes.bodies[j] = {
        ...b,
        label: labelV2 ? await decryptField(b.label, key) : b.label,
        content: contentV2 ? await decryptField(b.content, key) : b.content,
      }
    }
  }

  return {
    fetched,
    unlockModalOpen,
    isEnabled,
    isUnlocked,
    getContentKey,
    getDekId,
    refreshStatus,
    enableAccountEncryption,
    unlock,
    unlockWithRecoveryAndRewrap,
    lock,
    decryptLoadedAccountRows,
  }
})

/** Dựng lại display từ bytes ceremony đã sinh trước (base32 8 nhóm 4). */
function rebuildRecovery(bytes: Uint8Array): { display: string; bytes: Uint8Array } {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return { display: out.replace(/(.{4})(?=.)/g, '$1-'), bytes }
}
```

> Vòng import `notes.ts ↔ accountCrypto.ts` là cùng pattern `notes.ts ↔ secureFolder.ts` đang
> chạy — hợp lệ vì `useNotesStore()` chỉ gọi bên trong function.

### Thay đổi 2/9 — `src/utils/secureCache.ts`: tham số `account` (ADDITIVE)

**⚠ RÀNG BUỘC CỨNG: harness S1 gọi seal KHÔNG có `account` — hành vi cũ phải giữ nguyên từng
byte. KHÔNG sửa mock/assertion của `S1-secure-cache-leak.test.mjs`.**

Import đổi thành:

```ts
import { encryptField, encryptFieldV2, isEncryptedEnvelope } from '@/utils/secureCrypto'
```

Input thêm field (interface inline của `sealSecureRowsForCache`):

```ts
  /** S2C1: account-mode UNLOCKED → seal mọi row plaintext NGOÀI secure folder bằng v2.
   *  null/undefined = mode off HOẶC locked → row ngoài secure folder đi qua như cũ
   *  (trạng thái legacy pre-backfill — xem spec). */
  account?: { key: CryptoKey; kid: string } | null
```

Thân hàm — vòng notes, nhánh NON-secure-folder (hiện tại là `outNotes.push(n); continue` khi
`!folderId || !isSecureFolder(folderId)`) đổi thành:

```ts
    if (!folderId || !isSecureFolder(folderId)) {
      if (account && !isEncryptedEnvelope(n.title)) {
        outNotes.push({ ...n, title: await encryptFieldV2(n.title, account.key, account.kid) })
      } else {
        outNotes.push(n)
      }
      continue
    }
```

Vòng bodies, nhánh non-secure tương tự:

```ts
    if (!folderId || !isSecureFolder(folderId)) {
      if (account) {
        const lPlain = !isEncryptedEnvelope(b.label)
        const cPlain = !isEncryptedEnvelope(b.content)
        if (lPlain || cPlain) {
          outBodies.push({
            ...b,
            label: lPlain ? await encryptFieldV2(b.label, account.key, account.kid) : b.label,
            content: cPlain ? await encryptFieldV2(b.content, account.key, account.kid) : b.content,
          })
          continue
        }
      }
      outBodies.push(b)
      continue
    }
```

Nhánh secure-folder (v1, drop-khi-không-key) **giữ nguyên 100%** — folder key có ƯU TIÊN,
account không bao giờ đụng row secure folder (tới S3).

### Thay đổi 3/9 — `src/services/sync.service.ts`: guard + encrypt v2 (ADDITIVE)

Import thêm `encryptFieldV2`. Chữ ký `syncDirtyNotesFromList` thêm tham số cuối:

```ts
    getKey: (folderId: string) => CryptoKey | null,
    /** S2C1: null/undefined = account off; key=null = bật-nhưng-locked (skip plaintext). */
    account?: { key: CryptoKey | null; kid: string } | null,
```

Sau block guard `if (folder?.is_secure) {...}` hiện tại (`:114-123`), thêm:

```ts
      else if (account) {
        const titlePlain = !isEncryptedEnvelope(n.title)
        const anyBodyPlain = bodies.some(
          (b) => !isEncryptedEnvelope(b.label) || !isEncryptedEnvelope(b.content),
        )
        if ((titlePlain || anyBodyPlain) && !account.key) {
          continue
        }
      }
```

Encrypt title trước push — sau `if (folder?.is_secure && key) {...}` (`:128-130`) thêm:

```ts
          else if (account?.key && !isEncryptedEnvelope(title)) {
            title = await encryptFieldV2(title, account.key, account.kid)
          }
```

Encrypt body — sau block `if (folder?.is_secure && key) {...}` của label/content (`:160-165`) thêm:

```ts
          else if (account?.key) {
            if (!isEncryptedEnvelope(label)) label = await encryptFieldV2(label, account.key, account.kid)
            if (!isEncryptedEnvelope(content)) {
              content = await encryptFieldV2(content, account.key, account.kid)
            }
          }
```

**`syncFromCache` (SW) KHÔNG truyền `account`** — SW đọc đĩa đã seal (S1+2/9) nên không bao giờ
cầm plaintext account-row; xem FLAG.

### Thay đổi 4/9 — `src/stores/sync.ts`: caller UI truyền account

Import `useAccountCryptoStore`. Trong `runManualSync`, call site `:73-78` thành:

```ts
      const account = useAccountCryptoStore()
      await syncService.syncDirtyNotesFromList(
        notes.notes,
        notes.bodies,
        folders.folders,
        (id) => secure.getKey(id),
        account.isEnabled()
          ? { key: account.getContentKey(), kid: account.getDekId() }
          : null,
      )
```

### Thay đổi 5/9 — `src/stores/notes.ts`: write path v2 + search + overlay

Import thêm: `isEncryptedEnvelope, encryptFieldV2` (mở rộng dòng 13) và
`import { useAccountCryptoStore } from '@/stores/accountCrypto'`.

**5a. Helper module-scope** (đặt cạnh `NETWORK_LOAD_MS`):

```ts
/** S2C1: row NGOÀI secure folder + account bật → phải có K_content mới được mutate. */
function requireAccountKey(): { key: CryptoKey; kid: string } | null {
  const account = useAccountCryptoStore()
  if (!account.isEnabled()) return null
  const key = account.getContentKey()
  if (!key) throw new Error('Account locked')
  return { key, kid: account.getDekId() }
}
```

**5b. `createNote`** — sau block `if (folder?.is_secure && key) {...}` (`:185-189`) thêm:

```ts
    const acct = folder?.is_secure ? null : requireAccountKey()
    if (acct) {
      title = await encryptFieldV2(title, acct.key, acct.kid)
      bodyLabel = await encryptFieldV2('', acct.key, acct.kid)
      bodyContent = await encryptFieldV2('', acct.key, acct.kid)
    }
```

và ở block hiển thị (`:224-234`), thêm nhánh else:

```ts
    else if (acct) {
      storedNote = { ...note, title: initialTitle.trim() }
      storedBody = { ...bodyRow, label: '', content: '' }
    }
```

**5c. `updateNote`** — sau block encrypt payload secure (`:263-269`) thêm:

```ts
    let acctUpd: { key: CryptoKey; kid: string } | null = null
    if (!folder?.is_secure) {
      acctUpd = requireAccountKey()
      if (acctUpd && payload.title !== undefined) {
        payload.title = await encryptFieldV2(payload.title, acctUpd.key, acctUpd.kid)
      }
    }
```

và ở block hiển thị sau update thành công (`:278-290`), nhánh else cuối (`notes.value[idx] = merged`)
thành:

```ts
      } else if (acctUpd) {
        notes.value[idx] = { ...merged, title: updates.title ?? prev.title }
      } else {
        notes.value[idx] = merged
      }
```

(nhánh catch offline giữ nguyên — plaintext vào RAM, S1-seal + 2/9 lo phần đĩa.)

**5d. `updateBody`** — đối xứng 5c cho `label`/`content` (encrypt payload nếu `acctUpd`, hiển thị
`{ ...merged, label: updates.label ?? prev.label, content: updates.content ?? prev.content }`).

**5e. `createBodyForNote`** — đối xứng 5b: sau branch secure (`:418-421`) thêm
`const acct = folder?.is_secure ? null : requireAccountKey()`; nếu `acct` → `label`/`content` =
`await encryptFieldV2('', acct.key, acct.kid)`; block hiển thị thêm `else if (acct) { stored = { ...row, label: '', content: '' } }`.

**5f. `runSearch`** — filter `(n) => !folderStore.isSecureFolder(n.folder_id)` (`:81`) thành:

```ts
        .filter((n) => !isEncryptedEnvelope(n.title))
```

và XÓA dòng `const folderStore = useFoldersStore()` (`:74`) nếu không còn ai dùng trong hàm.
(Hệ quả chủ đích, ADR §7.2: row đang KHÓA bị loại; row đã unlock — kể cả secure folder — được
search client-side.)

**5g. Overlay account** — thêm `await useAccountCryptoStore().decryptLoadedAccountRows()` ngay
SAU cả 3 call site `decryptLoadedSecureRows()` hiện có (persistCache; loadAll sau hydrate;
loadAll cuối catch). Trong `persistCache`, seal truyền thêm account:

```ts
    const account = useAccountCryptoStore()
    await account.decryptLoadedAccountRows()
    ...
    const sealed = await sealSecureRowsForCache({
      notes: notes.value,
      bodies: bodies.value,
      isSecureFolder: folders.isSecureFolder,
      getKey: secure.getKey,
      account: account.isUnlocked()
        ? { key: account.getContentKey()!, kid: account.getDekId() }
        : null,
    })
```

### Thay đổi 6/9 — UI (pattern `SecureFolderModal.vue`: Teleport + bbqone-overlay + RetroInput/RetroButton + `t()`)

**6a. MỚI `src/components/account/AccountUnlockModal.vue`** — props `open`, emits `close`/`done`.
Hai mode nội bộ: `passphrase` (mặc định) và `recovery` (link "Quên passphrase?"). Script logic:

```ts
async function submit(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'recovery') {
      if (newPassphrase.value !== confirmNew.value) {
        throw new Error(t('account.errNewMismatch'))
      }
      await account.unlockWithRecoveryAndRewrap(recoveryInput.value, newPassphrase.value)
    } else {
      await account.unlock(password.value)
    }
    emit('done')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('common.operationFailed')
  } finally {
    busy.value = false
  }
}
```

Template contract: input passphrase (type password, autofocus như SecureFolderModal), nút
`t('account.unlock')`, nút ghost `t('account.later')` = emit close, link đổi mode
`t('account.forgot')`; mode recovery: input recovery key + passphrase mới ×2 + hint
`t('account.recoveryRewrapHint')`. Escape = close.

**6b. MỚI `src/components/account/AccountEncryptionSetupModal.vue`** — wizard 3 bước đúng
mockup. Bước 1: BA checkbox riêng (`ack1/ack2/ack3`) — nút Tiếp tục disabled tới khi đủ 3.
Bước 2: passphrase ≥ 10 + confirm (mismatch → error). Bước 3:

```ts
import { generateRecoveryKey } from '@/utils/accountCrypto'
// vào bước 3:
recovery.value = generateRecoveryKey()
confirmIdx.value = pickTwoDistinct() // 0..7, hiện label "nhóm {i+1}"
// nút cuối:
const groups = recovery.value.display.split('-')
if (
  g1.value.trim().toUpperCase() !== groups[confirmIdx.value[0]] ||
  g2.value.trim().toUpperCase() !== groups[confirmIdx.value[1]]
) {
  throw new Error(t('account.errGroupMismatch'))
}
const res = await account.enableAccountEncryption(passphrase.value, {
  recoveryBytes: recovery.value.bytes,
})
emit('done')
```

Nút "Sao chép" = `navigator.clipboard.writeText(recovery.value.display)`. **KHÔNG có nút tải
file (D4).** Đóng wizard trước nút cuối = zero side effect (chưa upsert).

> ⚠ `RetroInput` khai `id` là prop **bắt buộc** — mọi instance (kể cả 2 ô nhập nhóm recovery)
> phải truyền `id`, nếu không `vue-tsc` fail TS2345.

**6c. `src/components/layout/SettingsModal.vue`** — thêm `SettingsAccordionSection` mới
`:title="t('account.settingsTitle')"` (đặt sau section `settings.accountPassword`, chỉ hiện khi
đã đăng nhập): trạng thái OFF → mô tả + RetroButton mở `AccountEncryptionSetupModal`; ON →
dòng trạng thái (`t('account.statusUnlocked')` / `t('account.statusLocked')`) + khi locked nút
mở unlock modal (`account.unlockModalOpen = true`).

**6d. `src/pages/App.vue`** — mount `<AccountUnlockModal :open="account.unlockModalOpen" …>`;
trong flow mounted (chỗ gọi `folders.loadAll()...` `:106`): trước đó
`await account.refreshStatus()`; nếu `account.isEnabled() && !account.isUnlocked()` →
`account.unlockModalOpen = true` (D1: không chặn — modal bỏ qua được). Handler `@done`:

```ts
async function onAccountUnlocked(): Promise<void> {
  await Promise.all([folders.loadAll(), notes.loadAll(), calendarEvents.loadAll()])
}
```

`onLogout` (`:253-258`): thêm `account.lock()` cạnh `secure.lockAll()`.

**6e. `src/components/notes/NoteItem.vue`** — mask + chặn mở row khóa:

```ts
const rowLocked = computed(() => isEncryptedEnvelope(props.note.title))
// onMainClick, TRƯỚC selectNote:
if (rowLocked.value) {
  useAccountCryptoStore().unlockModalOpen = true
  return
}
```

Hiển thị title: khi `rowLocked` → `t('account.lockedNote')` (không render chuỗi envelope).

### Thay đổi 7/9 — i18n `src/i18n/vi.ts` + `en.ts` (flat key, theo mockup đã duyệt)

```
account.settingsTitle      vi: 'ENCRYPTED ACCOUNT'                    en: 'ENCRYPTED ACCOUNT'
account.titleUnlock        vi: 'MỞ KHÓA GHI CHÚ'                      en: 'UNLOCK NOTES'
account.unlock             vi: 'Mở khóa'                              en: 'Unlock'
account.later              vi: 'Để sau'                               en: 'Later'
account.forgot             vi: 'Quên passphrase? Dùng Recovery key'   en: 'Forgot passphrase? Use recovery key'
account.lockedNote         vi: 'Ghi chú được mã hóa · mở khóa để xem' en: 'Encrypted note · unlock to view'
account.statusUnlocked     vi: 'Đang mở khóa — khóa lại khi đóng cửa sổ' en: 'Unlocked — locks when this window closes'
account.statusLocked       vi: 'Đang khóa'                            en: 'Locked'
account.recoveryRewrapHint vi: 'Mở bằng Recovery key sẽ yêu cầu đặt passphrase mới ngay.' en: 'Unlocking with the recovery key requires setting a new passphrase.'
account.errNewMismatch     vi: 'Passphrase mới không khớp'            en: 'New passphrases do not match'
account.errGroupMismatch   vi: 'Nhóm ký tự chưa khớp Recovery key'    en: 'Groups do not match your recovery key'
(+ các key wizard: account.setupTitle, account.ack1/2/3, account.passphraseLabel,
 account.passphraseHint, account.recoveryTitle, account.recoveryHint, account.copy,
 account.savedCheck, account.confirmGroups, account.enableCta — copy lấy đúng mockup đã duyệt)
```

### Thay đổi 8/9 — `SECURITY.md`: section S2C1

```markdown
## Encrypted account (S2C1)

- Bật (opt-in) qua ceremony: passphrase (≥10, PBKDF2-SHA256 600k) + recovery key 160-bit hiện
  MỘT lần; commit = một upsert `user_crypto` duy nhất (atomic).
- `K_content` (HKDF từ DEK) chỉ trong RAM, chết theo cửa sổ. Ghi chú ngoài secure folder được
  encrypt v2 trước khi lên server và trước khi xuống `chrome.storage.local` (qua seal S1).
- Quên passphrase: recovery key mở DEK và BẮT BUỘC đặt passphrase mới (re-wrap, 1 UPDATE);
  recovery key cũ vẫn hiệu lực cho tới khi regenerate (S2C2).
- Trạng thái chuyển tiếp (tới khi backfill S2C2 xong): ghi chú cũ chưa từng sửa lại vẫn là
  plaintext trên server — không tệ hơn hiện trạng, thu hẹp dần. Row đã mã hóa không bao giờ
  hiển thị dạng `bbq:2:…` trần (mask ở NoteItem).
```

### Thay đổi 9/10 — `specs/S2B-user-crypto-dek-kek.test.mjs`: W3 chuyển ràng buộc (ĐÃ LÀM SẴN)

**Đây là trường hợp DUY NHẤT trong series được phép đụng harness của phase trước — và đã được
làm sẵn trong commit spec này, Cursor KHÔNG cần và KHÔNG được sửa thêm.**

W3 bản gốc assert *"Phase 2a: chưa store nào được wire"*. S2C1 lấy chính wiring làm deliverable
→ ràng buộc đó hết hiệu lực **có chủ đích**. Đã thay bằng ranh giới tầng, đúng ở cả trước lẫn
sau S2C1:

- `src/utils/accountCrypto.ts` KHÔNG được import `@/stores/` hay `@/services/` (giữ util thuần,
  test được không cần mock);
- `userCrypto.service` chỉ được import bởi **`src/stores/accountCrypto.ts`** — service có đúng
  MỘT owner, không rải rác call site khắp nơi.

→ Nếu Cursor thấy S2B FAIL, nghĩa là đã phá một trong hai ranh giới trên; **sửa source, không
sửa test.**

### Thay đổi 10/10 — KHÔNG được đổi (chặn over-reach)

- KHÔNG đụng `secureFolder.ts`, flow secure folder v1, `bookmarkCrypto`, calendar.
- KHÔNG đụng `syncFromCache` (SW) — không truyền account vào đó.
- KHÔNG sửa `S1`/`S2A`/`S2B` harness, mock, assertion. KHÔNG đổi contract cũ của
  `sealSecureRowsForCache` (account là field TÙY CHỌN).
- KHÔNG làm backfill / banner / đổi passphrase / regenerate recovery (S2C2); KHÔNG migrate
  secure folder (S3); KHÔNG local mode.
- KHÔNG thêm dependency.

### ⚠ FLAG liên đới

- **SW an toàn không cần biết account:** đĩa đã seal (S1 + 2/9) nên `syncFromCache` chỉ cầm
  envelope; nhánh guard mới trong `syncDirtyNotesFromList` vẫn nhận `account` khi được truyền
  (UI context) — SW không truyền, không sao.
- **Row legacy plaintext + locked** ghi đĩa plaintext (bằng hôm nay) — biến mất sau S2C2
  backfill. Đã ghi vào SECURITY.md, KHÔNG "sửa" bằng cách drop (drop = mất cache offline).
- **S2C2 (đã hẹn):** khi thêm nút "Khóa ngay" — lock() phải `loadAll()` re-hydrate TRƯỚC khi
  xóa key, nếu không cửa sổ persistCache kế tiếp seal thiếu key. Ghi chú này để sẵn cho spec sau.
- **Harness cũ:** import mới trong `notes.ts`/`sync.ts` (`@/stores/accountCrypto`) có thể làm
  harness nào transpile 2 file đó báo `Unmocked import` → thêm mock theo pattern
  (`useAccountCryptoStore: () => ({ isEnabled: () => false, isUnlocked: () => false, getContentKey: () => null, getDekId: () => 'k1', decryptLoadedAccountRows: async () => {} })`),
  **KHÔNG sửa assertion**. (Dry-run cho thấy hiện KHÔNG harness nào cần — chỉ là contingency.)

---

## PHẦN B — FAILING TEST

`specs/S2C1-account-encryption-core.test.mjs` — WebCrypto thật, transpile code THẬT.

- **T-A (store):** ceremony 1-upsert + shape row; unlock sai/đúng; recovery re-wrap (wrapped_dek
  đổi, recovery GIỮ, passphrase cũ chết, recovery vẫn sống); guard ≥10 + already-enabled;
  lock(); overlay v2 decrypt đúng tập row (v2 có, v1/plaintext không).
- **T-B (seal adapter):** account=null → hành vi S1 nguyên vẹn (kể cả drop folder-locked);
  account={key,kid} → row thường + null-folder thành v2 decrypt được, KHÔNG mutate input,
  KHÔNG encrypt chồng; row secure folder vẫn v1 (ưu tiên folder key).
- **T-C (push guard):** account key → payload lên server là v2; account locked (key=null) →
  row plaintext bị SKIP (không có update call); account off → hành vi cũ; folder secure → v1
  như cũ.
- **W1–W10 (wiring):** seal có `account`+`encryptFieldV2`; notes.ts ≥4 `encryptFieldV2(` +
  import store; runSearch dùng `!isEncryptedEnvelope(n.title)` và hết `isSecureFolder(n.folder_id)`;
  notes.ts ≥3 `decryptLoadedAccountRows(`; sync.service có param `account` + stores/sync.ts truyền;
  2 component account tồn tại đúng contract; SettingsModal wire setup; pages/App.vue mount modal
  + refreshStatus + account.lock() trong onLogout; NoteItem mask; i18n có `account.titleUnlock`
  cả vi lẫn en; SECURITY.md có section S2C1.

## PHẦN C — RED→GREEN CRITERIA

GREEN khi: store đúng contract (T-A), seal/push adapter đúng (T-B/T-C), toàn bộ wiring W1–W10,
**23 file harness** (`for f in specs/*.test.mjs; do node "$f"; done`) PASS và
`npx vue-tsc --noEmit -p tsconfig.app.json` sạch.

### Verify tay (Node không mô phỏng được)

1. Settings → bật Encrypted account: đủ 3 checkbox mới đi tiếp; passphrase 9 ký tự bị chặn;
   bước 3 copy được key, nhập sai nhóm bị chặn, đúng nhóm → bật.
2. DevTools: `chrome.storage.local.get(null)` — note thường sau một lần sửa phải là
   `bbq:2:A256GCM:k1:…`, KHÔNG còn plaintext (dùng chuỗi mồi `S2C1PROBE-XYZZY`).
3. Supabase Table Editor: row note vừa sửa — cột title/label/content là `bbq:2:…`.
4. Đóng popup mở lại → modal unlock; "Để sau" → note hiện "Ghi chú được mã hóa · mở khóa để
   xem", click row → modal; unlock đúng → nội dung về; sai → báo lỗi ngay.
5. Recovery: unlock bằng recovery key (nhập thường, thiếu dấu gạch) → bị bắt đặt passphrase
   mới → xong mở được; passphrase CŨ không còn dùng được; recovery key CŨ vẫn dùng được.
6. Secure folder v1: unlock/lock/sửa note trong folder secure — hành vi y hệt trước S2C1;
   search không trả về row đang khóa, có trả về row secure folder ĐANG unlock.
