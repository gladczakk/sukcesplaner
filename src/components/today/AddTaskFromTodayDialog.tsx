import { useState, type SubmitEvent } from "react";
import { CircleAlert } from "lucide-react";

import { useTaskApi } from "@/components/hooks/use-task-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import {
  flattenTaskErrors,
  isRecurrenceMode,
  readRecurrenceInterval,
  RECURRENCE_MODE_OPTIONS,
  taskCreateSchema,
  TASK_FIELDS,
  type RecurrenceMode,
  type TaskFieldErrors,
} from "@/lib/validation/task";
import type { TaskTargetMilestone, TaskTargetProject } from "@/types";

interface AddTaskFromTodayDialogProps {
  /** Projects with an open milestone; the milestones of each project are sorted from the nearest. */
  targets: TaskTargetProject[];
}

interface FormValues {
  projectId: string;
  milestoneId: string;
  title: string;
  due_date: string;
  /** Rhythm choice; `recurrence_interval_days` holds the number of days of "Co X dni". */
  repeat: RecurrenceMode;
  recurrence_interval_days: string;
}

const ID_PREFIX = "today-add-task";
const FIELD_IDS: Record<(typeof TASK_FIELDS)[number], string> = {
  title: `${ID_PREFIX}-title`,
  due_date: `${ID_PREFIX}-due-date`,
  recurrence_interval_days: `${ID_PREFIX}-recurrence-days`,
};
const REPEAT_ID = `${ID_PREFIX}-repeat`;
const EMPTY_HINT_ID = `${ID_PREFIX}-empty-hint`;
const NOT_NEAREST_HINT =
  "Ten milestone nie jest najbliższy w projekcie — zadanie pojawi się na liście Dziś, gdy stanie się najbliższy.";

function initialValues(targets: TaskTargetProject[]): FormValues {
  const first = targets.at(0);
  return {
    projectId: first?.id ?? "",
    milestoneId: first?.milestones.at(0)?.id ?? "",
    title: "",
    due_date: "",
    repeat: "none",
    recurrence_interval_days: "",
  };
}

function dueDateError(dueDate: string, milestone: TaskTargetMilestone): string | undefined {
  if (dueDate === "" || dueDate <= milestone.due_date) return undefined;
  return `Termin zadania nie może być późniejszy niż data milestona (${formatDate(milestone.due_date)})`;
}

export default function AddTaskFromTodayDialog({ targets }: AddTaskFromTodayDialogProps) {
  const { createTask } = useTaskApi();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(targets));
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const project = targets.find((target) => target.id === values.projectId);
  const milestone = project?.milestones.find((item) => item.id === values.milestoneId);
  const notNearest = Boolean(project && milestone && project.milestones.at(0)?.id !== milestone.id);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setValues(initialValues(targets));
      setFieldErrors({});
      setGeneralError(undefined);
    }
    setOpen(next);
  }

  function setValue(key: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function changeRepeat(value: string) {
    if (!isRecurrenceMode(value)) return;
    setValues((current) => ({ ...current, repeat: value, due_date: value === "none" ? current.due_date : "" }));
    setFieldErrors((current) => ({ ...current, due_date: undefined, recurrence_interval_days: undefined }));
  }

  /** Re-checks the typed date against the newly selected milestone, so a date past its new `max` is flagged at once. */
  function recheckDueDate(next: TaskTargetMilestone | undefined) {
    setFieldErrors((current) => ({ ...current, due_date: next ? dueDateError(values.due_date, next) : undefined }));
  }

  function changeProject(projectId: string) {
    const nearest = targets.find((target) => target.id === projectId)?.milestones.at(0);
    setValues((current) => ({ ...current, projectId, milestoneId: nearest?.id ?? "" }));
    recheckDueDate(nearest);
  }

  function changeMilestone(milestoneId: string) {
    setValue("milestoneId", milestoneId);
    recheckDueDate(project?.milestones.find((item) => item.id === milestoneId));
  }

  function focusFirstInvalid(errors: TaskFieldErrors) {
    const first = TASK_FIELDS.find((field) => errors[field]);
    if (!first) return;
    // Without the number input ("Codziennie"), a rhythm error belongs to the select.
    const target = first === "recurrence_interval_days" && values.repeat !== "every" ? REPEAT_ID : FIELD_IDS[first];
    document.getElementById(target)?.focus();
  }

  async function submit() {
    if (pending) return;
    setGeneralError(undefined);
    if (!project || !milestone) {
      setGeneralError("Wybierz projekt i milestone.");
      return;
    }
    const rhythm = readRecurrenceInterval(values.repeat, values.recurrence_interval_days);
    // A recurring task has no due date of its own.
    const dueDate = values.repeat === "none" ? values.due_date : "";
    const parsed = taskCreateSchema.safeParse({
      title: values.title,
      due_date: dueDate,
      recurrence_interval_days: rhythm.value,
    });
    const errors: TaskFieldErrors = parsed.success ? {} : flattenTaskErrors(parsed.error);
    if (rhythm.error) errors.recurrence_interval_days = rhythm.error;
    const dateError = dueDateError(dueDate, milestone);
    if (!errors.due_date && dateError) errors.due_date = dateError;
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
      const result = await createTask(project.id, milestone.id, parsed.data);
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
          setGeneralError("Nie znaleziono projektu lub milestona. Odśwież stronę.");
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

  if (targets.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled="true"
            aria-describedby={EMPTY_HINT_ID}
          >
            Dodaj zadanie
          </Button>
          <a
            href="/projects"
            className="type-button text-foreground focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm underline outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Projekty
          </a>
        </div>
        <p id={EMPTY_HINT_ID} className="type-meta text-muted-foreground">
          Najpierw dodaj projekt z otwartym milestonem.
        </p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Dodaj zadanie
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Dodaj zadanie</DialogTitle>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="grid gap-4">
          <Field id={`${ID_PREFIX}-project`} label="Projekt">
            <Select
              id={`${ID_PREFIX}-project`}
              name="project"
              value={values.projectId}
              options={targets.map((target) => ({ value: target.id, label: target.name }))}
              onChange={changeProject}
            />
          </Field>
          <Field
            id={`${ID_PREFIX}-milestone`}
            label="Milestone"
            // The status container stays in the DOM and only its text changes, so screen readers announce the change.
            hint={<span role="status">{notNearest ? NOT_NEAREST_HINT : ""}</span>}
          >
            <Select
              id={`${ID_PREFIX}-milestone`}
              name="milestone"
              value={values.milestoneId}
              options={(project?.milestones ?? []).map((item) => ({
                value: item.id,
                label: `${item.name} · ${formatDate(item.due_date)}`,
              }))}
              onChange={changeMilestone}
            />
          </Field>
          <Field id={FIELD_IDS.title} label="Tytuł" error={fieldErrors.title} required>
            <Input
              id={FIELD_IDS.title}
              name="title"
              value={values.title}
              autoComplete="off"
              onChange={(event) => {
                setValue("title", event.target.value);
              }}
            />
          </Field>
          <Field
            id={REPEAT_ID}
            label="Powtarzanie"
            error={values.repeat === "every" ? undefined : fieldErrors.recurrence_interval_days}
          >
            <Select
              id={REPEAT_ID}
              name="repeat"
              value={values.repeat}
              options={RECURRENCE_MODE_OPTIONS}
              onChange={changeRepeat}
            />
          </Field>
          {values.repeat === "every" ? (
            <Field
              id={FIELD_IDS.recurrence_interval_days}
              label="Co ile dni (2–30)"
              error={fieldErrors.recurrence_interval_days}
              required
            >
              <Input
                id={FIELD_IDS.recurrence_interval_days}
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
          {values.repeat === "none" ? (
            <Field id={FIELD_IDS.due_date} label="Termin (opcjonalny)" error={fieldErrors.due_date}>
              <Input
                id={FIELD_IDS.due_date}
                name="due_date"
                type="date"
                max={milestone?.due_date}
                value={values.due_date}
                onChange={(event) => {
                  setValue("due_date", event.target.value);
                }}
              />
            </Field>
          ) : null}
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
