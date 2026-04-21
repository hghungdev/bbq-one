# CURSOR PROMPT — Tích hợp Dictionary (Translate + Vocabulary) vào BBQOne Extension

> **Mục tiêu Phase 1**: Thêm tab "DICTIONARY" vào BBQOne extension.
> User quét text trên bất kỳ trang web nào → floating popup dịch instant (Chrome built-in API, free, local).
> Click Save → lưu vào Supabase per-user dictionary.
> Dictionary tab trong popup cho xem/search/delete entries.
>
> **Ship target**: 2 tuần (3 sprints × 4-5 ngày)
> **Design principle**: Strategy Pattern + Provider Registry — Phase 1 code Chrome Local Provider, Phase 2 plug Gemini KHÔNG refactor.

---

## 0. Context & Assumptions

### 0.1. Project hiện tại (đã phân tích)

```
src/
├── pages/App.vue              ← Shell chính, tab switcher NOTES | BOOKMARK
├── router/index.ts            ← Hash router
├── types/index.ts             ← Note, Folder, NoteBody, SyncStatus
├── services/
│   ├── supabase.ts            ← Client singleton, chrome.storage adapter
│   ├── auth.service.ts
│   ├── notes.service.ts       ← Pattern CRUD + FTS + substring fallback
│   ├── bookmarks.service.ts
│   └── sync.service.ts
├── stores/                    ← Pinia stores (auth, notes, folders, bookmarks, settings)
├── constants/storage.ts       ← Cache keys
├── components/ui/             ← RetroButton, RetroInput, RetroConfirm, TagInput
├── background.ts              ← Service worker (daily sync alarm)
└── assets/styles/retro.css    ← Design tokens: --bg-primary, --accent, --text-primary,...

public/manifest.json           ← MV3, permissions hiện có
supabase/migrations/           ← 001-005, pattern trigger + RLS + FTS
```

### 0.2. Constraints quan trọng

- **Chrome 138+ required** cho Translator/LanguageDetector API (OK vì đã stable từ 5/2025)
- **Multi-entry extension**: popup + content + background phải cùng 1 build, cùng 1 manifest
- **Provider pattern bắt buộc**: code Phase 1 phải extend được Phase 2 mà KHÔNG sửa core
- **Shadow DOM isolation**: floating popup trên web không được bị CSS của trang "đè"
- **RLS bắt buộc**: follow pattern `005_note_bodies.sql` có trigger + policy owner

### 0.3. Những gì KHÔNG làm Phase 1 (Out of scope — ghi rõ để Cursor không over-engineer)

- ❌ Gemini integration (Phase 2)
- ❌ Edge Function (chưa cần)
- ❌ Shared `translation_cache` table (Phase 2)
- ❌ Enrichment: synonyms, examples, grammar explain (Phase 2)
- ❌ Domain-level override (Phase 2)
- ❌ Spaced repetition / flashcard / mastery level (Phase 3+)
- ❌ Live Meet translate (defer)
- ❌ Starred, tags cho dictionary entry (Phase 2 — nhưng DB schema CHUẨN BỊ SẴN columns)

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        BBQOne EXTENSION                           │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │   POPUP      │  │   CONTENT    │  │      BACKGROUND          │ │
│  │              │  │              │  │                          │ │
│  │ Notes        │  │ Selection    │  │  Message broker          │ │
│  │ Bookmarks    │  │ detector     │  │  Sync worker (đã có)     │ │
│  │ Dictionary ★ │  │              │  │  Dict cache sync         │ │
│  │ Settings     │  │ Floating     │  │                          │ │
│  │              │  │ popup        │  │                          │ │
│  │              │  │ (Shadow DOM) │  │                          │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────────┘ │
│         │                 │                      │                 │
│         └─────────────────┴──────────────────────┘                 │
│                           │                                        │
│                  ┌────────┴─────────┐                              │
│                  │  SHARED MODULES  │                              │
│                  ├──────────────────┤                              │
│                  │ translator/      │  Provider Registry           │
│                  │  ├ types.ts      │  (Strategy Pattern)          │
│                  │  ├ providers/    │                              │
│                  │  │  └ chrome-    │  Phase 1: Chrome Local       │
│                  │  │     local    │  Phase 2: + Gemini            │
│                  │  └ translator.   │                              │
│                  │     service      │                              │
│                  │                  │                              │
│                  │ dictionary/      │                              │
│                  │  ├ entries.      │  Supabase CRUD               │
│                  │  │  service      │                              │
│                  │  └ segmenter     │  Intl.Segmenter wrapper      │
│                  │                  │                              │
│                  │ supabase.ts      │  (đã có)                     │
│                  └──────────────────┘                              │
└────────────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS
                           ↓
               ┌──────────────────────────┐
               │  Chrome Built-in APIs    │
               │  (local, offline, free)  │
               │  ├ Translator            │
               │  └ LanguageDetector      │
               └──────────────────────────┘
                           │
                           ↓
               ┌──────────────────────────┐
               │  Supabase (đã có)        │
               │  ├ user_dictionary_      │
               │  │  entries (NEW)        │
               │  ├ user_translation_     │
               │  │  settings (NEW)       │
               │  └ auth.users            │
               └──────────────────────────┘
```

### 1.1. Data flow — Quick translate (hot path)

```
User selects text trên trang web
    ↓
Content script captures selection → floating trigger icon
    ↓
User clicks icon
    ↓
Content script: translatorService.translate({ mode: 'quick', ... })
    ↓
TranslatorService: router pick ChromeLocalProvider (supports 'quick')
    ↓
ChromeLocalProvider: detect lang (if auto) → translate → return result
    ↓
Content script: render kết quả vào Shadow DOM popup (50-100ms)
    ↓
User clicks "💾 Save"
    ↓
Content script → chrome.runtime.sendMessage → background
    ↓
Background → dictionaryEntriesService.create() → Supabase insert
    ↓
Background → return success → content script show toast "✓ Saved"
```

### 1.2. Data flow — Dictionary tab (popup)

```
User mở popup → click tab "DICTIONARY"
    ↓
DictionaryTab.vue mounted
    ↓
dictionaryStore.loadAll() → Supabase select + cache chrome.storage.local
    ↓
Render list entries (filter by search query, sort by created_at desc)
    ↓
User click entry → expand show full translation
User click delete → confirm → delete from Supabase + cache
```

---

## 2. Thay đổi file — Danh sách đầy đủ

### 2.1. THÊM MỚI

```
src/
├── types/
│   └── dictionary.ts                              ← Types cho dictionary + translation
├── services/
│   ├── translator/
│   │   ├── types.ts                               ← ITranslationProvider interface
│   │   ├── providers/
│   │   │   └── chrome-local.provider.ts           ← Chrome Translator + LanguageDetector
│   │   └── translator.service.ts                  ← Registry + router
│   └── dictionary/
│       ├── entries.service.ts                     ← Supabase CRUD cho entries
│       ├── settings.service.ts                    ← Supabase CRUD cho settings
│       └── segmenter.ts                           ← Intl.Segmenter wrapper
├── stores/
│   ├── dictionary.ts                              ← Pinia store: entries + search
│   └── translationSettings.ts                     ← Pinia store: native/learning langs
├── components/
│   └── dictionary/
│       ├── DictionaryTab.vue                      ← Tab container (list + search)
│       ├── DictionaryEntryItem.vue                ← 1 row entry
│       ├── DictionarySearchBar.vue                ← Search input
│       └── TranslationSettingsPanel.vue           ← Settings UI trong modal
├── content/
│   ├── index.ts                                   ← Entry point content script
│   ├── selection-detector.ts                      ← Watch mouseup, getSelection
│   ├── trigger-icon.ts                            ← Floating icon near selection
│   ├── popup-host.ts                              ← Tạo Shadow DOM host element
│   ├── TranslatePopup.vue                         ← Floating popup Vue component
│   └── popup-styles.css                           ← CSS inside Shadow DOM
└── utils/
    └── langNames.ts                               ← ISO code → display name

supabase/migrations/
├── 006_user_translation_settings.sql              ← Settings table
└── 007_user_dictionary_entries.sql                ← Entries table + FTS + RLS

docs/
└── PHASE-1-DICTIONARY-QA.md                       ← QA checklist per sprint
```

### 2.2. CHỈNH SỬA

```
public/manifest.json                               ← Add content_scripts, optional permissions
vite.config.ts                                     ← Multi-entry config (content script)
src/constants/storage.ts                           ← Add cache keys
src/pages/App.vue                                  ← Add DICTIONARY tab switcher
src/components/layout/SettingsModal.vue            ← Embed TranslationSettingsPanel
src/background.ts                                  ← Add message handlers cho translate/save
```

---

## 3. SQL Migrations — Supabase

> **Pattern follow**: `005_note_bodies.sql` — `fts` là cột thường + BEFORE trigger, `updated_at` qua trigger `retronote_update_updated_at()`, RLS `owner` policy.

### 3.1. `supabase/migrations/006_user_translation_settings.sql`

```sql
-- BBQOne: User translation preferences
-- Run in Supabase SQL Editor sau khi migrate 005.

CREATE TABLE IF NOT EXISTS user_translation_settings (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  native_language     TEXT NOT NULL DEFAULT 'vi',            -- ISO 639-1
  learning_languages  TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
  default_provider    TEXT NOT NULL DEFAULT 'chrome-local',  -- Phase 2 có thể = 'gemini'
  auto_detect         BOOLEAN NOT NULL DEFAULT TRUE,
  auto_save           BOOLEAN NOT NULL DEFAULT FALSE,        -- Phase 1 = manual save
  -- Phase 2 extension point (để sẵn, không dùng Phase 1)
  domain_overrides    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Trigger updated_at (reuse function đã có)
DROP TRIGGER IF EXISTS user_translation_settings_updated_at ON user_translation_settings;
CREATE TRIGGER user_translation_settings_updated_at
  BEFORE UPDATE ON user_translation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

-- RLS
ALTER TABLE user_translation_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_translation_settings_owner" ON user_translation_settings;
CREATE POLICY "user_translation_settings_owner" ON user_translation_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 3.2. `supabase/migrations/007_user_dictionary_entries.sql`

```sql
-- BBQOne: Personal dictionary entries
-- Phase 1 columns. Phase 2 sẽ add: starred, tags, mastery_level, review_count, last_reviewed_at

CREATE TABLE IF NOT EXISTS user_dictionary_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core translation (Phase 1)
  source_text        TEXT NOT NULL,
  source_lang        TEXT NOT NULL,         -- ISO 639-1, actual lang (auto-detected)
  target_lang        TEXT NOT NULL,
  translated_text    TEXT NOT NULL,

  -- Classification
  entry_type         TEXT NOT NULL DEFAULT 'word',    -- 'word' | 'phrase' | 'sentence'

  -- Provenance
  provider           TEXT NOT NULL DEFAULT 'chrome-local',
  source_url         TEXT DEFAULT '',                 -- URL khi quét
  source_context     TEXT DEFAULT '',                 -- 50 chars before/after

  -- User metadata (Phase 1 optional, Phase 2 enhance)
  custom_note        TEXT DEFAULT '',

  -- Phase 2 extension points (để sẵn, Phase 1 không set)
  enrichment         JSONB DEFAULT NULL,              -- {synonyms, examples, phonetic, grammar}
  starred            BOOLEAN NOT NULL DEFAULT FALSE,
  tags               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Phase 3 extension points (spaced repetition)
  mastery_level      SMALLINT NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 5),
  review_count       INT NOT NULL DEFAULT 0,
  last_reviewed_at   TIMESTAMPTZ DEFAULT NULL,

  -- FTS (cột thường + trigger — pattern 005)
  fts                tsvector,

  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS user_dictionary_user_id_idx
  ON user_dictionary_entries (user_id);
CREATE INDEX IF NOT EXISTS user_dictionary_user_created_idx
  ON user_dictionary_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_dictionary_fts_idx
  ON user_dictionary_entries USING gin (fts);
-- Prevent duplicate (same source text + langs per user)
CREATE UNIQUE INDEX IF NOT EXISTS user_dictionary_unique_source
  ON user_dictionary_entries (user_id, source_text, source_lang, target_lang);

-- FTS trigger
CREATE OR REPLACE FUNCTION public.user_dictionary_set_fts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fts := to_tsvector(
    'simple'::regconfig,  -- simple vì đa ngôn ngữ; english stemmer sẽ sai với vi/ja
    coalesce(NEW.source_text, '') || ' ' ||
    coalesce(NEW.translated_text, '') || ' ' ||
    coalesce(NEW.custom_note, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_dictionary_set_fts ON user_dictionary_entries;
CREATE TRIGGER user_dictionary_set_fts
  BEFORE INSERT OR UPDATE OF source_text, translated_text, custom_note
  ON user_dictionary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.user_dictionary_set_fts();

-- updated_at trigger
DROP TRIGGER IF EXISTS user_dictionary_updated_at ON user_dictionary_entries;
CREATE TRIGGER user_dictionary_updated_at
  BEFORE UPDATE ON user_dictionary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.retronote_update_updated_at();

-- RLS
ALTER TABLE user_dictionary_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_dictionary_entries_owner" ON user_dictionary_entries;
CREATE POLICY "user_dictionary_entries_owner" ON user_dictionary_entries
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## 4. Manifest.json — Full Migration

### 4.1. Nội dung mới đầy đủ

```json
{
  "manifest_version": 3,
  "name": "BBQOne",
  "version": "1.1.0",
  "description": "All-in-one: notes, bookmarks, dictionary. Vintage 1989.",
  "icons": {
    "16": "bbq_note-final.png",
    "32": "bbq_note-final.png",
    "48": "bbq_note-final.png",
    "128": "bbq_note-final.png"
  },
  "action": {
    "default_popup": "index.html",
    "default_icon": {
      "16": "bbq_note-final.png",
      "32": "bbq_note-final.png",
      "48": "bbq_note-final.png",
      "128": "bbq_note-final.png"
    }
  },
  "background": {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],
  "permissions": [
    "storage",
    "identity",
    "alarms",
    "clipboardWrite",
    "bookmarks",
    "downloads",
    "activeTab"
  ],
  "optional_permissions": [],
  "host_permissions": [
    "https://*.supabase.co/*"
  ],
  "optional_host_permissions": [
    "<all_urls>"
  ],
  "web_accessible_resources": [
    {
      "resources": ["assets/*", "src/content/*"],
      "matches": ["<all_urls>"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com"
  }
}
```

### 4.2. Diff summary

- **ADD** `content_scripts` — inject vào mọi URL
- **ADD** `activeTab` permission — đủ cho getSelection without full host access
- **ADD** `optional_host_permissions: <all_urls>` — user sẽ được prompt lần đầu dùng
- **ADD** `web_accessible_resources` — cho phép content script load assets

---

## 5. Vite Config — Multi-entry

`@crxjs/vite-plugin` tự động detect entries từ manifest (`background.service_worker`, `content_scripts`, `action.default_popup`). **Không cần thay đổi `vite.config.ts`** nếu em không có build customization đặc biệt.

**Nhưng verify:** Sau khi update manifest, chạy `npm run build` và check `dist/` phải có:
- `dist/index.html` (popup)
- `dist/src/background.ts.js` (hoặc tương tự)
- `dist/src/content/index.ts.js` (hoặc tương tự)
- `dist/manifest.json` (merged)

Nếu build lỗi, add explicit input:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [vue(), crx({ manifest })],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        popup: 'index.html',
      }
    }
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
})
```

---

## 6. Types — `src/types/dictionary.ts`

```typescript
// src/types/dictionary.ts

/** Supported ISO 639-1 language codes Phase 1 */
export type LangCode = 'vi' | 'en' | 'ja' | 'zh' | 'th' | 'ko' | 'fr' | 'de' | 'es'
export type LangCodeOrAuto = LangCode | 'auto'

export type EntryType = 'word' | 'phrase' | 'sentence'

/** Translation request shape — shared giữa providers */
export interface TranslationRequest {
  text: string
  sourceLang: LangCodeOrAuto
  targetLang: LangCode
  mode: 'quick' | 'deep'     // Phase 1: quick only. Phase 2: deep.
}

/** Translation result — shared */
export interface TranslationResult {
  sourceText: string
  sourceLang: LangCode          // detected if was 'auto'
  targetLang: LangCode
  translatedText: string
  provider: string              // 'chrome-local' | 'gemini' | ...
  confidence?: number           // 0..1, từ language detector
  /** Phase 2 enrichment — Phase 1 để undefined */
  enrichment?: TranslationEnrichment
}

export interface TranslationEnrichment {
  phonetic?: string
  synonyms?: string[]
  examples?: string[]
  grammar?: string
}

/** Provider interface — Strategy Pattern */
export interface ITranslationProvider {
  readonly name: string
  readonly supportsMode: ReadonlyArray<'quick' | 'deep'>
  isAvailable(req?: Pick<TranslationRequest, 'sourceLang' | 'targetLang'>): Promise<boolean>
  translate(req: TranslationRequest): Promise<TranslationResult>
}

/** Dictionary entry — row của user_dictionary_entries */
export interface DictionaryEntry {
  id: string
  user_id: string
  source_text: string
  source_lang: LangCode
  target_lang: LangCode
  translated_text: string
  entry_type: EntryType
  provider: string
  source_url: string
  source_context: string
  custom_note: string
  enrichment: TranslationEnrichment | null
  starred: boolean
  tags: string[]
  mastery_level: number
  review_count: number
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
}

/** User translation settings */
export interface TranslationSettings {
  user_id: string
  native_language: LangCode
  learning_languages: LangCode[]
  default_provider: string
  auto_detect: boolean
  auto_save: boolean
  domain_overrides: Record<string, { target?: LangCode }>  // Phase 2
  created_at: string
  updated_at: string
}

/** Message types giữa content script ↔ background ↔ popup */
export type DictMessage =
  | { type: 'translate'; payload: TranslationRequest }
  | { type: 'save-entry'; payload: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'fts'> }
  | { type: 'get-settings' }
  | { type: 'entry-exists'; payload: { source_text: string; source_lang: LangCode; target_lang: LangCode } }

export type DictMessageResponse<M extends DictMessage> =
  M extends { type: 'translate' } ? TranslationResult :
  M extends { type: 'save-entry' } ? { ok: true; entry: DictionaryEntry } | { ok: false; error: string } :
  M extends { type: 'get-settings' } ? TranslationSettings :
  M extends { type: 'entry-exists' } ? { exists: boolean; entryId?: string } :
  never
```

---

## 7. Provider Implementation — Chrome Local

### 7.1. `src/services/translator/providers/chrome-local.provider.ts`

```typescript
import type {
  ITranslationProvider,
  TranslationRequest,
  TranslationResult,
  LangCode,
  LangCodeOrAuto,
} from '@/types/dictionary'

// Chrome 138+ global types
declare const Translator: {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<
    'available' | 'downloadable' | 'downloading' | 'unavailable'
  >
  create(opts: {
    sourceLanguage: string
    targetLanguage: string
    monitor?: (m: EventTarget) => void
  }): Promise<{ translate(text: string): Promise<string> }>
}

declare const LanguageDetector: {
  availability(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
  create(): Promise<{
    detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>
  }>
}

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
```

### 7.2. `src/services/translator/translator.service.ts` — Registry

```typescript
import type { ITranslationProvider, TranslationRequest, TranslationResult } from '@/types/dictionary'
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
        return p.translate(req)
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
```

---

## 8. Dictionary Services

### 8.1. `src/services/dictionary/entries.service.ts`

```typescript
import { supabase } from '@/services/supabase'
import type { DictionaryEntry, LangCode } from '@/types/dictionary'

async function requireUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const dictionaryEntriesService = {
  async getAll(): Promise<DictionaryEntry[]> {
    const { data, error } = await supabase
      .from('user_dictionary_entries')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<DictionaryEntry> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('user_dictionary_entries')
      .insert({ ...input, user_id: userId })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async upsert(
    input: Omit<DictionaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<DictionaryEntry> {
    // Nếu đã tồn tại (user_id + source_text + source_lang + target_lang) → update translated_text
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('user_dictionary_entries')
      .upsert(
        { ...input, user_id: userId },
        { onConflict: 'user_id,source_text,source_lang,target_lang' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('user_dictionary_entries').delete().eq('id', id)
    if (error) throw error
  },

  async exists(
    source_text: string,
    source_lang: LangCode,
    target_lang: LangCode,
  ): Promise<{ exists: boolean; entryId?: string }> {
    const { data, error } = await supabase
      .from('user_dictionary_entries')
      .select('id')
      .eq('source_text', source_text)
      .eq('source_lang', source_lang)
      .eq('target_lang', target_lang)
      .maybeSingle()
    if (error) throw error
    return data ? { exists: true, entryId: data.id } : { exists: false }
  },

  async searchFullText(query: string): Promise<DictionaryEntry[]> {
    const q = query.trim()
    if (!q) return dictionaryEntriesService.getAll()

    const { data, error } = await supabase
      .from('user_dictionary_entries')
      .select('*')
      .textSearch('fts', q, { type: 'plain', config: 'simple' })
      .order('created_at', { ascending: false })

    if (error) {
      // Fallback substring
      const all = await dictionaryEntriesService.getAll()
      return filterEntriesBySubstring(all, q)
    }
    if (!data?.length) {
      const all = await dictionaryEntriesService.getAll()
      return filterEntriesBySubstring(all, q)
    }
    return data
  },
}

export function filterEntriesBySubstring(
  entries: DictionaryEntry[],
  query: string,
): DictionaryEntry[] {
  const lower = query.trim().toLowerCase()
  if (!lower) return []
  return entries.filter((e) =>
    e.source_text.toLowerCase().includes(lower) ||
    e.translated_text.toLowerCase().includes(lower) ||
    e.custom_note.toLowerCase().includes(lower),
  )
}
```

### 8.2. `src/services/dictionary/settings.service.ts`

```typescript
import { supabase } from '@/services/supabase'
import type { TranslationSettings } from '@/types/dictionary'

const DEFAULT_SETTINGS: Omit<TranslationSettings, 'user_id' | 'created_at' | 'updated_at'> = {
  native_language: 'vi',
  learning_languages: ['en'],
  default_provider: 'chrome-local',
  auto_detect: true,
  auto_save: false,
  domain_overrides: {},
}

async function requireUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export const translationSettingsService = {
  async getOrCreate(): Promise<TranslationSettings> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('user_translation_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    if (data) return data

    const { data: created, error: errCreate } = await supabase
      .from('user_translation_settings')
      .insert({ user_id: userId, ...DEFAULT_SETTINGS })
      .select()
      .single()
    if (errCreate) throw errCreate
    return created
  },

  async update(
    updates: Partial<Omit<TranslationSettings, 'user_id' | 'created_at' | 'updated_at'>>,
  ): Promise<TranslationSettings> {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('user_translation_settings')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
```

### 8.3. `src/services/dictionary/segmenter.ts`

```typescript
/** Split text thành câu dùng Intl.Segmenter (Chrome built-in). Fallback regex. */
export function segmentSentences(text: string, locale: string = 'en'): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  if ('Segmenter' in Intl) {
    try {
      const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
      return [...segmenter.segment(trimmed)]
        .map((s) => s.segment.trim())
        .filter(Boolean)
    } catch {
      // fallthrough
    }
  }
  // Fallback
  return trimmed.split(/(?<=[.!?。！？])\s+/).map((s) => s.trim()).filter(Boolean)
}

/** Quyết định entry_type dựa trên length */
export function classifyEntryType(text: string): 'word' | 'phrase' | 'sentence' {
  const trimmed = text.trim()
  const words = trimmed.split(/\s+/).length
  // CJK không có space → dùng char count
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(trimmed)

  if (isCJK) {
    if (trimmed.length <= 3) return 'word'
    if (trimmed.length <= 15) return 'phrase'
    return 'sentence'
  }

  if (words <= 1) return 'word'
  if (words <= 4) return 'phrase'
  return 'sentence'
}
```

---

## 9. Pinia Stores

### 9.1. `src/stores/dictionary.ts`

```typescript
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dictionaryEntriesService } from '@/services/dictionary/entries.service'
import type { DictionaryEntry } from '@/types/dictionary'

const DICT_CACHE_KEY = 'dictionary_cache'

export const useDictionaryStore = defineStore('dictionary', () => {
  const entries = ref<DictionaryEntry[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const searchQuery = ref('')

  const filteredEntries = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return entries.value
    return entries.value.filter((e) =>
      e.source_text.toLowerCase().includes(q) ||
      e.translated_text.toLowerCase().includes(q) ||
      e.custom_note.toLowerCase().includes(q),
    )
  })

  const totalCount = computed(() => entries.value.length)

  async function loadAll(): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      const rows = await dictionaryEntriesService.getAll()
      entries.value = rows
      await saveCache(rows)
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
      // Fallback cache
      const cached = await readCache()
      if (cached.length) entries.value = cached
    } finally {
      loading.value = false
    }
  }

  async function runSearch(q: string): Promise<void> {
    searchQuery.value = q.trim()
    if (!searchQuery.value) return
    // FTS search server-side — optional Phase 1, local filter đủ dùng cho < 5k entries
    // Phase 2: switch sang FTS server-side nếu local filter chậm
  }

  async function addLocalEntry(entry: DictionaryEntry): Promise<void> {
    // Insert sorted desc by created_at
    const exists = entries.value.findIndex((e) => e.id === entry.id)
    if (exists >= 0) entries.value.splice(exists, 1, entry)
    else entries.value.unshift(entry)
    await saveCache(entries.value)
  }

  async function removeEntry(id: string): Promise<void> {
    await dictionaryEntriesService.delete(id)
    entries.value = entries.value.filter((e) => e.id !== id)
    await saveCache(entries.value)
  }

  async function saveCache(rows: DictionaryEntry[]): Promise<void> {
    await chrome.storage.local.set({ [DICT_CACHE_KEY]: rows })
  }

  async function readCache(): Promise<DictionaryEntry[]> {
    const { [DICT_CACHE_KEY]: v } = await chrome.storage.local.get(DICT_CACHE_KEY)
    return Array.isArray(v) ? v : []
  }

  return {
    entries,
    loading,
    loadError,
    searchQuery,
    filteredEntries,
    totalCount,
    loadAll,
    runSearch,
    addLocalEntry,
    removeEntry,
  }
})
```

### 9.2. `src/stores/translationSettings.ts`

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { translationSettingsService } from '@/services/dictionary/settings.service'
import type { LangCode, TranslationSettings } from '@/types/dictionary'

export const useTranslationSettingsStore = defineStore('translationSettings', () => {
  const settings = ref<TranslationSettings | null>(null)
  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      settings.value = await translationSettingsService.getOrCreate()
    } finally {
      loading.value = false
    }
  }

  async function updateNativeLanguage(lang: LangCode): Promise<void> {
    settings.value = await translationSettingsService.update({ native_language: lang })
  }

  async function updateLearningLanguages(langs: LangCode[]): Promise<void> {
    settings.value = await translationSettingsService.update({ learning_languages: langs })
  }

  /**
   * Decide target language dựa trên native + learning settings.
   * Rule:
   *  - Detected lang ∈ learning_languages → target = native
   *  - Detected lang = native → target = first learning_language
   *  - Otherwise → target = native
   */
  function decideTargetLang(detectedLang: LangCode): LangCode {
    const s = settings.value
    if (!s) return 'vi'
    if (s.learning_languages.includes(detectedLang)) return s.native_language
    if (detectedLang === s.native_language) return s.learning_languages[0] ?? 'en'
    return s.native_language
  }

  return { settings, loading, load, updateNativeLanguage, updateLearningLanguages, decideTargetLang }
})
```

---

## 10. Content Script + Shadow DOM Popup

### 10.1. `src/content/index.ts` — Entry point

```typescript
import { SelectionDetector } from './selection-detector'
import { TriggerIcon } from './trigger-icon'
import { PopupHost } from './popup-host'

const detector = new SelectionDetector()
const icon = new TriggerIcon()
const popupHost = new PopupHost()

detector.onSelectionChange((selection) => {
  if (!selection || !selection.text.trim()) {
    icon.hide()
    return
  }
  icon.showNear(selection.rect)
  icon.onClick(() => {
    icon.hide()
    popupHost.show({
      text: selection.text,
      rect: selection.rect,
      pageUrl: location.href,
      contextBefore: selection.contextBefore,
      contextAfter: selection.contextAfter,
    })
  })
})
```

### 10.2. `src/content/selection-detector.ts`

```typescript
export interface Selection {
  text: string
  rect: DOMRect
  contextBefore: string  // 50 chars before
  contextAfter: string   // 50 chars after
}

export class SelectionDetector {
  private handlers: Array<(s: Selection | null) => void> = []
  private debounceTimer: number | null = null

  constructor() {
    document.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('keyup', this.onKeyUp)
  }

  onSelectionChange(handler: (s: Selection | null) => void): void {
    this.handlers.push(handler)
  }

  private onMouseUp = (): void => {
    this.debounce(() => this.emit())
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    // Chỉ trigger khi select bằng keyboard (shift+arrow)
    if (e.shiftKey) this.debounce(() => this.emit())
  }

  private debounce(fn: () => void): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(fn, 200)
  }

  private emit(): void {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      this.handlers.forEach((h) => h(null))
      return
    }
    const text = sel.toString().trim()
    if (!text || text.length > 500) {   // Phase 1 cap 500 chars
      this.handlers.forEach((h) => h(null))
      return
    }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const { before, after } = this.extractContext(range, 50)
    this.handlers.forEach((h) => h({ text, rect, contextBefore: before, contextAfter: after }))
  }

  private extractContext(range: Range, maxChars: number): { before: string; after: string } {
    try {
      const full = range.startContainer.textContent ?? ''
      const start = range.startOffset
      const end = range.endOffset
      return {
        before: full.slice(Math.max(0, start - maxChars), start).trim(),
        after: full.slice(end, end + maxChars).trim(),
      }
    } catch {
      return { before: '', after: '' }
    }
  }
}
```

### 10.3. `src/content/trigger-icon.ts`

```typescript
/**
 * Small floating icon near selection. Click → open popup.
 * Pure DOM (không Vue để bundle nhỏ). Inject trực tiếp vào <body>.
 */
const ICON_ID = '__bbq_one_translate_icon__'

export class TriggerIcon {
  private el: HTMLElement | null = null
  private clickHandler: (() => void) | null = null

  showNear(rect: DOMRect): void {
    this.ensureElement()
    if (!this.el) return
    const top = window.scrollY + rect.bottom + 4
    const left = window.scrollX + rect.right - 20
    this.el.style.top = `${top}px`
    this.el.style.left = `${left}px`
    this.el.style.display = 'flex'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }

  onClick(handler: () => void): void {
    this.clickHandler = handler
  }

  private ensureElement(): void {
    if (this.el) return
    const el = document.createElement('div')
    el.id = ICON_ID
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', 'Translate with BBQOne')
    Object.assign(el.style, {
      position: 'absolute',
      zIndex: '2147483647',
      width: '24px',
      height: '24px',
      background: '#1a1a0e',
      color: '#f0c040',
      border: '1px solid #3a3020',
      borderRadius: '0',
      fontFamily: 'IBM Plex Mono, Courier New, monospace',
      fontSize: '11px',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>)
    el.textContent = 'T>'
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.clickHandler?.()
    })
    document.body.appendChild(el)
    this.el = el
  }
}
```

### 10.4. `src/content/popup-host.ts` + `TranslatePopup.vue`

```typescript
// src/content/popup-host.ts
import { createApp, h } from 'vue'
import TranslatePopup from './TranslatePopup.vue'
import popupStyles from './popup-styles.css?inline'

const HOST_ID = '__bbq_one_popup_host__'

export interface PopupShowArgs {
  text: string
  rect: DOMRect
  pageUrl: string
  contextBefore: string
  contextAfter: string
}

export class PopupHost {
  private host: HTMLElement | null = null
  private shadow: ShadowRoot | null = null
  private mountPoint: HTMLElement | null = null
  private app: ReturnType<typeof createApp> | null = null

  show(args: PopupShowArgs): void {
    this.ensure()
    if (!this.app || !this.mountPoint) return
    // Re-mount với new props
    this.app.unmount()
    this.app = createApp({
      render: () =>
        h(TranslatePopup, {
          ...args,
          onClose: () => this.hide(),
        }),
    })
    this.app.mount(this.mountPoint)
  }

  hide(): void {
    if (this.app) {
      this.app.unmount()
      this.app = null
    }
    if (this.host) this.host.style.display = 'none'
  }

  private ensure(): void {
    if (this.host) {
      this.host.style.display = 'block'
      return
    }
    const host = document.createElement('div')
    host.id = HOST_ID
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      zIndex: '2147483647',
    } satisfies Partial<CSSStyleDeclaration>)
    const shadow = host.attachShadow({ mode: 'open' })
    const styleEl = document.createElement('style')
    styleEl.textContent = popupStyles
    shadow.appendChild(styleEl)
    const mount = document.createElement('div')
    mount.className = 'bbq-popup-mount'
    shadow.appendChild(mount)
    document.body.appendChild(host)

    this.host = host
    this.shadow = shadow
    this.mountPoint = mount
    this.app = createApp({ render: () => null })
    this.app.mount(mount)
  }
}
```

```vue
<!-- src/content/TranslatePopup.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TranslationResult } from '@/types/dictionary'
import { translatorService } from '@/services/translator/translator.service'
import { classifyEntryType } from '@/services/dictionary/segmenter'

const props = defineProps<{
  text: string
  rect: DOMRect
  pageUrl: string
  contextBefore: string
  contextAfter: string
  onClose: () => void
}>()

const loading = ref(true)
const error = ref<string | null>(null)
const result = ref<TranslationResult | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const alreadySaved = ref(false)

const position = ref({ top: 0, left: 0 })

function calcPosition(): void {
  const top = window.scrollY + props.rect.bottom + 8
  const left = Math.min(
    window.scrollX + props.rect.left,
    window.scrollX + window.innerWidth - 340,
  )
  position.value = { top, left }
}

async function checkExists(src: string, srcLang: string, tgtLang: string) {
  const resp = await chrome.runtime.sendMessage({
    type: 'entry-exists',
    payload: { source_text: src, source_lang: srcLang, target_lang: tgtLang },
  })
  alreadySaved.value = !!resp?.exists
}

async function doTranslate(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    // Query settings qua background để biết targetLang
    const settings = await chrome.runtime.sendMessage({ type: 'get-settings' })
    const targetLang = settings.native_language
    // Gọi trực tiếp translatorService (content script có access)
    const r = await translatorService.translate({
      text: props.text,
      sourceLang: 'auto',
      targetLang,
      mode: 'quick',
    })
    result.value = r
    await checkExists(r.sourceText, r.sourceLang, r.targetLang)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function doSave(): Promise<void> {
  if (!result.value) return
  saveState.value = 'saving'
  const r = result.value
  const resp = await chrome.runtime.sendMessage({
    type: 'save-entry',
    payload: {
      source_text: r.sourceText,
      source_lang: r.sourceLang,
      target_lang: r.targetLang,
      translated_text: r.translatedText,
      entry_type: classifyEntryType(r.sourceText),
      provider: r.provider,
      source_url: props.pageUrl,
      source_context: `${props.contextBefore} [SEL] ${props.contextAfter}`.trim(),
      custom_note: '',
      enrichment: null,
      starred: false,
      tags: [],
      mastery_level: 0,
      review_count: 0,
      last_reviewed_at: null,
    },
  })
  if (resp?.ok) {
    saveState.value = 'saved'
    alreadySaved.value = true
  } else {
    saveState.value = 'error'
  }
}

onMounted(() => {
  calcPosition()
  void doTranslate()
})
</script>

<template>
  <div class="bbq-popup" :style="{ top: position.top + 'px', left: position.left + 'px' }">
    <div class="bbq-popup__header">
      <span class="bbq-popup__brand">BBQ &gt;</span>
      <button class="bbq-popup__close" @click="props.onClose">×</button>
    </div>
    <div class="bbq-popup__body">
      <div v-if="loading" class="bbq-popup__loading">Translating...</div>
      <div v-else-if="error" class="bbq-popup__error">[ERROR] {{ error }}</div>
      <template v-else-if="result">
        <div class="bbq-popup__source">
          <span class="bbq-popup__lang">{{ result.sourceLang }}</span>
          <span>{{ result.sourceText }}</span>
        </div>
        <div class="bbq-popup__arrow">↓</div>
        <div class="bbq-popup__translated">
          <span class="bbq-popup__lang">{{ result.targetLang }}</span>
          <span>{{ result.translatedText }}</span>
        </div>
        <div class="bbq-popup__actions">
          <button
            v-if="!alreadySaved && saveState !== 'saved'"
            class="bbq-popup__btn"
            :disabled="saveState === 'saving'"
            @click="doSave"
          >
            {{ saveState === 'saving' ? 'SAVING...' : '[SAVE]' }}
          </button>
          <span v-else class="bbq-popup__saved">✓ SAVED</span>
        </div>
      </template>
    </div>
  </div>
</template>
```

### 10.5. `src/content/popup-styles.css`

```css
/* Shadow DOM isolated — auto dark/light theo prefers-color-scheme */
:host { all: initial; }

.bbq-popup {
  position: absolute;
  width: 320px;
  font-family: 'IBM Plex Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  background: var(--bbq-bg, #1a1a0e);
  color: var(--bbq-text, #e8d5a3);
  border: 1px solid var(--bbq-border, #3a3020);
  border-radius: 0;
  box-shadow: none;
  z-index: 2147483647;
}

@media (prefers-color-scheme: light) {
  .bbq-popup {
    --bbq-bg: #fdf6e3;
    --bbq-text: #1a1a0e;
    --bbq-border: #a89060;
    --bbq-accent: #b8860b;
  }
}

.bbq-popup__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid var(--bbq-border, #3a3020);
}
.bbq-popup__brand {
  color: var(--bbq-accent, #f0c040);
  font-weight: bold;
  font-size: 11px;
}
.bbq-popup__close {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}
.bbq-popup__body { padding: 10px; }
.bbq-popup__loading,
.bbq-popup__error { font-size: 12px; opacity: 0.8; }
.bbq-popup__source,
.bbq-popup__translated {
  padding: 6px 0;
}
.bbq-popup__lang {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 6px;
  font-size: 10px;
  color: var(--bbq-accent, #f0c040);
  border: 1px solid var(--bbq-border, #3a3020);
  text-transform: uppercase;
}
.bbq-popup__arrow {
  text-align: center;
  opacity: 0.5;
  font-size: 12px;
  margin: 2px 0;
}
.bbq-popup__actions {
  margin-top: 8px;
  border-top: 1px solid var(--bbq-border, #3a3020);
  padding-top: 8px;
  display: flex;
  justify-content: flex-end;
}
.bbq-popup__btn {
  background: transparent;
  color: var(--bbq-accent, #f0c040);
  border: 1px solid var(--bbq-border, #3a3020);
  font-family: inherit;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}
.bbq-popup__btn:hover:not(:disabled) {
  background: var(--bbq-accent, #f0c040);
  color: var(--bbq-bg, #1a1a0e);
}
.bbq-popup__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bbq-popup__saved {
  color: #27ae60;
  font-size: 11px;
}
```

---

## 11. Background Message Broker

`src/background.ts` — **update** (giữ sync logic cũ, add handlers mới):

```typescript
import { syncService } from '@/services/sync.service'
import { dictionaryEntriesService } from '@/services/dictionary/entries.service'
import { translationSettingsService } from '@/services/dictionary/settings.service'
import type { DictMessage } from '@/types/dictionary'

const ALARM_NAME = 'bbqnote-daily-sync'

function ensureDailyAlarm(): void {
  void chrome.alarms.get(ALARM_NAME, (a) => {
    if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 24 * 60 })
  })
}

chrome.runtime.onInstalled.addListener(ensureDailyAlarm)
chrome.runtime.onStartup.addListener(ensureDailyAlarm)

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return
  void syncService.syncFromCache()
})

// NEW: Message handlers cho content script
chrome.runtime.onMessage.addListener((msg: DictMessage, _sender, sendResponse) => {
  ;(async () => {
    try {
      switch (msg.type) {
        case 'get-settings': {
          const s = await translationSettingsService.getOrCreate()
          sendResponse(s)
          break
        }
        case 'save-entry': {
          const entry = await dictionaryEntriesService.upsert(msg.payload)
          sendResponse({ ok: true, entry })
          break
        }
        case 'entry-exists': {
          const r = await dictionaryEntriesService.exists(
            msg.payload.source_text,
            msg.payload.source_lang,
            msg.payload.target_lang,
          )
          sendResponse(r)
          break
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' })
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  return true   // async response
})
```

---

## 12. Popup UI — Dictionary Tab

### 12.1. Update `src/pages/App.vue` tab switcher

Locate dòng `const activeTab = ref<'notes' | 'bookmarks'>('notes')` → thay thành:

```typescript
const activeTab = ref<'notes' | 'bookmarks' | 'dictionary'>('notes')
```

Thêm button tab "DICTIONARY" cạnh các tab hiện có. Khi active → render `<DictionaryTab />`:

```vue
<button
  class="tab-button"
  :class="{ active: activeTab === 'dictionary' }"
  @click="activeTab = 'dictionary'"
>
  [ DICTIONARY ]
</button>

<!-- ... -->

<DictionaryTab v-if="activeTab === 'dictionary'" />
```

Import:

```typescript
import DictionaryTab from '@/components/dictionary/DictionaryTab.vue'
```

### 12.2. `src/components/dictionary/DictionaryTab.vue`

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useDictionaryStore } from '@/stores/dictionary'
import DictionarySearchBar from './DictionarySearchBar.vue'
import DictionaryEntryItem from './DictionaryEntryItem.vue'

const store = useDictionaryStore()

onMounted(() => {
  void store.loadAll()
})
</script>

<template>
  <div class="dict-tab">
    <div class="dict-tab__header">
      <span>DICTIONARY ({{ store.totalCount }})</span>
    </div>
    <DictionarySearchBar v-model="store.searchQuery" />
    <div v-if="store.loading" class="dict-tab__state">Loading...</div>
    <div v-else-if="store.loadError" class="dict-tab__state">[ERROR] {{ store.loadError }}</div>
    <div v-else-if="!store.filteredEntries.length" class="dict-tab__state">
      {{ store.searchQuery ? 'No matches.' : 'Dictionary empty. Translate something!' }}
    </div>
    <div v-else class="dict-tab__list">
      <DictionaryEntryItem
        v-for="entry in store.filteredEntries"
        :key="entry.id"
        :entry="entry"
        @delete="store.removeEntry(entry.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.dict-tab { display: flex; flex-direction: column; height: 100%; }
.dict-tab__header {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  color: var(--accent);
  font-size: 11px;
}
.dict-tab__state {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}
.dict-tab__list { flex: 1; overflow-y: auto; }
</style>
```

### 12.3. `src/components/dictionary/DictionaryEntryItem.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { DictionaryEntry } from '@/types/dictionary'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'

defineProps<{ entry: DictionaryEntry }>()
const emit = defineEmits<{ delete: [] }>()

const expanded = ref(false)
const confirming = ref(false)

function toggle() { expanded.value = !expanded.value }
function askDelete() { confirming.value = true }
async function confirmDelete() {
  confirming.value = false
  emit('delete')
}
</script>

<template>
  <div class="entry" @click="toggle">
    <div class="entry__row">
      <span class="entry__lang">{{ entry.source_lang }}→{{ entry.target_lang }}</span>
      <span class="entry__src">{{ entry.source_text }}</span>
      <span class="entry__sep">│</span>
      <span class="entry__trg">{{ entry.translated_text }}</span>
    </div>
    <div v-if="expanded" class="entry__meta">
      <div v-if="entry.source_context" class="entry__context">{{ entry.source_context }}</div>
      <div v-if="entry.source_url" class="entry__url">
        <a :href="entry.source_url" target="_blank" rel="noopener">{{ entry.source_url }}</a>
      </div>
      <div class="entry__actions">
        <button class="entry__btn" @click.stop="askDelete">[ DELETE ]</button>
      </div>
    </div>
    <RetroConfirm
      v-if="confirming"
      message="Delete this entry?"
      @confirm="confirmDelete"
      @cancel="confirming = false"
    />
  </div>
</template>

<style scoped>
.entry {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: 12px;
}
.entry:hover { background: rgba(240, 192, 64, 0.05); }
.entry__row { display: flex; gap: 6px; align-items: center; }
.entry__lang {
  font-size: 10px;
  color: var(--accent);
  border: 1px solid var(--border);
  padding: 0 4px;
  text-transform: uppercase;
}
.entry__src { color: var(--text-primary); }
.entry__sep { color: var(--text-muted); }
.entry__trg { color: var(--text-secondary); flex: 1; }
.entry__meta { padding: 6px 0 0 30px; font-size: 11px; color: var(--text-muted); }
.entry__url a { color: var(--accent); word-break: break-all; }
.entry__actions { margin-top: 6px; }
.entry__btn {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--border);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  cursor: pointer;
}
</style>
```

### 12.4. `src/components/dictionary/DictionarySearchBar.vue`

Simple wrapper quanh `RetroInput`, bind `v-model`:

```vue
<script setup lang="ts">
import RetroInput from '@/components/ui/RetroInput.vue'
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="dict-search">
    <RetroInput v-model="model" placeholder="SEARCH dictionary..." />
  </div>
</template>

<style scoped>
.dict-search { padding: 6px 8px; border-bottom: 1px solid var(--border); }
</style>
```

### 12.5. `src/components/dictionary/TranslationSettingsPanel.vue`

Embed vào `SettingsModal.vue`. User set `native_language` + `learning_languages[]`.

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useTranslationSettingsStore } from '@/stores/translationSettings'
import type { LangCode } from '@/types/dictionary'

const settingsStore = useTranslationSettingsStore()

const LANGS: Array<{ code: LangCode; label: string }> = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'th', label: 'ไทย' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
]

const native = ref<LangCode>('vi')
const learning = ref<LangCode[]>(['en'])

onMounted(async () => {
  await settingsStore.load()
  if (settingsStore.settings) {
    native.value = settingsStore.settings.native_language
    learning.value = [...settingsStore.settings.learning_languages]
  }
})

watch(native, async (v) => { await settingsStore.updateNativeLanguage(v) })
watch(learning, async (v) => { await settingsStore.updateLearningLanguages([...v]) }, { deep: true })

function toggleLearning(code: LangCode) {
  const i = learning.value.indexOf(code)
  if (i >= 0) learning.value.splice(i, 1)
  else learning.value.push(code)
}
</script>

<template>
  <div class="tsp">
    <div class="tsp__section">
      <div class="tsp__label">NATIVE LANGUAGE</div>
      <select v-model="native" class="tsp__select">
        <option v-for="l in LANGS" :key="l.code" :value="l.code">
          {{ l.label }} ({{ l.code.toUpperCase() }})
        </option>
      </select>
    </div>
    <div class="tsp__section">
      <div class="tsp__label">LEARNING LANGUAGES</div>
      <div class="tsp__checks">
        <label
          v-for="l in LANGS.filter(x => x.code !== native)"
          :key="l.code"
          class="tsp__check"
        >
          <input
            type="checkbox"
            :checked="learning.includes(l.code)"
            @change="toggleLearning(l.code)"
          />
          <span>{{ l.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tsp { padding: 8px; }
.tsp__section { margin-bottom: 12px; }
.tsp__label {
  font-size: 10px;
  color: var(--accent);
  margin-bottom: 4px;
  text-transform: uppercase;
}
.tsp__select {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 0;
  font-family: inherit;
  font-size: 12px;
  padding: 4px;
  width: 100%;
}
.tsp__checks { display: flex; flex-wrap: wrap; gap: 6px; }
.tsp__check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}
</style>
```

---

## 13. Constants Update

`src/constants/storage.ts` — **add**:

```typescript
export const DICTIONARY_CACHE_KEY = 'dictionary_cache'
export const TRANSLATION_SETTINGS_CACHE_KEY = 'translation_settings_cache'
```

---

## 14. Sprint Breakdown

### 🏁 Sprint 1 — Foundation (Ngày 1-4)

**Goal**: DB + types + provider abstraction + Chrome API integration (không UI)

**Tasks**:
- [ ] Run SQL migrations 006, 007 trên Supabase
- [ ] Create `src/types/dictionary.ts`
- [ ] Create `src/services/translator/types.ts`, `providers/chrome-local.provider.ts`, `translator.service.ts`
- [ ] Create `src/services/dictionary/entries.service.ts`, `settings.service.ts`, `segmenter.ts`
- [ ] Update `src/constants/storage.ts`
- [ ] Update `public/manifest.json` (content_scripts, permissions)
- [ ] Smoke test: Console của popup chạy được `translatorService.translate({text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'quick'})` và return kết quả

**Acceptance Criteria**:
- [ ] `npm run build` OK, không TS error
- [ ] Extension load được, không warning manifest
- [ ] Chạy manual test trong popup devtools: translate "hello" → "xin chào"
- [ ] Supabase: bảng `user_dictionary_entries`, `user_translation_settings` exist, RLS policies active
- [ ] Manual insert 1 entry qua Supabase client → read back qua `dictionaryEntriesService.getAll()`

### 🏁 Sprint 2 — Content Script + Floating Popup (Ngày 5-9)

**Goal**: Quét text trên web → popup dịch → save được vào Supabase

**Tasks**:
- [ ] Create `src/content/` toàn bộ 5 files
- [ ] Update `src/background.ts` thêm message handlers
- [ ] Create Pinia stores `dictionary.ts`, `translationSettings.ts`
- [ ] Add utils `langNames.ts`
- [ ] Test Shadow DOM popup trên: Google Docs, Wikipedia, Reddit, YouTube comments

**Acceptance Criteria**:
- [ ] Select text bất kỳ → icon `T>` hiện cạnh selection
- [ ] Click icon → floating popup hiện trong 500ms với kết quả dịch
- [ ] Save button lưu thành công → check Supabase row được create
- [ ] Re-select cùng text → popup hiển thị "✓ SAVED" (dùng `entry-exists`)
- [ ] Popup không bị CSS của trang web ảnh hưởng (verify trên GitHub, Figma)
- [ ] Popup auto dark/light theo `prefers-color-scheme`
- [ ] Close popup (×) → DOM được cleanup hoàn toàn
- [ ] Content script không làm chậm trang host (< 5ms idle impact)

### 🏁 Sprint 3 — Popup Dictionary Tab + Settings (Ngày 10-14)

**Goal**: Tab DICTIONARY trong popup với list/search/delete + Settings panel

**Tasks**:
- [ ] Create `src/components/dictionary/` 4 components
- [ ] Update `src/pages/App.vue` tab switcher
- [ ] Update `src/components/layout/SettingsModal.vue` embed `TranslationSettingsPanel`
- [ ] QA end-to-end: quét → save → mở popup → thấy entry
- [ ] Viết QA checklist markdown

**Acceptance Criteria**:
- [ ] Tab DICTIONARY hiện cạnh NOTES, BOOKMARKS
- [ ] Click tab → load entries (cache-first, server-refresh)
- [ ] Search bar filter real-time (client-side)
- [ ] Expand entry → show context + source URL + delete button
- [ ] Delete → confirm modal → remove khỏi list và Supabase
- [ ] Settings modal → change native_language → next translate dùng target mới
- [ ] Empty state rõ ràng ("Dictionary empty. Translate something!")
- [ ] Không lỗi console trong cả popup lẫn content script
- [ ] Build prod bundle < 800KB total

---

## 15. QA Checklist — File `docs/PHASE-1-DICTIONARY-QA.md`

```markdown
# Phase 1 Dictionary — QA Checklist

## Environment
- [ ] Chrome 138+ (check chrome://version)
- [ ] Translator API: `'Translator' in self === true` trong DevTools console
- [ ] LanguageDetector API: `'LanguageDetector' in self === true`
- [ ] Logged in Supabase (user_id present)

## Sprint 1 Tests
### Unit
- [ ] `translatorService.translate({text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'quick'})` → `{translatedText: 'xin chào' | 'chào', provider: 'chrome-local'}`
- [ ] `translatorService.translate({text: 'bonjour', sourceLang: 'auto', targetLang: 'vi', mode: 'quick'})` → sourceLang detected as 'fr'
- [ ] `translatorService.translate({text: 'hello', sourceLang: 'en', targetLang: 'en', mode: 'quick'})` → translatedText === sourceText (same lang short-circuit)
- [ ] `translatorService.translate({text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'deep'})` → throw "No provider supports mode: deep" (expected Phase 1)
- [ ] `segmentSentences('Hello. How are you?')` → 2 segments
- [ ] `segmentSentences('今日は晴れです。明日は雨です。', 'ja')` → 2 segments
- [ ] `classifyEntryType('hello')` → 'word'
- [ ] `classifyEntryType('good morning')` → 'phrase'
- [ ] `classifyEntryType('I want to go home tonight because I am tired')` → 'sentence'

### DB
- [ ] Insert entry via service → row appears in Supabase
- [ ] Insert duplicate (same source/source_lang/target_lang) → upsert, 1 row only
- [ ] Other user query → 0 rows (RLS verify)
- [ ] FTS search works: `entries.service.searchFullText('hello')` returns matching rows

## Sprint 2 Tests
### Functional
- [ ] Visit https://en.wikipedia.org/wiki/Translation → select word → icon appears
- [ ] Click icon → popup opens within 500ms
- [ ] Popup shows: source, source_lang badge, translated, target_lang badge, Save button
- [ ] Save → toast "✓ SAVED", button disabled
- [ ] Re-select same word → popup opens showing "✓ SAVED" state (entry-exists worked)
- [ ] Select empty → icon hides
- [ ] Select > 500 chars → icon does NOT appear (cap)
- [ ] ESC or × closes popup
- [ ] Multiple popups: select new word while popup open → old popup replaced, not stacked

### Cross-site
Test on: Wikipedia, GitHub, Gmail, Google Docs, YouTube, Twitter, Reddit, Figma, AWS Docs
- [ ] Popup renders correctly on all (no CSS bleed)
- [ ] No errors in host page console
- [ ] No errors in extension service worker console

### Performance
- [ ] Translate latency < 300ms (after first model download)
- [ ] Content script adds < 50KB to page memory
- [ ] No memory leak after 20 select/translate/close cycles

## Sprint 3 Tests
### Popup Dictionary Tab
- [ ] Open popup → click DICTIONARY tab → entries load within 500ms
- [ ] Cache hit: close popup, open again → entries show instantly (< 50ms)
- [ ] Search "hello" → filters real-time
- [ ] Click entry → expands, shows context + URL
- [ ] Click URL → opens in new tab
- [ ] Delete → confirm → entry removed
- [ ] Empty search result → "No matches."
- [ ] Empty dictionary → "Dictionary empty. Translate something!"

### Settings
- [ ] Open Settings modal → TranslationSettingsPanel visible
- [ ] Change native_language VI → EN → settings saved (refresh popup, still EN)
- [ ] Toggle learning_language JA → saved
- [ ] After change native → EN: translate "xin chào" (auto detected VI) → target now EN

### Regression
- [ ] Notes tab still works
- [ ] Bookmarks tab still works
- [ ] Sync worker still runs (check chrome://extensions → service worker → console)
```

---

## 16. Cursor Prompts — Ready-to-paste

### Prompt cho Sprint 1

```
Implement Sprint 1 of BBQOne Phase 1 Dictionary feature.

Read the full spec in CURSOR-PROMPT-DICTIONARY-PHASE-1.md (attached).

Scope Sprint 1 only — do NOT implement content script or popup UI:
- SQL migrations 006, 007 (section 3)
- Types dictionary.ts (section 6)
- Translator service + Chrome Local provider (section 7)
- Dictionary services: entries, settings, segmenter (section 8)
- Update constants/storage.ts (section 13)
- Update manifest.json (section 4)

After implementation, run `npm run type-check` and fix all errors.
Do NOT touch src/content/, src/components/dictionary/, src/stores/dictionary.ts, src/stores/translationSettings.ts, src/background.ts in this sprint.

Verification: after build, run the smoke tests listed in section 15 "Sprint 1 Tests". Provide output.
```

### Prompt cho Sprint 2

```
Implement Sprint 2 of BBQOne Phase 1 Dictionary.

Prerequisites: Sprint 1 merged and smoke tests pass.

Read the full spec in CURSOR-PROMPT-DICTIONARY-PHASE-1.md (attached).

Scope Sprint 2:
- src/content/ directory (all 5 files, section 10)
- src/stores/dictionary.ts, src/stores/translationSettings.ts (section 9)
- src/utils/langNames.ts (map ISO code → display name)
- Update src/background.ts with message handlers (section 11)

Do NOT touch popup UI (DictionaryTab, SettingsPanel) in this sprint — that's Sprint 3.

For the Chrome Translator API types, the official signatures are in section 7.1. If TypeScript complains about `Translator` or `LanguageDetector` globals, add ambient declarations in a `src/types/chrome-ai.d.ts` file.

Verification: run manual tests from section 15 "Sprint 2 Tests" on at least Wikipedia + GitHub + YouTube. Report findings including screenshots of the floating popup in both dark and light themes.
```

### Prompt cho Sprint 3

```
Implement Sprint 3 of BBQOne Phase 1 Dictionary — final sprint.

Prerequisites: Sprint 1 + 2 merged.

Read the full spec in CURSOR-PROMPT-DICTIONARY-PHASE-1.md (attached).

Scope Sprint 3:
- src/components/dictionary/ (4 files, section 12)
- Update src/pages/App.vue tab switcher (section 12.1)
- Update src/components/layout/SettingsModal.vue to embed TranslationSettingsPanel
- Create docs/PHASE-1-DICTIONARY-QA.md with content from section 15

Ensure:
- Existing tabs (NOTES, BOOKMARKS) still work unchanged
- Dictionary cache persists across popup close/open
- Search filters client-side (Phase 1 — server FTS Phase 2)

Verification: complete full QA checklist from docs/PHASE-1-DICTIONARY-QA.md, report results. Flag any acceptance criteria NOT met so we decide whether to fix in Sprint 3 or move to Phase 1.5.
```

---

## 17. Phase 2 Extension Points — Documented

Để Phase 2 em chỉ cần hiểu code Phase 1 là plug được, anh note các điểm sẽ extend:

### 17.1. Add Gemini Provider

Tạo `src/services/translator/providers/gemini.provider.ts` implement `ITranslationProvider` với `supportsMode = ['deep'] as const`. Register sau ChromeLocal:

```typescript
// src/services/translator/translator.service.ts (Phase 2 change — 1 line)
import { GeminiProvider } from './providers/gemini.provider'
translatorService.register(new GeminiProvider())
```

### 17.2. Enrichment in Popup

`TranslatePopup.vue` đã sẵn state `result.enrichment`. Phase 2 chỉ cần:
- Thêm button "[ DEEP ]" cạnh Save
- Click → gọi `translatorService.translate({..., mode: 'deep'})` → render `enrichment.synonyms`, `enrichment.examples` bên dưới

### 17.3. DB Schema

Đã có sẵn:
- `enrichment JSONB` — lưu synonyms/examples/phonetic
- `starred BOOLEAN`, `tags TEXT[]` — cho organize
- `mastery_level`, `review_count`, `last_reviewed_at` — cho spaced repetition

Chỉ cần write to những columns này khi có feature mới, không migrate.

### 17.4. n8n Cold Path

Khi user save entry (Phase 1 flow), background có thể fire `chrome.runtime.sendMessage` → call n8n webhook async. n8n enrich → PATCH entry với `enrichment` jsonb. Popup next time mở sẽ thấy enrichment đã có.

---

## 18. Phase 1 Exit Criteria

Phase 1 được coi là **DONE** khi:

1. ✅ Extension build prod, load Chrome, không warning manifest
2. ✅ Quét text trên 5 sites khác nhau → popup dịch trong 500ms
3. ✅ Save 10 entries thực tế → list popup hiện đủ 10
4. ✅ Search filter hoạt động
5. ✅ Delete entry → sync Supabase
6. ✅ Settings: change native lang → translate reflects
7. ✅ Existing Notes + Bookmarks không regression
8. ✅ `npm run type-check` pass
9. ✅ QA checklist 100% pass (có thể defer 1-2 edge cases không critical)
10. ✅ Em dùng thật 3-5 ngày → list feedback cho Phase 2

**Sau Phase 1**: STOP. Dùng ít nhất 1 tuần. Collect real pain points. Rồi mới quyết Phase 2 scope dựa trên usage, không dựa trên ý tưởng.

---

## 19. Tips for Cursor

1. **Always read the section referenced** trước khi code — đừng auto-generate
2. **TypeScript strict** — project đang `strict: true`, không được `any` bừa
3. **Pattern matching** — follow pattern có sẵn (xem `notes.service.ts`, `bookmarks.service.ts`) trước khi viết mới
4. **CSS** — dùng CSS variables có sẵn trong `retro.css`, không hardcode color
5. **Test sau mỗi file** — đừng code 20 file rồi mới build
6. **Git commit per task** — dễ rollback nếu sai

---

**END OF PHASE 1 SPEC**

Total estimated effort: 10-14 ngày (1 dev, part-time). Có thể compress 7-8 ngày nếu full-time.

Phase 2 spec sẽ được viết sau khi Phase 1 ship và có real usage data.
