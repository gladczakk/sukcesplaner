import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import DeleteTaskDialog from "@/components/projects/DeleteTaskDialog";
import TaskFormDialog from "@/components/projects/TaskFormDialog";
import { Select, type SelectOption } from "@/components/ui/select";
import { TASK_STATUSES, type Milestone, type Task, type TaskStatus } from "@/types";

interface TaskRowActionsProps {
  projectId: string;
  milestone: Pick<Milestone, "id" | "due_date" | "name">;
  task: Pick<
    Task,
    "id" | "title" | "due_date" | "status" | "recurrence_interval_days" | "recurrence_weekdays" | "is_recurring"
  >;
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "todo", label: "Do zrobienia" },
  { value: "partial", label: "Częściowo" },
  { value: "done", label: "Zrobione" },
];

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export default function TaskRowActions({ projectId, milestone, task }: TaskRowActionsProps) {
  const { setTaskStatus } = useTaskApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function changeStatus(value: string) {
    if (pending || !isTaskStatus(value) || value === task.status) return;
    setError(undefined);
    setPending(true);
    // After success the page reloads; keep the controls locked meanwhile. On failure the select stays
    // controlled by `task.status`, so it returns to the previous value.
    let navigating = false;
    try {
      const result = await setTaskStatus(projectId, milestone.id, task.id, value);
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
      <div className="flex flex-wrap items-center gap-1">
        {/* A recurring task is ticked off per occurrence on the Dziś list, so it has no status switch. */}
        {task.is_recurring !== true ? (
          <Select
            className="w-auto aria-disabled:opacity-50"
            aria-label={`Status zadania ${task.title}`}
            options={STATUS_OPTIONS}
            value={task.status}
            aria-disabled={pending}
            onChange={(value) => {
              void changeStatus(value);
            }}
          />
        ) : null}
        <TaskFormDialog mode="edit" projectId={projectId} milestone={milestone} task={task} />
        <DeleteTaskDialog projectId={projectId} milestoneId={milestone.id} taskId={task.id} taskTitle={task.title} />
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
