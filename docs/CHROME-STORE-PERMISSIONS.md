# BBQOne — Chrome Web Store Permissions Justification

This document explains why each permission declared in `public/manifest.json`
is required for BBQOne **v1.3.2+**. The content below is the **source of
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

BBQOne's single purpose is **personal knowledge capture and daily planning
during web browsing**. Users have one place to:

- Save **notes** (rich text with code-block support).
- Back up and search their Chrome **bookmarks** (with optional client-side
  AES-GCM encrypted secure folders).
- Track **calendar** events (with a banner that surfaces "today" and
  "tomorrow" plans on the dashboard).

All three surfaces are unified by a single search bar, a single local-first
storage layer (`chrome.storage.local`), and a single design system. The
extension runs entirely inside the popup / extension pages — it does **not**
inject scripts into the pages users visit.

---

## Required Permissions

### `storage`

**Purpose**: Persist user-created data (notes, folders, bookmarks, calendar
events, UI preferences such as theme and language) locally in
`chrome.storage.local`. This is the foundation of BBQOne's local-first
architecture — by default no data leaves the user's device.
`chrome.storage.session` is additionally used to hold the Supabase auth
session token, so the session is cleared automatically when the browser
closes.

**User-facing functionality**: Core data persistence — without this
permission, no data can be saved.

### `unlimitedStorage`

**Purpose**: BBQOne is a local-first application — the user's complete
notes, calendar events, and bookmark backup history are cached in
`chrome.storage.local` so the extension works fully offline. The default
10MB quota is insufficient for users with large note collections (a few
thousand notes with rich-text bodies exceeds it), and hitting the quota
would silently prevent offline edits from being persisted.

**User-facing functionality**: Reliable offline persistence of all user
data regardless of collection size. No data is collected or transmitted —
this permission only raises the local disk cap.

### `contextMenus`

**Purpose**: Add a single menu item ("Open Dashboard") to the **extension
action icon's** right-click menu (`contexts: ['action']`). This menu does
**not** appear in the right-click menu of pages the user visits.

**User-facing functionality**: A keyboard-free way to open the BBQOne popup
dashboard.

### `alarms`

**Purpose**: Schedule a periodic background sync (once every 24 hours) for
users who have opted into Supabase cloud sync. The alarm keeps the local
cache fresh relative to the user's cloud account without requiring manual
action.

**User-facing functionality**: Daily auto-sync of cloud data when
authenticated. Anonymous (non-signed-in) users generate no alarm activity
and no network requests.

### `clipboardWrite`

**Purpose**: Power the "Copy note" button in the note editor — users can
copy the plain-text content of a note to the clipboard with a single click.
The extension only writes user-initiated content to the clipboard and
**never reads from the clipboard**.

**User-facing functionality**: One-click copy of note content.

### `offscreen`

**Purpose**: Provide a Manifest V3 fallback for clipboard write operations
from contexts where the direct Clipboard API is not available (for example
when the write is triggered from the service worker via
`chrome.runtime.sendMessage`). The offscreen document is created on demand,
performs a single clipboard write, and is immediately closed (see
`src/background.ts` and `src/offscreen.ts`).

**User-facing functionality**: Reliable "Copy note" behavior across all
extension surfaces (popup, service worker).

### `bookmarks`

**Purpose**: Read the user's Chrome bookmark tree to display, search, and
back it up inside the BBQOne dashboard. The extension also listens to
bookmark `onCreated` / `onRemoved` / `onChanged` / `onMoved` events to keep
its backup snapshot fresh.

**User-facing functionality**: Core bookmark feature — viewing, searching,
and backing up Chrome bookmarks. Users may additionally store sensitive
snapshots inside encrypted secure folders (client-side AES-GCM encryption).

### `downloads`

**Purpose**: Power the **"Export Bookmarks as HTML"** feature in the
Bookmarks tab. The extension generates a standard Netscape Bookmark HTML
file in memory (via `Blob`) and calls `chrome.downloads.download(...)` to
save it. The download is always user-initiated.

**User-facing functionality**: Backup / migration of the user's bookmarks
into another browser.

---

## Host Permissions

### `https://*.supabase.co/*`

**Purpose**: The single host permission `https://*.supabase.co/*` is used
**only** when the user explicitly opts into cloud sync by signing in via the
Settings panel. It is required to:

1. **Authenticate** the user via Supabase Auth (email + password sign-in —
   no OAuth redirect, no `chrome.identity`).
2. **Sync** the user's notes, folders, bookmarks (optionally encrypted), and
   calendar events to and from their Supabase project, protected
   server-side by **Row Level Security** (`auth.uid() = user_id`).
3. Maintain a **daily background refresh** triggered by `chrome.alarms`.

**Activation**: Only used when the user is signed in. Anonymous (default)
users never trigger any requests to Supabase.

> The wildcard `*.supabase.co` is used because the destination project URL
> is read from build-time environment variables — not because the extension
> reaches into multiple unrelated Supabase projects at runtime.

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
  with the extension at build time. Google Fonts loads font files (CSS +
  font binaries), which Chrome does not classify as remote code.

---

## Content Security Policy

The CSP declared in `public/manifest.json` for extension pages is:

```
script-src 'self' 'wasm-unsafe-eval';
object-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
connect-src 'self' https://*.supabase.co https://fonts.googleapis.com;
```

- `'wasm-unsafe-eval'` is required by **Shiki** (syntax highlighter used in
  note code blocks), which loads a bundled WebAssembly module.
- `'unsafe-inline'` is restricted to **`style-src` only** (required by Vue
  Single-File Component scoped styles and Shiki's inline highlight output).
  Chrome Web Store policy permits `'unsafe-inline'` in `style-src`; it is
  not allowed in `script-src`, which BBQOne does **not** use.
- `https://fonts.googleapis.com` and `https://fonts.gstatic.com` are
  required to load the **Inter** UI font (see `index.html`).

---

## Remote Code

**Question**: Does this extension use remote code?
**Answer**: **No.**

All JavaScript and WebAssembly is bundled into the extension at build time
via Vite + `@crxjs/vite-plugin`. The extension loads only:

- **Google Fonts** (`fonts.googleapis.com` / `fonts.gstatic.com`) — CSS
  stylesheet and font binary files. These are not executable code under
  Chrome's definition.
- **Supabase REST / Auth endpoints** (`*.supabase.co`) — data
  endpoints, not code endpoints.

No `eval()`, no remote `<script src="...">` injection, no dynamic module
imports from external origins.

---

## Summary for Reviewer

BBQOne follows a **privacy-first, local-first** philosophy:

- All core data stays on the user's device by default.
- The only remote host is `*.supabase.co`, and only when the user
  explicitly signs in for optional cloud sync.
- No content scripts on third-party sites.
- No tracking, no analytics, no advertising.
- All permissions are scoped to features that are actually present in the
  build — anything that previously required broader permissions (in-page
  translation, dictionary lookup) has been removed in v1.2.0.

For the user-facing privacy policy, see
[`docs/privacy-policy.html`](./privacy-policy.html) — hosted at
<https://hghungdev.github.io/bbq-one/privacy-policy.html>.
