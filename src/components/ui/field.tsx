import * as React from "react";
import { CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  /** Marks the control as required for assistive technology (`aria-required`). */
  required?: boolean;
  children: React.ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string; "aria-required"?: boolean }>;
}

/** Label + control + message with correct a11y wiring. The child control must use the same `id`. */
function Field({ id, label, error, hint, className, required, children }: FieldProps) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error) || Boolean(hint);

  const control = React.cloneElement(children, {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": hasMessage ? messageId : undefined,
    "aria-required": required ? true : undefined,
  });

  return (
    <div data-slot="field" className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="type-meta text-muted-foreground">
        {label}
      </label>
      {control}
      {error ? (
        <p id={messageId} role="alert" className="type-meta text-destructive-ink flex items-center gap-1">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Błąd:</span> {error}
          </span>
        </p>
      ) : hint ? (
        <p id={messageId} className="type-meta text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
