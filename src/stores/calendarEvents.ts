import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CALENDAR_EVENTS_CACHE_KEY, CALENDAR_MAX_EVENTS_PER_DAY } from '@/constants/calendar'
import { calendarEventsService } from '@/services/calendarEvents.service'
import { localCalendarEventsService } from '@/services/localFirst/localCalendarEvents.service'
import { normalizeLocalDateKey } from '@/utils/calendarDate'
import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
} from '@/types/calendar'
import { withTimeout } from '@/utils/withTimeout'
import { isOnline } from '@/services/networkReachability.service'
import { isNetworkError } from '@/utils/networkErrors'
import { isSyncConflictError, nextLocalUpdatedAt } from '@/utils/syncConflict'
import { scheduleAutoSync } from '@/services/autoSync.service'
import { isCalendarEventDirty, mergeFreshWithDirtyLocal } from '@/services/sync.service'
import { useUndoToastStore } from '@/stores/undoToast'
import { useLangStore } from '@/stores/uiLang'

const NETWORK_LOAD_MS = 12_000

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

  async function hydrateFromCache(): Promise<void> {
    const cached = await chrome.storage.local.get(CALENDAR_EVENTS_CACHE_KEY)
    const raw = cached[CALENDAR_EVENTS_CACHE_KEY] as CalendarEvent[] | undefined
    if (Array.isArray(raw) && raw.length > 0) {
      events.value = withNormalizedDates(raw)
    }
  }

  async function loadAll(): Promise<void> {
    loadError.value = null
    try {
      await hydrateFromCache()
      if (!isOnline()) return
      const fresh = await withTimeout(
        calendarEventsService.getAll(),
        NETWORK_LOAD_MS,
        'Load calendar timed out',
      )
      // Không đè row đang dirty (sửa offline chưa push) bằng bản server cũ.
      events.value = mergeFreshWithDirtyLocal(
        withNormalizedDates(fresh),
        events.value,
        isCalendarEventDirty,
      )
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
    const nextPos =
      siblings.length === 0 ? 0 : Math.max(...siblings.map((e) => e.position)) + 1
    let created: CalendarEvent
    let createdOffline = false
    try {
      created = await calendarEventsService.create({
        ...input,
        event_date: dayKey,
        position: nextPos,
      })
    } catch (e) {
      if (isOnline() && !isNetworkError(e)) throw e
      // Offline fallback: tạo trong LocalFirst → autoSync push qua pushLocalToCloud.
      const local = await localCalendarEventsService.create({
        ...input,
        event_date: dayKey,
        position: nextPos,
      })
      created = { ...local, user_id: '' } as CalendarEvent
      createdOffline = true
    }
    const row = { ...created, event_date: normalizeLocalDateKey(created.event_date) }
    events.value = [...events.value, row]
    await persistCache()
    if (createdOffline) scheduleAutoSync('calendar-create-offline')
    return row
  }

  async function updateEvent(id: string, updates: CalendarEventUpdateInput): Promise<void> {
    const idx = events.value.findIndex((e) => e.id === id)
    if (idx < 0) return
    try {
      const updated = await calendarEventsService.update(id, updates, {
        row: events.value[idx],
        retryOnConflictWithServerState: true,
      })
      const next = events.value.slice()
      next[idx] = { ...updated, event_date: normalizeLocalDateKey(updated.event_date) }
      events.value = next
      await persistCache()
    } catch (e) {
      if (isSyncConflictError(e)) throw e
      if (isOnline() && !isNetworkError(e)) throw e
      // Offline: cập nhật Pinia + cache với updated_at mới; syncFromCache push sau
      // qua dirty-detection (calendar event có cột synced_at trong DB).
      const next = events.value.slice()
      const cur = next[idx]
      const ts = nextLocalUpdatedAt(cur)
      next[idx] = {
        ...cur,
        ...updates,
        event_date: normalizeLocalDateKey(updates.event_date ?? cur.event_date),
        updated_at: ts,
      }
      events.value = next
      await persistCache()
      scheduleAutoSync('calendar-update-offline')
    }
  }

  async function deleteEvent(id: string): Promise<void> {
    const eventIndex = events.value.findIndex((e) => e.id === id)
    const event = eventIndex === -1 ? null : { ...events.value[eventIndex] }
    if (!event) return
    const prevActiveDate = activeDate.value
    const prevActiveEventId = activeEventId.value

    events.value = events.value.filter((e) => e.id !== id)
    if (activeEventId.value === id) activeEventId.value = null
    await persistCache()

    const undoToast = useUndoToastStore()
    const { t } = useLangStore()
    await undoToast.schedule({
      id: `calendar:${id}`,
      message: t('undo.calendarEventDeleted', {
        title: event.title,
        date: event.event_date,
      }),
      undo: async () => {
        restoreEventSnapshot(event, eventIndex)
        if (activeDate.value === null) activeDate.value = prevActiveDate
        if (activeEventId.value === null && prevActiveEventId === id) {
          activeEventId.value = prevActiveEventId
        }
        await persistCache()
      },
      commit: async () => {
        try {
          await calendarEventsService.delete(id)
        } catch (e) {
          if (isNetworkError(e)) {
            loadError.value = e instanceof Error ? e.message : 'Delete calendar event failed'
            throw e
          }
          restoreEventSnapshot(event, eventIndex)
          if (activeDate.value === null) activeDate.value = prevActiveDate
          if (activeEventId.value === null && prevActiveEventId === id) {
            activeEventId.value = prevActiveEventId
          }
          loadError.value = e instanceof Error ? e.message : 'Delete calendar event failed'
          await persistCache()
        }
      },
    })
  }

  function restoreEventSnapshot(event: CalendarEvent, index: number): void {
    if (events.value.some((e) => e.id === event.id)) return
    const next = events.value.slice()
    next.splice(Math.min(Math.max(index, 0), next.length), 0, event)
    events.value = next
  }

  async function toggleDone(id: string): Promise<void> {
    const e = events.value.find((x) => x.id === id)
    if (!e) return
    await updateEvent(id, { is_done: !e.is_done })
  }

  async function markEventsDone(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)]
    await Promise.all(unique.map((id) => updateEvent(id, { is_done: true })))
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
    hydrateFromCache,
    createEvent,
    updateEvent,
    deleteEvent,
    toggleDone,
    markEventsDone,
    openModalForDate,
    openModalForEdit,
    closeModal,
    focusCalendarCellFromSearch,
  }
})
