import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface InlineErrorProps {
  children: ReactNode;
  className?: string;
  /** `alert` for errors that appear after a user action; `status` for a static message present at page load. */
  role?: "alert" | "status";
}

/** Standalone error message with an icon and the word "Błąd:" (same markup as the message in `Field`). */
function InlineError({ children, className, role = "alert" }: InlineErrorProps) {
  return (
    <p role={role} className={cn("type-meta text-destructive-ink flex items-center gap-1", className)}>
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">Błąd:</span> {children}
      </span>
    </p>
  );
}

export { InlineError };
