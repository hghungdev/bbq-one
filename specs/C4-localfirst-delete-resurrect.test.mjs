/**
 * FAILING TEST — C4: authenticated delete không dọn LocalFirst → resurrect qua pushLocalToCloud.
 *
 * Chạy:   node specs/C4-localfirst-delete-resurrect.test.mjs
 *
 * Test transpile và THỰC THI CODE THẬT của notes.service.ts + calendarEvents.service.ts.
 *
 * RED trên code hiện tại: behavior + static fail.
 * GREEN sau specs/C4-localfirst-delete-resurrect.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

const NOTES_PATH = path.join(ROOT, 'src', 'services', 'notes.service.ts')
const CAL_PATH = path.join(ROOT, 'src', 'services', 'calendarEvents.service.ts')

function loadTsModule(filePath, mocks) {
  const src = fs.readFileSync(filePath, 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const requireShim = (spec) => {
    if (spec in mocks) return mocks[spec]
    throw new Error(`Unmocked import in ${path.basename(filePath)}: ${spec}`)
  }
  new Function('require', 'module', 'exports', js)(requireShim, mod, mod.exports)
  return mod.exports
}

const supabaseDeleteOk = {
  from: () => ({
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
  }),
}

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('C4 — behavior: authenticated delete phải gọi local delete (service thật)')

// C9 (commit 852885a) thêm import syncConflict vào services — mock bằng module THẬT để không drift
const syncConflictReal = loadTsModule(path.join(ROOT, 'src', 'utils', 'syncConflict.ts'), { '@/utils/webLock': loadTsModule(path.join(ROOT, 'src', 'utils', 'webLock.ts'), {}) })

let notesLocalCalls = []
const notesMod = loadTsModule(NOTES_PATH, {
  './supabase': { supabase: supabaseDeleteOk },
  './noteBodies.service': { noteBodiesService: {} },
  '@/utils/syncConflict': syncConflictReal,
  '@/utils/supabaseFetchAll': loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
  '@/services/localFirst/authMode': { isAuthenticated: async () => true },
  '@/services/localFirst/localNotes.service': {
    localNotesService: {
      delete: async (id) => {
        notesLocalCalls.push(id)
      },
    },
  },
})

notesLocalCalls = []
await notesMod.notesService.delete('note-orphan-local')
check(
  'C4.1 notesService.delete(authenticated) → localNotesService.delete cùng id',
  notesLocalCalls.includes('note-orphan-local'),
  `local calls = ${JSON.stringify(notesLocalCalls)} — LocalFirst entry sống → pushLocalToCloud resurrect`,
)

let calLocalCalls = []
const calMod = loadTsModule(CAL_PATH, {
  '@/constants/calendar': { CALENDAR_MAX_EVENTS_PER_DAY: 50 },
  './supabase': { supabase: supabaseDeleteOk },
  '@/utils/syncConflict': syncConflictReal,
  '@/utils/supabaseFetchAll': loadTsModule(path.join(ROOT, 'src', 'utils', 'supabaseFetchAll.ts'), {}),
  '@/services/localFirst/authMode': { isAuthenticated: async () => true },
  '@/services/localFirst/localCalendarEvents.service': {
    localCalendarEventsService: {
      delete: async (id) => {
        calLocalCalls.push(id)
      },
    },
  },
})

calLocalCalls = []
await calMod.calendarEventsService.delete('ev-orphan-local')
check(
  'C4.2 calendarEventsService.delete(authenticated) → localCalendarEventsService.delete cùng id',
  calLocalCalls.includes('ev-orphan-local'),
  `local calls = ${JSON.stringify(calLocalCalls)}`,
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nC4 — static: authenticated branch gọi local delete trước return')

const notesSrc = fs.readFileSync(NOTES_PATH, 'utf8')
const calSrc = fs.readFileSync(CAL_PATH, 'utf8')

function authDeleteCallsLocal(src, localDeleteToken) {
  const m = src.match(
    /async delete\(id: string\): Promise<void> \{[\s\S]*?if \(await isAuthenticated\(\)\) \{([\s\S]*?\n    \})/,
  )
  const block = m?.[1] ?? ''
  return block.includes(localDeleteToken) && /await\s+local\w+Service\.delete\s*\(\s*id\s*\)/.test(block)
}

check(
  'C4.3 notes.service.ts authenticated delete gọi localNotesService.delete(id)',
  authDeleteCallsLocal(notesSrc, 'localNotesService.delete'),
  'nhánh auth return sớm sau supabase — thiếu local delete',
)
check(
  'C4.4 calendarEvents.service.ts authenticated delete gọi localCalendarEventsService.delete(id)',
  authDeleteCallsLocal(calSrc, 'localCalendarEventsService.delete'),
  'nhánh auth return sớm sau supabase — thiếu local delete',
)

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C4-localfirst-delete-resurrect.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — C4 local delete cleanup đúng spec.')
