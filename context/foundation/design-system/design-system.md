# SukcesPlaner design system

Design specification for how SukcesPlaner looks: tokens, component catalogue, screen layouts, copy. Read this file fully before any UI work and follow the contract below. It is a reference for `/10x-ui` and the core chain, not a skill and not a second source of values.

## How this fits the repo (the contract)

The app runs Tailwind v4 + shadcn/ui (`new-york`). The design system adapts to that stack, not the other way round:

| Part | Where it lives | Notes |
|---|---|---|
| **Values** (colours, radii, shadows, fonts, type styles) | `src/styles/global.css`: `:root` / `.dark` hold values, `@theme inline` publishes them | Single source. Roles use shadcn names (`primary`, `muted`, `destructive`…) plus app roles (`brand`, `warning`, `info`, `project-*`). Never raw colours inside `@theme inline` |
| **Components** | `src/components/ui/` (shadcn, extend with `npx shadcn@latest add <name>`) and app components next to it | Port a component from `reference/components/` only when a view needs it, keeping values exact. No second `Button`, no second `shadcn init` |
| **Dark mode** | `.dark` class on `<html>`, set in `src/layouts/Layout.astro` from the OS or `localStorage.theme` (`"dark"` / `"light"`) | Changed at the token layer only; never by editing component classes |
| **This folder** | `context/foundation/design-system/` | Spec, references, screenshots, raw values snapshot |

Rules: if a value is missing, add it to `global.css` (both `:root` and `.dark`) and to `tokens/tokens.json`, and tell the user. Views use token classes (`bg-card`, `text-muted-foreground`, `rounded-pill`, `type-display`), never hex, palette classes (`bg-green-700`) or arbitrary values (`p-[13px]`).

## Files

| File | Use it for |
|---|---|
| `design-system.md` (this) | Contract, token names, component catalogue, screen specs, copy |
| `tokens/tokens.json` | Raw values of all tokens with a `usage` note each. **Import snapshot**; the runtime source is `src/styles/global.css` |
| `reference/components/<Name>.md` + `.html` | Guideline and live markup per component |
| `reference/screens/<screen>.html` + `.md` | Full screen markup and spec for all 3 screens, desktop + mobile: `day-view`, `calendar-view`, `project-view` (+ `-mobile`). Open in a browser to compare |
| `reference/screenshots/*.png` | Target look, light + dark (rendered with fallback fonts; the real app uses Newsreader + Figtree) |
| `reference/legacy/` | Superseded by `global.css`, kept only for lookup, **not imported**: `tokens.css` (old variable names), `tailwind.preset.v3.js` (Tailwind v3 preset), `components/components.css` (`sp-` classes used by the `.html` references), `CLAUDE-snippet.md` |

## Product context

Personal planner (PRD: SukcesPlaner) joining long-running projects from different life areas (Dom / Sport / Praca). Hierarchy: **projekt → milestone (required date) → zadanie (optional own deadline)**. The core screen is **Lista na dziś**: tasks from the nearest open milestone of every project, sorted by deadline, overdue first, tasks without a deadline last; when all tasks of a milestone are done, the milestone itself appears as the last step. Guardrail: nothing leaves the list without a visible step; an approaching milestone is signaled before its date. Web app, fully usable on phone and desktop.

Mood: calm paper planner, muted botanical greens, warm ochre and brick for urgency, Times-like serif for dates and names.

## Setup (already done in the repo)

1. Tokens are in `src/styles/global.css`. The fonts (Newsreader + Figtree) load through `<link>` tags in `src/layouts/Layout.astro` — not through a CSS `@import`, which Tailwind would place after other rules where browsers ignore it.
2. `<html lang="pl">` and the dark-mode class script are in `Layout.astro`.
3. Pages that need serif headings or dates use `font-serif` or a `type-*` class; body text is `font-sans` by default.

## Color tokens

Palette source: White River `#E2E3D7`, Jojoba `#7F8770`, Kensington Green `#95B1AE`, English Ochre `#BB7940`, Boston Brick `#814C3E`.

Design-source names (left, used in the `.md`/`.html` references and `tokens.json`) map to repo roles (right, used in code). Code uses only the right column.

| Design name | Tailwind role (`bg-*` / `text-*` / `border-*`) | Light | Dark | Use |
|---|---|---|---|---|
| `bg` | `background` | #F4F4EE | #191C17 | Page ground |
| `surface` | `card`, `popover` | #FBFBF7 | #22261F | Panels, task list, cards, dialogs |
| `river` | `secondary`, `muted`, `sidebar` | #E2E3D7 | #2C3128 | Sidebar, secondary button, sunken wells |
| `line` | `border`, `input` | #D5D7C8 | #3A4034 | Hairlines, borders |
| `ink` | `foreground` | #23271F | #E2E3D7 | Primary text |
| `ink-muted` | `muted-foreground` | #5E6355 | #A6AB98 | Metadata, captions |
| `jojoba` | `brand` | #7F8770 | #A3AB92 | Marks, active icons, progress. Not for body text |
| `jojoba-strong` / `jojoba-hover` | `primary` / `primary-hover` | #6B7360 / #5E6655 | #A3AB92 / #B6BDA6 | Primary button fill / hover |
| `on-jojoba` | `primary-foreground` | #FFFFFF | #191C17 | Text on primary button |
| `jojoba-soft` / `jojoba-ink` | `accent` + `accent-foreground`, also `success-soft` / `success-ink` | #E6E9DE / #4E5544 | #2A2F25 / #C3CAB2 | Selected filter, active nav, "zrobione" |
| `kensington` | `info` | #95B1AE | #95B1AE | Selected day, info accent |
| `kensington-soft` / `kensington-ink` | `info-soft` / `info-ink` | #E1EBEA / #3F5E5A | #22312F / #B9D0CD | "jutro" chip, info |
| `ochre` | `warning` | #BB7940 | #D39A63 | Due today / milestone soon signal |
| `ochre-soft` / `ochre-ink` | `warning-soft` / `warning-ink` | #F3E4D3 / #7A4A1E | #3A2A1B / #E2B88E | "dziś" chip, soon banner |
| `brick` / `on-brick` | `destructive` / `destructive-foreground` | #814C3E / #FFFFFF | #C27C6A / #191C17 | Overdue, destructive button |
| `brick-soft` / `brick-ink` | `destructive-soft` / `destructive-ink` | #F1E2DD / #814C3E | #3B231D / #E0A595 | "po terminie" chip, overdue banner |
| `focus` | `ring` | #3F5E5A | #B9D0CD | 2px focus ring, 2px offset (= kensington-ink) |
| `project-sage, -kensington, -ochre, -brick, -teal, -sand` | `project-*` (same names) | | | Project colors (dots, calendar bars, milestone diamonds only) |

Elevation: `shadow-card` (faint, panels) and `shadow-pop` (menus, floating add button). Radii: `rounded-sm` 6 · `rounded-md` 12 · `rounded-lg` 20 · `rounded-pill` 999 (this overrides the shadcn defaults on purpose).

Rules:
- Text pairs: `ink`/`ink-muted` on `bg`, `surface`, `river`; `*-ink` on its own `*-soft` or on `surface`. All pass WCAG AA in both themes. Do not create new pairs without checking 4.5:1.
- Urgency is always color + word + icon, never color alone.
- Project colors never become text or large fills.

## Typography

- `--font-serif`: **Newsreader** (fallback Times New Roman). Dates, project/milestone names, section headings. Never buttons or metadata.
- `--font-sans`: **Figtree** (fallback system-ui). Everything you operate.

| Style (class `type-<name>`, e.g. `type-display`) | Family | Size/line | Weight | Use |
|---|---|---|---|---|
| `display` | serif | 40/44 (32/36 on phone) | 500 | Day heading "Wtorek, 6 października"; project name. One per screen |
| `title` | serif | 28/34 | 500 | Month title, dialog title |
| `section` | serif | 20/26 | 600 | Section headings ("Najbliższe milestony") |
| `quote` | serif italic | 17/24 | 400 | Milestone description, empty states |
| `task` | sans | 16/22 | 500 | Task title |
| `body` | sans | 15/22 | 400 | Running text, inputs |
| `meta` | sans | 13/18 | 400 | "Projekt · Milestone" line, in `ink-muted` |
| `button` | sans | 14/20 | 600 | Buttons, chips |
| `eyebrow` | sans | 12/16, +0.08em, UPPERCASE | 600 | Labels ("DZIŚ", "PROJEKTY") |

Numbers in counts and dates: `font-variant-numeric: tabular-nums`.

## Spacing, radius, elevation

- Spacing (4px base) is the default Tailwind scale, no custom tokens: 4 = `1` · 8 = `2` · 12 = `3` · 16 = `4` · 24 = `6` · 32 = `8` · 48 = `12` (e.g. `p-4`, `gap-6`). The references call these `space-1`…`space-7`.
- Radius: `radius-sm` 6 (checkbox, calendar cell) · `radius-md` 12 (cards, inputs, dialogs) · `radius-lg` 20 (mobile sheets) · `radius-pill` 999 (buttons, chips, nav items). **Pill = signature shape. Diamond = milestone** everywhere.
- Separate with `line` hairlines first. `shadow-card` (faint) on panels, `shadow-pop` only for menus and the floating add button.

## Components (see `reference/components/`)

The `sp-*` class names below come from the design source (`reference/legacy/components/components.css`, which the `.html` references link to). They are **not** used in the app: implement each component as a React/Astro component in `src/components/ui/` (or next to it) with token classes, keeping the values and rules from this table and from `reference/components/<Name>.md`. Port a component only when a view needs it.

| Component | Classes (design source) | Key rules |
|---|---|---|
| Button | `sp-btn` + `--primary` / `--secondary` / `--ghost` / `--danger`, `--sm` (32px), `--icon` | 40px pill. One primary per region. Danger only inside a confirmation dialog |
| Chip (deadline) | `sp-chip` + `--overdue` / `--today` / `--tomorrow` / (none = date) / `--none` / `--done` | Icon + word: "2 dni po terminie", "wczoraj", "dziś", "jutro", "czw, 8 paź", "bez terminu" |
| Chip (filter) | `sp-chip sp-chip--filter` as `<button aria-pressed>` | Life-area filter: Wszystko · Dom · Sport · Praca |
| ProjectDot | `sp-dot sp-dot--{sage,kensington,ochre,brick,teal,sand}`, `--lg` | Always next to the project name |
| TaskCheck | `<button class="sp-check" data-state="todo|partial|done">`, `--milestone` (diamond) | Click: todo→done. "Częściowo" is set from the row action |
| TaskRow | `sp-list` > `sp-task` (+ `--partial`, `--done`, `--milestone`, `--active`) | Check · title + meta (dot, project · milestone) · chip + actions (Częściowo, Na jutro). Actions on hover/focus on desktop, always visible on touch / under 560px. List ends with `sp-add` row "Dodaj zadanie do projektu…" |
| MilestoneCard | `sp-ms` (+ `--risk` ochre border ≤2 days with open tasks, `--late` brick border past date) | Diamond in project color, name (serif), project, countdown chip + date, progress bar, "2/6 zadań zrobione · 1 po terminie" |
| Banner | `sp-banner`, `--late`, `role="status"` | One sentence, milestone name in bold |
| Navigation | `sp-nav` (sidebar), `sp-tabbar` (mobile), `sp-fab` | Destinations: Dziś, Kalendarz, Projekty |
| CalendarMonth | `sp-cal` (+ `--compact` on phones) > `sp-cal__day` (`--out`, `--weekend`, `--today`, `--selected`) with `sp-cal__ms` (`--done`, `--late`, `--project`) and `sp-cal__tasks` | Monday-first. Max 2 milestones per cell then "+N więcej"; task deadlines only as a count with Polish plurals ("1 termin zadania", "2 terminy zadań", "5 terminów zadań") |
| MilestoneSection | `sp-timeline` > `sp-mss` (`--done`, `--current`, `--late`, default = planned) | Project view. Current milestone expanded with its TaskRows (no project meta); others collapsed behind "Pokaż N zadań"; empty milestone shows `sp-empty` |
| ConfirmDialog | `sp-scrim` > `sp-dialog` `role="alertdialog"` | Delete project/milestone: question title naming the object, exact counts that disappear, "Anuluj" + danger button. Focus starts on "Anuluj" |
| Panel | `sp-panel`, `sp-dl`, `sp-swatches`, `sp-progress` | Details rail in project view; color picker for project colors |

Icons: Lucide (`lucide-react` or equivalent), 18px, stroke 1.6, `currentColor`. Map: Dziś=`sun`, Kalendarz=`calendar`, Projekty=`folder`, add=`plus`, Na jutro=`arrow-right`, Częściowo=`circle-half` (or `contrast`), soon=`clock`, overdue=`triangle-alert`, delete=`trash-2`. No emoji.

## Layout and breakpoints

- **≥1100px:** grid `240px | 1fr | 300px` = sidebar on `river` · main column (padding `space-7` top, `space-6` sides) · milestone rail.
- **768–1099px:** sidebar + main; the most urgent rail item becomes a Banner above the list.
- **<768px:** one column, 16px gutters, bottom `sp-tabbar`, `sp-fab` bottom-right above it, display heading 32/36 and short date ("Wtorek, 6 paź"), chips move under the meta line.

## Screens (all three designed — `reference/screens/`)

Compare your implementation against the matching `.html` (open in a browser) and `reference/screenshots/<screen>-light|dark.png`. Example data in the references (Edukacja domowa, Półmaraton Kraków, Migracja CRM, Remont łazienki; today = Tue 6 Oct 2026) is placeholder content only.

### 1. Lista na dziś — `day-view.html`, `day-view-mobile.html`
Top to bottom: eyebrow "Dziś" → `display` date → summary "9 pozycji · 2 po terminie · 1 milestone do zamknięcia" (overdue number in `brick-ink`) → primary "Dodaj zadanie" (right) → filter chips → task list (sorted per PRD; a milestone with all tasks done appears as a `sp-task--milestone` row) → rail: "Najbliższe milestony", one Banner, 3–5 MilestoneCards nearest first. Phone: short date, one Banner instead of the rail.

### 2. Kalendarz — `calendar-view.html`, `calendar-view-mobile.html`
Shows **deadlines** across all projects (milestones, project ends, count of task deadlines). It is not a plan for other days (PRD non-goal). Header: eyebrow "Kalendarz", "Październik 2026" in `display`, prev / "Dziś" / next. Filter chips + legend. CalendarMonth grid. Rail for the selected day: date in `section`, note "Terminy tego dnia. Plan do zrobienia jest w zakładce Dziś.", MilestoneCards for that day, tasks with that deadline, secondary "Dodaj milestone". Phone: compact grid (diamonds + dot for task deadlines), selected day below.

### 3. Widok projektu — `project-view.html`, `project-view-mobile.html`
Header: back link "Projekty", project dot + eyebrow "Projekt · Dom", name in `display`, description in `quote`, "Termin projektu: 20 cze 2027", "1/5 milestonów zamkniętych", actions "Edytuj" + primary "Dodaj milestone". Body: `sp-timeline` of MilestoneSections by date (done → current → planned). Rail: "Szczegóły" panel (obszar życia, termin, kolor, counts, progress) and ghost "Usuń projekt…" in `brick-ink` that opens ConfirmDialog. Overdue project (FR-015): "po terminie" chip next to the eyebrow and in the projects list. Phone: actions under the header, details behind "Edytuj".

### Not designed yet
Login, projects list, add/edit forms (project, milestone, task). Build them from the tokens and components above: forms in a `sp-dialog` (desktop) or `radius-lg` bottom sheet (phone), inputs 40px high with `line` border and `radius-md`, labels in `meta`. Tell the user these screens have no reference yet.

## Copy (UI is Polish)

- Short, plain, sentence case; uppercase only in `eyebrow`.
- Domain words: projekt, milestone (not "kamień milowy"), zadanie, obszar życia; states: do zrobienia, częściowo, zrobione.
- Buttons: "Dodaj zadanie", "Na jutro", "Częściowo", "Zamknij milestone", "Zapisz", "Anuluj", "Usuń projekt".
- Dates: "czw, 8 paź"; relative "dziś", "jutro", "za 2 dni", "wczoraj", "2 dni po terminie"; full date only in the heading. Use `Intl.DateTimeFormat('pl-PL')`, Polish plural rules (1 dzień, 2–4 dni, 5+ dni; 1 zadanie, 2–4 zadania, 5+ zadań).
- Warnings name the thing and the fact: "Akceptacja planu migracji jest jutro. 2 zadania są jeszcze otwarte." No exclamation marks, no emoji.
- Delete confirmations name what disappears: "Usunąć projekt Migracja CRM? Usuniesz też 3 milestony i 12 zadań."

## Interaction rules

- Every control has the 2px `focus` ring with 2px offset (`:focus-visible`).
- Done/moved tasks: brief strike-through or "Przeniesiono na jutro" feedback, then the row leaves; never vanish instantly.
- Touch targets ≥40px; respect `prefers-reduced-motion`.

## Checklist before finishing any UI task

- [ ] Only tokens used; no raw hex, no new font, no off-scale spacing/radius
- [ ] Looks right in light and dark (`.dark` on `<html>`)
- [ ] Works at 390px and 1280px, no horizontal scroll
- [ ] Urgency has a word + icon, not just color
- [ ] Polish copy follows the rules above
- [ ] Compared against `reference/screens/*.html` and screenshots
