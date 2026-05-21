import { defineStore } from 'pinia'
import { ref } from 'vue'
import { BBQ_UTC_OFFSET_HOURS_KEY } from '@/constants/storage'
import {
  DEFAULT_UTC_OFFSET_HOURS,
  formatUtcOffsetLabel,
  normalizeUtcOffsetHours,
} from '@/utils/appDateTime'

export const useAppTimezoneStore = defineStore('appTimezone', () => {
  const utcOffsetHours = ref<number>(DEFAULT_UTC_OFFSET_HOURS)
  let storageListenerAttached = false

  const offsetLabel = (): string => formatUtcOffsetLabel(utcOffsetHours.value)

  async function init(): Promise<void> {
    try {
      const chunk = await chrome.storage.local.get(BBQ_UTC_OFFSET_HOURS_KEY)
      utcOffsetHours.value = normalizeUtcOffsetHours(chunk[BBQ_UTC_OFFSET_HOURS_KEY])
    } catch {
      utcOffsetHours.value = DEFAULT_UTC_OFFSET_HOURS
    }

    if (storageListenerAttached) return
    storageListenerAttached = true
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !(BBQ_UTC_OFFSET_HOURS_KEY in changes)) return
      utcOffsetHours.value = normalizeUtcOffsetHours(changes[BBQ_UTC_OFFSET_HOURS_KEY]?.newValue)
    })
  }

  async function setOffsetHours(hours: number): Promise<void> {
    const next = normalizeUtcOffsetHours(hours)
    utcOffsetHours.value = next
    try {
      await chrome.storage.local.set({ [BBQ_UTC_OFFSET_HOURS_KEY]: next })
    } catch {
      /* extension context only */
    }
  }

  return {
    utcOffsetHours,
    offsetLabel,
    init,
    setOffsetHours,
  }
})
