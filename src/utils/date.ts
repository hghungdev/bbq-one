const TZ_UTC7 = 'Asia/Ho_Chi_Minh'

/** List folder/note: ngày theo UTC+7, format YYYY/MM/dd. */
export function formatListUpdatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_UTC7,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !day) return '—'
  return `${y}/${m}/${day}`
}
