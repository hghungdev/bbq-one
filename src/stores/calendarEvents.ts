import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CALENDAR_EVENTS_CACHE_KEY, CALENDAR_MAX_EVENTS_PER_DAY } from '@/constants/calendar'
import { calendarEventsService } from '@/services/calendarEvents.service'
import { normalizeLocalDateKey } from '@/utils/calendarDate'
import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
} from '@/types/calendar'

export const useCalendarEventsStore = defineStore('calendarEvents', () => {
  const events = ref<CalendarEvent[]>([])
  const loadError = ref<string | null>(null)
  /** Date currently displayed in the modal ('YYYY-MM-DD' | null). */
  const activeDate = ref<string | null>(null)
  /** Event currently being edited (null when creating). */
  const activeEventId = ref<string | null>(null)
  /** Lọc theo title — đồng bộ SearchBar khi tab CALENDAR. */
  const searchQuery = ref('')
  /** Ô được focus khi chọn kết quả search — không bật modal. */
  const gridFocusDateKey = ref<string | null>(null)

  function withNormalizedDates(list: CalendarEvent[]): CalendarEvent[] {
    return list.map((e) => ({ ...e, event_date: normalizeLocalDateKey(e.event_date) }))
  }

  const eventsByDate = computed(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events.value) {
      const list = map.get(e.event_date) ?? []
      list.push(e)
      map.set(e.event_date, list)
    }
    // Sort each bucket by position
    for (const [k, list] of map) {
      list.sort((a, b) => a.position - b.position)
      map.set(k, list)
    }
    return map
  })

  function eventsForDate(dateKey: string): CalendarEvent[] {
    return eventsByDate.value.get(dateKey) ?? []
  }

  /** Ô lịch: khi có search chỉ hiện sự kiện khớp title. */
  function eventsMatchingSearchForDate(dateKey: string): CalendarEvent[] {
    const list = eventsForDate(dateKey)
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return list
    return list.filter((e) => e.title.toLowerCase().includes(q))
  }

  /** Toàn bộ sự kiện khớp title (có search text) — sắp xếp theo ngày để disambiguate trùng title. */
  const calendarSearchMatches = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return [] as CalendarEvent[]
    return events.value
      .filter((e) => e.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.position - b.position)
  })

  function setSearchQuery(q: string): void {
    searchQuery.value = q
  }

  function clearCalendarSearch(): void {
    searchQuery.value = ''
    gridFocusDateKey.value = null
  }

  async function persistCache(): Promise<void> {
    await chrome.storage.local.set({ [CALENDAR_EVENTS_CACHE_KEY]: events.value })
  }

  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      const cached = await chrome.storage.local.get(CALENDAR_EVENTS_CACHE_KEY)
      const raw = cached[CALENDAR_EVENTS_CACHE_KEY] as CalendarEvent[] | undefined
      if (Array.isArray(raw) && raw.length > 0) {
        events.value = withNormalizedDates(raw)
      }
      const fresh = await calendarEventsService.getAll()
      events.value = withNormalizedDates(fresh)
      await persistCache()
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Load calendar failed'
      // Fall back to cache
      const cached = await chrome.storage.local.get(CALENDAR_EVENTS_CACHE_KEY)
      const raw = cached[CALENDAR_EVENTS_CACHE_KEY] as CalendarEvent[] | undefined
      if (Array.isArray(raw)) events.value = withNormalizedDates(raw)
    }
  }

  async function createEvent(input: CalendarEventCreateInput): Promise<CalendarEvent> {
    const dayKey = normalizeLocalDateKey(input.event_date)
    const siblings = eventsForDate(dayKey)
    if (siblings.length >= CALENDAR_MAX_EVENTS_PER_DAY) {
      throw new Error('MAX_EVENTS_PER_DAY')
    }
    const nextPos = siblings.length
    const created = await calendarEventsService.create({
      ...input,
      event_date: dayKey,
      position: nextPos,
    })
    const row = { ...created, event_date: normalizeLocalDateKey(created.event_date) }
    events.value = [...events.value, row]
    await persistCache()
    return row
  }

  async function updateEvent(id: string, updates: CalendarEventUpdateInput): Promise<void> {
    const idx = events.value.findIndex((e) => e.id === id)
    if (idx < 0) return
    const updated = await calendarEventsService.update(id, updates)
    const next = events.value.slice()
    next[idx] = { ...updated, event_date: normalizeLocalDateKey(updated.event_date) }
    events.value = next
    await persistCache()
  }

  async function deleteEvent(id: string): Promise<void> {
    await calendarEventsService.delete(id)
    events.value = events.value.filter((e) => e.id !== id)
    await persistCache()
  }

  async function toggleDone(id: string): Promise<void> {
    const e = events.value.find((x) => x.id === id)
    if (!e) return
    await updateEvent(id, { is_done: !e.is_done })
  }

  function openModalForDate(dateKey: string): void {
    gridFocusDateKey.value = null
    activeDate.value = normalizeLocalDateKey(dateKey)
    activeEventId.value = null
  }

  function openModalForEdit(id: string): void {
    const e = events.value.find((x) => x.id === id)
    if (!e) return
    gridFocusDateKey.value = null
    activeDate.value = normalizeLocalDateKey(e.event_date)
    activeEventId.value = id
  }

  function closeModal(): void {
    activeDate.value = null
    activeEventId.value = null
  }

  /** Chỉ định hướng lưới + highlight ô; dùng cho click kết quả search (không popup). */
  function focusCalendarCellFromSearch(dateKey: string): void {
    gridFocusDateKey.value = normalizeLocalDateKey(dateKey)
  }

  return {
    events,
    loadError,
    activeDate,
    activeEventId,
    gridFocusDateKey,
    eventsByDate,
    eventsForDate,
    eventsMatchingSearchForDate,
    searchQuery,
    setSearchQuery,
    clearCalendarSearch,
    calendarSearchMatches,
    loadAll,
    createEvent,
    updateEvent,
    deleteEvent,
    toggleDone,
    openModalForDate,
    openModalForEdit,
    closeModal,
    focusCalendarCellFromSearch,
  }
})
