import { CALENDAR_MAX_EVENTS_PER_DAY } from '@/constants/calendar'
import { supabase } from './supabase'
import { isAuthenticated } from '@/services/localFirst/authMode'
import { localCalendarEventsService } from '@/services/localFirst/localCalendarEvents.service'
import type {
  CalendarEvent,
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
} from '@/types/calendar'
import {
  type OptimisticUpdateOptions,
  resolveExpectedServerUpdatedAt,
  throwIfSyncConflict,
} from '@/utils/syncConflict'

export const calendarEventsService = {
  async getAll(): Promise<CalendarEvent[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('event_date', { ascending: true })
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as CalendarEvent[]
    }
    const arr = await localCalendarEventsService.getAll()
    return arr
      .sort((a, b) => {
        if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date)
        return a.position - b.position
      })
      .map((e) => ({ ...e, user_id: '' }) as CalendarEvent)
  },

  async listByDateRange(startISO: string, endISO: string): Promise<CalendarEvent[]> {
    if (await isAuthenticated()) {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('event_date', startISO)
        .lte('event_date', endISO)
        .order('event_date', { ascending: true })
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as CalendarEvent[]
    }
    const arr = await localCalendarEventsService.listByDateRange(startISO, endISO)
    return arr
      .sort((a, b) => {
        if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date)
        return a.position - b.position
      })
      .map((e) => ({ ...e, user_id: '' }) as CalendarEvent)
  },

  async create(input: CalendarEventCreateInput): Promise<CalendarEvent> {
    if (await isAuthenticated()) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr
      if (!user) throw new Error('Not authenticated')
      const { count, error: countErr } = await supabase
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_date', input.event_date)
      if (countErr) throw countErr
      if ((count ?? 0) >= CALENDAR_MAX_EVENTS_PER_DAY) {
        throw new Error('MAX_EVENTS_PER_DAY')
      }
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          event_date: input.event_date,
          title: input.title,
          description: input.description ?? '',
          position: input.position ?? 0,
          color: input.color ?? null,
          user_id: user.id,
        })
        .select()
        .single()
      if (error) throw error
      return data as CalendarEvent
    }
    const local = await localCalendarEventsService.create(input)
    return { ...local, user_id: '' } as CalendarEvent
  },

  async update(
    id: string,
    updates: CalendarEventUpdateInput,
    options?: OptimisticUpdateOptions & { row?: CalendarEvent },
  ): Promise<CalendarEvent> {
    if (await isAuthenticated()) {
      const expected = resolveExpectedServerUpdatedAt(options)
      const base = options?.row
      if (expected !== null && base) {
        const { data, error } = await supabase.rpc('bbq_update_calendar_event_if_current', {
          p_id: id,
          p_expected_updated_at: expected,
          p_title: updates.title ?? base.title,
          p_description: updates.description ?? base.description,
          p_event_date: updates.event_date ?? base.event_date,
          p_is_done: updates.is_done ?? base.is_done,
          p_position: updates.position ?? base.position,
          p_color: updates.color !== undefined ? updates.color : base.color,
          p_synced_at: updates.synced_at ?? base.synced_at ?? new Date().toISOString(),
        })
        throwIfSyncConflict(error)
        if (error) throw error
        return data as CalendarEvent
      }
      const { data, error } = await supabase
        .from('calendar_events')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as CalendarEvent
    }
    const local = await localCalendarEventsService.update(id, updates)
    return { ...local, user_id: '' } as CalendarEvent
  },

  async delete(id: string): Promise<void> {
    if (await isAuthenticated()) {
      const { error } = await supabase.from('calendar_events').delete().eq('id', id)
      if (error) throw error
      await localCalendarEventsService.delete(id)
      return
    }
    await localCalendarEventsService.delete(id)
  },
}
