/**
 * G1b: gộp Edge Function calendar-feed (ics.ts + handler.ts + index.ts) thành MỘT file để dán vào
 * Supabase Dashboard › Edge Functions › Via Editor (xem supabase/functions/calendar-feed/README.md, mục A1).
 *
 *   npm run calendar-feed:bundle                → out/calendar-feed.dashboard.ts
 *   node scripts/bundle-calendar-feed.mjs <file> → ghi ra <file>
 *
 * File sinh ra — không sửa tay: sửa 3 file nguồn rồi chạy lại.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fnDir = join(root, 'supabase', 'functions', 'calendar-feed')
const outPath = resolve(process.argv[2] ?? join(root, 'out', 'calendar-feed.dashboard.ts'))

// Thứ tự phụ thuộc: ics.ts ← handler.ts ← index.ts.
const SOURCES = ['ics.ts', 'handler.ts', 'index.ts']
const SINGLE_LINE_IMPORT = /^import\s.+\sfrom\s+'([^']+)'\s*;?\s*$/

const external = []
const parts = []
for (const file of SOURCES) {
  const lines = readFileSync(join(fnDir, file), 'utf8').split('\n')
  const kept = []
  for (const line of lines) {
    if (!/^import\s/.test(line)) {
      kept.push(line)
      continue
    }
    const m = SINGLE_LINE_IMPORT.exec(line)
    if (!m) {
      console.error(`[bundle-calendar-feed] ${file}: import nhiều dòng / lạ — gộp tay hoặc viết lại 1 dòng:\n  ${line}`)
      process.exit(1)
    }
    // Import tương đối đã nằm trong file gộp; import ngoài (npm:…) đưa lên đầu.
    if (!m[1].startsWith('./') && !external.includes(line.trim())) external.push(line.trim())
  }
  parts.push(`// ───────── ${file} ─────────\n${kept.join('\n').trim()}\n`)
}

const header = [
  '// BBQOne — Edge Function "calendar-feed" (1 file để dán vào Supabase Dashboard › Edge Functions › Via Editor).',
  '// TỰ SINH bởi scripts/bundle-calendar-feed.mjs từ supabase/functions/calendar-feed/{ics,handler,index}.ts —',
  '// không sửa tay. Sau khi Deploy: tab Settings → TẮT "Verify JWT with legacy secret" → Save changes.',
]
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${header.join('\n')}\n${external.join('\n')}\n\n${parts.join('\n')}`)
console.log(`[bundle-calendar-feed] → ${outPath}`)
