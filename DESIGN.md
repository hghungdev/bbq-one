# BBQOne — Design System

Design reference for the **BBQOne Chrome extension** (Manifest V3). The UI is **Apple-inspired** — single blue accent, parchment surfaces, tight negative letter-spacing — adapted to a **fixed-size extension popup** (not a marketing website).

**Source of truth (code):**

| File | Role |
|------|------|
| `src/assets/styles/global.css` | Semantic CSS variables, light/dark overrides, popup shell constraints |
| `src/assets/styles/retro.css` | Shared utilities (scrollbar, selection, loading dots, `cursor-blink`) |
| `src/pages/App.vue` | Dashboard shell, header, tab layout |
| `src/components/ui/*` | Reusable controls (`RetroButton`, `RetroInput`, `IconButton`, …) |

When tokens change, update **`global.css` first**, then this document.

---

## Overview

BBQOne is a **local-first** productivity popup: **Calendar**, **Notes**, and **Bookmarks**, with optional **Supabase cloud sync**. All UI runs inside extension pages (`index.html` popup); there are **no content scripts** on visited sites.

**Design goals:**

- **Compact & readable** — 720×600 px popup; base text 13px; dense but not cramped.
- **One accent** — Action Blue (`#0066cc` light / `#2997ff` dark) for links, active tabs, focus rings, and primary actions.
- **Light + dark** — Class strategy on `<html data-theme="light|dark">`, persisted in `chrome.storage.local`.
- **Consistent chrome** — Same header, tokens, and button grammar across tabs and modals.
- **Accessible focus** — `outline: 2px solid var(--focus-ring)` on interactive elements.

---

## Color system

Semantic tokens live in `:root` and are **re-mapped** under `html[data-theme='dark']`. Components should use **semantic names**, never hard-coded hex.

### Brand & accent

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--color-primary` | `#0066cc` | `#2997ff` | Base accent |
| `--color-primary-focus` | `#0071e3` | `#66bfff` | Focus ring, hover emphasis |
| `--color-primary-on-dark` | `#2997ff` | `#7dc4ff` | Accent on dark surfaces |
| `--accent` | primary | primary-on-dark | Links, active tab, caret |
| `--accent-dashboard` | primary | primary-on-dark | Shell / login overlay accent |
| `--focus-ring` | primary-focus | primary-focus | `:focus-visible` outline |

### Surfaces & text

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--bg-primary` | `#f5f5f7` (parchment) | `#1c1c1e` | Page / shell background |
| `--bg-secondary` | `#ffffff` | `#2c2c2e` | Panels, inputs, modals |
| `--bg-panel` | `#fafafc` | `#3a3a3c` | Buttons, icon buttons, secondary panels |
| `--border` | `#e0e0e0` | `#48484a` | Hairlines, button borders |
| `--text-primary` | `#1d1d1f` | `#f5f5f7` | Body copy |
| `--text-secondary` | `#515154` | `#a1a1a6` | Labels, subheadings |
| `--text-muted` | `#6e6e73` | `#8e8e93` | Meta, placeholders, footer hints |
| `--bg-code` / `--text-on-code` | `#272729` / parchment | `#111113` / `#ebebf5` | Inline `code` in notes/editor |

### Status & feedback

| Token | Use |
|-------|-----|
| `--danger` | Errors, destructive hover (`#cf2228` light; `#ff6b6b` dark) |
| `--success` / `--sync-done` | Sync success, done states |
| `--surface-danger-muted` | Danger icon-button hover background |
| `--surface-accent-muted` | Accent icon-button background |
| `--overlay-scrim` | Modal backdrop (light `rgba(0,0,0,0.42)`; dark `0.72`) |

### Calendar-specific (semantic overrides in dark)

| Token | Purpose |
|-------|---------|
| `--calendar-banner-upcoming-*` | Blue banner: events **tomorrow** (dismissible) |
| `--calendar-banner-today-*` | Yellow banner: events **today** |
| `--calendar-search-focus-border` / `-bg` | **Yellow** focus when jumping to a date from search |
| `--cal-cell--today` (component) | **Blue** border for today's cell in the grid |

Search focus intentionally uses **yellow**; “today” in the grid uses **blue** — do not swap these roles.

### Soft accent fills

| Token | Use |
|-------|-----|
| `--accent-soft-bg` / `--accent-soft-bg-hover` | Hover states |
| `--accent-soft-border` | Icon button hover border |
| `--search-hit-bg` | Text selection + search highlight (`.search-hit`) |
| `--bg-dashboard-radial` | Subtle radial wash at top of dashboard shell |
| `--bg-dashboard-header-wash` | Header gradient wash |

---

## Typography

| Token | Value | Use |
|-------|-------|-----|
| `--font-body` | `'Inter', system-ui, …` | All UI (SF Pro substitute outside Apple OS) |
| `--font-mono` | `ui-monospace, …` | Clock tooltip context, settings version/email, code |
| `--font-size-base` | **13px** | Body (fixed; font-size setting removed) |
| `--font-size-sm` | 11px | Header chrome, small labels |
| `--font-size-xs` | 12px | Settings email, version footer |
| `--font-size-lg` | 15px | Modal titles, panel headings |

**Principles:**

- **Letter-spacing:** `-0.022em` on body; `0.06–0.1em` on uppercase section labels in settings.
- **Weights:** 400 body, 600 labels/buttons/headings. No weight 500.
- **Brand line:** `BBQOne` in header — `font-size: sm`, `letter-spacing: 0.08em`, `color: var(--accent)`.
- **Google Fonts:** Inter loaded on extension pages per CSP (`fonts.googleapis.com`).

---

## Layout & shell

### Popup constraints (`global.css`)

```text
min-width: 720px (--popup-min-width)
height:     600px (fixed; overflow hidden on html/body/#app)
```

The shell is a **single column flex column**: header → optional error strip → tab content.

### Dashboard shell (`App.vue` — `.shell.shell--dashboard`)

```text
┌─────────────────────────────────────────────────────────────┐
│ BBQOne │ [Calendar] [Notes] [Bookmark]     🌓 🕐 ☁ ⚙ 🔒/↪ │
│ CalendarTodayBanner (conditional)                           │
│ SearchBar (mode: calendar | notes | bookmarks)              │
├─────────────────────────────────────────────────────────────┤
│ Tab content (notes 3-col grid | bookmarks full | calendar)  │
└─────────────────────────────────────────────────────────────┘
```

**Header toolbar (right):**

| Control | Component | Notes |
|---------|-----------|-------|
| Theme | `ThemeModeToggle` | Single icon; toggles light/dark |
| Clock | `IconButton` | Display only; tooltip shows UTC offset from settings |
| Cloud sync | `CloudSyncStatusBadge` | When signed in; click = manual sync |
| Local pending | `SyncStatusBadge` | When anonymous; prompts sign-in |
| Settings | `IconButton` | Opens `SettingsModal` |
| Login / Logout | `IconButton` | Padlock (accent) vs door-out; no email in header |

**Tabs:** `RetroButton variant="sm"` with `.shell__tab-btn--active` → accent border + text.

**Notes tab grid:**

| Column | Width | Component |
|--------|-------|-----------|
| Folders | 180px fixed | `Sidebar` |
| Notes list | resizable (`useColumnResize`) | `NoteList` |
| Editor | flex | `NoteEditor` |

During **search**, editor column hides; note list expands.

**Default tab:** Calendar (`activeTab` initial value).

---

## Theme

| Item | Detail |
|------|--------|
| Store | `useThemeStore` → `chrome.storage.local` key `BBQ_UI_THEME_KEY` |
| DOM | `document.documentElement.dataset.theme = 'light' \| 'dark'` |
| Init | `main.ts` calls `useThemeStore().init()` before mount |
| Toggle | `ThemeModeToggle` → `theme.toggle()` |

Dark mode **redefines semantic tokens** in `global.css` (not a separate stylesheet). Calendar banner colors use **solid dark fills** in dark mode to avoid muddy rgba-on-dark.

---

## Components

### Buttons & inputs

| Component | File | Notes |
|-----------|------|-------|
| `RetroButton` | `src/components/ui/RetroButton.vue` | Default + `sm` variant; panel bg, accent text; `scale(0.97)` active |
| `RetroInput` | `src/components/ui/RetroInput.vue` | Pill shape (`--radius-pill`); accent caret; optional `digitOnly` for PIN |
| `IconButton` | `src/components/ui/IconButton.vue` | 32×32; variants `default`, `accent`, `danger` |
| `ThemeModeToggle` | `src/components/ui/ThemeModeToggle.vue` | Wraps `IconButton` + sun/moon SVG (17px) |
| `RetroConfirm` | `src/components/ui/RetroConfirm.vue` | Destructive confirm dialog pattern |

**Icon stroke:** SVG icons in header/toolbar use **1.75** stroke width, **17×17** px — match when adding new icons.

### Modals & overlays

Shared pattern:

- Fixed overlay: `background: var(--overlay-scrim)`
- Panel: `background: var(--bg-secondary)`, `border: 1px solid var(--border)`
- Settings panel adds **accent hairline**: `box-shadow: 0 0 0 1px var(--accent)`

| Modal | File |
|-------|------|
| Settings | `src/components/layout/SettingsModal.vue` |
| Login | `src/components/auth/LoginModal.vue` |
| Secure folder | `src/components/folders/SecureFolderModal.vue` |
| Calendar event | `src/components/calendar/CalendarEventModal.vue` |
| Bookmark PIN | `src/components/bookmarks/BookmarkPinModal.vue` |

**Settings modal layout:**

- Header: title + user **email** (mono, muted, right-aligned) when signed in
- Body: accordion sections (`SettingsAccordionSection`)
- Footer: `BBQOne v{version}` (mono) + Close button

**Settings sections (current):** UI language, UTC offset, bookmark PIN, account password (signed-in only).

### Sync badges

| Component | When |
|-----------|------|
| `CloudSyncStatusBadge` | Signed in — variants: `idle`, `done`, `syncing`, `unsaved`, `error` |
| `SyncStatusBadge` | Anonymous — local pending indicator |

### Calendar

| Piece | File |
|-------|------|
| Tab shell | `CalendarTab.vue` |
| Grid | `CalendarGrid.vue` + `CalendarCell.vue` |
| Today / upcoming banners | `CalendarTodayBanner.vue` |
| Month nav | `CalendarMonthNav.vue` |
| Event modal | `CalendarEventModal.vue` |
| Search panel | `CalendarSearchPanel.vue` |

Upcoming (1-day) banner dismiss state: `chrome.storage.session` via `calendarBannerDismiss.service.ts`; cleared on sign-in.

### Notes & bookmarks

| Area | Key components |
|------|----------------|
| Notes | `Sidebar`, `NoteList`, `NoteItem`, `NoteEditor`, `CodeBlock` |
| Folders | `FolderItem`, `SecureFolderModal`, `DeleteFolderModal` |
| Bookmarks | `BookmarkTab`, `BookmarkTree`, `PinKeypad`, `DeleteBackupModal` |

Active list items use `--accent-soft-bg` / accent border — same search-hit grammar as `.search-hit`.

---

## Utilities (`retro.css`)

| Class | Purpose |
|-------|---------|
| `.search-hit` | Highlight matched search text |
| `.retro-empty` | Empty / loading placeholder copy |
| `.retro-loading__dots` | Animated `...` after loading label |
| `.cursor-blink` | Blinking `\|` after text (login title) |
| Scrollbar | 6px; track `--bg-secondary`, thumb `--color-hairline` |

**Removed:** CRT scanlines / terminal chrome — class `.crt-scanlines` is a no-op stub for backward compatibility.

---

## Internationalization

All user-visible strings use **vue-i18n**:

- `src/i18n/en.ts`, `src/i18n/vi.ts`
- Template: `$t('key')` · Script: `t('key')` via `useLangStore()`

Do not ship hard-coded UI copy in components (except `docs/` static HTML).

---

## External pages

### Privacy policy (`docs/privacy-policy.html`)

Hosted standalone (e.g. GitHub Pages). **Not** a clone of the extension popup:

- Light-only, document-style layout
- Inter 15px body, white content card on `#f5f5f7` page
- Simple header with BBQOne brand link — **no theme toggle**
- Accent blue for brand and links only

Keep legal copy in sync with `manifest.json` version and actual permissions.

---

## Do's and Don'ts

### Do

- Use CSS variables from `global.css` for colors, radii, and fonts.
- Test **both** `data-theme="light"` and `data-theme="dark"` for new UI.
- Use existing primitives (`RetroButton`, `IconButton`, `RetroInput`) before inventing new button styles.
- Keep header minimal: brand + tabs + icon toolbar; put email and version in **Settings**.
- Use `--focus-ring` for keyboard focus on all interactive elements.
- Respect popup overflow: tab content uses `min-height: 0` + internal scroll, not page scroll.

### Don't

- Hard-code hex colors in Vue `<style>` blocks (except one-off SVG assets if unavoidable).
- Add a second accent color (yellow is **calendar semantic only**, not general CTAs).
- Reintroduce decorative CRT/terminal effects or heavy box shadows on chrome.
- Add font-size UI — body is fixed at 13px.
- Put email or extension version in the main header bar.
- Use ALL CAPS section titles in prose pages (privacy policy); sentence case reads more professional.

---

## Agent iteration guide

1. **Read** `global.css` tokens before styling new UI.
2. **Prefer** extending `RetroButton` / `IconButton` variants over new button classes.
3. **Modals:** copy overlay + panel pattern from `LoginModal.vue` or `SettingsModal.vue`.
4. **Dark mode:** add overrides only in `html[data-theme='dark']` block in `global.css` when introducing new semantic colors.
5. **Calendar colors:** if adding a new banner or focus state, define tokens in `global.css` with explicit dark-mode solid backgrounds.
6. **Verify** at 720×600 in Chrome extension popup after visual changes.

---

## Known gaps / out of scope

- Form validation styling is per-modal (no global error token beyond `--danger`).
- `README.md` may mention features not in current manifest (e.g. dictionary) — **manifest + this file + privacy policy** reflect shipping scope.
- Apple marketing components (product tiles, store grids, hero typography at 40–56px) are **not used** in the extension; only the **token palette** is borrowed.
- Privacy policy page intentionally does not support dark mode.

---

## Quick token reference (YAML)

```yaml
# Mirrors src/assets/styles/global.css — do not edit here without updating CSS
product: BBQOne
version: 1.2.1
popup:
  minWidth: 720px
  height: 600px
colors:
  primary: "#0066cc"
  primary-focus: "#0071e3"
  parchment: "#f5f5f7"
  canvas: "#ffffff"
  ink: "#1d1d1f"
typography:
  font: Inter
  base: 13px
  mono: ui-monospace
radii:
  sm: 8px
  md: 11px
  lg: 18px
  pill: 9999px
theme:
  attribute: data-theme
  values: [light, dark]
  storage: chrome.storage.local
```
