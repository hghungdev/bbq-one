import { CALENDAR_MAX_EVENTS_PER_DAY } from '@/constants/calendar'
import { localStore } from './localStore.service'
import { LOCAL_STORAGE_KEYS } from '@/types/localFirst'
import type { LocalCalendarEvent } from '@/types/localFirst'
import type { CalendarEventCreateInput, CalendarEventUpdateInput } from '@/types/calendar'

// ─── Calendar events (local-first, chrome.storage.local) ──────────────────────

export const localCalendarEventsService = {
  async getAll(): Promise<LocalCalendarEvent[]> {
    return localStore.getArray<LocalCalendarEvent>(LOCAL_STORAGE_KEYS.calendarEvents)
  },

  async listByDateRange(startISO: string, endISO: string): Promise<LocalCalendarEvent[]> {
    const all = await this.getAll()
    return all.filter((e) => e.event_date >= startISO && e.event_date <= endISO)
  },

  async create(input: CalendarEventCreateInput): Promise<LocalCalendarEvent> {
    const all = await this.getAll()
    const sameDay = all.filter((e) => e.event_date === input.event_date).length
    if (sameDay >= CALENDAR_MAX_EVENTS_PER_DAY) {
      throw new Error('MAX_EVENTS_PER_DAY')
    }
    const now = new Date().toISOString()
    const event: LocalCalendarEvent = {
      id: crypto.randomUUID(),
      event_date: input.event_date,
      title: input.title,
      description: input.description ?? '',
      is_done: false,
      position: input.position ?? 0,
      color: input.color ?? null,
      start_time: null,
      end_time: null,
      created_at: now,
      updated_at: now,
      synced_at: null,
      __synced: false,
    }
    await localStore.pushItem(LOCAL_STORAGE_KEYS.calendarEvents, event)
    return event
  },

  async update(id: string, updates: CalendarEventUpdateInput): Promise<LocalCalendarEvent> {
    const arr = await this.getAll()
    const idx = arr.findIndex((e) => e.id === id)
    if (idx < 0) throw new Error('Calendar event not found in local store')
    arr[idx] = {
      ...arr[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      __synced: false,
    }
    await localStore.setArray(LOCAL_STORAGE_KEYS.calendarEvents, arr)
    return arr[idx]
  },

  async delete(id: string): Promise<void> {
    const arr = await this.getAll()
    await localStore.setArray(
      LOCAL_STORAGE_KEYS.calendarEvents,
      arr.filter((e) => e.id !== id),
    )
  },

  async pendingSyncCount(): Promise<number> {
    const arr = await this.getAll()
    return arr.filter((e) => !e.__synced).length
  },
}
