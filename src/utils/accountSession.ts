import { deriveContentKey } from '@/utils/accountCrypto'
import { saltFromBase64, saltToBase64 } from '@/utils/secureCrypto'

/**
 * S2C1.3: trạng thái encrypted-account dùng chung giữa popup / tab / SW, đặt trong
 * `chrome.storage.session` — CHỈ nằm trong RAM của trình duyệt, KHÔNG xuống đĩa, mất khi đóng
 * trình duyệt hoặc reload/update extension. Cùng chỗ với refresh token Supabase
 * (`utils/storage.ts`) và khóa bookmark PIN. KHÔNG bao giờ dùng `chrome.storage.local` ở đây.
 *
 * - status: row `user_crypto` (không bí mật — bản giống hệt nằm trên server) → mở khóa được khi
 *   offline, và SW biết account đã bật mã hóa.
 * - dek: DEK đã mở → mở lại popup không phải gõ passphrase, SW mã hóa được khi push.
 *   Tự khóa sau ACCOUNT_IDLE_LOCK_MS không thao tác.
 */
export const ACCOUNT_STATUS_SESSION_KEY = 'bbqone_account_crypto_status'
export const ACCOUNT_DEK_SESSION_KEY = 'bbqone_account_dek'
/**
 * Hạn đã gia hạn — key RIÊNG để touch không bao giờ ghi lại entry DEK. Touch chạy đua với
 * "Khóa ngay"/logout (kể cả ở context khác) mà ghi lại cả entry thì DEK vừa xóa sẽ sống lại.
 */
export const ACCOUNT_DEK_EXTENDED_SESSION_KEY = 'bbqone_account_dek_extended_until'
export const ACCOUNT_AUTOLOCK_ALARM = 'bbqone-account-autolock'
export const ACCOUNT_IDLE_LOCK_MS = 30 * 60_000

/** Cùng hình dạng row `user_crypto` (khai riêng để util không phụ thuộc tầng service). */
export interface SessionCryptoRow {
  kdf: string
  kdf_params: { iterations: number }
  kdf_salt: string
  dek_id: string
  wrapped_dek: string
  wrapped_dek_recovery: string | null
  verifier: string
}

export interface AccountStatusEntry {
  userId: string
  /** null = user này chưa bật mã hóa. */
  row: SessionCryptoRow | null
}

interface DekEntry {
  userId: string
  dekId: string
  dekB64: string
  expiresAt: number
}

/** Ngữ cảnh push: null = account tắt; key=null = bật nhưng khóa HOẶC chưa biết (fail-closed). */
export interface AccountPushContext {
  key: CryptoKey | null
  kid: string
}

function sessionArea(): chrome.storage.StorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.session ? chrome.storage.session : null
}

async function getEntry(key: string): Promise<unknown> {
  const area = sessionArea()
  if (!area) return undefined
  try {
    const r = await area.get(key)
    return r[key]
  } catch {
    return undefined
  }
}

async function setEntry(key: string, value: unknown): Promise<void> {
  const area = sessionArea()
  if (!area) return
  try {
    await area.set({ [key]: value })
  } catch {
    /* session storage không khả dụng → chỉ mất tiện ích, không mất dữ liệu */
  }
}

async function removeEntries(keys: string[]): Promise<void> {
  const area = sessionArea()
  if (!area) return
  try {
    await area.remove(keys)
  } catch {
    /* best-effort */
  }
}

function scheduleAutoLock(when: number): void {
  try {
    void chrome.alarms?.create(ACCOUNT_AUTOLOCK_ALARM, { when })
  } catch {
    /* alarms không có trong context này — hết hạn vẫn được kiểm tra mỗi lần đọc */
  }
}

/** Hạn hiệu lực = max(hạn lúc mở khóa, hạn đã gia hạn). */
async function effectiveExpiry(e: DekEntry): Promise<number> {
  const extended = await getEntry(ACCOUNT_DEK_EXTENDED_SESSION_KEY)
  return typeof extended === 'number' ? Math.max(e.expiresAt, extended) : e.expiresAt
}

function isRow(v: unknown): v is SessionCryptoRow {
  const r = v as SessionCryptoRow
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.kdf_salt === 'string' &&
    typeof r.dek_id === 'string' &&
    typeof r.wrapped_dek === 'string' &&
    typeof r.verifier === 'string' &&
    typeof r.kdf_params?.iterations === 'number'
  )
}

function asDekEntry(v: unknown): DekEntry | null {
  const e = v as DekEntry
  if (
    typeof e !== 'object' ||
    e === null ||
    typeof e.userId !== 'string' ||
    typeof e.dekId !== 'string' ||
    typeof e.dekB64 !== 'string' ||
    typeof e.expiresAt !== 'number'
  ) {
    return null
  }
  return e
}

export async function writeAccountStatus(userId: string, row: SessionCryptoRow | null): Promise<void> {
  await setEntry(ACCOUNT_STATUS_SESSION_KEY, { userId, row })
}

/** null = chưa biết (chưa từng kiểm tra thành công trong phiên trình duyệt này). */
export async function readAccountStatus(): Promise<AccountStatusEntry | null> {
  const v = (await getEntry(ACCOUNT_STATUS_SESSION_KEY)) as AccountStatusEntry | undefined
  if (typeof v !== 'object' || v === null || typeof v.userId !== 'string') return null
  if (v.row !== null && !isRow(v.row)) return null
  return { userId: v.userId, row: v.row }
}

export async function writeSessionDek(userId: string, dekId: string, dek: Uint8Array): Promise<void> {
  const expiresAt = Date.now() + ACCOUNT_IDLE_LOCK_MS
  await removeEntries([ACCOUNT_DEK_EXTENDED_SESSION_KEY])
  await setEntry(ACCOUNT_DEK_SESSION_KEY, { userId, dekId, dekB64: saltToBase64(dek), expiresAt })
  scheduleAutoLock(expiresAt)
}

/** DEK còn hạn; hết hạn → xóa luôn và trả null. */
export async function readSessionDek(): Promise<{ userId: string; dekId: string; dek: Uint8Array } | null> {
  const e = asDekEntry(await getEntry(ACCOUNT_DEK_SESSION_KEY))
  if (!e) return null
  if ((await effectiveExpiry(e)) <= Date.now()) {
    await removeEntries([ACCOUNT_DEK_SESSION_KEY, ACCOUNT_DEK_EXTENDED_SESSION_KEY])
    return null
  }
  try {
    return { userId: e.userId, dekId: e.dekId, dek: saltFromBase64(e.dekB64) }
  } catch {
    return null
  }
}

/**
 * Có thao tác → gia hạn thêm ACCOUNT_IDLE_LOCK_MS. Chỉ ghi key hạn RIÊNG — chạy đua với
 * clearSessionDek thì cùng lắm để lại một mốc hạn mồ côi, không bao giờ hồi sinh DEK.
 */
export async function touchSessionDek(): Promise<void> {
  const e = asDekEntry(await getEntry(ACCOUNT_DEK_SESSION_KEY))
  if (!e || (await effectiveExpiry(e)) <= Date.now()) return
  const extendedUntil = Date.now() + ACCOUNT_IDLE_LOCK_MS
  await setEntry(ACCOUNT_DEK_EXTENDED_SESSION_KEY, extendedUntil)
  scheduleAutoLock(extendedUntil)
}

export async function clearSessionDek(): Promise<void> {
  await removeEntries([ACCOUNT_DEK_SESSION_KEY, ACCOUNT_DEK_EXTENDED_SESSION_KEY])
}

/** Logout / đổi account: quên cả trạng thái lẫn DEK. */
export async function clearAccountSession(): Promise<void> {
  await removeEntries([
    ACCOUNT_STATUS_SESSION_KEY,
    ACCOUNT_DEK_SESSION_KEY,
    ACCOUNT_DEK_EXTENDED_SESSION_KEY,
  ])
}

/** Alarm tự khóa: xóa DEK đã hết hạn (mọi context đang mở nghe onChanged → tự khóa). */
export async function purgeExpiredSessionDek(): Promise<void> {
  const e = asDekEntry(await getEntry(ACCOUNT_DEK_SESSION_KEY))
  if (!e) return
  const until = await effectiveExpiry(e)
  if (until <= Date.now()) {
    await removeEntries([ACCOUNT_DEK_SESSION_KEY, ACCOUNT_DEK_EXTENDED_SESSION_KEY])
    return
  }
  scheduleAutoLock(until)
}

/**
 * Đường push (SW, local-first) — chỉ gọi khi đã có userId của session hiện tại.
 * Chưa biết trạng thái / trạng thái của user khác → fail-closed (key=null: không đẩy plaintext).
 */
export async function resolveAccountForPush(userId: string): Promise<AccountPushContext | null> {
  const status = await readAccountStatus()
  if (!status || status.userId !== userId) return { key: null, kid: 'k1' }
  if (!status.row) return null
  const kid = status.row.dek_id
  const s = await readSessionDek()
  if (!s || s.userId !== userId || s.dekId !== kid) return { key: null, kid }
  return { key: await deriveContentKey(s.dek), kid }
}
