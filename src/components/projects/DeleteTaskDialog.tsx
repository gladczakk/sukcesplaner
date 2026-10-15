import { useState } from "react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface DeleteTaskDialogProps {
  projectId: string;
  milestoneId: string;
  taskId: string;
  taskTitle: string;
}

export default function DeleteTaskDialog({ projectId, milestoneId, taskId, taskTitle }: DeleteTaskDialogProps) {
  const { deleteTask } = useTaskApi();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) setError(undefined);
    setOpen(next);
  }

  async function confirm() {
    if (pending) return;
    setError(undefined);
    setPending(true);
    // After success (or a 404 that reloads the page) the page reloads; keep the dialog locked meanwhile.
    let navigating = false;
    try {
      const result = await deleteTask(projectId, milestoneId, taskId);
      switch (result.status) {
        case "ok":
          navigating = true;
          window.location.reload();
          return;
        case "notFound":
          navigating = true;
          setError("Nie znaleziono zadania. Odświeżam stronę.");
          window.setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        case "unavailable":
          setError(result.error);
          break;
        case "unauthorized":
          navigating = true;
          return;
      }
    } finally {
      if (!navigating) setPending(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Usunąć zadanie ${taskTitle}?`}
      description="Tej operacji nie można cofnąć."
      confirmLabel="Usuń zadanie"
      onConfirm={() => {
        void confirm();
      }}
      pending={pending}
      error={error}
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive-ink" aria-label={`Usuń zadanie ${taskTitle}`}>
          Usuń
        </Button>
      }
    />
  );
}
