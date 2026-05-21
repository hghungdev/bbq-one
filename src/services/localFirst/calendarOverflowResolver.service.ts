import { CALENDAR_MAX_EVENTS_PER_DAY } from '@/constants/calendar'
import { supabase } from '@/services/supabase'
import type { CalendarEvent } from '@/types/calendar'
import { LOCAL_STORAGE_KEYS, type LocalCalendarEvent } from '@/types/localFirst'
import { normalizeLocalDateKey } from '@/utils/calendarDate'
import { getCurrentUserId } from './authMode'
import { localStore } from './localStore.service'

export type CalendarOverflowSource = 'local' | 'cloud'

export interface CalendarOverflowEventItem {
  id: string
  title: string
  description: string
  event_date: string
  position: number
  is_done: boolean
  source: CalendarOverflowSource
}

export interface CalendarOverflowDay {
  dateKey: string
  events: CalendarOverflowEventItem[]
  maxAllowed: number
}

export interface CalendarOverflowReport {
  days: CalendarOverflowDay[]
}

export interface CalendarDayKeepSelection {
  dateKey: string
  keepIds: string[]
}

/**
 * Ngày có tổng (cloud + local chưa sync) > CALENDAR_MAX — cần user chọn trước khi push.
 */
export async function detectCalendarDayOverflow(): Promise<CalendarOverflowReport> {
  const userId = await getCurrentUserId()
  const localAll = await localStore.getArray<LocalCalendarEvent>(LOCAL_STORAGE_KEYS.calendarEvents)
  const localPending = localAll.filter((e) => !e.__synced)

  const { data: cloudRows, error } = await supabase
    .from('calendar_events')
    .select('id, event_date, title, description, position, is_done')
    .eq('user_id', userId)
  if (error) throw error

  const cloudAll = (cloudRows ?? []) as Pick<
    CalendarEvent,
    'id' | 'event_date' | 'title' | 'description' | 'position' | 'is_done'
  >[]

  const dateKeys = new Set<string>()
  for (const e of localPending) dateKeys.add(normalizeLocalDateKey(e.event_date))
  for (const e of cloudAll) dateKeys.add(normalizeLocalDateKey(e.event_date))

  const days: CalendarOverflowDay[] = []

  for (const dateKey of [...dateKeys].sort()) {
    const localForDay = localPending.filter(
      (e) => normalizeLocalDateKey(e.event_date) === dateKey,
    )
    const cloudForDay = cloudAll.filter((e) => normalizeLocalDateKey(e.event_date) === dateKey)
    const combined: CalendarOverflowEventItem[] = [
      ...cloudForDay.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description ?? '',
        event_date: dateKey,
        position: e.position,
        is_done: e.is_done,
        source: 'cloud' as const,
      })),
      ...localForDay.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description ?? '',
        event_date: dateKey,
        position: e.position,
        is_done: e.is_done,
        source: 'local' as const,
      })),
    ]

    if (combined.length <= CALENDAR_MAX_EVENTS_PER_DAY) continue

    combined.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))

    days.push({
      dateKey,
      maxAllowed: CALENDAR_MAX_EVENTS_PER_DAY,
      events: combined,
    })
  }

  return { days }
}

/** Áp dụng lựa chọn một lần: xóa cloud/local không giữ, renumber position. */
export async function applyCalendarOverflowSelections(
  selections: CalendarDayKeepSelection[],
): Promise<void> {
  const userId = await getCurrentUserId()
  let localArr = await localStore.getArray<LocalCalendarEvent>(LOCAL_STORAGE_KEYS.calendarEvents)

  for (const { dateKey, keepIds } of selections) {
    if (keepIds.length > CALENDAR_MAX_EVENTS_PER_DAY) {
      throw new Error('MAX_KEEP_EXCEEDED')
    }
    const keepSet = new Set(keepIds)
    const key = normalizeLocalDateKey(dateKey)

    const { data: cloudRows, error: fetchErr } = await supabase
      .from('calendar_events')
      .select('id, position')
      .eq('user_id', userId)
      .eq('event_date', key)
    if (fetchErr) throw fetchErr

    for (const row of cloudRows ?? []) {
      if (!keepSet.has(row.id)) {
        const { error } = await supabase.from('calendar_events').delete().eq('id', row.id)
        if (error) throw error
      }
    }

    const keptLocal: LocalCalendarEvent[] = []
    const nextLocal: LocalCalendarEvent[] = []
    for (const ev of localArr) {
      if (normalizeLocalDateKey(ev.event_date) !== key) {
        nextLocal.push(ev)
        continue
      }
      if (keepSet.has(ev.id)) keptLocal.push(ev)
    }
    localArr = nextLocal

    const keptCloud = (cloudRows ?? [])
      .filter((r) => keepSet.has(r.id))
      .sort((a, b) => a.position - b.position)

    const ordered = [
      ...keptCloud.map((r) => ({ id: r.id, position: r.position, kind: 'cloud' as const })),
      ...keptLocal
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((r) => ({ id: r.id, position: r.position, kind: 'local' as const })),
    ].sort((a, b) => a.position - b.position)

    let pos = 0
    for (const item of ordered) {
      if (item.kind === 'cloud') {
        const { error } = await supabase
          .from('calendar_events')
          .update({ position: pos })
          .eq('id', item.id)
        if (error) throw error
      } else {
        const idx = keptLocal.findIndex((e) => e.id === item.id)
        if (idx >= 0) keptLocal[idx] = { ...keptLocal[idx], position: pos }
      }
      pos++
    }

    localArr.push(...keptLocal)
  }

  await localStore.setArray(LOCAL_STORAGE_KEYS.calendarEvents, localArr)
}
