import { useState, type SubmitEvent } from "react";
import { CircleAlert } from "lucide-react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/ui/weekday-picker";
import { formatDate, formatRecurrence } from "@/lib/format";
import {
  flattenTaskErrors,
  isRecurrenceMode,
  readRecurrenceInterval,
  readRecurrenceWeekdays,
  RECURRENCE_MODE_OPTIONS,
  taskCreateSchema,
  taskInputSchema,
  TASK_FIELDS,
  type RecurrenceMode,
  type TaskFieldErrors,
} from "@/lib/validation/task";
import type { Milestone, Task } from "@/types";

type ParentMilestone = Pick<Milestone, "id" | "due_date" | "name">;
type EditableTask = Pick<
  Task,
  "id" | "title" | "due_date" | "recurrence_interval_days" | "recurrence_weekdays" | "is_recurring"
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
  /** Rhythm choice (create mode only); `recurrence_interval_days` holds the number of days of "Co X dni". */
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
  return {
    title: task?.title ?? "",
    due_date: task?.due_date ?? "",
    repeat: "none",
    recurrence_interval_days: "",
    recurrence_weekdays: [],
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
  // A recurring task has no due date of its own; its rhythm is chosen on create and only shown on edit.
  const editedRhythm =
    isEdit && task?.is_recurring === true
      ? formatRecurrence({ intervalDays: task.recurrence_interval_days, weekdays: task.recurrence_weekdays })
      : null;
  const repeating = isEdit ? editedRhythm !== null : values.repeat !== "none";

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setValues(initialValues(task));
      setFieldErrors({});
      setGeneralError(undefined);
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
    const rhythm: ReturnType<typeof readRecurrenceInterval> = isEdit
      ? { value: null }
      : readRecurrenceInterval(values.repeat, values.recurrence_interval_days);
    const weekdays: ReturnType<typeof readRecurrenceWeekdays> = isEdit
      ? { value: null }
      : readRecurrenceWeekdays(values.repeat, values.recurrence_weekdays);
    const dueDate = repeating ? "" : values.due_date;
    // Edit goes through PUT, which never changes the rhythm, so only the create schema carries it.
    const parsed = isEdit
      ? taskInputSchema.safeParse({ title: values.title, due_date: dueDate })
      : taskCreateSchema.safeParse({
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
    setPending(true);
    // After a successful save the page reloads; keep the form locked meanwhile so a second click
    // cannot create a duplicate task.
    let navigating = false;
    try {
      const result =
        isEdit && task
          ? // Until the form edits the rhythm, PUT carries the task's existing one (same rhythm = title-only update).
            await updateTask(projectId, milestone.id, task.id, {
              ...parsed.data,
              recurrence_interval_days: task.recurrence_interval_days,
              recurrence_weekdays: task.recurrence_weekdays,
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
          {isEdit && editedRhythm !== null ? (
            <Field id={`${idPrefix}-repeat`} label="Powtarzanie">
              <Input id={`${idPrefix}-repeat`} name="repeat" value={editedRhythm} readOnly />
            </Field>
          ) : null}
          {isEdit ? null : (
            <Field
              id={`${idPrefix}-repeat`}
              label="Powtarzanie"
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
                onChange={changeRepeat}
              />
            </Field>
          )}
          {!isEdit && values.repeat === "every" ? (
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
          {!isEdit && values.repeat === "weekdays" ? (
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
      </DialogContent>
    </Dialog>
  );
}
