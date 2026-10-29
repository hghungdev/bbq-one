/**
 * FAILING TEST — P2: Shiki gọn — highlight.ts chỉ nạp 10 ngôn ngữ + 2 theme, HTML tô màu không đổi.
 *
 * Chạy:   node specs/P2-shiki-fine-grained.test.mjs
 * GREEN sau khi áp specs/P2-shiki-fine-grained.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
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

const FILE = path.join(ROOT, 'src', 'utils', 'highlight.ts')
const src = fs.readFileSync(FILE, 'utf8')
const LANGS = ['javascript', 'typescript', 'sql', 'php', 'bash', 'python', 'json', 'html', 'css', 'markdown']

// ─── Tĩnh: không còn kéo bundle đầy đủ ───────────────────────────────────────
check(
  "P2.1 không import bundle đầy đủ: không có import('shiki') / import … from 'shiki' dạng giá trị",
  !/import\(\s*['"]shiki['"]\s*\)/.test(src) && !/^import\s+(?!type\b)[^;]*from\s+['"]shiki['"]/m.test(src),
  'highlight.ts vẫn nạp cả bộ shiki',
)
const missing = [
  ...LANGS.map((l) => `shiki/langs/${l}.mjs`),
  'shiki/themes/github-light.mjs',
  'shiki/themes/github-dark.mjs',
  'shiki/core',
  'shiki/engine/oniguruma',
  'shiki/wasm',
].filter((m) => !src.includes(`'${m}'`))
check('P2.2 import riêng: 10 ngôn ngữ, 2 theme, shiki/core + engine oniguruma + shiki/wasm', missing.length === 0, missing.join(', '))

// ─── Chạy CODE THẬT: HTML phải giống bundle đầy đủ ───────────────────────────
const esm = async (spec) => ({ __esModule: true, ...(await import(require.resolve(spec))) })
function loadTsModule(code, mocks) {
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const requireShim = (spec) => {
    if (spec in mocks) return mocks[spec]
    throw new Error(`Unmocked import in highlight.ts: ${spec}`)
  }
  new Function('require', 'module', 'exports', js)(requireShim, mod, mod.exports)
  return mod.exports
}

const mocks = {}
for (const spec of [
  'shiki',
  'shiki/core',
  'shiki/engine/oniguruma',
  'shiki/wasm',
  'shiki/themes/github-light.mjs',
  'shiki/themes/github-dark.mjs',
  ...LANGS.map((l) => `shiki/langs/${l}.mjs`),
]) {
  mocks[spec] = await esm(spec)
}
// Đếm số highlighter tạo ra (P2: dùng chung một Promise).
let created = 0
for (const key of ['shiki', 'shiki/core']) {
  for (const fn of ['createHighlighter', 'createHighlighterCore']) {
    if (typeof mocks[key][fn] !== 'function') continue
    const real = mocks[key][fn]
    mocks[key] = { ...mocks[key], [fn]: (...a) => { created++; return real(...a) } }
  }
}

const SAMPLES = {
  javascript: "const a = [1, 2].map((x) => x * 2) // nhân đôi\nexport default { a }",
  typescript: 'interface N { id: string; tags?: string[] }\nconst n: N = { id: "x" } as const',
  sql: "SELECT id, title FROM notes WHERE user_id = $1 AND title ILIKE '%bbq%' ORDER BY updated_at DESC;",
  php: '<?php\n$rows = $pdo->query("SELECT * FROM t")->fetchAll();\necho json_encode($rows);',
  bash: 'for f in specs/*.test.mjs; do node "$f" || echo "FAIL $f"; done',
  python: 'def f(xs: list[int]) -> int:\n    return sum(x * 2 for x in xs)  # tổng',
  json: '{ "app": "bbqone", "format": 1, "items": [true, null, 2.5] }',
  html: '<div class="a"><script>let x = 1</script><style>.a { color: red }</style></div>',
  css: ':root { --accent: #0066cc } .a:hover > b::after { content: "→"; }',
  markdown: '# Tiêu đề\n\n- **đậm** và `code`\n\n```js\nlet a = 1\n```',
}

let H = null
try {
  H = loadTsModule(src, mocks)
} catch (e) {
  check('P2.3 highlight.ts load được', false, e.message)
}
if (H?.highlightCode) {
  const { codeToHtml } = mocks.shiki
  const diffs = []
  for (const theme of ['light', 'dark']) {
    globalThis.document = { documentElement: { dataset: { theme } } }
    for (const lang of LANGS) {
      const got = await H.highlightCode(SAMPLES[lang], lang)
      const want = await codeToHtml(SAMPLES[lang], { lang, theme: `github-${theme}` })
      if (got !== want) diffs.push(`${lang}/${theme}`)
    }
    const odd = await H.highlightCode('plain *text*', 'cobol')
    const oddWant = await codeToHtml('plain *text*', { lang: 'markdown', theme: `github-${theme}` })
    if (odd !== oddWant) diffs.push(`ngôn ngữ lạ → markdown/${theme}`)
  }
  check('P2.3 HTML tô màu giống hệt bundle đầy đủ (10 ngôn ngữ × 2 theme + ngôn ngữ lạ → markdown)', diffs.length === 0, diffs.join(', '))

  // Highlighter tạo một lần; gọi đồng thời lúc "nguội" không tạo trùng (load lại module mới).
  created = 0
  const H2 = loadTsModule(src, mocks)
  await Promise.all([H2.highlightCode('a', 'json'), H2.highlightCode('b', 'css'), H2.highlightCode('c', 'sql')])
  check('P2.4 3 lần gọi đồng thời khi chưa có highlighter → chỉ tạo 1 highlighter', created === 1, `tạo ${created}`)
}

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/P2-shiki-fine-grained.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. P2 đúng spec.')
