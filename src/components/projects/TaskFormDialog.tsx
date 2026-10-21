import { useState, type SubmitEvent } from "react";
import { CircleAlert } from "lucide-react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { formatDate } from "@/lib/format";
import {
  flattenTaskErrors,
  isRecurrenceMode,
  readRecurrenceInterval,
  readRecurrenceWeekdays,
  RECURRENCE_MODE_OPTIONS,
  taskCreateSchema,
  TASK_FIELDS,
  type RecurrenceMode,
  type TaskFieldErrors,
} from "@/lib/validation/task";
import type { Milestone, Task } from "@/types";

type ParentMilestone = Pick<Milestone, "id" | "due_date" | "name">;
type EditableTask = Pick<
  Task,
  "id" | "title" | "due_date" | "status" | "recurrence_interval_days" | "recurrence_weekdays" | "is_recurring"
>;

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
  /** Rhythm choice; `recurrence_interval_days` holds the number of days of "Co X dni". */
  repeat: RecurrenceMode;
  recurrence_interval_days: string;
  /** Selected ISO days (1 = Monday) of "W wybrane dni tygodnia". */
  recurrence_weekdays: number[];
}

const FIELD_IDS: Record<(typeof TASK_FIELDS)[number], string> = {
  title: "title",
  due_date: "due-date",
  recurrence_interval_days: "recurrence-days",
  recurrence_weekdays: "recurrence-weekdays",
};

function initialValues(task?: EditableTask): FormValues {
  const base: FormValues = {
    title: task?.title ?? "",
    due_date: task?.due_date ?? "",
    repeat: "none",
    recurrence_interval_days: "",
    recurrence_weekdays: [],
  };
  if (!task) return base;
  const interval = task.recurrence_interval_days;
  if (interval !== null) {
    return interval === 1
      ? { ...base, repeat: "daily" }
      : { ...base, repeat: "every", recurrence_interval_days: String(interval) };
  }
  if (task.recurrence_weekdays !== null) {
    return { ...base, repeat: "weekdays", recurrence_weekdays: [...task.recurrence_weekdays] };
  }
  return base;
}

export default function TaskFormDialog({ mode, projectId, milestone, task, disabled = false }: TaskFormDialogProps) {
  const { createTask, updateTask, deleteTask } = useTaskApi();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(task));
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | undefined>();

  const isEdit = mode === "edit";
  const idPrefix = isEdit && task ? `edit-task-${task.id}` : `create-task-${milestone.id}`;
  const isRecurringTask = isEdit && task?.is_recurring === true;
  // A done ordinary task cannot become recurring (the API rejects it), so its rhythm select is locked.
  const isDoneTask = isEdit && !isRecurringTask && task?.status === "done";
  // A recurring task has no due date of its own.
  const repeating = values.repeat !== "none";
  const repeatHint = isDoneTask
    ? "Zrobionego zadania nie można zmienić w powtarzalne."
    : isRecurringTask
      ? "Zmiana rytmu działa od dziś i usuwa przyszłe przeniesienia."
      : isEdit && repeating
        ? "Termin i status „Częściowo” zostaną wyczyszczone."
        : undefined;

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setValues(initialValues(task));
      setFieldErrors({});
      setGeneralError(undefined);
      setConfirmError(undefined);
    }
    setOpen(next);
  }

  function setValue(key: "title" | "due_date" | "recurrence_interval_days", value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function changeRepeat(value: string) {
    if (!isRecurrenceMode(value)) return;
    setValues((current) => ({ ...current, repeat: value, due_date: value === "none" ? current.due_date : "" }));
    setFieldErrors((current) => ({
      ...current,
      due_date: undefined,
      recurrence_interval_days: undefined,
      recurrence_weekdays: undefined,
    }));
  }

  function focusFirstInvalid(errors: TaskFieldErrors) {
    const first = TASK_FIELDS.find((field) => errors[field]);
    if (!first) return;
    // Without the number input ("Codziennie"), a rhythm error belongs to the select; the days group is focused on its first button.
    const target =
      first === "recurrence_weekdays"
        ? `${FIELD_IDS.recurrence_weekdays}-1`
        : first === "recurrence_interval_days" && values.repeat !== "every"
          ? "repeat"
          : FIELD_IDS[first];
    document.getElementById(`${idPrefix}-${target}`)?.focus();
  }

  async function submit() {
    if (pending) return;
    setGeneralError(undefined);
    const rhythm = readRecurrenceInterval(values.repeat, values.recurrence_interval_days);
    const weekdays = readRecurrenceWeekdays(values.repeat, values.recurrence_weekdays);
    const dueDate = repeating ? "" : values.due_date;
    const parsed = taskCreateSchema.safeParse({
      title: values.title,
      due_date: dueDate,
      recurrence_interval_days: rhythm.value,
      recurrence_weekdays: weekdays.value,
    });
    const errors: TaskFieldErrors = parsed.success ? {} : flattenTaskErrors(parsed.error);
    if (rhythm.error) errors.recurrence_interval_days = rhythm.error;
    if (weekdays.error) errors.recurrence_weekdays = weekdays.error;
    if (!errors.due_date && dueDate !== "" && dueDate > milestone.due_date) {
      errors.due_date = `Termin zadania nie może być późniejszy niż data milestona (${formatDate(milestone.due_date)})`;
    }
    if (!parsed.success || Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }
    setFieldErrors({});
    if (isRecurringTask && !repeating) {
      // Turning repeating off deletes the task (PUT rejects it), so ask first.
      setConfirmError(undefined);
      setConfirmOpen(true);
      return;
    }
    setPending(true);
    // After a successful save the page reloads; keep the form locked meanwhile so a second click
    // cannot create a duplicate task.
    let navigating = false;
    try {
      const result =
        isEdit && task
          ? await updateTask(projectId, milestone.id, task.id, {
              ...parsed.data,
              recurrence_interval_days: rhythm.value,
              recurrence_weekdays: weekdays.value,
            })
          : await createTask(projectId, milestone.id, {
              ...parsed.data,
              recurrence_interval_days: rhythm.value,
              recurrence_weekdays: weekdays.value,
            });
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

  function handleConfirmOpenChange(next: boolean) {
    if (pending) return;
    if (next) setConfirmError(undefined);
    setConfirmOpen(next);
  }

  async function confirmDelete() {
    if (pending || !task) return;
    setConfirmError(undefined);
    setPending(true);
    // After success (or a 404 that reloads the page) the page reloads; keep both dialogs locked meanwhile.
    let navigating = false;
    try {
      const result = await deleteTask(projectId, milestone.id, task.id);
      switch (result.status) {
        case "ok":
          navigating = true;
          window.location.reload();
          return;
        case "notFound":
          navigating = true;
          setConfirmError("Nie znaleziono zadania. Odświeżam stronę.");
          window.setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        case "unavailable":
          setConfirmError(result.error);
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
          <Field
            id={`${idPrefix}-repeat`}
            label="Powtarzanie"
            hint={repeatHint}
            error={
              values.repeat === "every" || values.repeat === "weekdays"
                ? undefined
                : fieldErrors.recurrence_interval_days
            }
          >
            <Select
              id={`${idPrefix}-repeat`}
              name="repeat"
              value={values.repeat}
              options={RECURRENCE_MODE_OPTIONS}
              disabled={isDoneTask}
              onChange={changeRepeat}
            />
          </Field>
          {values.repeat === "every" ? (
            <Field
              id={`${idPrefix}-${FIELD_IDS.recurrence_interval_days}`}
              label="Co ile dni (2–30)"
              error={fieldErrors.recurrence_interval_days}
              required
            >
              <Input
                id={`${idPrefix}-${FIELD_IDS.recurrence_interval_days}`}
                name="recurrence_interval_days"
                type="number"
                inputMode="numeric"
                min={2}
                max={30}
                value={values.recurrence_interval_days}
                onChange={(event) => {
                  setValue("recurrence_interval_days", event.target.value);
                }}
              />
            </Field>
          ) : null}
          {values.repeat === "weekdays" ? (
            <WeekdayPicker
              id={`${idPrefix}-${FIELD_IDS.recurrence_weekdays}`}
              value={values.recurrence_weekdays}
              error={fieldErrors.recurrence_weekdays}
              disabled={pending}
              onChange={(days) => {
                setValues((current) => ({ ...current, recurrence_weekdays: days }));
                setFieldErrors((current) => ({ ...current, recurrence_weekdays: undefined }));
              }}
            />
          ) : null}
          {repeating ? null : (
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
          )}
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
        {isRecurringTask ? (
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={handleConfirmOpenChange}
            title={`Usunąć zadanie ${task.title}?`}
            description="Wyłączenie powtarzania usuwa zadanie razem z jego odhaczeniami. Tej operacji nie można cofnąć."
            confirmLabel="Usuń zadanie"
            onConfirm={() => {
              void confirmDelete();
            }}
            pending={pending}
            error={confirmError}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
