# TaskCheck

The 22px task checkbox with three states: do zrobienia, częściowo, zrobione (FR-011).

`<button class="sp-check" data-state="todo|partial|done" aria-label="…">`. Partial is a diagonal half fill in `jojoba-strong`; done is a full fill with a white check. Add `sp-check--milestone` for the diamond used when a milestone itself is the last step (Business Logic). Clicking cycles todo → done; *częściowo* is set from the row action, so a mis-tap never marks partial.
