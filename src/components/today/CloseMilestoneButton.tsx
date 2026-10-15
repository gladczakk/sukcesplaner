import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { useMilestoneApi } from "@/components/hooks/use-milestone-api";
import { Button } from "@/components/ui/button";

interface CloseMilestoneButtonProps {
  projectId: string;
  milestoneId: string;
  milestoneName: string;
}

export default function CloseMilestoneButton({ projectId, milestoneId, milestoneName }: CloseMilestoneButtonProps) {
  const { setMilestoneCompleted } = useMilestoneApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function close() {
    if (pending) return;
    setError(undefined);
    setPending(true);
    // After success the page reloads; keep the button locked meanwhile.
    let navigating = false;
    try {
      const result = await setMilestoneCompleted(projectId, milestoneId, true);
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
      <Button
        variant="secondary"
        size="sm"
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        aria-disabled={pending}
        aria-busy={pending}
        aria-label={`Zamknij milestone ${milestoneName}`}
        onClick={() => {
          void close();
        }}
      >
        Zamknij milestone
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
