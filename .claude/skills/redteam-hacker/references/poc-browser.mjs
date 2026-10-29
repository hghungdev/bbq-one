// PoC trình duyệt dùng chung — web app (URL cục bộ) hoặc browser extension (thư mục build chưa đóng gói).
// Đo dấu hiệu bị hack: alert/confirm bật lên, request ra ngoài, vi phạm CSP, ô nhiễm prototype, lỗi JS.
// Thoát mã 1 nếu có bất kỳ dấu hiệu nào → dùng được trong CI.
//
//   node poc-browser.mjs --url http://localhost:5173 [--allow-host api.local] [--seed seed.json] [--scenario s.mjs] [--out dir]
//   node poc-browser.mjs --extension ./dist [--page index.html] [--seed seed.json] [--scenario s.mjs] [--out dir]
//
// --seed      JSON object: extension → chrome.storage.local.set(obj); web → localStorage[k] = JSON/chuỗi.
// --scenario  module ESM: export default async function (page, h) { … }  với h = { base, wait, shot, paste, type, log }.
//             Viết kịch bản riêng của dự án (selector, route) ở đây — đừng sửa file mẫu này.
// --allow-host  host được phép gọi ra ngoài (API của chính app); lặp lại được.
// Cần Playwright + Chromium (đã có sẵn trong môi trường Claude Code cloud; máy khác: npm i -D playwright && npx playwright install chromium).
// Chỉ dùng tên miền *.example cho payload. Không trỏ vào production.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  ;({ chromium } = createRequire(path.join(process.cwd(), 'noop.js'))('playwright'))
}

const args = process.argv.slice(2)
const opt = (name, def = undefined) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def }
const optAll = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []))
const URL_ARG = opt('url')
const EXT = opt('extension')
const OUT = opt('out', '.')
const SEED = opt('seed') ? JSON.parse(fs.readFileSync(opt('seed'), 'utf8')) : null
const ALLOW = new Set(optAll('allow-host'))
if (!URL_ARG && !EXT) { console.error('Cần --url hoặc --extension'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const ctx = await chromium.launchPersistentContext('', {
  headless: true,
  acceptDownloads: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
  args: EXT ? [`--disable-extensions-except=${path.resolve(EXT)}`, `--load-extension=${path.resolve(EXT)}`] : [],
})

// Bắt vi phạm CSP chắc chắn hơn đọc console.
await ctx.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) =>
    console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI}`))
})

let base
if (EXT) {
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 })
  base = `chrome-extension://${new URL(sw.url()).host}`
} else {
  base = new URL(URL_ARG).origin
}

const page = await ctx.newPage()
await page.setViewportSize({ width: 1024, height: 700 })
const logs = []
const alerts = []
const external = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
page.on('dialog', async (d) => { alerts.push(`${d.type()}: ${d.message()}`); await d.dismiss() })
ctx.on('request', (r) => {
  const u = r.url()
  if (/^(data|blob|about|chrome-extension|chrome):/.test(u)) return
  const host = new URL(u).host
  if (!EXT && new URL(u).origin === base) return
  if (ALLOW.has(host)) return
  external.push(u)
})

const start = EXT ? `${base}/${opt('page', 'index.html')}` : URL_ARG
await page.goto(start)
await page.waitForLoadState('domcontentloaded')

if (SEED) {
  if (EXT) await page.evaluate((s) => chrome.storage.local.set(s), SEED)
  else await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)) }, SEED)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
}

const h = {
  base,
  wait: (ms) => page.waitForTimeout(ms),
  shot: (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }),
  log: (...a) => console.log('  ·', ...a),
  type: (selector, text) => page.locator(selector).first().fill(text),
  // Dán HTML vào phần tử (ClipboardEvent tổng hợp — như người dùng dán từ trang web).
  paste: (selector, html, plain = '') => page.evaluate(({ selector, html, plain }) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`không thấy ${selector}`)
    el.focus()
    const dt = new DataTransfer()
    dt.setData('text/html', html)
    dt.setData('text/plain', plain || html.replace(/<[^>]+>/g, ''))
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, { selector, html, plain }),
}

const scenarioPath = opt('scenario')
if (scenarioPath) {
  const mod = await import(pathToFileURL(path.resolve(scenarioPath)).href)
  await mod.default(page, h)
} else {
  await page.waitForTimeout(1500)
  await h.shot('poc-start')
}

const polluted = await page.evaluate(() => ({}).polluted !== undefined).catch(() => false)
const csp = logs.filter((m) => /CSP-VIOLATION|Content Security Policy|Refused to/i.test(m))
const errors = logs.filter((m) => /^(error|pageerror)/.test(m) && !/CSP-VIOLATION|Content Security Policy|Refused to/i.test(m))
const evilLogs = logs.filter((m) => /evil\.example/.test(m))

console.log('\n── Kết quả PoC ──')
console.log('alert / confirm bật lên :', JSON.stringify(alerts))
console.log('request ra ngoài        :', JSON.stringify(external))
console.log('vi phạm CSP             :', JSON.stringify(csp))
console.log('prototype bị ô nhiễm    :', polluted)
console.log('console nhắc evil.*     :', JSON.stringify(evilLogs))
console.log('lỗi JS khác             :', JSON.stringify(errors))
await ctx.close()
const hacked = alerts.length > 0 || external.length > 0 || polluted
console.log(hacked ? '\n❌ CÓ DẤU HIỆU BỊ KHAI THÁC' : '\n✅ Không thấy dấu hiệu khai thác (vi phạm CSP / lỗi JS: xem thêm ở trên)')
process.exit(hacked ? 1 : 0)
