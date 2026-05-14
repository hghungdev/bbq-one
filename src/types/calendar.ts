/**
 * A single calendar event tied to one date.
 * `event_date` is DATE (no timezone) — same value across locations.
 *
 * v1 UI uses: title, description, is_done, position.
 * Future-proof nullable fields: color, start_time, end_time (v2 + desktop app).
 */
export interface CalendarEvent {
  id: string
  user_id: string
  event_date: string // 'YYYY-MM-DD'
  title: string
  description: string
  is_done: boolean
  position: number
  color: string | null
  start_time: string | null // 'HH:MM' (24h)
  end_time: string | null
  created_at: string
  updated_at: string
  synced_at: string | null
}

/** Input shape when creating a new event */
export type CalendarEventCreateInput = Pick<
  CalendarEvent,
  'event_date' | 'title' | 'description'
> & {
  position?: number
  color?: string | null
}

/** Input shape when updating */
export type CalendarEventUpdateInput = Partial<
  Pick<
    CalendarEvent,
    | 'title'
    | 'description'
    | 'is_done'
    | 'position'
    | 'event_date'
    | 'color'
    | 'start_time'
    | 'end_time'
    | 'synced_at'
  >
>
