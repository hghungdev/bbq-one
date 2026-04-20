# Phase 1 Dictionary — QA Checklist

> **Extension**: BBQ-One v1.1.0
> **Chrome requirement**: 138+ (Translation API stable)
> **Tester**: ___________  **Date**: ___________

---

## Environment Setup

- [ ] Chrome 138+ — check `chrome://version`
- [ ] Translation API enabled: `'Translator' in self === true` in DevTools console (any tab)
- [ ] Language Detector API: `'LanguageDetector' in self === true` in DevTools console
- [ ] Extension loaded from `dist/` via `chrome://extensions` (Developer mode, Load unpacked)
- [ ] Logged in to BBQ-One (Supabase auth session active)
- [ ] Supabase tables `user_dictionary_entries` + `user_translation_settings` exist (migrations 006, 007 run)

---

## Sprint 1 Tests — Foundation

### Unit (run in popup DevTools console after loading extension)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1.1 | `translatorService.translate({text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'quick'})` | `{translatedText: 'xin chào'\|'chào', provider: 'chrome-local'}` | ☐ |
| 1.2 | `translatorService.translate({text: 'bonjour', sourceLang: 'auto', targetLang: 'vi', mode: 'quick'})` | `sourceLang === 'fr'` | ☐ |
| 1.3 | `translatorService.translate({text: 'hello', sourceLang: 'en', targetLang: 'en', mode: 'quick'})` | `translatedText === 'hello'` (same-lang short-circuit) | ☐ |
| 1.4 | `translatorService.translate({text: 'hello', sourceLang: 'en', targetLang: 'vi', mode: 'deep'})` | Throws `"No provider supports mode: deep"` | ☐ |
| 1.5 | `segmentSentences('Hello. How are you?')` | 2 segments | ☐ |
| 1.6 | `segmentSentences('今日は晴れです。明日は雨です。', 'ja')` | 2 segments | ☐ |
| 1.7 | `classifyEntryType('hello')` | `'word'` | ☐ |
| 1.8 | `classifyEntryType('good morning')` | `'phrase'` | ☐ |
| 1.9 | `classifyEntryType('I want to go home tonight because I am tired')` | `'sentence'` | ☐ |

### DB Verification (Supabase SQL Editor)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1.10 | Insert entry via `dictionaryEntriesService.create(...)` | Row appears in `user_dictionary_entries` | ☐ |
| 1.11 | Insert duplicate (same source/source_lang/target_lang) via `upsert` | 1 row only (upsert works) | ☐ |
| 1.12 | Query from another user session | 0 rows returned (RLS policy active) | ☐ |
| 1.13 | `dictionaryEntriesService.searchFullText('hello')` | Returns matching rows | ☐ |

---

## Sprint 2 Tests — Content Script + Floating Popup

### Functional (test on each site listed)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.1 | Visit `https://en.wikipedia.org/wiki/Translation` → select any word | `T>` icon appears near selection | ☐ |
| 2.2 | Click `T>` icon | Floating popup opens within 500ms | ☐ |
| 2.3 | Popup content | Shows: source text + `[LANG]` badge, `↓`, translated text + `[LANG]` badge, `[SAVE]` button | ☐ |
| 2.4 | Click `[SAVE]` | Button shows `SAVING...` → `✓ SAVED`; Supabase row created | ☐ |
| 2.5 | Re-select same word on same page | Popup opens showing `✓ SAVED` state (entry-exists check works) | ☐ |
| 2.6 | Select empty area (click away) | `T>` icon hides | ☐ |
| 2.7 | Select > 500 characters | `T>` icon does NOT appear | ☐ |
| 2.8 | Press `ESC` while popup is open | Popup closes | ☐ |
| 2.9 | Click `×` button on popup | Popup closes | ☐ |
| 2.10 | Select new word while popup is open | Old popup replaced, not stacked | ☐ |
| 2.11 | `[SAVE]` fails (e.g. offline) | Button shows `[RETRY]` | ☐ |

### Cross-site CSS Isolation (Shadow DOM)

Test on each site — check popup renders without CSS bleed:

| Site | No CSS bleed | No host page console errors | Result |
|------|-------------|----------------------------|--------|
| Wikipedia (en.wikipedia.org) | ☐ | ☐ | ☐ |
| GitHub (github.com) | ☐ | ☐ | ☐ |
| YouTube (youtube.com) | ☐ | ☐ | ☐ |
| Google Docs (docs.google.com) | ☐ | ☐ | ☐ |
| Reddit (reddit.com) | ☐ | ☐ | ☐ |
| Twitter/X (x.com) | ☐ | ☐ | ☐ |
| Figma (figma.com) | ☐ | ☐ | ☐ |
| AWS Docs (docs.aws.amazon.com) | ☐ | ☐ | ☐ |

### Dark/Light Theme

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.12 | OS dark mode active | Popup background `#1a1a0e`, text `#e8d5a3`, accent gold | ☐ |
| 2.13 | OS light mode active | Popup background `#fdf6e3`, text `#1a1a0e`, accent `#b8860b` | ☐ |

### Performance

| # | Test | Expected | Result |
|---|------|----------|--------|
| 2.14 | Translate latency (after initial model download) | < 300ms | ☐ |
| 2.15 | 20 select/translate/close cycles | No memory leak (check DevTools Memory) | ☐ |
| 2.16 | Service worker console (`chrome://extensions` → inspect service worker) | No errors | ☐ |

---

## Sprint 3 Tests — Popup Dictionary Tab + Settings

### Dictionary Tab

| # | Test | Expected | Result |
|---|------|----------|--------|
| 3.1 | Open BBQ-One popup → click `[ DICT ]` tab | Dictionary tab loads within 500ms | ☐ |
| 3.2 | Tab shows entry count | `DICTIONARY (N)` in header | ☐ |
| 3.3 | Cache hit: close popup → reopen → click `[ DICT ]` | Entries show instantly (< 50ms) from `chrome.storage.local` | ☐ |
| 3.4 | Type in search bar | Entries filter real-time (client-side) | ☐ |
| 3.5 | Clear search | All entries restore | ☐ |
| 3.6 | Click entry row | Row expands showing context, date, source URL, `[ DELETE ]` | ☐ |
| 3.7 | Click same row again | Row collapses | ☐ |
| 3.8 | Click source URL | Opens in new tab | ☐ |
| 3.9 | Click `[ DELETE ]` | RetroConfirm dialog appears with `[Y/N]` | ☐ |
| 3.10 | Press `Y` in confirm | Entry removed from list and Supabase | ☐ |
| 3.11 | Press `N` or `ESC` in confirm | Entry remains, dialog closes | ☐ |
| 3.12 | Search with no matches | `No matches for "..."` message | ☐ |
| 3.13 | Empty dictionary | `Dictionary empty. Translate something!` message | ☐ |
| 3.14 | Save entry via content script → open popup DICT tab | New entry appears in list | ☐ |

### Settings — TranslationSettingsPanel

| # | Test | Expected | Result |
|---|------|----------|--------|
| 3.15 | Open `[ SETTINGS ]` → scroll to TRANSLATION section | Native language selector + learning language checkboxes visible | ☐ |
| 3.16 | Change native language VI → EN → close settings | Setting persisted (reopen settings: EN still selected) | ☐ |
| 3.17 | Check `日本語` as learning language | Setting saved; `ja` appears in `learning_languages` in Supabase | ☐ |
| 3.18 | After setting native=EN: select `xin chào` on any page | Translation target is now EN (native); popup shows `[vi→en]` | ☐ |

### Regression — Existing Features

| # | Test | Expected | Result |
|---|------|----------|--------|
| 3.19 | `[ NOTES ]` tab | All notes load, create/edit/delete work | ☐ |
| 3.20 | `[ BOOKMARK ]` tab | All bookmarks load correctly | ☐ |
| 3.21 | `[ SYNC ]` button | Sync runs, badge updates | ☐ |
| 3.22 | Service worker daily alarm | `chrome://extensions` → service worker → no errors | ☐ |
| 3.23 | `npm run build` | Exit 0, no TS errors | ☐ |

---

## Phase 1 Exit Criteria

| # | Criterion | Status |
|---|-----------|--------|
| E1 | Extension builds prod, loads in Chrome, no manifest warnings | ☐ |
| E2 | Translate text on 5+ different sites within 500ms | ☐ |
| E3 | Save 10 real entries → all appear in `[ DICT ]` tab | ☐ |
| E4 | Search filter works | ☐ |
| E5 | Delete entry → synced to Supabase | ☐ |
| E6 | Change native language in Settings → next translate reflects new target | ☐ |
| E7 | Notes + Bookmarks tabs have zero regression | ☐ |
| E8 | `npm run type-check` passes with 0 errors | ☐ |
| E9 | QA checklist above 100% pass (or deferred items documented below) | ☐ |
| E10 | Real usage for 3-5 days → feedback collected for Phase 2 | ☐ |

---

## Deferred / Known Issues

> List any acceptance criteria NOT met in Sprint 3, with decision: fix now vs Phase 1.5.

| Item | Description | Decision |
|------|-------------|----------|
| | | |

---

## Notes

> Free-form notes from testing session.

```
```
