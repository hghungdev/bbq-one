import type {
  ITranslationProvider,
  TranslationRequest,
  TranslationResult,
  LangCode,
} from '@/types/dictionary'
import { mymemoryRateLimit } from '@/utils/mymemoryRateLimit'
import { USE_MYMEMORY_KEY } from '@/constants/storage'

interface MyMemoryResponse {
  responseData: {
    translatedText: string
    match: number
  }
  responseStatus: number
  responseDetails?: string
  quotaFinished?: boolean
}

const MYMEMORY_BASE_URL = 'https://api.mymemory.translated.net/get'
const MAX_TEXT_LENGTH = 500 // MyMemory limit per request
const TIMEOUT_MS = 5000 // 5s timeout → fallback to Chrome

export class MyMemoryProvider implements ITranslationProvider {
  readonly name = 'mymemory'
  readonly supportsMode = ['quick'] as const

  async isAvailable(
    req?: Pick<TranslationRequest, 'sourceLang' | 'targetLang'>,
  ): Promise<boolean> {
    // 1. Kiểm tra user setting — nếu tắt MyMemory thì skip
    const stored = await chrome.storage.local.get(USE_MYMEMORY_KEY)
    if (stored[USE_MYMEMORY_KEY] === false) {
      return false
    }

    // 2. Kiểm tra daily quota
    if (await mymemoryRateLimit.isQuotaExhausted()) {
      return false
    }

    // 3. MyMemory không support 'auto' → Chrome provider xử lý case này
    if (!req || req.sourceLang === 'auto') {
      return false
    }

    // 4. Kiểm tra cặp ngôn ngữ hỗ trợ (sourceLang đã narrowed sang LangCode)
    if (!this.isPairSupported(req.sourceLang, req.targetLang)) {
      return false
    }

    return true
  }

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const text = req.text.trim()
    if (!text) throw new Error('Empty text')
    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Text exceeds MyMemory limit (${MAX_TEXT_LENGTH} chars)`)
    }
    if (req.sourceLang === 'auto') {
      throw new Error('MyMemory requires explicit sourceLang')
    }

    // Edge case: same lang → return as-is (không gọi API)
    if (req.sourceLang === req.targetLang) {
      return {
        sourceText: text,
        sourceLang: req.sourceLang,
        targetLang: req.targetLang,
        translatedText: text,
        provider: this.name,
        confidence: 1,
      }
    }

    const langPair = `${req.sourceLang}|${req.targetLang}`
    const url = `${MYMEMORY_BASE_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal })
    } catch (e) {
      throw new Error(`MyMemory network error: ${(e as Error).message}`)
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      throw new Error(`MyMemory HTTP ${response.status}`)
    }

    const data = (await response.json()) as MyMemoryResponse

    if (data.quotaFinished) {
      await mymemoryRateLimit.markQuotaExhausted()
      throw new Error('MyMemory daily quota exhausted')
    }

    if (data.responseStatus !== 200) {
      throw new Error(`MyMemory API error: ${data.responseDetails ?? 'unknown'}`)
    }

    const translatedText = data.responseData.translatedText
    if (!translatedText) {
      throw new Error('MyMemory returned empty translation')
    }

    // Nếu translation === source thì có thể là failure → fallback sang Chrome
    if (translatedText.trim().toLowerCase() === text.trim().toLowerCase()) {
      throw new Error('MyMemory returned untranslated text (likely failure)')
    }

    await mymemoryRateLimit.recordRequest(text.length)

    return {
      sourceText: text,
      sourceLang: req.sourceLang as LangCode,
      targetLang: req.targetLang,
      translatedText,
      provider: this.name,
      confidence: data.responseData.match,
    }
  }

  /**
   * Kiểm tra MyMemory có hỗ trợ cặp ngôn ngữ này không.
   * Giới hạn tier-1 để đảm bảo chất lượng cao.
   */
  private isPairSupported(source: LangCode, target: LangCode): boolean {
    const tier1: LangCode[] = ['en', 'vi', 'ja', 'zh', 'fr', 'de', 'es', 'ko', 'th']
    return tier1.includes(source) && tier1.includes(target)
  }
}
