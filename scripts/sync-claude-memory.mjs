/**
 * Đồng bộ Claude Code memory của project này qua git.
 *
 * Memory local nằm ở:  ~/.claude/projects/<sanitized-repo-path>/memory/
 *   (vd Windows: C:\Users\huynh\.claude\projects\d--VMs-bbq-one\memory
 *    vd Linux:   /home/dev/.claude/projects/-home-dev-bbq-one/memory)
 * Bản sync trong repo:  .claude/memory/   (được git track)
 *
 * Cách dùng:
 *   node scripts/sync-claude-memory.mjs export   # local → repo (chạy tự động ở pre-commit)
 *   node scripts/sync-claude-memory.mjs import   # repo → local (chạy tự động ở post-merge/pull)
 *   node scripts/sync-claude-memory.mjs setup    # bật git hooks (chạy 1 lần sau khi clone)
 *   node scripts/sync-claude-memory.mjs status   # in 2 đường dẫn + danh sách file 2 phía
 *
 * Đường dẫn hoàn toàn dynamic: os.homedir() + sanitize(đường dẫn repo trên máy hiện tại),
 * nên qua máy mới / user mới / ổ đĩa khác đều tự resolve đúng. Override được bằng env
 * CLAUDE_MEMORY_DIR (dùng cho test hoặc setup đặc biệt).
 *
 * Chính sách merge (đơn giản, dự đoán được):
 *   - export: MIRROR local → repo (file bị xóa ở local cũng bị xóa ở repo).
 *   - import: COPY repo → local (ghi đè file trùng tên; file chỉ-có-ở-local GIỮ NGUYÊN —
 *     không phá memory chưa kịp export; MEMORY.md lấy theo bản repo).
 *   Nguồn sự thật là repo vì export chạy ở mọi commit — máy nào commit sau cùng thắng.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_MEMORY_DIR = path.join(REPO_ROOT, '.claude', 'memory')

/** Claude Code đặt tên thư mục project = đường dẫn tuyệt đối, mọi ký tự không phải chữ/số → '-'. */
function sanitizeProjectPath(absPath) {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Resolve thư mục memory local — dynamic theo máy hiện tại. */
function resolveLocalMemoryDir() {
  if (process.env.CLAUDE_MEMORY_DIR) return process.env.CLAUDE_MEMORY_DIR
  const projectsDir = path.join(os.homedir(), '.claude', 'projects')
  const expected = sanitizeProjectPath(REPO_ROOT)
  let dirName = expected
  // Windows: hoa/thường ổ đĩa (d: vs D:) có thể lệch — match case-insensitive với thư mục sẵn có.
  if (fs.existsSync(projectsDir)) {
    const ci = fs
      .readdirSync(projectsDir)
      .find((e) => e.toLowerCase() === expected.toLowerCase())
    if (ci) dirName = ci
  }
  return path.join(projectsDir, dirName, 'memory')
}

function listMemoryFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
}

function copyFiles(fromDir, toDir, names) {
  fs.mkdirSync(toDir, { recursive: true })
  for (const name of names) {
    fs.copyFileSync(path.join(fromDir, name), path.join(toDir, name))
  }
}

function exportToRepo() {
  const local = resolveLocalMemoryDir()
  const files = listMemoryFiles(local)
  if (files.length === 0) {
    console.log(`[claude-memory] export: local memory trống/chưa có (${local}) — bỏ qua.`)
    return
  }
  // mirror: xóa file repo không còn ở local
  for (const stale of listMemoryFiles(REPO_MEMORY_DIR)) {
    if (!files.includes(stale)) fs.rmSync(path.join(REPO_MEMORY_DIR, stale))
  }
  copyFiles(local, REPO_MEMORY_DIR, files)
  console.log(`[claude-memory] export: ${files.length} file → ${path.relative(REPO_ROOT, REPO_MEMORY_DIR)} (${files.join(', ')})`)
}

function importFromRepo() {
  const files = listMemoryFiles(REPO_MEMORY_DIR)
  if (files.length === 0) {
    console.log('[claude-memory] import: repo chưa có .claude/memory — bỏ qua.')
    return
  }
  const local = resolveLocalMemoryDir()
  copyFiles(REPO_MEMORY_DIR, local, files)
  console.log(`[claude-memory] import: ${files.length} file → ${local}`)
}

function setupHooks() {
  execSync('git config core.hooksPath .githooks', { cwd: REPO_ROOT, stdio: 'inherit' })
  console.log('[claude-memory] setup: core.hooksPath = .githooks')
  console.log('  - pre-commit  → export memory local vào commit')
  console.log('  - post-merge  → import memory từ repo sau khi pull')
  importFromRepo() // máy mới: kéo luôn memory hiện có trong repo về
}

function status() {
  const local = resolveLocalMemoryDir()
  console.log(`local: ${local}`)
  console.log(`  ${listMemoryFiles(local).join(', ') || '(trống)'}`)
  console.log(`repo : ${REPO_MEMORY_DIR}`)
  console.log(`  ${listMemoryFiles(REPO_MEMORY_DIR).join(', ') || '(trống)'}`)
}

const mode = process.argv[2]
try {
  if (mode === 'export') exportToRepo()
  else if (mode === 'import') importFromRepo()
  else if (mode === 'setup') setupHooks()
  else if (mode === 'status') status()
  else {
    console.log('Usage: node scripts/sync-claude-memory.mjs <export|import|setup|status>')
    process.exit(1)
  }
} catch (e) {
  // Sync memory là best-effort — không bao giờ được chặn commit/pull.
  console.warn('[claude-memory] lỗi (bỏ qua, không chặn git):', e.message)
}
