/**
 * Đo hiệu năng popup BBQOne trên Chromium thật (chế độ không đăng nhập) — số đo của ROADMAP-P.
 *
 * Cần Playwright + Chromium (không nằm trong devDependencies):  npm i --no-save playwright && npx playwright install chromium
 * Chạy (sau `npm run build`):
 *   node scripts/measure-popup-perf.mjs dist [số ghi chú=2000] [số sự kiện=800]
 *   FONT_DELAY=3000 node scripts/measure-popup-perf.mjs dist 0 0      # giả lập Google Fonts trả chậm 3 s
 *   BOOKMARKS=3000 node scripts/measure-popup-perf.mjs dist 0 0       # thêm 3.000 bookmark rồi đo tab Bookmark
 *
 * Nạp dữ liệu giả thẳng vào bbqone_local_* (20 thư mục, 30 % ghi chú ở "Folder 0", mỗi ghi chú 2 body ~1,7 KB),
 * bọc chrome.storage.local.get/set để ghi kích thước + thời gian, đếm longtask (> 50 ms chặn luồng chính).
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const { chromium } = createRequire(import.meta.url)('playwright')
const DIST = path.resolve(process.argv[2])
const N_NOTES = Number(process.argv[3] ?? 2000)
const N_EVENTS = Number(process.argv[4] ?? 800)
const FONT_DELAY = Number(process.env.FONT_DELAY ?? 0)

function seedData() {
  const iso = (d) => new Date(d).toISOString()
  const base = Date.UTC(2026, 0, 1)
  const folders = Array.from({ length: 20 }, (_, i) => ({
    id: `f${i}`, name: `Folder ${i}`, position: i, is_secure: false, secure_salt: null,
    pbkdf2_iterations: 310000, secure_verifier_enc: null,
    created_at: iso(base), updated_at: iso(base + i * 1000), __synced: false,
  }))
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua select from where join trading report'.split(' ')
  const para = (seed, n) => Array.from({ length: n }, (_, k) => words[(seed * 7 + k * 13) % words.length]).join(' ')
  const notes = [], bodies = []
  for (let i = 0; i < N_NOTES; i++) {
    const folder = i < N_NOTES * 0.3 ? 'f0' : `f${1 + (i % 19)}`
    notes.push({ id: `n${i}`, title: `Note ${i} ${para(i, 4)}`, folder_id: folder, tags: i % 5 ? [] : ['work'],
      created_at: iso(base + i * 60000), updated_at: iso(base + i * 60000), synced_at: null, __synced: false })
    for (let b = 0; b < 2; b++) {
      bodies.push({ id: `b${i}_${b}`, note_id: `n${i}`, label: b ? 'Query' : 'Draft', position: b,
        content: `<p>${para(i + b, 120)}</p><p>${para(i + b + 1, 120)}</p>`,
        created_at: iso(base + i * 60000), updated_at: iso(base + i * 60000), synced_at: null, __synced: false })
    }
  }
  const events = Array.from({ length: N_EVENTS }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 29) + (Math.floor(i / 3) - 120) * 86400000)
    return { id: `e${i}`, event_date: d.toISOString().slice(0, 10), title: `Event ${i}`, description: para(i, 10),
      is_done: i % 4 === 0, position: i % 3, color: null, start_time: null, end_time: null,
      created_at: iso(base), updated_at: iso(base), synced_at: null, __synced: false }
  })
  return { bbqone_local_folders: folders, bbqone_local_notes: notes, bbqone_local_note_bodies: bodies, bbqone_local_calendar_events: events }
}

const INIT = () => {
  window.__io = []
  window.__long = []
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) })
      .observe({ type: 'longtask', buffered: true })
  } catch {}
  const L = chrome?.storage?.local
  if (!L) return
  const wrap = (name, sizeOf) => {
    const orig = L[name].bind(L)
    const fn = async (...a) => {
      const t = performance.now()
      const r = await orig(...a)
      window.__io.push({ op: name, size: sizeOf(a[0], r), ms: performance.now() - t, at: t, keys: name === 'set' ? Object.keys(a[0] ?? {}) : (typeof a[0] === 'string' ? [a[0]] : Array.isArray(a[0]) ? a[0] : a[0] == null ? ['*'] : Object.keys(a[0])) })
      return r
    }
    try { L[name] = fn } catch {}
    if (L[name] !== fn) Object.defineProperty(L, name, { value: fn, configurable: true, writable: true })
  }
  wrap('set', (o) => JSON.stringify(o).length)
  wrap('get', (_k, r) => JSON.stringify(r ?? {}).length)
}

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
})
if (FONT_DELAY) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (r) => {
    await new Promise((s) => setTimeout(s, FONT_DELAY))
    await r.fulfill({ status: 200, contentType: 'text/css', body: '' })
  })
}
await ctx.addInitScript(INIT)
let [sw] = ctx.serviceWorkers()
if (!sw) sw = await ctx.waitForEvent('serviceworker')
const id = new URL(sw.url()).host
const URL_ = `chrome-extension://${id}/index.html`
const page = await ctx.newPage()
await page.setViewportSize({ width: 800, height: 600 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

async function openPopup(label) {
  const t0 = Date.now()
  await page.goto(URL_)
  await page.waitForSelector('.cal-grid', { timeout: 30000 })
  const wall = Date.now() - t0
  await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1
    const js = performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.js')).map((e) => new URL(e.name).pathname)
    const nav = performance.getEntriesByType('navigation')[0]
    const long = window.__long
    return { fcp: Math.round(fcp), dcl: Math.round(nav.domContentLoadedEventEnd), js,
      longCount: long.length, longMs: Math.round(long.reduce((s, x) => s + x.d, 0)), longMax: Math.round(Math.max(0, ...long.map((x) => x.d))),
      io: window.__io.slice() }
  })
  const jsBytes = [...new Set([...m.js, ...await page.evaluate(() => [...document.querySelectorAll('script[src],link[rel=modulepreload]')].map((s) => new URL(s.src || s.href).pathname))])]
    .reduce((s, p) => s + (fs.existsSync(path.join(DIST, p)) ? fs.statSync(path.join(DIST, p)).size : 0), 0)
  const ioBig = m.io.filter((x) => x.size > 50000)
  console.log(`[${label}] wall→.cal-grid ${wall}ms · FCP ${m.fcp}ms · DCL ${m.dcl}ms · JS ${(jsBytes / 1024).toFixed(0)} KB (${m.js.length} file) · longtask ${m.longCount}× ${m.longMs}ms (max ${m.longMax}) · storage ops ${m.io.length} (${ioBig.length} >50KB: ${ioBig.map((x) => `${x.op} ${x.keys.join('+')} ${(x.size / 1024).toFixed(0)}KB ${x.ms.toFixed(0)}ms`).join(', ')})`)
  return m
}

await openPopup('empty #1')
await openPopup('empty #2')
await openPopup('empty #3')

if (N_NOTES > 0) {
  const data = seedData()
  await page.evaluate((d) => chrome.storage.local.set(d), data)
  console.log(`seeded: ${N_NOTES} notes, ${N_NOTES * 2} bodies, ${N_EVENTS} events — ${(JSON.stringify(data).length / 1024 / 1024).toFixed(1)} MB`)
  await openPopup('large first')
  await openPopup('large steady #1')
  await openPopup('large steady #2')
  const usage = await page.evaluate(() => chrome.storage.local.getBytesInUse(null))
  console.log(`storage.local bytes in use: ${(usage / 1024 / 1024).toFixed(1)} MB`)

  // Notes tab
  await page.evaluate(() => { window.__io.length = 0; window.__long.length = 0 })
  let t = Date.now()
  await page.locator('.shell__rail-item').nth(1).click()
  await page.locator('.folder-item').first().waitFor()
  await page.locator('.folder-item', { hasText: 'Folder 0' }).first().click()
  await page.locator('.note-item').first().waitFor()
  const nItems = await page.locator('.note-item').count()
  console.log(`[notes tab → Folder 0] ${Date.now() - t}ms · ${nItems} .note-item trong DOM`)
  t = Date.now()
  await page.locator('.note-item').first().click()
  await page.locator('.ProseMirror').first().waitFor()
  console.log(`[open note] ${Date.now() - t}ms`)
  await page.evaluate(() => { window.__io.length = 0; window.__long.length = 0 })
  await page.locator('.ProseMirror').first().click()
  t = Date.now()
  await page.keyboard.type(' hello world performance', { delay: 30 })
  const typeMs = Date.now() - t
  await page.waitForTimeout(3500)
  const afterType = await page.evaluate(() => ({ io: window.__io.slice(), long: window.__long.slice() }))
  const sets = afterType.io.filter((x) => x.op === 'set')
  const gets = afterType.io.filter((x) => x.op === 'get' && x.size > 50000)
  console.log(`[type 24 ký tự + autosave] gõ ${typeMs}ms · longtask ${afterType.long.length}× ${Math.round(afterType.long.reduce((s, x) => s + x.d, 0))}ms · set ${sets.length}× [${sets.map((x) => `${x.keys.join('+')} ${(x.size / 1024).toFixed(0)}KB/${x.ms.toFixed(0)}ms`).join(', ')}] · get lớn ${gets.length}× [${gets.map((x) => `${x.keys.join('+')} ${(x.size / 1024).toFixed(0)}KB/${x.ms.toFixed(0)}ms`).join(', ')}]`)

  // Search
  await page.evaluate(() => { window.__long.length = 0 })
  const input = page.locator('.sidebar__search input')
  await input.click()
  t = Date.now()
  await input.pressSequentially('trading', { delay: 40 })
  await page.waitForTimeout(800)
  const s = await page.evaluate(() => ({ long: window.__long.slice(), res: document.querySelectorAll('.note-item').length }))
  console.log(`[search "trading"] ${Date.now() - t}ms · ${s.res} kết quả trong DOM · longtask ${s.long.length}× ${Math.round(s.long.reduce((a, x) => a + x.d, 0))}ms (max ${Math.round(Math.max(0, ...s.long.map((x) => x.d)))})`)
}

if (process.env.BOOKMARKS) {
  const NB = Number(process.env.BOOKMARKS)
  const tb = Date.now()
  await page.evaluate(async (NB) => {
    const bar = (await chrome.bookmarks.getTree())[0].children[0]
    for (let f = 0; f < NB / 100; f++) {
      const folder = await chrome.bookmarks.create({ parentId: bar.id, title: `Dir ${f}` })
      await Promise.all(Array.from({ length: 100 }, (_, i) => chrome.bookmarks.create({ parentId: folder.id, title: `Trading page ${f}-${i} lorem ipsum`, url: `https://example${i}.com/p/${f}/${i}` })))
    }
  }, NB)
  console.log(`bookmarks created: ${NB} (${Date.now() - tb}ms)`)
  await page.goto(URL_)
  await page.waitForSelector('.cal-grid')
  await page.evaluate(() => { window.__long.length = 0 })
  let t = Date.now()
  await page.locator('.shell__rail-item').nth(2).click()
  await page.waitForTimeout(1500)
  const tl = Date.now() - t
  let b = await page.evaluate(() => ({ long: window.__long.slice(), nodes: document.querySelectorAll('.shell__grid--full *').length }))
  console.log(`[bookmark tab] (gồm chờ 1500) ${tl}ms · ${b.nodes} phần tử DOM · longtask ${b.long.length}× ${Math.round(b.long.reduce((a, x) => a + x.d, 0))}ms`)
  await page.evaluate(() => { window.__long.length = 0 })
  await page.locator('.shell__grid--full .inline-search__open, .shell__grid--full button[aria-label*="earch"]').first().click().catch(() => {})
  const bin = page.locator('.shell__grid--full input').first()
  t = Date.now()
  await bin.pressSequentially('page 7', { delay: 40 })
  await page.waitForTimeout(800)
  b = await page.evaluate(() => ({ long: window.__long.slice(), nodes: document.querySelectorAll('.shell__grid--full *').length }))
  console.log(`[bookmark search "page 7"] ${Date.now() - t}ms · ${b.nodes} DOM · longtask ${b.long.length}× ${Math.round(b.long.reduce((a, x) => a + x.d, 0))}ms (max ${Math.round(Math.max(0, ...b.long.map((x) => x.d)))})`)
}
await ctx.close()
