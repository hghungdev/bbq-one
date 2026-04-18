import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { bookmarksService } from '@/services/bookmarks.service'
import {
  fetchBookmarkCryptoRow,
  upsertBookmarkCryptoSetup,
  type BookmarkCryptoRow,
} from '@/services/bookmarkCryptoKeys.service'
import {
  deriveBookmarkKeyFromPin,
  encryptVerifier,
  generateSaltB64,
  verifyPinAgainstStored,
} from '@/utils/bookmarkCrypto'
import {
  clearBookmarkCryptoKeyFromSession,
  getBookmarkCryptoKeyFromSession,
  persistBookmarkCryptoKeyToSession,
} from '@/utils/bookmarkSessionKey'
import { bookmarkPinWeakReason } from '@/utils/bookmarkPinValidation'

const MAX_ATTEMPTS = 3
const LOCKOUT_MS = 60_000

export const useBookmarkPinStore = defineStore('bookmarkPin', () => {
  const cryptoRowLoaded = ref(false)
  const hasCryptoSetup = ref(false)
  /** Row từ server — dùng khi unlock. */
  const cryptoRowData = ref<BookmarkCryptoRow | null>(null)
  const cryptoKey = ref<CryptoKey | null>(null)
  const failedAttempts = ref(0)
  const lockoutUntil = ref(0)

  const unlocked = computed(() => cryptoKey.value !== null)

  const isLockedOut = computed(() => Date.now() < lockoutUntil.value)

  const lockoutSecondsLeft = computed((): number => {
    if (!isLockedOut.value) return 0
    return Math.ceil((lockoutUntil.value - Date.now()) / 1000)
  })

  async function loadCryptoState(): Promise<void> {
    const row = await fetchBookmarkCryptoRow()
    cryptoRowData.value = row
    hasCryptoSetup.value = !!row
    cryptoRowLoaded.value = true
  }

  /** Khôi phục khóa từ phiên (đã nhập PIN trước đó trong cùng session trình duyệt). */
  async function hydrateFromSession(): Promise<void> {
    const key = await getBookmarkCryptoKeyFromSession()
    if (key) cryptoKey.value = key
  }

  /** Đặt PIN lần đầu (salt + verifier lên Supabase). */
  async function setupPin(pin: string): Promise<void> {
    const weak = bookmarkPinWeakReason(pin)
    if (weak) throw new Error(weak)
    const salt = generateSaltB64()
    const key = await deriveBookmarkKeyFromPin(pin, salt)
    const { ivB64, ctB64 } = await encryptVerifier(key)
    await upsertBookmarkCryptoSetup(salt, ivB64, ctB64)
    await persistBookmarkCryptoKeyToSession(key)
    cryptoKey.value = key
    cryptoRowData.value = {
      salt,
      verifier_iv: ivB64,
      verifier_ct: ctB64,
    }
    hasCryptoSetup.value = true
  }

  /** Mở khóa bằng PIN — sai 3 lần khóa 60s. */
  async function tryUnlock(pin: string): Promise<boolean> {
    const row = cryptoRowData.value
    if (!row) return false
    if (isLockedOut.value) return false

    const key = await deriveBookmarkKeyFromPin(pin, row.salt)
    const ok = await verifyPinAgainstStored(key, row.verifier_iv, row.verifier_ct)
    if (!ok) {
      failedAttempts.value++
      if (failedAttempts.value >= MAX_ATTEMPTS) {
        lockoutUntil.value = Date.now() + LOCKOUT_MS
        failedAttempts.value = 0
      }
      return false
    }

    failedAttempts.value = 0
    lockoutUntil.value = 0
    await persistBookmarkCryptoKeyToSession(key)
    cryptoKey.value = key
    return true
  }

  async function lock(): Promise<void> {
    cryptoKey.value = null
    failedAttempts.value = 0
    lockoutUntil.value = 0
    await clearBookmarkCryptoKeyFromSession()
  }

  /** Đổi PIN (Settings): xác thực PIN cũ, salt mới, re-encrypt backup encrypted, cập nhật verifier. */
  async function changePin(oldPin: string, newPin: string): Promise<void> {
    const row = cryptoRowData.value ?? (await fetchBookmarkCryptoRow())
    if (!row) {
      throw new Error('Chưa đặt PIN bookmark. Mở tab Bookmark để đặt.')
    }
    if (!/^\d{6}$/.test(newPin) && !/^\d{9}$/.test(newPin)) {
      throw new Error('PIN mới phải đúng 6 hoặc 9 chữ số.')
    }
    const weakNew = bookmarkPinWeakReason(newPin)
    if (weakNew) throw new Error(weakNew)
    const oldKey = await deriveBookmarkKeyFromPin(oldPin, row.salt)
    const ok = await verifyPinAgainstStored(oldKey, row.verifier_iv, row.verifier_ct)
    if (!ok) {
      throw new Error('PIN hiện tại không đúng.')
    }
    /* Sau khi xác thực PIN cũ đúng: mới so sánh — tránh báo “trùng” khi user nhập sai PIN cũ nhưng hai ô trùng nhau. */
    if (oldPin === newPin) {
      throw new Error('PIN mới không được trùng PIN hiện tại.')
    }
    const newSalt = generateSaltB64()
    const newKey = await deriveBookmarkKeyFromPin(newPin, newSalt)
    await bookmarksService.reencryptAllEncryptedBackups(oldKey, newKey)
    const { ivB64, ctB64 } = await encryptVerifier(newKey)
    await upsertBookmarkCryptoSetup(newSalt, ivB64, ctB64)
    await persistBookmarkCryptoKeyToSession(newKey)
    cryptoKey.value = newKey
    cryptoRowData.value = {
      salt: newSalt,
      verifier_iv: ivB64,
      verifier_ct: ctB64,
    }
    hasCryptoSetup.value = true
  }

  return {
    cryptoRowLoaded,
    hasCryptoSetup,
    cryptoRowData,
    cryptoKey,
    unlocked,
    failedAttempts,
    lockoutUntil,
    isLockedOut,
    lockoutSecondsLeft,
    loadCryptoState,
    hydrateFromSession,
    setupPin,
    tryUnlock,
    lock,
    changePin,
  }
})
