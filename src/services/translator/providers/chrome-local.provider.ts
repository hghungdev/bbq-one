// chrome-ai.d.ts provides global Translator / LanguageDetector types
import type {
  ITranslationProvider,
  TranslationRequest,
  TranslationResult,
  LangCode,
} from '@/types/dictionary'
import {
  buildMixedRuns,
  mixedRunsNeedTranslation,
  vietnameseKeepsIntactInTranslation,
  type MixedRun,
} from '@/services/translator/mixedViEnSegments'

export class ChromeLocalProvider implements ITranslationProvider {
  readonly name = 'chrome-local'
  readonly supportsMode = ['quick'] as const

  async isAvailable(
    req?: Pick<TranslationRequest, 'sourceLang' | 'targetLang'>,
  ): Promise<boolean> {
    if (typeof Translator === 'undefined' || typeof LanguageDetector === 'undefined') {
      return false
    }
    if (!req || req.sourceLang === 'auto') return true
    const status = await Translator.availability({
      sourceLanguage: req.sourceLang,
      targetLanguage: req.targetLang,
    })
    return status === 'available' || status === 'downloadable'
  }

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const text = req.text.trim()
    if (!text) throw new Error('Empty text')

    /* Đoạn VI+EN lẫn: Chrome LanguageDetector + Translator.create('auto') thường lỗi hoặc dịch sai.
     * Tách token: giữ đoạn có dấu tiếng Việt, chỉ gọi Translator cho cụm Latin (EN). */
    if (req.sourceLang === 'auto' && (req.targetLang === 'vi' || req.targetLang === 'en')) {
      return this.translateMixedViEn(text, req.targetLang)
    }

    // 1. Detect if auto
    let sourceLang: LangCode
    let confidence: number | undefined
    if (req.sourceLang === 'auto') {
      const detected = await this.detectLanguage(text)
      sourceLang = detected.lang as LangCode
      confidence = detected.confidence
    } else {
      sourceLang = req.sourceLang
    }

    // 2. Edge case: same lang → return as-is
    if (sourceLang === req.targetLang) {
      return {
        sourceText: text,
        sourceLang,
        targetLang: req.targetLang,
        translatedText: text,
        provider: this.name,
        confidence,
      }
    }

    // 3. Translate
    const translator = await Translator.create({
      sourceLanguage: sourceLang,
      targetLanguage: req.targetLang,
    })
    const translatedText = await translator.translate(text)
    translator.destroy?.()

    return {
      sourceText: text,
      sourceLang,
      targetLang: req.targetLang,
      translatedText,
      provider: this.name,
      confidence,
    }
  }

  /**
   * Dịch xen kẽ: với native tiếng Việt, chỉ đẩy sang Translator các cụm coi là tiếng Anh;
   * phần có dấu tiếng Việt giữ nguyên (tương tự Chrome Translate trên trang).
   */
  private async translateMixedViEn(text: string, targetLang: LangCode): Promise<TranslationResult> {
    let confidence: number | undefined
    let sourceLangMeta: LangCode
    try {
      const detected = await this.detectLanguage(text)
      sourceLangMeta = detected.lang as LangCode
      confidence = detected.confidence
    } catch {
      sourceLangMeta = targetLang === 'vi' ? 'vi' : 'en'
    }

    const runs = buildMixedRuns(text, targetLang)
    if (!mixedRunsNeedTranslation(runs)) {
      return {
        sourceText: text,
        sourceLang: sourceLangMeta,
        targetLang,
        translatedText: text,
        provider: this.name,
        confidence,
      }
    }

    if (typeof Translator === 'undefined') {
      throw new Error('Translator API not available')
    }

    /* Đích tiếng Việt: ưu tiên một lần dịch cả đoạn (en→vi) để model thấy ngữ cảnh tiếng Việt xung quanh.
     * Nếu lỗi hoặc phần VN bị biến dạng → fallback tách cụm như trước. */
    if (targetLang === 'vi') {
      const contextual = await this.tryFullSentenceEnToVi(text, runs, sourceLangMeta, confidence)
      if (contextual !== null) return contextual
    }

    const out: string[] = []
    const translators = new Map<string, TranslatorInstance>()

    try {
      for (const run of runs) {
        if (run.action === 'keep') {
          out.push(run.text)
          continue
        }

        const src = run.sourceLang!
        if (src === targetLang) {
          out.push(run.text)
          continue
        }

        const key = `${src}:${targetLang}`
        let translator = translators.get(key)
        if (!translator) {
          const status = await Translator.availability({
            sourceLanguage: src,
            targetLanguage: targetLang,
          })
          if (status !== 'available' && status !== 'downloadable') {
            throw new Error(`Translation unavailable for ${src}→${targetLang}`)
          }
          translator = await Translator.create({
            sourceLanguage: src,
            targetLanguage: targetLang,
          })
          translators.set(key, translator)
        }

        const raw = run.text
        const piece = raw.trim()
        if (!piece) {
          out.push(raw)
          continue
        }

        let translatedPiece: string
        try {
          translatedPiece = await translator.translate(piece)
        } catch {
          translatedPiece = piece
        }

        const leadMatch = raw.match(/^\s*/)
        const trailMatch = raw.match(/\s*$/)
        const lead = leadMatch ? leadMatch[0] : ''
        const trail = trailMatch ? trailMatch[0] : ''
        out.push(lead + translatedPiece.trim() + trail)
      }
    } finally {
      for (const tr of translators.values()) {
        tr.destroy?.()
      }
    }

    return {
      sourceText: text,
      sourceLang: sourceLangMeta,
      targetLang,
      translatedText: out.join(''),
      provider: this.name,
      confidence,
    }
  }

  /**
   * Gửi nguyên câu lẫn EN/VN vào cặp en→vi: thường giữ được tiếng Việt và dịch tiếng Anh theo ngữ cảnh.
   */
  private async tryFullSentenceEnToVi(
    text: string,
    runs: MixedRun[],
    sourceLangMeta: LangCode,
    confidence: number | undefined,
  ): Promise<TranslationResult | null> {
    try {
      const status = await Translator.availability({
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      })
      if (status !== 'available' && status !== 'downloadable') return null

      const tr = await Translator.create({
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      })
      try {
        const translatedText = await tr.translate(text)
        if (translatedText === text) return null
        if (!vietnameseKeepsIntactInTranslation(runs, translatedText)) return null
        return {
          sourceText: text,
          sourceLang: sourceLangMeta,
          targetLang: 'vi',
          translatedText,
          provider: this.name,
          confidence,
        }
      } finally {
        tr.destroy?.()
      }
    } catch {
      return null
    }
  }

  private async detectLanguage(text: string): Promise<{ lang: string; confidence: number }> {
    const detector = await LanguageDetector.create()
    const results = await detector.detect(text)
    if (!results.length) throw new Error('Language detection failed')
    return { lang: results[0].detectedLanguage, confidence: results[0].confidence }
  }
}
