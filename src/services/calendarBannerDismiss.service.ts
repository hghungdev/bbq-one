import { CALENDAR_UPCOMING_BANNER_DISMISSED_SESSION_KEY } from '@/constants/storage'

/** Ngày sự kiện (YYYY-MM-DD) user đã đóng banner “1 ngày trước” trong phiên trình duyệt. */
export async function getDismissedUpcomingBannerDateKey(): Promise<string | null> {
  try {
    const chunk = await chrome.storage.session.get(CALENDAR_UPCOMING_BANNER_DISMISSED_SESSION_KEY)
    const v = chunk[CALENDAR_UPCOMING_BANNER_DISMISSED_SESSION_KEY]
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  } catch {
    return null
  }
}

export async function dismissUpcomingBannerForDate(dateKey: string): Promise<void> {
  try {
    await chrome.storage.session.set({
      [CALENDAR_UPCOMING_BANNER_DISMISSED_SESSION_KEY]: dateKey,
    })
  } catch {
    /* extension session storage only */
  }
}

/** Gọi khi đăng nhập lại — banner “1 ngày trước” hiện lại. */
export async function clearUpcomingBannerDismiss(): Promise<void> {
  try {
    await chrome.storage.session.remove(CALENDAR_UPCOMING_BANNER_DISMISSED_SESSION_KEY)
  } catch {
    /* ignore */
  }
}
