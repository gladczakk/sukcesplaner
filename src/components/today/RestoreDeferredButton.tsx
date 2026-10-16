import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";

interface RestoreDeferredButtonProps {
  projectId: string;
  milestoneId: string;
  taskId: string;
  title: string;
}

export default function RestoreDeferredButton({ projectId, milestoneId, taskId, title }: RestoreDeferredButtonProps) {
  const { setTaskDeferral } = useTaskApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function restore() {
    if (pending) return;
    setError(undefined);
    setPending(true);
    // After success the page reloads; keep the button locked meanwhile.
    let navigating = false;
    try {
      const result = await setTaskDeferral(projectId, milestoneId, taskId, null);
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
          setError("Nie znaleziono zadania. Odśwież stronę.");
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
      <Button
        variant="ghost"
        size="sm"
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        aria-disabled={pending}
        aria-busy={pending}
        aria-label={`Przywróć na dziś: ${title}`}
        onClick={() => {
          void restore();
        }}
      >
        Przywróć na dziś
      </Button>
      {error ? (
        <p role="alert" className="type-meta text-destructive-ink flex items-center gap-1">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
