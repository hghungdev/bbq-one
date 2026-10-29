# BBQOne — Chrome Web Store Permissions Justification

This document explains why each permission declared in `public/manifest.json`
is required for BBQOne **v2.1.1** (permissions unchanged since v1.3.3 — the Google Calendar link is served by a Supabase Edge Function; the extension itself never contacts Google Calendar. v2.0.1 added only the manifest **`omnibox`** key for address-bar search, which is not a permission and shows no install / update warning; v2.1.0 reuses `downloads` for JSON backup files — still no new permission). The content below is the **source of
truth** when filling out the Chrome Web Store submission form's "Permission
Justification" section.

> **History note (Release 1.2.0):** in-page translation, personal
> dictionary, and the related content script + remote host
> (`https://api.dictionaryapi.dev/*`) have been **removed** from this
> extension. The `scripting`, `activeTab`, `tabs`, and `identity` permissions
> have also been removed. If you reference any older version of this doc,
> discard it — only the section below is current.

---

## Single Purpose

Paste into **Single purpose description** (each block below is paste-ready for its form field, ≤ 1,000 characters):

```text
BBQOne is a local-first personal productivity dashboard: notes, Chrome bookmark backups, and a calendar in one extension popup. Users write notes (rich text, code blocks, and optional passphrase-protected secure folders with client-side AES-GCM encryption), snapshot, search, restore and export their Chrome bookmarks, and plan events in a month calendar. Data is stored in chrome.storage.local by default; signing in is optional and only syncs the same data to the user's account. The extension runs entirely inside its popup and extension pages and does not inject scripts into the pages users visit.
```

---

## Required Permissions

### `storage`

```text
Persist user-created data (notes, folders, bookmark backups, calendar events) and preferences (theme, language) in chrome.storage.local. This is the basis of BBQOne's local-first design: by default no data leaves the user's device. chrome.storage.session (in memory, cleared when the browser closes) holds only short-lived state: the sign-in session token, a safety copy of the note draft being edited (so an unsaved edit survives the popup closing), and, for accounts that turned on note encryption, the unlocked key until it auto-locks. Without this permission no data can be saved.
```

### `unlimitedStorage`

```text
BBQOne is local-first: the user's notes, calendar events and bookmark backup history are cached in chrome.storage.local so the extension works fully offline. The default ~10 MB quota is too small for large collections (a few thousand notes with rich-text bodies exceed it), and hitting the quota would silently stop offline edits from being saved. This permission only raises the local disk limit; no data is collected or transmitted.
```

### `contextMenus`

```text
Adds one item, "Open Dashboard", to the right-click menu of the extension's own toolbar icon (contexts: ["action"]) so users can open the BBQOne dashboard from there. Nothing is added to the right-click menus of web pages.
```

### `alarms`

```text
BBQOne uses chrome.alarms for background housekeeping only: (1) a 24-hour sync refresh for signed-in users; (2) a 5-minute retry that uploads changes made while offline; it does work only when there are pending changes and the user is signed in; (3) a one-shot alarm that finalizes a delete when its Undo window ends, so the delete still completes if the popup was closed; (4) for accounts that turned on note encryption, a one-shot auto-lock that clears the unlocked key from session memory after 30 minutes. For users who are not signed in, the sync alarms make no network requests.
```

### `clipboardWrite`

```text
Powers the copy buttons the user clicks: "Copy note" in the note editor (copies the note's plain text) and the copy button next to the private Google Calendar link in Settings. The extension writes only the text the user chose to copy, only on click, and never reads from the clipboard.
```

### `offscreen`

```text
Fallback for the copy buttons above. The popup first copies with navigator.clipboard.writeText; if that fails (for example when the popup has lost focus), it asks the extension's service worker, which opens an offscreen document with reason CLIPBOARD, writes the text, and closes the document immediately. The offscreen document is used for nothing else.
```

### `bookmarks`

```text
Reads the user's Chrome bookmark tree to show, search and back it up in the Bookmarks tab, and listens to bookmarks.onCreated / onRemoved / onChanged / onMoved to keep the automatic backup snapshot up to date. Bookmarks are changed only when the user clicks Restore on a backup and confirms it; the bookmark tree is then rebuilt from that snapshot. Bookmark backups stay in chrome.storage.local unless the user signs in to sync them.
```

### `downloads`

```text
Saves files the user keeps on their own computer, built in memory and written with chrome.downloads.download (no prompt, no network):
1. "Export as HTML" in the Bookmarks tab — a standard Netscape bookmark HTML file to keep or import into another browser (only when the user clicks Export).
2. Backup files (not signed in, since v2.1.0) — a JSON backup file of the user's own notes, calendar events and bookmark backups: "Back up now" in Settings, plus an optional automatic backup (Settings › Backup, can be turned off) at most once a day when BBQOne is opened and the data changed, into Downloads/BBQOne (one file per weekday, overwritten the next week). Before "Restore from file" replaces data, a safety backup file of the current data is saved the same way. Nothing is uploaded.
```

---

## Host Permissions

### `https://*.supabase.co/*`

```text
https://*.supabase.co/* is used only after the user chooses to sign in. It is needed to:
1. Sign in with Supabase Auth (email + password; no OAuth, no chrome.identity).
2. Sync the user's notes, folders, bookmark backups and calendar events with BBQOne's Supabase backend. Each account's rows are isolated by Row Level Security (auth.uid() = user_id); notes in secure folders are encrypted on the device before upload.
3. Create, replace or turn off the optional private Google Calendar link (stored in the same backend). Google Calendar fetches that link from the server; the extension never contacts Google.
4. Run the daily background refresh (chrome.alarms).
Users who are not signed in never send requests to Supabase. There are no content scripts. Apart from Supabase there are no network requests: the Inter font is bundled with the extension.
```

> The wildcard `*.supabase.co` is used because the project URL is set at build time (`VITE_SUPABASE_URL`); at
> runtime the extension talks to that one project only. Optional hardening for a later release: narrow it to the exact
> project host (`https://<project-ref>.supabase.co/*`) — a narrower host pattern usually means a lighter review.

---

## What BBQOne Does NOT Do

- **No** content scripts on the pages the user visits.
- **No** modification of webpage content.
- **No** ads, tracking, or analytics.
- **No** collection of IP address, browsing history, or fingerprinting.
- **No** web-accessible resources — websites cannot probe for the extension's
  presence (no fingerprinting surface).
- **No** in-page translation, no personal dictionary, no third-party
  translation/dictionary API (these features and the associated
  `api.dictionaryapi.dev` host permission were **removed in v1.2.0**).
- **No** remote code execution — all JavaScript and WebAssembly is bundled
  with the extension at build time. Fonts (Inter) are bundled too — no
  external font or stylesheet requests.

---

## Content Security Policy

The CSP declared in `public/manifest.json` for extension pages is:

```
script-src 'self' 'wasm-unsafe-eval';
object-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
connect-src 'self' https://*.supabase.co;
```

- `'wasm-unsafe-eval'` is required by **Shiki** (syntax highlighter used in
  note code blocks), which loads a bundled WebAssembly module.
- `'unsafe-inline'` is restricted to **`style-src` only** (required by Vue
  Single-File Component scoped styles and Shiki's inline highlight output).
  Chrome Web Store policy permits `'unsafe-inline'` in `style-src`; it is
  not allowed in `script-src`, which BBQOne does **not** use.
- `font-src 'self'`: the **Inter** UI font ships inside the extension
  (`src/assets/fonts/inter/`); no external font hosts are allowed.

---

## Remote Code

**Question**: Does this extension use remote code?
**Answer**: **No.**

All JavaScript and WebAssembly is bundled into the extension at build time
via Vite + `@crxjs/vite-plugin`. The extension loads only:

- **Supabase REST / Auth endpoints** (`*.supabase.co`) — data
  endpoints, not code endpoints.

No `eval()`, no remote `<script src="...">` injection, no dynamic module
imports from external origins.

---

## Summary for Reviewer

BBQOne follows a **privacy-first, local-first** philosophy:

- All core data stays on the user's device by default.
- The only remote host is `*.supabase.co`, and only when the user
  explicitly signs in for optional cloud sync (including the optional
  Google Calendar link, which Google fetches from the server — not from
  the extension).
- No content scripts on third-party sites.
- Address-bar search uses the manifest **`omnibox`** key (keyword `bbq`) — not a
  permission, no install warning. Text typed after `bbq` goes only to the
  extension, which searches notes stored on the device (no network request);
  copying a note reuses `clipboardWrite` + `offscreen`.
- No tracking, no analytics, no advertising.
- All permissions are scoped to features that are actually present in the
  build — anything that previously required broader permissions (in-page
  translation, dictionary lookup) has been removed in v1.2.0.

For the user-facing privacy policy, see
[`docs/privacy-policy.html`](./privacy-policy.html) — hosted at
<https://hghungdev.github.io/bbq-one/privacy-policy.html>.
