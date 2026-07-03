/**
 * FAILING TEST — C10: calendar next position after delete gap.
 * Chạy: node specs/C10-calendar-position.test.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAL_STORE = path.join(ROOT, 'src', 'stores', 'calendarEvents.ts')

function nextCalendarPosition(siblings) {
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((e) => e.position)) + 1
}

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}

console.log('C10 — next position sau gap (behavior formula)')

check(
  'C10.1 siblings [0,2] → nextPos = 3 (không phải siblings.length=2)',
  nextCalendarPosition([{ position: 0 }, { position: 2 }]) === 3,
  `got ${nextCalendarPosition([{ position: 0 }, { position: 2 }])}`,
)
check(
  'C10.2 empty day → nextPos = 0',
  nextCalendarPosition([]) === 0,
  'empty siblings',
)
check(
  'C10.3 single sibling → nextPos = 1',
  nextCalendarPosition([{ position: 0 }]) === 1,
  'single sibling',
)

console.log('\nC10 — static: createEvent dùng Math.max(...position)')

const calSrc = fs.readFileSync(CAL_STORE, 'utf8')
const createBlock = calSrc.match(/async function createEvent[\s\S]*?^  \}/m)?.[0] ?? ''

check(
  'C10.4 calendarEvents.ts createEvent dùng max(position)+1',
  /Math\.max\s*\(\s*\.\.\.siblings\.map/.test(createBlock),
  'vẫn dùng nextPos = siblings.length → trùng position sau delete',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/C10-calendar-position.spec.md')
  process.exit(1)
}
console.log('✅ PASS — C10 calendar position đúng spec.')
