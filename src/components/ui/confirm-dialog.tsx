import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Question naming the object, e.g. "Usunąć projekt Migracja CRM?" */
  title: string;
  /** One sentence with the exact counts that will disappear. */
  description: ReactNode;
  /** Repeats the verb of the action, e.g. "Usuń projekt". */
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: string;
}

/** Confirmation for destructive actions. Focus starts on "Anuluj" (Radix focuses the cancel button), Esc closes. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  error,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="type-meta text-destructive-ink flex items-center gap-1">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Błąd:</span> {error}
            </span>
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={pending}>
            Anuluj
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
