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
