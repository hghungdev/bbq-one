# BBQOne

A **Chrome extension** (Manifest V3) for **notes**, **bookmarks**, and a **personal dictionary**—with a distinctive retro / terminal-inspired UI. Use it **without an account** (local-first), or **sign in** when you want cloud sync and backup.

**Version:** 1.1.0

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Privacy & data](#privacy--data)
- [Install](#install)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Development](#development)
- [Configuration](#configuration)
- [License](#license)

---

## Overview

BBQOne brings together everyday knowledge work inside the browser: organized notes, optional encrypted folders, bookmark snapshots, saved translation entries, and quick translate-from-selection—all in one extension popup and dashboard.

**Design goals:**

- **Local-first** — work offline or without signing in; your data can stay on the device.
- **Optional cloud** — sign in to sync and back up notes and related data to your own backend project.
- **Focused UX** — resizable panels, search, and shortcuts for people who live in the keyboard.

---

## Features

| Area | What you get |
|------|----------------|
| **Notes** | Folders, rich-text editing, code-friendly blocks, full-text search, export current note as plain text. |
| **Secure folders** | Optional passphrase-protected folders; sensitive titles and bodies are protected before they leave your unlocked session. |
| **Bookmarks** | Snapshot your browser bookmark tree, browse history, restore to Chrome, export HTML, and optional encryption when signed in with PIN. |
| **Personal dictionary** | Save words and phrases from the reading flow; manage entries in the dashboard tab. |
| **Quick translate** | Select text on a page to translate/lookup (behavior depends on your settings and context). |

---

## Privacy & data

- **Anonymous / not signed in:** notes, bookmark backups, and dictionary entries can be stored **locally** in the extension. No account is required for core workflows.
- **Signed in:** data syncs against **your** configured backend; access is scoped per user on the server side (standard row-level rules).
- **Permissions:** the extension requests only what it needs for bookmarks, storage, translation, and optional cloud APIs—see the manifest packaged with the build for the full list.

For deep technical documentation (database layout, migrations, and security model), refer to the `supabase/` directory and internal docs rather than duplicating operational detail in this file.

---

## Install

**End users:** install from the **Chrome Web Store** when a listing is available, then pin the extension and open it from the toolbar.

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

### Load in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. **Load unpacked** → select the **`dist/`** directory.
5. After changing `.env`, rebuild and click **Reload** on the extension card.

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

<p align="center"><strong>BBQOne</strong> — notes, bookmarks, and vocabulary, your way.</p>
