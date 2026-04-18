import {
  bootstrapBookmarkBaseline,
  scheduleBookmarkAutoBackup,
} from '@/services/bookmarkAutoBackup.service'
import { syncService } from '@/services/sync.service'

const ALARM_NAME = 'bbqnote-daily-sync'

function ensureDailyAlarm(): void {
  void chrome.alarms.get(ALARM_NAME, (a) => {
    if (!a) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 24 * 60 })
    }
  })
}

function wireBookmarkAutoBackup(): void {
  const onChange = (): void => {
    scheduleBookmarkAutoBackup()
  }
  chrome.bookmarks.onCreated.addListener(onChange)
  chrome.bookmarks.onRemoved.addListener(onChange)
  chrome.bookmarks.onChanged.addListener(onChange)
  chrome.bookmarks.onMoved.addListener(onChange)
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDailyAlarm()
  void bootstrapBookmarkBaseline()
})

chrome.runtime.onStartup.addListener(() => {
  ensureDailyAlarm()
  void bootstrapBookmarkBaseline()
})

wireBookmarkAutoBackup()

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return
  void syncService.syncFromCache()
})
