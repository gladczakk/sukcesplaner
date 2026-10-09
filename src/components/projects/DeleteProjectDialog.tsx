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
    setError(undefined);
    setPending(true);
    try {
      const result = await deleteProject(projectId);
      switch (result.status) {
        case "ok":
          window.location.assign("/projects");
          return;
        case "notFound":
          setError("Nie znaleziono projektu. Odświeżam stronę.");
          window.setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        case "unavailable":
          setError(result.error);
          break;
        case "unauthorized":
          return;
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        className="text-destructive-ink self-start"
        onClick={() => {
          handleOpenChange(true);
        }}
      >
        <Trash2 aria-hidden="true" />
        Usuń projekt…
      </Button>
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
      />
    </>
  );
}
