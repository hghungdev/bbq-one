import type { ITranslationProvider, TranslationRequest, TranslationResult } from '@/types/dictionary'
import { enrichTranslationWithEnglishDictionary } from '@/services/dictionary/englishWordMeta.service'
import { ChromeLocalProvider } from './providers/chrome-local.provider'

class TranslatorService {
  private providers: ITranslationProvider[] = []

  register(p: ITranslationProvider): void {
    this.providers.push(p)
  }

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const candidates = this.providers.filter((p) => p.supportsMode.includes(req.mode))
    if (!candidates.length) {
      throw new Error(`No provider supports mode: ${req.mode}`)
    }
    for (const p of candidates) {
      if (await p.isAvailable({ sourceLang: req.sourceLang, targetLang: req.targetLang })) {
        const raw = await p.translate(req)
        return enrichTranslationWithEnglishDictionary(raw)
      }
    }
    throw new Error(`No available provider for ${req.sourceLang} → ${req.targetLang}`)
  }
}

export const translatorService = new TranslatorService()

// Phase 1 registration
translatorService.register(new ChromeLocalProvider())

// Phase 2 (chỉ thêm dòng này, KHÔNG sửa code trên):
// import { GeminiProvider } from './providers/gemini.provider'
// translatorService.register(new GeminiProvider())
