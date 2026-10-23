import * as React from "react";

import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

type SelectProps = Omit<React.ComponentProps<"select">, "children" | "onChange"> & {
  options: SelectOption[];
  onChange: (value: string) => void;
};

/** Native <select> styled with tokens — accessible and mobile-friendly with no extra dependency. */
function Select({ className, options, onChange, ...props }: SelectProps) {
  return (
    <select
      data-slot="select"
      className={cn(
        "type-body border-input bg-card text-foreground h-10 w-full rounded-md border px-3 outline-hidden transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2",
        "aria-invalid:border-destructive",
        className,
      )}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export { Select };
export type { SelectOption };
