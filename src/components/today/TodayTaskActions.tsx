import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { useTaskApi, type TaskApiSaveResult } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";

interface TodayTaskActionsProps {
  projectId: string;
  milestoneId: string;
  taskId: string;
  title: string;
  status: "todo" | "partial";
}

export default function TodayTaskActions({ projectId, milestoneId, taskId, title, status }: TodayTaskActionsProps) {
  const { setTaskStatus, setTaskDeferral } = useTaskApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // `hint` is appended to a failed save: the status prop stays frozen until reload, so a toggle can act on stale state.
  async function run(save: () => Promise<TaskApiSaveResult>, hint?: string) {
    if (pending) return;
    setError(undefined);
    setPending(true);
    // After success the page reloads; keep the buttons locked meanwhile.
    let navigating = false;
    try {
      const result = await save();
      switch (result.status) {
        case "ok":
          navigating = true;
          window.location.reload();
          return;
        case "fieldErrors":
        case "unavailable":
          setError(hint ? `${result.error} ${hint}` : result.error);
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

  const buttonClassName = "aria-disabled:pointer-events-none aria-disabled:opacity-50";

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className={buttonClassName}
          aria-disabled={pending}
          aria-busy={pending}
          aria-label={`Zrobione: ${title}`}
          onClick={() => {
            void run(() => setTaskStatus(projectId, milestoneId, taskId, "done"));
          }}
        >
          Zrobione
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className={buttonClassName}
          aria-disabled={pending}
          aria-busy={pending}
          aria-pressed={status === "partial"}
          aria-label={`Częściowo: ${title}`}
          onClick={() => {
            void run(
              () => setTaskStatus(projectId, milestoneId, taskId, status === "partial" ? "todo" : "partial"),
              "Jeśli status się nie zgadza, odśwież stronę.",
            );
          }}
        >
          Częściowo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={buttonClassName}
          aria-disabled={pending}
          aria-busy={pending}
          aria-label={`Na jutro: ${title}`}
          onClick={() => {
            void run(() => setTaskDeferral(projectId, milestoneId, taskId, "tomorrow"));
          }}
        >
          Na jutro
        </Button>
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
