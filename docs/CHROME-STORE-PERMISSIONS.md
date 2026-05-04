# BBQOne — Chrome Web Store Permissions Justification

This document explains why each permission is required. Use this content
when filling out the Chrome Web Store submission form's "Permission
Justification" section.

## Required Permissions

### `storage`
**Purpose**: Store user-created notes, bookmarks, dictionary entries, and
settings locally in `chrome.storage.local` (local-first architecture).
**User-facing functionality**: Core data persistence — without this, no
data can be saved.

### `contextMenus`
**Purpose**: Add right-click menu item to open the BBQOne dashboard.
**User-facing functionality**: Quick access from any webpage.

### `identity`
**Purpose**: OAuth-style sign-in flow with Supabase for optional cloud sync.
**User-facing functionality**: Optional sign-in from Settings — only used
when user explicitly opts to enable cloud sync.

### `alarms`
**Purpose**: Schedule periodic background sync when user is in cloud mode.
**User-facing functionality**: Daily auto-sync of cloud data when
authenticated. No-op for anonymous users.

### `clipboardWrite`
**Purpose**: Allow user to copy translations and notes to clipboard.
**User-facing functionality**: "Copy translation" button in popup,
"Copy note" in notes UI.

### `scripting`
**Purpose**: Inject the translation popup component into web pages when
user selects text.
**User-facing functionality**: Floating translation popup that appears
near user-selected text.

### `offscreen`
**Purpose**: Manifest V3 requirement for clipboard fallback on pages where
direct clipboard access isn't allowed.
**User-facing functionality**: Reliable copy-to-clipboard across all
contexts.

### `bookmarks`
**Purpose**: Read/write user's Chrome bookmarks for the bookmark
management feature.
**User-facing functionality**: Core bookmark feature — view, search,
backup user bookmarks.

### `downloads`
**Purpose**: Allow user to export local data as JSON file (backup).
**User-facing functionality**: "Export Local Data" button in Settings.

### `activeTab`
**Purpose**: Read selected text from active tab when user invokes
translation.
**User-facing functionality**: Get text user has highlighted to translate.
Activated only on explicit user gesture.

### `tabs`
**Purpose**: Open the BBQOne dashboard in a new tab from context menu.
**User-facing functionality**: "Open Dashboard" navigation.

## Host Permissions

### `https://*.supabase.co/*`
**Purpose**: Communicate with Supabase backend for optional cloud sync
and authentication.
**Activation**: Only used when user is signed in. Anonymous users never
trigger requests to Supabase.

### `https://api.dictionaryapi.dev/*`
**Purpose**: Fetch English word enrichment (phonetic, part-of-speech,
synonyms) from Free Dictionary API.
**Activation**: Only when user saves an English word in dictionary.
No user data sent — only the English word itself.

## Content Script `<all_urls>`

**Purpose**: The translation feature requires a content script to:
1. Detect when user selects text on any webpage
2. Render the floating translation popup near the selection
3. Send the selected text to background for translation

**Why `<all_urls>` is necessary**: Users may want to translate text on
any website (news, documentation, social media, etc.). Limiting to
specific URLs would defeat the purpose.

**Privacy safeguards**:
- Content script does NOT auto-read page content
- Only activates on explicit user text selection
- Sends only the selected text (not URL, not surrounding context)
- No tracking, no analytics, no fingerprinting

## What BBQOne Does NOT Do

- Does NOT modify webpage content
- Does NOT inject ads or trackers
- Does NOT collect IP addresses
- Does NOT use browser fingerprinting
- Does NOT read browsing history
- Does NOT communicate with servers when user is anonymous (except
  optional translation enrichment which user can disable)
- Does NOT auto-update bookmarks without user action

## Summary for Reviewer

BBQOne follows a **privacy-first, local-first** philosophy:
- All core data stays on the user's device by default
- External requests (Supabase, MyMemory, Dictionary API) are
  feature-specific and can be disabled
- All third-party communications are documented in the privacy policy
- User can export their data and uninstall cleanly at any time
