# Button

Soft pill buttons for every action; one `sp-btn--primary` per screen region.

**Markup:** `<button class="sp-btn sp-btn--primary">` + optional inline 18px line icon before the label. Modifiers: `--primary`, `--secondary`, `--ghost`, `--danger`; sizes `--sm` (32px) and default (40px); `--icon` for icon-only (needs `aria-label`).

- **Primary** (`jojoba-strong` fill, `on-jojoba` label): the one main action — *Dodaj zadanie*, *Zapisz*.
- **Secondary** (`river` fill): companion actions — *Na jutro*, *Zamknij milestone*, *Częściowo*.
- **Ghost**: low-weight inline actions inside task rows, and *Anuluj*.
- **Danger** (`brick` fill): only inside a confirmation step (FR-003, FR-005: deleting a project or milestone removes its tasks). Never as the first button the user sees.
- Labels are verbs in the infinitive or imperative, Polish, sentence case: *Dodaj zadanie*, not *DODAJ*.
