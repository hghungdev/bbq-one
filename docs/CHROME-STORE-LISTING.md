# BBQOne — Chrome Web Store Listing Copy

## Short Description (132 chars max)

Local-first notes, bookmarks, and calendar. Optional cloud sync and Google Calendar link. Private and offline-capable.

_(118 characters — fits the 132 limit.)_

**Paste-ready plain text** (Chrome “Detailed description” box — same layout as legacy listing, ASCII separators):

→ [`chrome-store-detailed-description.txt`](./chrome-store-detailed-description.txt)

---

## Detailed Description (store / long form)

**BBQOne** is a privacy-minded productivity extension with **local-first defaults**: notes, bookmark backups, and a **calendar** — from one clean, compact popup dashboard (side rail for Calendar / Notes / Bookmarks; settings and account in the header).

**Release 2.1.1 (highlights):** Security hardening — patched editor libraries (paste XSS fix in ProseMirror), stricter content security policy (no external images, frames or form posts), unsafe bookmark links (`javascript:`, `data:`) never restored and exported links escaped, calendar-link hardening against injected control characters, note HTML parsed without loading images. No new permission.

**Release 2.1.0 (highlights):** Backup files for use without an account — automatic daily backup to Downloads/BBQOne (last 7 days kept), "Back up now", and "Restore from file" with a preview, two confirmations and a safety backup of the current data; restored files are validated and cleaned (no scripts, images, links or unsafe bookmark links). No new permission.

**Release 2.0.1 (highlights):** Much faster with large libraries (folders and search in a fraction of a second; package 11 MB → 3 MB, Inter font bundled — no network requests without sign-in); search notes from the address bar (`bbq` + Space — Enter opens, Alt+Enter copies); up to 6 events per day and edit / delete a whole repeating series; full-width header with an icon-only side rail; Esc and clicks outside never discard a half-filled dialog; fix for deleted items reappearing when not signed in.

**Release 2.0.0 (highlights):** New vertical navigation rail and flat, modern UI with one icon set; redesigned calendar event dialog, per-item overdue check-off, and a private one-way Google Calendar link (Settings › Google Calendar); bookmark PIN removed so backups are never blocked.

**Release 1.3.3 (highlights):** Notes settings menu (rename / move between regular folders / delete); deeper dark-mode UI and clearer calendar event chips.

**Release 1.3.2 (highlights):** Refreshed extension icon; local-first sync hardening with `unlimitedStorage` for large offline caches.

**Release 1.2.2 (highlights):** Delete commits when you close the popup during the 5s undo window (no spurious revert); subtle pastel colors per calendar event.

**Release 1.2.1 (highlights):** Faster dashboard load (cache-first), offline edits with auto-sync when back online, calendar overdue reminder on sign-in, and header/calendar UX polish.

**Release 1.2.0 (highlights):** Translation, personal dictionary, and page-injected “quick translate” flows have been **removed** so the surface area stays smaller: no third-party translation or dictionary APIs, and **no content scripts** on sites you visit for those features. Optional **Supabase** sign-in remains for cloud sync; the dashboard includes **English / Vietnamese** UI and theme controls.

---

═══════════════════════════════════════════════════  
**KEY FEATURES**  
═══════════════════════════════════════════════════  

**NOTES**

- Rich text editing with sensible formatting for everyday writing and technical notes  
- Code-friendly highlighting for many languages (bundled with the in-app editor)  
- Folders + full-text search  
- **Address bar search:** type `bbq` + Space, then a keyword — Enter opens the note, Alt+Enter copies the whole note  
- Rename, move between regular folders, and delete from a compact settings menu on each row  
- Optional **encrypted secure folders** (passphrase-gated content; AES‑GCM client-side where applicable)  

**BOOKMARKS**

- Snapshot, browse, filter, and search your Chrome bookmark tree  
- Safety net: backups and restores aligned with Chrome’s bookmarks model  
- **Export** bookmark trees as **HTML** where supported (Bookmarks tab)  

**CALENDAR**

- Month grid with events stored **locally** by default — up to 6 events per day  
- Repeat events weekly, monthly, or yearly; search across all events  
- Today / tomorrow chip in the header; mark done with one click; tick off overdue items one by one  
- Optional sync to your account when signed in (same Supabase backend as notes/bookmarks)  
- Optional **private one-way Google Calendar link** (Settings › Google Calendar) — Google decides when to refresh; anyone with the link can read the calendar  

---

═══════════════════════════════════════════════════  
**PRIVACY-FIRST DESIGN**  
═══════════════════════════════════════════════════  

By default BBQOne keeps **notes, bookmark backups, and calendar events** on your machine unless you explicitly **sign in** for sync.

- **No mandatory account.** No analytics or ads bundled for product tracking.  
- **Optional sync:** Sign in through **Supabase** when you want multi-device continuity — **HTTPS** in transit plus **Row Level Security** so only your account can read/write your rows.  

**Network use (plain language):**  
Without signing in, the extension does **not** need your browsing history as a feature. Normal use talks to **`*.supabase.co`** only when you opt into cloud sync (auth + sync). Fonts (Inter) are bundled with the extension, so without sign-in it makes **no** network requests — see the Privacy Policy.  

BBQOne does **not** run a behavioral ad network inside the extension. Read the Privacy Policy below for hosting, accountability, and what Supabase sign-in implies.

---

═══════════════════════════════════════════════════  
**LOOK & FEEL**  
═══════════════════════════════════════════════════  

Clean, flat layout: a compact **side rail** for Calendar / Notes / Bookmarks (☀ theme and ☁ sync at its foot), **settings + account** in the header, one consistent icon set. Manual **light / dark** theme synced to storage; interface copy in **English** and **Vietnamese**.

---

═══════════════════════════════════════════════════  
**WHY BBQONE?**  
═══════════════════════════════════════════════════  

- Defaults to **offline-capable** core workflows  
- **No** in-page translation or personal dictionary stack — fewer third parties and clearer data story  
- **Declared** remote endpoints (see manifest `host_permissions`: Supabase when you sync)  
- Public repository you can skim for reassurance (deployment keys stay yours)  
- **Bookmark HTML export** for portability from the dashboard  
- Uninstall follows Chrome’s normal extension storage semantics for local data  

---

═══════════════════════════════════════════════════  
**PRIVACY POLICY**  
═══════════════════════════════════════════════════  

**Authoritative policy:**  
https://hghungdev.github.io/bbq-one/privacy-policy.html  

The policy names **Supabase** (auth + optional sync), the optional **Google Calendar** link, **clipboard/offscreen** (copy-to-clipboard helper), **`downloads`** (e.g. bookmark export), **`bookmarks`** and **`chrome.storage`** — aligned with current permissions.

---

═══════════════════════════════════════════════════  
**SUPPORT & FEEDBACK**  
═══════════════════════════════════════════════════  

Questions, bugs, or feature requests:  
**Email:** hghungdev@gmail.com  

**GitHub:** https://github.com/hghungdev/bbq-one  

---

═══════════════════════════════════════════════════  
**GETTING STARTED**  
═══════════════════════════════════════════════════  

1. Install the extension  
2. Pin **BBQOne** in Chrome’s toolbar  
3. Open the popup → **Dashboard** (notes, bookmarks, calendar)  
4. Create notes / manage bookmarks / add events anytime — **no account** required  
5. **Optional:** Sign in to enable cloud backup & sync (Supabase)  

---

## Permissions Explained (for reviewers / Privacy tab)

Aligned with **`manifest.json`**:

| Permission        | Why |
|-------------------|-----|
| `storage`         | Local-first data (`chrome.storage.local` / session) |
| `bookmarks`       | Read/sync bookmark tree for backup & restore |
| `downloads`       | Save bookmark exports (HTML) and similar file downloads |
| `clipboardWrite` + `offscreen` | Reliable clipboard copy from the popup when needed |
| `contextMenus`    | Toolbar context menu entry (e.g. open dashboard) |
| `alarms`          | Scheduled background sync for signed-in users |

**Host:** `https://*.supabase.co/*` — only when you use optional cloud sync and auth.

**No `<all_urls>` content scripts** for translation or reading page selection in this release.

---

## Category

Productivity  

## Language

English (listing); **UI:** English + Vietnamese  
