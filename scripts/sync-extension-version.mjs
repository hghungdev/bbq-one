/**
 * Đồng bộ field "version" trong package.json với public/manifest.json.
 * Chạy trước build để chỉ cần sửa một chỗ (manifest).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'public', 'manifest.json')
const pkgPath = join(root, 'package.json')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const version = manifest.version
if (typeof version !== 'string' || version.trim() === '') {
  console.warn('[sync-extension-version] manifest.version rỗng hoặc không hợp lệ')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (pkg.version === version) {
  process.exit(0)
}
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log('[sync-extension-version] package.json version →', version)
