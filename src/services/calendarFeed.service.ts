import { supabase } from './supabase'
import { buildFeedUrl, feedTokenFromBytes } from '@/utils/calendarFeed'

/**
 * G1: link Google Calendar của user hiện tại (bảng calendar_feeds, RLS chủ sở hữu). Chỉ dùng khi đã đăng
 * nhập + có mạng — link do Edge Function `calendar-feed` phục vụ, không có bản local-first.
 */

export interface CalendarFeedInfo {
  token: string
  enabled: boolean
  /** URL dán vào Google Calendar → Thêm lịch → Từ URL. */
  url: string
}

const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim()

function localTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

function toInfo(row: { token: string; enabled: boolean }): CalendarFeedInfo {
  return { token: row.token, enabled: row.enabled, url: buildFeedUrl(SUPABASE_URL, row.token, localTimeZone()) }
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw error ?? new Error('Not authenticated')
  return data.user.id
}

function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return feedTokenFromBytes(bytes)
}

export const calendarFeedService = {
  async get(): Promise<CalendarFeedInfo | null> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('calendar_feeds')
      .select('token, enabled')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data ? toInfo(data) : null
  },

  /** Tạo link — hoặc tạo LẠI (token mới): link cũ trong Google ngừng hoạt động ngay. */
  async createOrRotate(): Promise<CalendarFeedInfo> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('calendar_feeds')
      .upsert({ user_id: userId, token: newToken(), enabled: true }, { onConflict: 'user_id' })
      .select('token, enabled')
      .single()
    if (error) throw error
    return toInfo(data)
  },

  async setEnabled(enabled: boolean): Promise<CalendarFeedInfo> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('calendar_feeds')
      .update({ enabled })
      .eq('user_id', userId)
      .select('token, enabled')
      .single()
    if (error) throw error
    return toInfo(data)
  },
}
