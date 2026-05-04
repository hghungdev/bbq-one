import type { ITranslationProvider, TranslationRequest, TranslationResult } from '@/types/dictionary'
import { enrichTranslationWithEnglishDictionary } from '@/services/dictionary/englishWordMeta.service'
import { ChromeLocalProvider } from './providers/chrome-local.provider'
import { MyMemoryProvider } from './providers/mymemory.provider'

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

    let lastError: Error | null = null

    for (const p of candidates) {
      try {
        if (await p.isAvailable({ sourceLang: req.sourceLang, targetLang: req.targetLang })) {
          const raw = await p.translate(req)
          return enrichTranslationWithEnglishDictionary(raw)
        }
      } catch (e) {
        lastError = e as Error
        console.warn(`[Translator] Provider ${p.name} failed:`, lastError.message)
        // Continue to next provider in chain
      }
    }

    throw lastError ?? new Error(`No available provider for ${req.sourceLang} → ${req.targetLang}`)
  }
}

export const translatorService = new TranslatorService()

// IMPORTANT: Register order = priority order
// MyMemory first (better quality), Chrome as fallback
translatorService.register(new MyMemoryProvider())
translatorService.register(new ChromeLocalProvider())

// Phase 2 (Gemini for deep mode):
// import { GeminiProvider } from './providers/gemini.provider'
// translatorService.register(new GeminiProvider())
