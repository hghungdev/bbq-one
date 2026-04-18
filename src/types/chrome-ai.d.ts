/**
 * Chrome 138+ built-in AI API ambient declarations.
 * These globals are available in extension content scripts and service workers
 * when the flag chrome://flags/#translation-api is enabled (stable in Chrome 138+).
 *
 * Spec: https://github.com/WICG/translation-api
 */

type ChromeAIAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

interface TranslatorInstance {
  translate(text: string): Promise<string>
  destroy?(): void
}

interface TranslatorCreateOptions {
  sourceLanguage: string
  targetLanguage: string
  monitor?: (monitor: EventTarget) => void
}

interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<ChromeAIAvailability>
  create(opts: TranslatorCreateOptions): Promise<TranslatorInstance>
}

interface LanguageDetectionResult {
  detectedLanguage: string
  confidence: number
}

interface LanguageDetectorInstance {
  detect(text: string): Promise<LanguageDetectionResult[]>
  destroy?(): void
}

interface LanguageDetectorStatic {
  availability(): Promise<ChromeAIAvailability>
  create(): Promise<LanguageDetectorInstance>
}

declare const Translator: TranslatorStatic
declare const LanguageDetector: LanguageDetectorStatic
