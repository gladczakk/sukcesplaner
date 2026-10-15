import { useState, type SubmitEvent } from "react";
import { CircleAlert } from "lucide-react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { flattenTaskErrors, taskInputSchema, TASK_FIELDS, type TaskFieldErrors } from "@/lib/validation/task";
import type { Milestone, Task } from "@/types";

type ParentMilestone = Pick<Milestone, "id" | "due_date" | "name">;
type EditableTask = Pick<Task, "id" | "title" | "due_date">;

interface TaskFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  /** Milestone the task belongs to; the task date cannot be later than `milestone.due_date`. */
  milestone: ParentMilestone;
  task?: EditableTask;
  /** Closed milestone: renders only a disabled "Dodaj zadanie" button. */
  disabled?: boolean;
}

interface FormValues {
  title: string;
  due_date: string;
}

const FIELD_IDS: Record<(typeof TASK_FIELDS)[number], string> = {
  title: "title",
  due_date: "due-date",
};

function initialValues(task?: EditableTask): FormValues {
  return {
    title: task?.title ?? "",
    due_date: task?.due_date ?? "",
  };
}

export default function TaskFormDialog({ mode, projectId, milestone, task, disabled = false }: TaskFormDialogProps) {
  const { createTask, updateTask } = useTaskApi();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(task));
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const isEdit = mode === "edit";
  const idPrefix = isEdit && task ? `edit-task-${task.id}` : `create-task-${milestone.id}`;

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setValues(initialValues(task));
      setFieldErrors({});
      setGeneralError(undefined);
    }
    setOpen(next);
  }

  function setValue(key: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function focusFirstInvalid(errors: TaskFieldErrors) {
    const first = TASK_FIELDS.find((field) => errors[field]);
    if (first) document.getElementById(`${idPrefix}-${FIELD_IDS[first]}`)?.focus();
  }

  async function submit() {
    if (pending) return;
    setGeneralError(undefined);
    const parsed = taskInputSchema.safeParse(values);
    const errors: TaskFieldErrors = parsed.success ? {} : flattenTaskErrors(parsed.error);
    if (!errors.due_date && values.due_date !== "" && values.due_date > milestone.due_date) {
      errors.due_date = `Termin zadania nie może być późniejszy niż data milestona (${formatDate(milestone.due_date)})`;
    }
    if (!parsed.success || Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }
    setFieldErrors({});
    setPending(true);
    // After a successful save the page reloads; keep the form locked meanwhile so a second click
    // cannot create a duplicate task.
    let navigating = false;
    try {
      const result =
        isEdit && task
          ? await updateTask(projectId, milestone.id, task.id, parsed.data)
          : await createTask(projectId, milestone.id, parsed.data);
      switch (result.status) {
        case "ok":
          navigating = true;
          window.location.reload();
          return;
        case "fieldErrors":
          setFieldErrors(result.fieldErrors);
          focusFirstInvalid(result.fieldErrors);
          if (Object.keys(result.fieldErrors).length === 0) setGeneralError(result.error);
          break;
        case "notFound":
          setGeneralError("Nie znaleziono milestona lub zadania. Odśwież stronę.");
          break;
        case "unavailable":
          setGeneralError(result.error);
          break;
        case "unauthorized":
          navigating = true;
          return;
      }
    } finally {
      if (!navigating) setPending(false);
    }
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  if (disabled && !isEdit) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        aria-disabled="true"
        aria-describedby={`closed-milestone-hint-${milestone.id}`}
        aria-label={`Dodaj zadanie do milestona ${milestone.name}`}
      >
        Dodaj zadanie
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" aria-label={task ? `Edytuj zadanie ${task.title}` : "Edytuj zadanie"}>
            Edytuj
          </Button>
        ) : (
          <Button variant="secondary" size="sm" aria-label={`Dodaj zadanie do milestona ${milestone.name}`}>
            Dodaj zadanie
          </Button>
        )}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edytuj zadanie" : "Dodaj zadanie"}</DialogTitle>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="grid gap-4">
          <Field id={`${idPrefix}-title`} label="Tytuł" error={fieldErrors.title} required>
            <Input
              id={`${idPrefix}-title`}
              name="title"
              value={values.title}
              autoComplete="off"
              onChange={(event) => {
                setValue("title", event.target.value);
              }}
            />
          </Field>
          <Field id={`${idPrefix}-due-date`} label="Termin (opcjonalny)" error={fieldErrors.due_date}>
            <Input
              id={`${idPrefix}-due-date`}
              name="due_date"
              type="date"
              max={milestone.due_date}
              value={values.due_date}
              onChange={(event) => {
                setValue("due_date", event.target.value);
              }}
            />
          </Field>
          {generalError ? (
            <p role="alert" className="type-meta text-destructive-ink flex items-center gap-1">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold">Błąd:</span> {generalError}
              </span>
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
