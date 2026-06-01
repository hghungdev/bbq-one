import { describe, expect, it } from 'vitest'
import {
  CALENDAR_EVENT_TONE_COUNT,
  calendarEventToneClass,
  calendarEventToneIndex,
} from '@/utils/calendarEventTone'

describe('calendarEventTone', () => {
  it('returns stable index in range', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    expect(calendarEventToneIndex(id)).toBe(calendarEventToneIndex(id))
    expect(calendarEventToneIndex(id)).toBeGreaterThanOrEqual(0)
    expect(calendarEventToneIndex(id)).toBeLessThan(CALENDAR_EVENT_TONE_COUNT)
  })

  it('maps to tone class', () => {
    const idx = calendarEventToneIndex('event-1')
    expect(calendarEventToneClass('event-1')).toBe(`cal-event-tone-${idx}`)
  })
})
