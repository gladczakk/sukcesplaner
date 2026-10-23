import { Check, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { WEEKDAYS } from "@/lib/weekdays";

interface WeekdayPickerProps {
  /** Id prefix; the day buttons get `${id}-1` (Monday) .. `${id}-7` (Sunday), the group error `${id}-message`. */
  id: string;
  /** Selected ISO days (1 = Monday .. 7 = Sunday). */
  value: readonly number[];
  /** Called with the new selection sorted ascending. */
  onChange: (value: number[]) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** Seven toggle buttons (pn–nd) for choosing any number of weekdays; the "Chip (filter)" pattern, `<button aria-pressed>`. */
function WeekdayPicker({
  id,
  value,
  onChange,
  label = "Dni tygodnia",
  error,
  disabled,
  className,
}: WeekdayPickerProps) {
  const messageId = `${id}-message`;

  function toggle(day: number) {
    const next = value.includes(day) ? value.filter((item) => item !== day) : [...value, day];
    onChange(next.sort((a, b) => a - b));
  }

  return (
    <fieldset
      data-slot="weekday-picker"
      aria-describedby={error ? messageId : undefined}
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <legend className="type-meta text-muted-foreground mb-1 p-0">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => {
          const pressed = value.includes(day.value);
          return (
            <button
              key={day.value}
              id={`${id}-${day.value}`}
              type="button"
              aria-pressed={pressed}
              aria-label={day.label}
              disabled={disabled}
              onClick={() => {
                toggle(day.value);
              }}
              className={cn(
                "type-button rounded-pill inline-flex h-10 min-w-10 items-center justify-center gap-1 border px-3 outline-hidden transition-colors",
                "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
                pressed
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
                  : "border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
                error && !pressed && "border-destructive",
              )}
            >
              {pressed ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              <span aria-hidden="true">{day.short}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p id={messageId} role="alert" className="type-meta text-destructive-ink flex items-center gap-1">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Błąd:</span> {error}
          </span>
        </p>
      ) : null}
    </fieldset>
  );
}

export { WeekdayPicker };
