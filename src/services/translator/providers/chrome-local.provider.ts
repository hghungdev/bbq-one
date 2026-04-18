// chrome-ai.d.ts provides global Translator / LanguageDetector types
import type {
  ITranslationProvider,
  TranslationRequest,
  TranslationResult,
  LangCode,
} from '@/types/dictionary'

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

    return {
      sourceText: text,
      sourceLang,
      targetLang: req.targetLang,
      translatedText,
      provider: this.name,
      confidence,
    }
  }

  private async detectLanguage(text: string): Promise<{ lang: string; confidence: number }> {
    const detector = await LanguageDetector.create()
    const results = await detector.detect(text)
    if (!results.length) throw new Error('Language detection failed')
    return { lang: results[0].detectedLanguage, confidence: results[0].confidence }
  }
}
