# Study hub visual design

Calm, sleek, minimalist reading tool for cramming. One bold thing: serif display type. Everything else is quiet.

## Tokens (in `styles.css` `:root`)
- Color: paper `--bg`, ink `--text`, `--muted`, hairline `--border` (and `--border-strong` for controls). One accent (Berkeley slate `--accent`) for links, primary buttons, selection and focus. Ochre `--gsi*` is ONLY the priority-source ("Mock focus") marker: text or a thin rule, never a filled pill. `--good`/`--bad` only for grading feedback.
- Lines: 1px hairlines everywhere. No box-shadows (`--shadow: none`). No gradients.
- Radius: `--radius` 3px on controls (buttons, inputs, choices, chips), `--radius-lg` 6px on figures/media only, 0 on lists and sections.
- Type: `--serif` (Newsreader, weights 400/500) for h1, h2, page titles, module titles. `--font` (Instrument Sans 400/500/600) for body and UI. Major-third scale on 16px: .8rem, 1rem, 1.25rem, 1.563rem, 1.953rem, 2.441rem. Serif headings: line-height 1.15, letter-spacing -0.01em, weight 400–500. Body 1.6 line-height, reading measure ≤ 70ch. `font-variant-numeric: tabular-nums` on counts, scores, timers.

## Rules
- Prefer ruled lists (hairline separators between rows) over grids of boxed cards. A box (1px border) is only for things that are a single object you act on: a question, a flashcard, the passcode gate.
- Labels are sentence case, muted, .85rem, weight 500. No uppercase + letter-spacing eyebrows.
- No emoji in UI chrome. No "→" appended to buttons/links. No "A · B · C" meta strings: write "43 cards, 12 due" or split into separate muted spans.
- Callouts (tip/warning/example, prof emphasis, focus): 2px left rule in the type's color, no fill, short sentence-case title.
- Progress: 2px track in `--border`, fill in `--accent` (or `--good` when complete). No rounded pills.
- Selected/active state: accent 1px border + `--accent-soft` background. Hover: border goes `--border-strong`, nothing moves.
- Motion: none on load. Only state changes the user caused (flip card, open details). Respect `prefers-reduced-motion`.
- Keyboard focus: 2px accent outline, 2px offset, 3px radius.
- Must work at 375px and in light + dark.
