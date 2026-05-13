import { BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY } from '@/constants/storage'

/**
 * Cho biết có mở nhanh màn Translate khi click icon extension hay không.
 * Không có key trong storage ⇒ false (mặc định: vào Dashboard).
 */
export async function loadIconQuickTranslateActive(): Promise<boolean> {
  const raw = await chrome.storage.local.get(BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY)
  return raw[BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY] === true
}

export async function saveIconQuickTranslateActive(active: boolean): Promise<void> {
  await chrome.storage.local.set({ [BBQ_ICON_QUICK_TRANSLATE_ACTIVE_KEY]: active })
}
