/**
 * Sprint 1 Smoke Tests — section 15 "Sprint 1 Tests"
 * Run (from repo root): npx tsx scripts/smoke-test-sprint1.ts
 *
 * Tests segmenter and classifyEntryType (pure functions, no Chrome API required).
 * TranslatorService tests require Chrome 138+ runtime — documented separately.
 */

import { segmentSentences, classifyEntryType } from '../src/services/dictionary/segmenter'

let passed = 0
let failed = 0

function assert(label: string, actual: unknown, expected: unknown): void {
  const ok =
    typeof expected === 'object'
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : actual === expected
  if (ok) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    Expected: ${JSON.stringify(expected)}`)
    console.error(`    Actual:   ${JSON.stringify(actual)}`)
    failed++
  }
}

function assertLength(label: string, actual: unknown[], expectedLen: number): void {
  if (actual.length === expectedLen) {
    console.log(`  ✓ ${label} → ${actual.length} segments: ${JSON.stringify(actual)}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    console.error(`    Expected ${expectedLen} segments, got ${actual.length}: ${JSON.stringify(actual)}`)
    failed++
  }
}

console.log('\n=== Sprint 1 Smoke Tests ===\n')

// ── segmentSentences ──────────────────────────────────────────────────────────
console.log('segmentSentences():')
assertLength("'Hello. How are you?' → 2 segments", segmentSentences('Hello. How are you?'), 2)
assertLength("'今日は晴れです。明日は雨です。' → 2 segments", segmentSentences('今日は晴れです。明日は雨です。', 'ja'), 2)
assertLength("empty string → 0 segments", segmentSentences(''), 0)
assertLength("single sentence → 1 segment", segmentSentences('Hello there'), 1)

// ── classifyEntryType ─────────────────────────────────────────────────────────
console.log('\nclassifyEntryType():')
assert("'hello' → 'word'", classifyEntryType('hello'), 'word')
assert("'good morning' → 'phrase'", classifyEntryType('good morning'), 'phrase')
assert("'I want to go home tonight because I am tired' → 'sentence'", classifyEntryType('I want to go home tonight because I am tired'), 'sentence')
assert("'xin chào' → 'phrase' (2 words)", classifyEntryType('xin chào'), 'phrase')
assert("'こんにちは' (5 chars CJK) → 'phrase'", classifyEntryType('こんにちは'), 'phrase')
assert("'日本' (2 chars CJK) → 'word'", classifyEntryType('日本'), 'word')
// 16 chars → sentence (> 15)
assert("CJK > 15 chars → 'sentence'", classifyEntryType('今日はとても良い天気ですねよかった'), 'sentence')

// ── TranslatorService structure ───────────────────────────────────────────────
console.log('\nTranslatorService:')
// Import directly using ESM — tsx supports this
  import('../src/services/translator/translator.service')
  .then(async ({ translatorService }) => {
    assert('translatorService exists', typeof translatorService, 'object')
    assert('translatorService.translate is a function', typeof translatorService.translate, 'function')

    // deep mode should throw — no provider supports it
    try {
      await translatorService.translate({ text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'deep' })
      console.error('  ✗ deep mode should throw, but resolved')
      failed++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('No provider supports mode: deep')) {
        console.log(`  ✓ deep mode throws: "${msg}"`)
        passed++
      } else {
        console.error(`  ✗ Unexpected error: ${msg}`)
        failed++
      }
    }
    printSummary()
  })
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ⚠ translatorService import failed (likely missing Chrome globals in Node): ${msg}`)
    printSummary()
  })

function printSummary(): void {
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
  process.exit(failed > 0 ? 1 : 0)
}
