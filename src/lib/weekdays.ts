/** Days of the week in display order (Monday first); `value` is the ISO number 1 = Monday .. 7 = Sunday. */
export const WEEKDAYS = [
  { value: 1, short: "pn", label: "poniedziałek" },
  { value: 2, short: "wt", label: "wtorek" },
  { value: 3, short: "śr", label: "środa" },
  { value: 4, short: "cz", label: "czwartek" },
  { value: 5, short: "pt", label: "piątek" },
  { value: 6, short: "so", label: "sobota" },
  { value: 7, short: "nd", label: "niedziela" },
] as const;
