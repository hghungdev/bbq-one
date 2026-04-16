import { syncService } from '@/services/sync.service'

const ALARM_NAME = 'retronote-daily-sync'

function ensureDailyAlarm(): void {
  void chrome.alarms.get(ALARM_NAME, (a) => {
    if (!a) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 24 * 60 })
    }
  })
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDailyAlarm()
})

chrome.runtime.onStartup.addListener(() => {
  ensureDailyAlarm()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return
  void syncService.syncFromCache()
})
