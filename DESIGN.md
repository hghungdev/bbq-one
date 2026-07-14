# BBQOne — Design System

Design reference for the **BBQOne Chrome extension** (Manifest V3). The UI is **Apple-inspired** — single blue accent, parchment surfaces, rounded capsule controls, soft cards, and tight negative letter-spacing — adapted to a **fixed-size extension popup** (not a marketing website).

**Source of truth (code):**

| File | Role |
|------|------|
| `src/assets/styles/global.css` | Semantic CSS variables, light/dark overrides, popup shell constraints |
| `src/assets/styles/retro.css` | Shared utilities (scrollbar, selection, loading dots, `cursor-blink`) |
| `src/pages/App.vue` | Dashboard shell, header,  tab layout |
| `src/components/ui/*` | Reusable controls (`RetroButton`, `RetroInput`, `IconButton`, …) |

When tokens change, update **`global.css` first**, then this document.

---

## Overview

BBQOne is a **local-first** productivity popup: **Calendar**, **Notes**, and **Bookmarks**, with optional **Supabase cloud sync**. All UI runs inside extension pages (`index.html` popup); there are **no content scripts** on visited sites.

**Design goals:**

- **Compact & readable** — 720×600 px popup; base text 13px; dense but not cramped.
- **One accent** — Action Blue (`#0066cc` light / `#3b82f6` dark) for links, active tabs, focus rings, and primary actions. Dark mode intentionally avoids ice-blue (`#7dc4ff`) on deep charcoal.
- **Light + dark** — Class strategy on `<html data-theme="light|dark">`, persisted in `chrome.storage.local`.
- **Consistent chrome** — Same header, capsule/card surfaces, tokens, and button grammar across tabs and modals.
- **Accessible focus** — `outline: 2px solid var(--focus-ring)` on interactive elements.

---

## Color system

Semantic tokens live in `:root` and are **re-mapped** under `html[data-theme='dark']`. Components should use **semantic names**, never hard-coded hex.

### Brand & accent

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--color-primary` | `#0066cc` | `#3b82f6` | Base accent (dark: mid blue, not ice) |
| `--color-primary-focus` | `#0071e3` | `#60a5fa` | Focus ring, hover emphasis |
| `--color-primary-on-dark` | `#2997ff` | `#60a5fa` | Soft hover tint on dark surfaces |
| `--accent` | primary | **primary** | Links, active tab, caret (dark uses mid blue) |
| `--accent-dashboard` | primary | **primary** | Shell / login overlay accent |
| `--focus-ring` | primary-focus | primary-focus | `:focus-visible` outline |

### Surfaces & text

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--bg-primary` | parchment | `#0f0f10` | Page / shell background (deep charcoal) |
| `--bg-secondary` | `#ffffff` | `#1a1a1c` | Panels, inputs, modals |
| `--bg-panel` | pearl | `#242428` | Raised surfaces, buttons, secondary panels |
| `--border` | hairline | `#2e2e32` | Hairlines, button borders |
| `--text-primary` | ink | `#f5f5f7` | Body copy |
| `--text-secondary` | muted ink | `#c2c2c7` | Labels, subheadings |
| `--text-muted` | body-muted | `#a8a8ae` | Meta, placeholders, footer hints |
| `--bg-code` / `--text-on-code` | tile / parchment | `#09090b` / `#ebebf5` | Inline `code` in notes/editor |

### Status & feedback

| Token | Use |
|-------|-----|
| `--danger` | Errors, destructive hover (`#cf2228` light; `#ff6b6b` dark) |
| `--success` / `--sync-done` | Sync success, done states |
| `--surface-danger-muted` | Danger / delete warn surfaces (dark: mix danger into panel — avoid muddy solid red fills) |
| `--surface-accent-muted` | Accent icon-button background |
| `--overlay-scrim` | Modal backdrop (light `rgba(0,0,0,0.42)`; dark `0.78`) |
| `--panel-ring` | Modal / header elevation shadow |

### Calendar-specific (semantic overrides in dark)

| Token | Purpose |
|-------|---------|
| `--calendar-banner-upcoming-*` | Cool slate + blue rail: events **tomorrow** (dismissible) |
| `--calendar-banner-today-*` | Cool charcoal + amber rail: events **today** (avoid olive-brown muddy fills) |
| `--calendar-search-focus-border` / `-bg` | **Yellow** focus when jumping to a date from search |
| `--cal-cell--today` (component) | **Blue** border for today's cell in the grid |
| `--cal-event-N-bg` / `-border` | Month-grid event chips — light: pastel rgba; dark: soft solid mix into panel + left color rail (`calendar-events.css`) |

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

- **Letter-spacing:** body text uses normal/tight spacing; headings and tabs use `-0.012em` to `-0.035em`. Avoid wide terminal-style tracking except for monospace metadata.
- **Weights:** 400 body, 600 labels/buttons, 700 section/card headings. Avoid 500 unless a component already uses it intentionally.
- **Brand line:** `BBQOne` in header — `font-size: 17px`, `font-weight: 700`, `letter-spacing: -0.035em`, `color: var(--accent)`.
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

**Tabs:** `RetroButton variant="sm"` inside `.shell__tabs` segmented capsule. Active tab is filled with `var(--accent)` and `var(--on-accent)`; inactive tabs stay transparent but keep hover affordance.

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

Dark mode **redefines semantic tokens** in `global.css` (not a separate stylesheet). Prefer a **deep charcoal elevation stack** (`#0f0f10` → `#1a1a1c` → `#242428`) and a **mid blue accent** (`#3b82f6`). Calendar banners use **solid cool fills** (not olive-brown muddy rgba). Month event chips in dark use **soft solid mixes + left color rail** (`calendar-events.css`) so tags stay readable on black cells without looking neon.

---

## Components

### Modern Surface Grammar

Use this as the default UI recipe for all new screens. A new component should look like it belongs beside `App.vue`, `BookmarkTab.vue`, `NoteEditor.vue`, `CalendarEventModal.vue`, and `SettingsModal.vue`.

#### 1. Outer Screens

Tab-level screens use a subtle accent wash over the main surface:

```css
background:
  radial-gradient(
    ellipse 110% 80% at 50% 0%,
    color-mix(in srgb, var(--accent) 4%, transparent) 0%,
    transparent 58%
  ),
  var(--bg-primary);
```

Use this for full tab panes and major panels, not every small card.

#### 2. Cards

Primary cards use `--radius-lg`, `var(--border)`, and a light inset highlight:

```css
border: 1px solid var(--border);
border-radius: var(--radius-lg);
background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
```

Use cards for panel headers, settings sections, toolbars, modal headers, form groups, and list containers.

#### 3. Capsules

Use `--radius-pill` for:

- Main tab groups and active tabs.
- Toolbar action groups.
- Small action buttons and inline action chips.
- Footer action bars in dialogs.
- Tags and small status pills.

#### 4. Rows

Rows should feel like soft list cards, not divider-only tables:

```css
border: 1px solid transparent;
border-radius: var(--radius-md);
background: color-mix(in srgb, var(--bg-panel) 58%, transparent);
transition: background 0.12s ease, border-color 0.12s ease;
```

Hover:

```css
border-color: var(--accent-soft-border);
background: var(--surface-accent-muted);
```

Active/selected:

```css
border-color: var(--accent-soft-border);
background: var(--surface-accent-muted);
box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
```

#### 5. Dialogs and Modals

All modal shells should follow the same pattern:

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

.modal-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  box-shadow: 0 18px 54px var(--panel-ring);
  overflow: hidden;
}
```

Modal internals:

- Header: inset `--radius-lg` card, not a full-width old-style stripe.
- Close: `IconButton`, not raw `✕` text.
- Body groups: card/form sections with `--radius-lg`.
- Actions: pill/capsule action bar with `RetroButton variant="sm"`.
- Errors: rounded danger callout using `--surface-danger-muted`.

Danger modals use the same shell, with a subtle danger wash:

```css
color-mix(in srgb, var(--danger) 5%, transparent)
```

Do not use square panels, raw horizontal rules, or `border-radius: 0`.

#### 6. Forms and Feedback

Labels:

- Use `font-size: var(--font-size-sm)` or `--font-size-xs`.
- Use `font-weight: 600`.
- Use tight/normal letter spacing, not terminal-style wide tracking.

Error callout:

```css
padding: 7px 9px;
border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
border-radius: var(--radius-md);
background: var(--surface-danger-muted);
color: var(--danger);
```

Success callout:

```css
border: 1px solid color-mix(in srgb, var(--success) 34%, var(--border));
border-radius: var(--radius-md);
background: color-mix(in srgb, var(--success) 10%, var(--bg-secondary));
color: var(--success);
```

### Buttons & inputs

| Component | File | Notes |
|-----------|------|-------|
| `RetroButton` | `src/components/ui/RetroButton.vue` | Default + `sm` variant; `sm` is capsule-style; `scale(0.97)` active |
| `RetroInput` | `src/components/ui/RetroInput.vue` | Pill shape (`--radius-pill`); accent caret; optional `digitOnly` for PIN |
| `IconButton` | `src/components/ui/IconButton.vue` | 32×32 pill; variants `default`, `accent`, `danger` |
| `ListItemSettingsMenu` | `src/components/ui/ListItemSettingsMenu.vue` | 26×26 gear trigger; Teleport menu with rename / optional move / delete icons; flips up near viewport bottom |
| `ThemeModeToggle` | `src/components/ui/ThemeModeToggle.vue` | Wraps `IconButton` + sun/moon SVG (17px) |
| `RetroConfirm` | `src/components/ui/RetroConfirm.vue` | Destructive confirm dialog pattern |

**Icon stroke:** SVG icons in header/toolbar use **1.75** stroke width, **17×17** px — match when adding new icons.

### Modals & overlays

Shared pattern:

- Fixed overlay: `background: var(--overlay-scrim)`
- Panel: `--radius-lg`, `background: var(--bg-secondary)` with subtle accent radial wash
- Shadow: `box-shadow: 0 18px 54px var(--panel-ring)`
- Inset header/action cards: `--radius-lg` or `--radius-pill`

| Modal | File |
|-------|------|
| Settings | `src/components/layout/SettingsModal.vue` |
| Login | `src/components/auth/LoginModal.vue` |
| Secure folder | `src/components/folders/SecureFolderModal.vue` |
| Move note | `src/components/notes/MoveNoteModal.vue` |
| Calendar event | `src/components/calendar/CalendarEventModal.vue` |
| Bookmark PIN | `src/components/bookmarks/BookmarkPinModal.vue` |
| Delete backup | `src/components/bookmarks/DeleteBackupModal.vue` |
| Delete folder | `src/components/folders/DeleteFolderModal.vue` |

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
| Notes | `Sidebar`, `NoteList`, `NoteItem`, `NoteEditor`, `CodeBlock`, `MoveNoteModal` |
| Folders | `FolderItem`, `SecureFolderModal`, `DeleteFolderModal` |
| List row actions | `ListItemSettingsMenu` on `FolderItem` / `NoteItem` (gear → rename / move / delete). Folder secure actions stay on **right-click** context menu. |
| Bookmarks | `BookmarkTab`, `BookmarkTree`, `PinKeypad`, `DeleteBackupModal` |

**Move note (v1):** `notes.moveNoteToFolder(noteId, targetFolderId)` — only **non-secure → non-secure**. Store rejects secure source/target (`SECURE_FOLDER_MOVE_UNSUPPORTED`). No DB migration; uses existing `folder_id` + sync/RPC. Secure-folder moves (re-encrypt title + bodies) are out of scope for v1.

Active list items use `--surface-accent-muted` + `--accent-soft-border`. Avoid active states that only change text color or border.

---

## Utilities (`retro.css`)

| Class | Purpose |
|-------|---------|
| `.search-hit` | Highlight matched search text |
| `.retro-empty` | Empty / loading placeholder copy |
| `.retro-loading__dots` | Animated `...` after loading label |
| `.cursor-blink` | Legacy blinking `\|`; avoid in new UI unless intentionally preserving old branding |
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
- Build new panels with the modern surface grammar above: radial shell, inset card headers, capsule action bars.
- Use `--radius-lg` for dialogs/cards, `--radius-md` for rows, and `--radius-pill` for controls/chips.
- Use `IconButton` for close/delete/restore icon actions.
- Keep header minimal: brand + tabs + icon toolbar; put email and version in **Settings**.
- Use `--focus-ring` for keyboard focus on all interactive elements.
- Respect popup overflow: tab content uses `min-height: 0` + internal scroll, not page scroll.

### Don't

- Hard-code hex colors in Vue `<style>` blocks (except one-off SVG assets if unavoidable).
- Add a second accent color (yellow is **calendar semantic only**, not general CTAs).
- Reintroduce decorative CRT/terminal effects or heavy box shadows on chrome.
- Use `border-radius: 0`, raw `✕` text close buttons, full-width modal header stripes, or divider-only list rows.
- Use square keypad/button tiles; PIN/keypad controls should be rounded cards/capsules.
- Add font-size UI — body is fixed at 13px.
- Put email or extension version in the main header bar.
- Use ALL CAPS section titles in prose pages (privacy policy); sentence case reads more professional.

---

## Agent iteration guide

1. **Read** `global.css` tokens before styling new UI.
2. **Prefer** extending `RetroButton` / `IconButton` variants over new button classes.
3. **Modals:** copy overlay + panel pattern from `SettingsModal.vue`, `CalendarEventModal.vue`, or `RetroConfirm.vue`.
4. **Dark mode:** add overrides only in `html[data-theme='dark']` block in `global.css` when introducing new semantic colors.
5. **Calendar colors:** banners → solid cool fills in `global.css` dark block; month chips → `calendar-events.css` (light pastel vs dark soft-solid + left rail). Do not paste light pastel rgba onto dark cells.
6. **List row actions:** prefer `ListItemSettingsMenu` over always-visible trash; keep double-click / F2 rename.
7. **Verify** at 720×600 in Chrome extension popup after visual changes.
8. **Before release:** run `npm run type-check` and `npm run build`.

### New Screen Checklist

Before shipping a new screen or modal:

- [ ] Uses semantic CSS variables only; no hard-coded colors in Vue styles.
- [ ] Supports both light and dark via existing tokens.
- [ ] Uses modern shell/card/capsule patterns from this file.
- [ ] Uses `RetroButton`, `RetroInput`, and `IconButton` where possible.
- [ ] Has visible `:focus-visible` states.
- [ ] Avoids `border-radius: 0`, raw separators, and text-only icon buttons.
- [ ] Keeps scroll inside the component with `min-height: 0` where needed.
- [ ] Uses i18n for all user-visible text.

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
version: 1.3.2
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
  sm: 10px
  md: 12px
  lg: 16px
  pill: 9999px
theme:
  attribute: data-theme
  values: [light, dark]
  storage: chrome.storage.local
```
