import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { useMilestoneApi } from "@/components/hooks/use-milestone-api";
import DeleteMilestoneDialog from "@/components/projects/DeleteMilestoneDialog";
import MilestoneFormDialog from "@/components/projects/MilestoneFormDialog";
import { Button } from "@/components/ui/button";
import type { Milestone } from "@/types";

interface MilestoneRowActionsProps {
  projectId: string;
  projectDueDate: string;
  milestone: Pick<Milestone, "id" | "name" | "due_date" | "completed_at">;
  taskCount: number;
}

export default function MilestoneRowActions({
  projectId,
  projectDueDate,
  milestone,
  taskCount,
}: MilestoneRowActionsProps) {
  const { setMilestoneCompleted } = useMilestoneApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isCompleted = milestone.completed_at !== null;

  async function toggle() {
    if (pending) return;
    setError(undefined);
    setPending(true);
    // After success the page reloads; keep the button locked meanwhile.
    let navigating = false;
    try {
      const result = await setMilestoneCompleted(projectId, milestone.id, !isCompleted);
      switch (result.status) {
        case "ok":
          navigating = true;
          window.location.reload();
          return;
        case "fieldErrors":
        case "unavailable":
          setError(result.error);
          break;
        case "notFound":
          setError("Nie znaleziono milestona. Odśwież stronę.");
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
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <MilestoneFormDialog mode="edit" projectId={projectId} projectDueDate={projectDueDate} milestone={milestone} />
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-label={`${isCompleted ? "Otwórz ponownie" : "Zamknij milestone"} ${milestone.name}`}
          onClick={() => {
            void toggle();
          }}
        >
          {isCompleted ? "Otwórz ponownie" : "Zamknij milestone"}
        </Button>
        <DeleteMilestoneDialog
          projectId={projectId}
          milestoneId={milestone.id}
          milestoneName={milestone.name}
          taskCount={taskCount}
        />
      </div>
      {error ? (
        <p role="alert" className="type-meta text-destructive-ink flex items-center gap-1">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
