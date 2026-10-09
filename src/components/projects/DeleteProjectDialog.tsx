import { useState } from "react";
import { Trash2 } from "lucide-react";

import { useProjectApi } from "@/components/hooks/use-project-api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { plural } from "@/lib/format";

interface DeleteProjectDialogProps {
  projectId: string;
  projectName: string;
  counts: { milestones: number; tasks: number };
}

export default function DeleteProjectDialog({ projectId, projectName, counts }: DeleteProjectDialogProps) {
  const { deleteProject } = useProjectApi();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const description =
    counts.milestones + counts.tasks > 0
      ? `Usuniesz też ${counts.milestones} ${plural(counts.milestones, ["milestone", "milestony", "milestonów"])} i ${counts.tasks} ${plural(counts.tasks, ["zadanie", "zadania", "zadań"])}.`
      : "Projekt nie ma milestonów ani zadań.";

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) setError(undefined);
    setOpen(next);
  }

  async function confirm() {
    if (pending) return;
    setError(undefined);
    setPending(true);
    // After success (or a 404 that reloads the page) the browser navigates; keep the dialog locked meanwhile.
    let navigating = false;
    try {
      const result = await deleteProject(projectId);
      switch (result.status) {
        case "ok":
          navigating = true;
          window.location.assign("/projects");
          return;
        case "notFound":
          navigating = true;
          setError("Nie znaleziono projektu. Odświeżam stronę.");
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
      title={`Usunąć projekt ${projectName}?`}
      description={description}
      confirmLabel="Usuń projekt"
      onConfirm={() => {
        void confirm();
      }}
      pending={pending}
      error={error}
      trigger={
        <Button variant="ghost" className="text-destructive-ink self-start">
          <Trash2 aria-hidden="true" />
          Usuń projekt…
        </Button>
      }
    />
  );
}
