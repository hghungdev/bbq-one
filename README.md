# BBQOne

A **Chrome extension** (Manifest V3) for **notes**, **bookmarks**, and a **calendar**—with a distinctive retro / terminal-inspired UI. Use it **without an account** (local-first), or **sign in** when you want cloud sync and backup.

**Version:** 2.2.0

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-BBQOne-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/bbqone/ceapgalokgiaajogfjjkcaidnkpmplll)

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [What changed in 2.2.0](#what-changed-in-220)
- [What changed in 2.1.2](#what-changed-in-212)
- [What changed in 2.1.1](#what-changed-in-211)
- [What changed in 2.1.0](#what-changed-in-210)
- [What changed in 2.0.1](#what-changed-in-201)
- [What changed in 2.0.0](#what-changed-in-200)
- [What changed in 1.3.3](#what-changed-in-133)
- [What changed in 1.3.2](#what-changed-in-132)
- [What changed in 1.2.2](#what-changed-in-122)
- [What changed in 1.2.1](#what-changed-in-121)
- [What changed in 1.2.0](#what-changed-in-120)
- [Privacy & data](#privacy--data)
- [Install](#install)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Development](#development)
- [Configuration](#configuration)
- [License](#license)

---

## Overview

BBQOne brings together everyday knowledge capture and daily planning inside the browser: organized notes, optional encrypted folders, bookmark snapshots, and a simple calendar—all in one extension popup and dashboard.

**Design goals:**

- **Local-first** — work offline or without signing in; your data stays on the device by default.
- **Optional cloud** — sign in to sync and back up notes, bookmarks, and calendar events to your own Supabase project.
- **Focused UX** — resizable panels, search, and keyboard shortcuts for people who live in the keyboard.
- **Minimal surface area** — the extension runs entirely inside its popup and extension pages. It does **not** inject content scripts into the websites you visit.

---

## Features

| Area | What you get |
|------|----------------|
| **Notes** | Folders, rich-text editing, code-friendly blocks (Shiki highlighting), full-text search, copy-to-clipboard. Settings menu on rows (rename / move / delete); double-click or F2 still renames. Move between **regular** folders only (secure-folder moves deferred). |
| **Address bar search** | Type `bbq` + Space in Chrome's address bar, then a keyword: matching notes appear as suggestions. **Enter** opens the note in BBQOne; **Alt+Enter** copies the whole note to the clipboard (✓ flashes on the toolbar icon). Searches only the data on this device — no network request. |
| **Secure folders** | Optional passphrase-protected folders; sensitive titles and bodies are AES-GCM encrypted client-side before leaving your device. |
| **Bookmarks** | Snapshot your Chrome bookmark tree, browse, search, restore, and export as HTML; backups sync to your account when signed in. |
| **Backup files** | Without an account: automatic backup to `Downloads/BBQOne` (once a day when you open BBQOne and your data changed; last 7 days kept), **Back up now**, and **Restore from file** (replace everything — preview, two confirmations, safety backup first). Settings › Backup. |
| **Calendar** | Month grid with per-day events, today/tomorrow banner on the dashboard, search across all events, and local-first storage. Event chips use pastel fills in light mode and softer solid chips with a left color rail in dark mode. |
| **Cloud sync (optional)** | Sign in via Supabase Auth (email + password) to sync notes, folders, bookmarks, and calendar events across devices, protected by Row Level Security. |
| **Theme** | Light + dark UI (`data-theme`); dark uses a deeper charcoal stack and a mid blue accent tuned for dense popup chrome. |

---

## What changed in 2.2.0

Safer actions and stronger secure folders (`specs/ROADMAP-SEC.md` S11, S12, S9). No new permission.

- **Delete all bookmarks is no longer one click away:** BBQOne first saves a `before-delete` backup (if the backup fails, nothing is deleted), the button stays disabled until you type **DELETE** (Vietnamese UI: **XOA**), and afterwards it tells you how many bookmarks were removed and which backup restores them.
- **Address-bar search privacy (`bbq` + Space):** Settings › Address-bar search — *Title + snippet* (default, as before), *Title only* (no folder or note text in the suggestions — safer when sharing your screen) or *Off*.
- **Secure folders:** new folders and password changes use PBKDF2 with **600,000** iterations (older folders keep opening with their own setting; an *Upgrade* strip re-encrypts them with the same password). New passwords need at least 10 characters and common passwords are refused.
- **Password changed on another device:** a device that still holds the old key in memory now locks the folder and asks for the new password instead of saving notes with the old key (which made them unreadable). This also works between two tabs on the same computer.
- **Fixes:** changing a secure folder's password while it is unlocked no longer fails with "Current passphrase is wrong"; the Supabase "lock option is deprecated" warning on chrome://extensions is gone.

## What changed in 2.1.2

Clean libraries and automated security checks (`specs/ROADMAP-SEC.md` T1–T3). No new permission, no change to how notes are stored.

- **Editor: Tiptap 3** (3.32.1) — clears the remaining moderate Tiptap advisories (`mergeAttributes` / `__proto__`). The note schema is unchanged (links and underline stay off, so pasted / synced / restored `<a href>` is still removed); opening a note still never triggers a save.
- **Build tools: vite 6** (6.4.5, esbuild 0.25) — fixes the dev-server advisories. `npm audit` now reports **0 vulnerabilities**.
- **CI (GitHub Actions) + Dependabot:** every push, pull request and a weekly run check `npm audit`, build (`vue-tsc`) and run every `specs/*.test.mjs`; Dependabot proposes library and action updates.

## What changed in 2.1.1

Security hardening (from an internal "think like an attacker" review — `specs/SEC-REDTEAM-2026-10-29.md`). No new permission.

- **Libraries patched:** `prosemirror-view` 1.42.8 (fixes an XSS in paste handling of the note editor), Vue 3.5.44, Tiptap 2.27.3 and build tools — `npm audit --omit=dev` has no high-severity issue left. (Remaining: moderate Tiptap advisories that need the Tiptap 3 upgrade; a `vite` dev-server advisory that does not affect the built extension.)
- **Stricter Content Security Policy (CSP):** `default-src 'self'`; images only from the extension or `data:`; no frames, `<base>` or form posts.
- **Bookmarks:** restoring a backup never re-creates `javascript:` / `data:` links (the confirmation tells you how many are skipped); exported HTML escapes every link.
- **Calendar link (Google Calendar):** control characters in event titles / descriptions can no longer inject lines into the calendar file (redeploy the `calendar-feed` Edge Function).
- **No silent image loads:** note HTML is parsed in an inert document when extracting text or pasting, so images inside notes or pasted content are never fetched in the background.

## What changed in 2.1.0

- **New — backup files (not signed in):** Settings › Backup, Termius-style — an **automatic backup** switch (on by default), "Last backup" time and **Back up now**. Automatic backup runs at most once a day when you open BBQOne and your data changed, into `Downloads/BBQOne` (one file per weekday, overwritten the next week → the last 7 days are kept). Secure-folder notes stay encrypted in the file.
- **New — restore from file:** replaces everything on this device. It opens in a tab (Chrome closes the popup when a file picker opens), shows a preview (what is in the file, what will be deleted, what was skipped), then asks twice; a safety backup of the current data is saved to Downloads first.
- **Security:** a backup file is treated as untrusted input — only known fields with the right types and lengths are kept; ids must be UUIDs; note content goes through the editor's own schema (scripts, images, iframes, links, inline handlers and styles are removed); bookmark links other than http(s) / ftp / file (e.g. `javascript:`, `data:`) are dropped; `__proto__` keys cannot pollute objects; limits on file size (50 MB), rows, tree depth and PBKDF2 iterations.
- **Versioning:** new features bump the middle number (2.0.1 → 2.1.0); big refactors / upgrades bump the first.

## What changed in 2.0.1

- **Faster with large libraries:** opening a folder of 600 notes ~3 s → ~0.2 s; searching 2,000 notes ~12 s → ~0.3 s (searches the text you wrote, not the HTML markup); the popup no longer rewrites its cache on every open; the extension package shrank from 11 MB to 3.2 MB.
- **Bundled font:** Inter ships with the extension — no Google Fonts request, so without signing in BBQOne makes no network requests at all, and the popup draws instantly on slow networks.
- **New — address bar search:** type `bbq` + Space in Chrome's address bar, then a keyword. **Enter** opens the note in BBQOne; **Alt+Enter** copies the whole note.
- **Calendar:** up to 6 events per day — a day cell shows 2 plus a full-width "+n more" row that opens the day; the header chip shows how many events the day has ("5 events"; a single event shows its title, and hovering lists every title); the Upcoming panel lists all of today and 3 of tomorrow with "Show n more". Edit or delete a whole repeating series (this event / this and following / all).
- **Layout:** the header spans the full width with the logo top-left; the side rail below shows icons only, with a tooltip on hover. Bookmarks: backup is the ☁↑ icon in the Backups header, and the search box sits at the top of the browser column.
- **Dialogs:** Esc closes only the innermost dialog or menu — never the extension; clicking outside a dialog no longer closes it (close with ✕ or Esc), so half-typed text is never lost.
- **Fix:** without signing in, deleted notes, sections, and events no longer come back after reopening the popup.

## What changed in 2.0.0

- **New layout:** vertical navigation rail (icons; ☰ opens labels as an overlay; Settings + account at the bottom). The header now holds the brand, a wider calendar chip, theme and sync.
- **Calendar:** redesigned event dialog (segmented repeat, occurrences stepper, date chips), tap a title to mark done (✎ edits), overdue items can be ticked one by one in the Upcoming panel, chip shows whole titles + "+n".
- **Google Calendar link:** one-way private iCalendar link per account (Settings › Google Calendar).
- **One icon language:** a single icon set — delete is always 🗑, close is ✕; flat "popover" styling everywhere; input dialogs drop the redundant Cancel button (✕ / Esc close them).
- **Bookmarks:** the bookmark PIN was removed; the tab opens directly and auto-backup is never blocked.
- **Fixes:** Esc closes confirm dialogs; cached folders / events no longer saved as objects; English / Vietnamese copy cleaned up (no more "[ X ]" labels).

## What changed in 1.3.3

- **Notes UX:** Settings menu on folder/note rows (rename / move between regular folders / delete). Double-click and F2 rename unchanged; folder right-click secure menu unchanged. Move is regular-folder only (secure moves deferred).
- **Dark mode:** Deeper charcoal surfaces, mid blue accent (`#3b82f6`), clearer delete-warning copy, and calendar event chips that stay readable on dark cells (soft solid fill + left color rail).
- **Login:** Removed redundant `SECURE · ENCRYPTED` footer line.

## What changed in 1.3.2

- **Icon:** Refreshed extension icons (16/32/48/128) with tighter framing for Chrome toolbar and store listing.
- **Sync hardening:** Quota-aware local storage (`unlimitedStorage`), offline edit safety, and CWS polish from the N-series work.

## What changed in 1.2.2

- **Undo delete:** Closing the extension popup during the 5s undo window **commits** the delete (no spurious revert when reopening). Pending deletes are flushed via background + storage queue.
- **Calendar:** Subtle per-event pastel colors on the month grid (stable per event id).

---

## What changed in 1.2.1

- **Performance:** Dashboard loads from cache first; network refresh runs in the background with timeouts.
- **Offline:** Local edits while offline; auto-sync when the network returns (signed-in users).
- **Calendar:** Overdue-events reminder on sign-in; click event opens day list (not edit form); tooltips for truncated titles.
- **UI:** Header brand/tab hierarchy polish; privacy policy page restyle.

---

## What changed in 1.2.0

- **Added:** Calendar tab (month grid + today/tomorrow banner + per-day events, max 3/day in v1).
- **Added:** UI refresh across notes, bookmarks, and dashboard surfaces.
- **Removed:** In-page translation feature, personal dictionary, and the associated content script on `<all_urls>`.
- **Removed:** Host permission `https://api.dictionaryapi.dev/*`.
- **Removed:** Permissions `scripting`, `activeTab`, `tabs`, `identity` (no longer needed without translation/dictionary).
- **Remaining permissions:** `storage`, `unlimitedStorage`, `contextMenus`, `alarms`, `clipboardWrite`, `offscreen`, `bookmarks`, `downloads`, and host `https://*.supabase.co/*`.

See [`docs/CHROME-STORE-PERMISSIONS.md`](docs/CHROME-STORE-PERMISSIONS.md) for the full per-permission justification.

---

## Privacy & data

- **Anonymous / not signed in (default):** notes, bookmark snapshots, and calendar events are stored **locally** in `chrome.storage.local`. No account is required for core workflows. No network requests are made. Backup files (Settings › Backup) are saved only to your own Downloads folder.
- **Signed in:** data syncs to **your** configured Supabase project; access is gated per user by Row Level Security (`auth.uid() = user_id`).
- **Encrypted surfaces:** Secure Folder notes (and notes of accounts that turned on account encryption) are encrypted client-side (AES-GCM) before upload. Other notes, folders, bookmark backups, and calendar events are stored as plaintext under your account (isolated by RLS, not end-to-end encrypted). Calendar events stay unencrypted on purpose so the optional Google Calendar link can work.
- **Google Calendar link (optional):** a private, one-way iCalendar link (Settings › Google Calendar). Anyone with the link can read your calendar; create a new link or turn it off anytime.
- **No content scripts.** BBQOne does not inject scripts into the pages you visit.
- **No tracking, no analytics, no ads.**

Full policy: [`docs/privacy-policy.html`](docs/privacy-policy.html) — also hosted at <https://hghungdev.github.io/bbq-one/privacy-policy.html>.

---

## Install

**End users:** install BBQOne from the [**Chrome Web Store**](https://chromewebstore.google.com/detail/bbqone/ceapgalokgiaajogfjjkcaidnkpmplll), then pin the extension and open it from the toolbar.

**Developers / testers:** see [Development](#development) to load an unpacked build from `dist/`.

---

## Keyboard shortcuts

Shortcuts apply in the **notes dashboard** (where supported).

| Shortcut | Action |
|----------|--------|
| `F2` | Rename the selected note, or the active folder if no note is selected |
| `Ctrl` + `F` | Focus search |
| `Ctrl` + `N` | Create a new note in the active folder (blocked if the folder is locked) |
| `Ctrl` + `S` | Flush save for the open editor |
| `bbq` + `Space` (address bar) | Search notes; **Enter** opens the note, **Alt+Enter** copies the whole note |
| `Esc` | Closes the innermost dialog / menu / search — never the extension (click outside to close it) |

On macOS, use `⌘` instead of `Ctrl` where the browser maps it.

---

## Development

### Prerequisites

- **Node.js** LTS (18+ recommended; 20+ is a safe choice)
- **npm**
- A modern **Chromium-based** browser (Chrome, Edge, etc.)

### Setup

```bash
git clone <repository-url>
cd bbq-one
npm install
cp .env.example .env
# Edit .env per .env.example comments (required for cloud/auth features in dev builds)
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development build with hot reload |
| `npm run build` | Type-check + production bundle (extension output) |
| `npm run type-check` | TypeScript only |
| `npm run preview` | Preview CLI (optional; primary workflow is loading `dist/` in Chrome) |
| `npm run sync-version` | Sync extension version from `package.json` to `public/manifest.json` |

### Load in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. **Load unpacked** → select the **`dist/`** directory.
5. After changing `.env`, rebuild and click **Reload** on the extension card.

### Tech stack

- **Vue 3** (Composition API + `<script setup>`) + **Pinia** + **Vue Router**
- **TypeScript** (strict mode via `vue-tsc`)
- **Vite** + **@crxjs/vite-plugin** (MV3 bundler)
- **Tiptap** (note editor) + **Shiki** (syntax highlighting)
- **Supabase** (optional cloud sync — Auth + Postgres + RLS)

---

## Configuration

- **Environment:** copy `.env.example` to `.env` and set the variables documented there. Never commit secrets.
- **Backend:** database schema and migration scripts live under `supabase/` for teams that self-host the data plane.

The repository is **public**; keep deployment specifics, keys, and architecture runbooks out of this README.

---

## Contributing

Issues and pull requests are welcome. Please:

1. Keep changes focused and match existing code style.
2. Run `npm run type-check` (and `npm run build` before submitting larger changes).
3. Avoid committing `.env` or credentials.

---

## License

See **`package.json`** (`private` field and any future `license` entry) or add a **`LICENSE`** file to the repository for explicit terms.

---

<p align="center"><strong>BBQOne</strong> — notes, bookmarks, and calendar, your way.</p>
