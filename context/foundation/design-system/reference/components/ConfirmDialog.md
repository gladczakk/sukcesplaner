# ConfirmDialog

The confirmation for destructive actions: deleting a project or a milestone also deletes what is inside (FR-003, FR-005).

`sp-scrim` > `sp-dialog` with `role="alertdialog"`. Title as a question naming the object (*Usunąć projekt Edukacja domowa?*), one sentence with the exact counts that will disappear, then *Anuluj* (ghost) and the `danger` button repeating the verb. Focus starts on *Anuluj*; Esc closes. Never use the browser `confirm()`.
