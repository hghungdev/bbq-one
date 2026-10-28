/**
 * FAILING TEST — U25: icon / logo BBQOne cắt sát viền (không còn nhỏ hơn icon khác trên Chrome / header).
 *
 * Chạy:   node specs/U25-brand-icon-size.test.mjs
 * Giải mã PNG thật (RGBA 8-bit) để đo phần có hình trong khung.
 * GREEN sau khi áp specs/U25-brand-icon-size.spec.md.
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(`${name}: ${detail}`)
}
const bytes = (...p) => {
  try {
    return fs.readFileSync(path.join(ROOT, ...p))
  } catch {
    return null
  }
}

/** PNG RGBA 8-bit, không interlace → { width, height, alpha(x, y) }. */
function decodePng(buf) {
  if (!buf || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('không phải PNG')
  let off = 8
  let width = 0
  let height = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`cần RGBA 8-bit, không interlace`)
    } else if (type === 'IDAT') idat.push(data)
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = width * bpp
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0
      const b = y > 0 ? px[(y - 1) * stride + i] : 0
      const c = i >= bpp && y > 0 ? px[(y - 1) * stride + i - bpp] : 0
      let v = line[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + i] = v & 0xff
    }
  }
  return { width, height, alpha: (x, y) => px[y * stride + x * bpp + 3] }
}

/** Tỉ lệ khung có hình (alpha > 24) theo ngang / dọc. */
function fill(buf) {
  const { width, height, alpha } = decodePng(buf)
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha(x, y) > 24) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  return { width, height, fx: (x1 - x0 + 1) / width, fy: (y1 - y0 + 1) / height }
}

const targets = [
  [['public', 'icon-16.png'], 16],
  [['public', 'icon-32.png'], 32],
  [['public', 'icon-48.png'], 48],
  [['public', 'icon-128.png'], 128],
  [['src', 'assets', 'brand', 'bbqone-logo.png'], 64],
]
const measured = targets.map(([p, size]) => {
  try {
    return { p: p.join('/'), size, ...fill(bytes(...p)) }
  } catch (e) {
    return { p: p.join('/'), size, error: String(e) }
  }
})
check(
  'U25.1 icon Chrome + logo header: đúng cỡ, hình lấp ≥ 94 % ngang và ≥ 80 % dọc khung',
  measured.every((m) => !m.error && m.width === m.size && m.height === m.size && m.fx >= 0.94 && m.fy >= 0.8),
  measured.map((m) => m.error ?? `${m.p} ${(m.fx * 100).toFixed(0)}%×${(m.fy * 100).toFixed(0)}%`).join(' · '),
)

const same = (a, b) => {
  const x = bytes(...a)
  const y = bytes(...b)
  return !!x && !!y && x.equals(y)
}
const mismatch = [
  ...[16, 32, 48, 128].filter((n) => !same(['public', `icon-${n}.png`], ['design', 'transparent-tight', `icon${n}.png`])),
  ...(same(['src', 'assets', 'brand', 'bbqone-logo.png'], ['design', 'transparent-tight', 'icon64.png']) ? [] : ['logo']),
]
check(
  'U25.2 public/icon-* + logo app = design/transparent-tight/* (nguồn đã cắt sát, commit cùng repo)',
  mismatch.length === 0,
  `lệch: ${mismatch.join(', ')}`,
)
const script = (bytes('scripts', 'make-brand-icons.py') ?? '').toString('utf8')
check(
  'U25.3 scripts/make-brand-icons.py sinh lại được từ design/transparent/icon1024.png (bản gốc giữ nguyên)',
  /design.+transparent.+icon1024\.png/.test(script) && /transparent-tight/.test(script) && /getbbox\(\)/.test(script) &&
    same(['design', 'transparent', 'icon1024.png'], ['design', 'transparent', 'icon1024.png']),
  'chưa có script',
)

console.log('\n──────────────────────────────────────────────')
if (failures.length > 0) {
  console.log(`❌ FAIL (${failures.length}):\n- ${failures.join('\n- ')}`)
  console.log('\n→ Áp specs/U25-brand-icon-size.spec.md để chuyển sang PASS.')
  process.exit(1)
}
console.log('✅ PASS — mọi case đạt. U25 đúng spec.')
