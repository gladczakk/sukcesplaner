import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";

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
  /** Element that opens the dialog; Radix returns focus to it when the dialog closes. */
  trigger?: ReactNode;
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
  trigger,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <InlineError>{error}</InlineError> : null}
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
