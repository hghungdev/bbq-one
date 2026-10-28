/**
 * FAILING TEST — G1b: sổ tay làm lại link Google Calendar + script gộp 1 file để dán vào Supabase Dashboard.
 *
 * Chạy:   node specs/G1b-calendar-feed-runbook.test.mjs
 *
 * B — scripts/bundle-calendar-feed.mjs: sinh file gộp, rồi CHẠY THỬ file đó (Supabase / Deno giả).
 * R — supabase/functions/calendar-feed/README.md: đủ các phần A / B / C + lỗi thường gặp, không lộ project ref.
 * GREEN sau khi áp specs/G1b-calendar-feed-runbook.spec.md.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}
const read = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p), 'utf8')
  } catch {
    return ''
  }
}

// ── B: script gộp ───────────────────────────────────────────────────────────
const SCRIPT = path.join(ROOT, 'scripts', 'bundle-calendar-feed.mjs')
const pkg = JSON.parse(read('package.json'))
check(
  'G1b.B1 có scripts/bundle-calendar-feed.mjs + npm run calendar-feed:bundle',
  fs.existsSync(SCRIPT) && pkg.scripts?.['calendar-feed:bundle'] === 'node scripts/bundle-calendar-feed.mjs',
  'chưa có script',
)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'g1b-'))
const out = path.join(tmp, 'calendar-feed.dashboard.ts')
let bundle = ''
try {
  execFileSync(process.execPath, [SCRIPT, out], { cwd: ROOT, stdio: 'pipe' })
  bundle = fs.readFileSync(out, 'utf8')
} catch (e) {
  bundle = ''
}
const importLines = bundle.split('\n').filter((l) => /^\s*import\s/.test(l))
check(
  'G1b.B2 file gộp: đúng 1 import (npm:@supabase/supabase-js@2) ở đầu, không còn import tương đối',
  importLines.length === 1 &&
    /from 'npm:@supabase\/supabase-js@2'/.test(importLines[0]) &&
    !/from '\.\//.test(bundle) &&
    bundle.indexOf(importLines[0]) < bundle.indexOf('export interface FeedEvent'),
  `import: ${JSON.stringify(importLines)}`,
)

const FN = path.join(ROOT, 'supabase', 'functions', 'calendar-feed')
const body = (f) =>
  fs
    .readFileSync(path.join(FN, f), 'utf8')
    .split('\n')
    .filter((l) => !/^import\s/.test(l))
    .join('\n')
    .trim()
check(
  'G1b.B3 file gộp chứa nguyên văn ics.ts → handler.ts → index.ts (không sửa tay, đúng thứ tự)',
  bundle.length > 0 &&
    ['ics.ts', 'handler.ts', 'index.ts'].every((f) => bundle.includes(body(f))) &&
    bundle.indexOf(body('ics.ts')) < bundle.indexOf(body('handler.ts')) &&
    bundle.indexOf(body('handler.ts')) < bundle.indexOf(body('index.ts')),
  'nội dung lệch nguồn',
)

// Chạy thử file gộp: createClient giả + Deno giả, bắt handler của Deno.serve.
async function runBundle() {
  const js = ts.transpileModule(bundle, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = []
  const FEED = { user_id: 'u1', enabled: true }
  const EVENTS = [
    { id: 'e1', title: 'Họp nhóm', description: '', event_date: '2026-10-29', start_time: null, end_time: null, is_done: false, updated_at: '2026-10-28T01:00:00+00:00' },
  ]
  function builder(table) {
    const q = {
      select: () => q, eq: (c, v) => (calls.push([table, 'eq', c, v]), q), gte: () => q, lte: () => q, order: () => q,
      update: (v) => (calls.push([table, 'update', Object.keys(v).join()]), q),
      maybeSingle: async () => ({ data: calls.some((c) => c[3] === GOOD) ? FEED : null, error: null }),
      then: (ok) => ok({ data: table === 'calendar_events' ? EVENTS : null, error: null }),
    }
    return q
  }
  let serveHandler = null
  const fakeRequire = (id) => {
    if (id === 'npm:@supabase/supabase-js@2') return { createClient: () => ({ from: builder }) }
    throw new Error(`require lạ: ${id}`)
  }
  const Deno = { env: { get: (k) => `env:${k}` }, serve: (h) => { serveHandler = h } }
  new Function('require', 'exports', 'module', 'Deno', js)(fakeRequire, {}, { exports: {} }, Deno)
  const base = 'https://x.supabase.co/functions/v1/calendar-feed/'
  const bad = await serveHandler(new Request(`${base}${'A'.repeat(43)}.ics`))
  const good = await serveHandler(new Request(`${base}${GOOD}.ics?tz=Asia/Ho_Chi_Minh`))
  return { bad, good, goodText: await good.text(), calls }
}
const GOOD = 'b'.repeat(43)
let run = null
try {
  run = await runBundle()
} catch (e) {
  run = { error: String(e) }
}
check(
  'G1b.B4 chạy file gộp: token lạ → 404; token đúng → 200 text/calendar có sự kiện; ghi last_fetched_at',
  run?.bad?.status === 404 &&
    run?.good?.status === 200 &&
    /text\/calendar/.test(run.good.headers.get('content-type') ?? '') &&
    /BEGIN:VCALENDAR/.test(run.goodText) &&
    /SUMMARY:Họp nhóm/.test(run.goodText) &&
    run.calls.some((c) => c[0] === 'calendar_feeds' && c[1] === 'update' && c[2] === 'last_fetched_at'),
  run?.error ?? `bad=${run?.bad?.status} good=${run?.good?.status}`,
)

let tscOk = false
let tscOut = ''
if (bundle) {
  const shim = path.join(tmp, 'shim.d.ts')
  fs.writeFileSync(
    shim,
    "declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void }\n" +
      "declare module 'npm:@supabase/supabase-js@2' { export function createClient(url: string, key: string, opts?: unknown): any }\n",
  )
  try {
    execFileSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'es2022', '--module', 'esnext',
        '--moduleResolution', 'bundler', '--lib', 'es2022,dom', out, shim],
      { cwd: ROOT, stdio: 'pipe' },
    )
    tscOk = true
  } catch (e) {
    tscOut = String(e.stdout ?? e).slice(0, 300)
  }
}
check('G1b.B5 file gộp kiểm kiểu sạch (tsc --strict)', tscOk, tscOut || 'chưa có file gộp')
check('G1b.B6 out/ trong .gitignore (file sinh ra, không commit)', /^out\/?$/m.test(read('.gitignore')), '.gitignore')

// ── R: sổ tay ───────────────────────────────────────────────────────────────
const md = read('supabase', 'functions', 'calendar-feed', 'README.md')
const has = (re) => re.test(md)
check(
  'G1b.R1 sổ tay có đủ phần: A1 Dashboard / A2 CLI / Kiểm tra / Lỗi thường gặp / B project mới / C server khác',
  has(/^## A\. Triển khai trên Supabase/m) &&
    has(/^### A1\. Dashboard/m) &&
    has(/^### A2\. CLI/m) &&
    has(/^## Kiểm tra/m) &&
    has(/^## Lỗi thường gặp/m) &&
    has(/^## B\. Chuyển sang project Supabase mới/m) &&
    has(/^## C\. Chuyển sang server \/ DB khác/m),
  'thiếu mục',
)
check(
  'G1b.R2 A1 đúng các bước đã làm: Via Editor, tên calendar-feed, npm run calendar-feed:bundle, TẮT "Verify JWT"',
  has(/Via Editor/) && has(/`calendar-feed`/) && has(/npm run calendar-feed:bundle/) && has(/Verify JWT with legacy secret/),
  'A1 thiếu bước',
)
check(
  'G1b.R3 A2: --no-verify-jwt, --use-api (không cần Docker), cách tìm <project-ref>',
  has(/--no-verify-jwt/) && has(/--use-api/) && has(/Docker/) && has(/Reference ID/),
  'A2 thiếu',
)
check(
  'G1b.R4 lỗi thường gặp có 401 (Verify JWT còn bật) và 404 (sai tên function / link tắt)',
  has(/401/) && has(/Missing authorization header|Invalid JWT/) && has(/Requested function was not found/) && has(/Not found/),
  'thiếu bảng lỗi',
)
check(
  'G1b.R5 B: link cũ chết khi đổi project → tạo link mới + thêm lại vào Google; không chép calendar_feeds (user_id đổi)',
  has(/VITE_SUPABASE_URL/) && has(/Tạo link mới|Tạo link/) && has(/Từ URL/) && has(/user_id/),
  'B thiếu',
)
check(
  'G1b.R6 C: giữ ics.ts + handler.ts; 4 hàm findFeed / listEvents / touch / now kèm SQL; đổi buildFeedUrl',
  has(/findFeed/) && has(/listEvents/) && has(/touch/) && has(/now\(\)/) &&
    has(/SELECT user_id, enabled FROM calendar_feeds/) && has(/src\/utils\/calendarFeed\.ts/) && has(/buildFeedUrl/) &&
    has(/privacy/i),
  'C thiếu',
)
check(
  'G1b.R7 không lộ project ref thật (repo công khai) — chỉ <project-ref>',
  !/https:\/\/[a-z0-9]{20}\.supabase\.co/.test(md + read('specs', 'ROADMAP-U.md')) && has(/<project-ref>/),
  'có project ref thật',
)

fs.rmSync(tmp, { recursive: true, force: true })
console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/G1b-calendar-feed-runbook.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. G1b đúng spec.')
