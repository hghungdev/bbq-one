# BBQOne — Chrome Web Store Listing Copy

## Short Description (132 chars max)

Local-first notes, bookmarks, and calendar. Optional cloud sync. Privacy-respecting, offline-capable.

_(118 characters — fits the 132 limit.)_

**Paste-ready plain text** (Chrome “Detailed description” box — same layout as legacy listing, ASCII separators):

→ [`chrome-store-detailed-description.txt`](./chrome-store-detailed-description.txt)

---

## Detailed Description (store / long form)

**BBQOne** is a privacy-minded productivity extension with **local-first defaults**: notes, bookmark backups, and a simple **calendar** — from one compact, retro-inspired popup dashboard.

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
- Optional **encrypted secure folders** (passphrase-gated content; AES‑GCM client-side where applicable)  

**BOOKMARKS**

- Snapshot, browse, filter, and search your Chrome bookmark tree  
- Safety net: backups and restores aligned with Chrome’s bookmarks model  
- **Export** bookmark trees as **HTML** where supported (Bookmarks tab)  

**CALENDAR**

- Month grid with events stored **locally** by default  
- Optional sync to your account when signed in (same Supabase project as notes/bookmarks)  

---

═══════════════════════════════════════════════════  
**PRIVACY-FIRST DESIGN**  
═══════════════════════════════════════════════════  

By default BBQOne keeps **notes, bookmark backups, and calendar events** on your machine unless you explicitly **sign in** for sync.

- **No mandatory account.** No analytics or ads bundled for product tracking.  
- **Optional sync:** Sign in through **Supabase** when you want multi-device continuity — **HTTPS** in transit plus **Row Level Security** so only your account can read/write your rows.  

**Network use (plain language):**  
Without signing in, the extension does **not** need your browsing history as a feature. Normal use talks to **`*.supabase.co`** only when you opt into cloud sync (auth + sync). Extension pages may load **Google Fonts** (`fonts.googleapis.com` / `fonts.gstatic.com`) for typography — see the Privacy Policy.  

BBQOne does **not** run a behavioral ad network inside the extension. Read the Privacy Policy below for hosting, accountability, and what Supabase sign-in implies.

---

═══════════════════════════════════════════════════  
**LOOK & FEEL**  
═══════════════════════════════════════════════════  

Vintage terminal–inspired chrome (dense panels, monospace accents where it matters), manual **light / dark** theme control synced to storage, typography tuned for long sessions. Interface copy available in **English** and **Vietnamese**.

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

The policy names **Supabase** (auth + optional sync), **Google Fonts**, **clipboard/offscreen** (copy-to-clipboard helper), **`downloads`** (e.g. bookmark export), **`bookmarks`** and **`chrome.storage`** — aligned with current permissions.

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
