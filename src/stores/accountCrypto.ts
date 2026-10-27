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
  fetchUserCryptoStatus,
  upsertUserCryptoRow,
  type UserCryptoRow,
} from '@/services/userCrypto.service'
import { parseEnvelopeV2, saltFromBase64, saltToBase64 } from '@/utils/secureCrypto'
import { openSealedField, sealMemoId } from '@/utils/secureCache'
import {
  clearAccountSession,
  clearSessionDek,
  readAccountStatus,
  readSessionDek,
  touchSessionDek,
  writeAccountStatus,
  writeSessionDek,
} from '@/utils/accountSession'
import { useNotesStore } from '@/stores/notes'

export interface EnableOptions {
  kdfParams?: KdfParams
  /** Ceremony sinh recovery key TRƯỚC khi commit (hiện 1 lần, gõ lại 2 nhóm) rồi truyền vào. */
  recoveryBytes?: Uint8Array
}

/**
 * S2C1: khóa account-level. DEK/K_content không bao giờ xuống đĩa.
 * S2C1.3 (D5 đổi): DEK giữ trong chrome.storage.session (RAM trình duyệt) tới khi tự khóa sau
 * 30' không thao tác / đóng trình duyệt / logout / "Khóa ngay" — xem utils/accountSession.ts.
 * Store KHÔNG tự gọi notes.loadAll() sau unlock — component gọi (tránh vòng lặp store↔store).
 */
export const useAccountCryptoStore = defineStore('accountCrypto', () => {
  const row = shallowRef<UserCryptoRow | null>(null)
  /** User sở hữu `row` — session DEK chỉ được dùng khi khớp. */
  const userId = shallowRef<string | null>(null)
  const fetched = ref(false)
  /** S2C1.3: trạng thái lấy từ bản session (offline) — có mạng lại thì phải hỏi server. */
  const stale = ref(false)
  const dekBytes = shallowRef<Uint8Array | null>(null)
  const contentKey = shallowRef<CryptoKey | null>(null)
  /** UI: NoteItem/Settings mở modal unlock qua cờ này. */
  const unlockModalOpen = ref(false)
  /** Tăng mỗi lần clearStatus() — refreshStatus đang bay của session cũ không được ghi đè. */
  let statusEpoch = 0
  let lastActivityAt = 0

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
    const epoch = statusEpoch
    let next: { userId: string; row: UserCryptoRow | null } | null
    try {
      next = await fetchUserCryptoStatus()
    } catch (e) {
      // S2C1.3: offline / lỗi mạng → bản đã kiểm tra trong phiên trình duyệt này (RAM, không phải
      // đĩa). Logout xóa nó (clearStatus), và login cần mạng nên không lẫn sang account khác.
      const cached = await readAccountStatus()
      if (epoch !== statusEpoch) return
      if (!cached) throw e
      applyStatus(cached.userId, cached.row)
      stale.value = true
      return
    }
    if (epoch !== statusEpoch) return
    applyStatus(next?.userId ?? null, next?.row ?? null)
    stale.value = false
    if (next) await writeAccountStatus(next.userId, next.row)
  }

  function applyStatus(uid: string | null, r: UserCryptoRow | null): void {
    // Key đang cầm thuộc account / DEK khác → bỏ, không mã hóa dữ liệu account này bằng DEK kia.
    if (contentKey.value && (uid !== userId.value || r?.dek_id !== row.value?.dek_id)) lock()
    userId.value = uid
    row.value = r
    fetched.value = true
  }

  /** Ghi status + DEK vào chrome.storage.session — chỉ khi biết user (refreshStatus đã chạy). */
  async function persistSession(r: UserCryptoRow, dek: Uint8Array): Promise<void> {
    const uid = userId.value
    if (!uid) return
    await writeAccountStatus(uid, r)
    await writeSessionDek(uid, r.dek_id, dek)
    lastActivityAt = Date.now()
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
    await persistSession(next, dek)
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
    await persistSession(r, dek)
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
    await persistSession(next, dek)
  }

  /**
   * S2C1.3: mở lại popup trong phiên (DEK còn hạn trong chrome.storage.session) → mở khóa
   * không hỏi passphrase. Chỉ khi DEK thuộc đúng user + đúng dek_id của row hiện tại.
   */
  async function restoreFromSession(): Promise<boolean> {
    if (contentKey.value) return true
    const r = row.value
    const uid = userId.value
    if (!r || !uid) return false
    const s = await readSessionDek()
    if (!s || s.userId !== uid || s.dekId !== r.dek_id) return false
    if (row.value !== r || userId.value !== uid) return false
    dekBytes.value = s.dek
    contentKey.value = await deriveContentKey(s.dek)
    markActivity()
    return true
  }

  /** Có thao tác (mở popup, ghi) → gia hạn tự khóa. Tối đa 1 lần ghi session mỗi phút. */
  function markActivity(): void {
    if (!contentKey.value) return
    const now = Date.now()
    if (now - lastActivityAt < 60_000) return
    lastActivityAt = now
    void touchSessionDek()
  }

  /** Chỉ bỏ key trong RAM (logout / đổi account). Khóa theo yêu cầu user dùng lockNow(). */
  function lock(): void {
    dekBytes.value = null
    contentKey.value = null
  }

  /**
   * "Khóa ngay" / hết hạn tự khóa. Thứ tự bắt buộc: seal đĩa bằng key còn sống → bỏ key → nạp
   * lại RAM từ đĩa (chỉ còn envelope). Bỏ key trước thì persistCache kế tiếp ghi plaintext.
   * `clearSession: false` khi DEK session đã bị xóa từ nơi khác (context khác khóa / alarm).
   */
  async function lockNow(opts: { clearSession?: boolean } = {}): Promise<void> {
    if (!contentKey.value) return
    const notes = useNotesStore()
    await notes.persistCache()
    lock()
    if (opts.clearSession !== false) await clearSessionDek()
    await notes.hydrateFromCache()
  }

  /**
   * Logout / đổi account: quên row user_crypto của session cũ. Nếu giữ, local mode bị
   * requireAccountKey chặn mọi thao tác ("Account locked") và account kế tiếp bị áp nhầm
   * verifier của account trước. Gọi SAU lock().
   */
  function clearStatus(): void {
    statusEpoch++
    row.value = null
    userId.value = null
    fetched.value = false
    stale.value = false
    unlockModalOpen.value = false
    // S2C1.3: bản session (status + DEK) dùng chung mọi context — xóa luôn.
    void clearAccountSession()
  }

  /**
   * Overlay v2: decrypt in-place mọi row envelope v2 khi account unlocked.
   * KHÔNG ghi cache (persistCache gọi hàm này — gọi ngược = đệ quy).
   * Row v1 (secure folder) là việc của decryptLoadedSecureRows — hai tập row rời nhau tới S3.
   * S2C1.2: qua openSealedField — envelope đã biết (vừa seal / đã mở) không giải mã lại.
   */
  async function decryptLoadedAccountRows(): Promise<void> {
    const key = contentKey.value
    if (!key) return
    const notes = useNotesStore()
    for (let i = 0; i < notes.notes.length; i++) {
      const n = notes.notes[i]
      if (!parseEnvelopeV2(n.title)) continue
      notes.notes[i] = { ...n, title: await openSealedField(key, sealMemoId.noteTitle(n.id), n.title) }
    }
    for (let j = 0; j < notes.bodies.length; j++) {
      const b = notes.bodies[j]
      const labelV2 = parseEnvelopeV2(b.label) !== null
      const contentV2 = parseEnvelopeV2(b.content) !== null
      if (!labelV2 && !contentV2) continue
      notes.bodies[j] = {
        ...b,
        label: labelV2 ? await openSealedField(key, sealMemoId.bodyLabel(b.id), b.label) : b.label,
        content: contentV2
          ? await openSealedField(key, sealMemoId.bodyContent(b.id), b.content)
          : b.content,
      }
    }
  }

  return {
    fetched,
    stale,
    unlockModalOpen,
    isEnabled,
    isUnlocked,
    getContentKey,
    getDekId,
    refreshStatus,
    enableAccountEncryption,
    unlock,
    unlockWithRecoveryAndRewrap,
    restoreFromSession,
    markActivity,
    lock,
    lockNow,
    clearStatus,
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
