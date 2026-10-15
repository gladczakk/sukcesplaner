import { useState } from "react";

import { useMilestoneApi } from "@/components/hooks/use-milestone-api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { plural } from "@/lib/format";

interface DeleteMilestoneDialogProps {
  projectId: string;
  milestoneId: string;
  milestoneName: string;
  taskCount: number;
}

export default function DeleteMilestoneDialog({
  projectId,
  milestoneId,
  milestoneName,
  taskCount,
}: DeleteMilestoneDialogProps) {
  const { deleteMilestone } = useMilestoneApi();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const description =
    taskCount > 0
      ? `Usuniesz też ${taskCount} ${plural(taskCount, ["zadanie", "zadania", "zadań"])}.`
      : "Milestone nie ma zadań.";

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
      const result = await deleteMilestone(projectId, milestoneId);
      switch (result.status) {
        case "ok":
          navigating = true;
          window.location.reload();
          return;
        case "notFound":
          navigating = true;
          setError("Nie znaleziono milestona. Odświeżam stronę.");
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
      title={`Usunąć milestone ${milestoneName}?`}
      description={description}
      confirmLabel="Usuń milestone"
      onConfirm={() => {
        void confirm();
      }}
      pending={pending}
      error={error}
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive-ink">
          Usuń
        </Button>
      }
    />
  );
}
