import { useState } from "react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";

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
        aria-disabled={pending}
        aria-busy={pending}
        aria-label={`Przywróć na dziś: ${title}`}
        onClick={() => {
          void restore();
        }}
      >
        Przywróć na dziś
      </Button>
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
