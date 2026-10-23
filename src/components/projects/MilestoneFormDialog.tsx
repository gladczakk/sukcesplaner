import { useState, type SubmitEvent } from "react";

import { useMilestoneApi } from "@/components/hooks/use-milestone-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  flattenMilestoneErrors,
  milestoneInputSchema,
  MILESTONE_FIELDS,
  type MilestoneFieldErrors,
} from "@/lib/validation/milestone";
import type { Milestone } from "@/types";

type EditableMilestone = Pick<Milestone, "id" | "name" | "due_date">;

interface MilestoneFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  /** Project deadline (`YYYY-MM-DD`); the milestone date cannot be later. */
  projectDueDate: string;
  milestone?: EditableMilestone;
}

interface FormValues {
  name: string;
  due_date: string;
}

const FIELD_IDS: Record<(typeof MILESTONE_FIELDS)[number], string> = {
  name: "name",
  due_date: "due-date",
};

function initialValues(milestone?: EditableMilestone): FormValues {
  return {
    name: milestone?.name ?? "",
    due_date: milestone?.due_date ?? "",
  };
}

export default function MilestoneFormDialog({ mode, projectId, projectDueDate, milestone }: MilestoneFormDialogProps) {
  const { createMilestone, updateMilestone } = useMilestoneApi();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(milestone));
  const [fieldErrors, setFieldErrors] = useState<MilestoneFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const isEdit = mode === "edit";
  const idPrefix = isEdit && milestone ? `edit-milestone-${milestone.id}` : "create-milestone";

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setValues(initialValues(milestone));
      setFieldErrors({});
      setGeneralError(undefined);
    }
    setOpen(next);
  }

  function setValue(key: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function focusFirstInvalid(errors: MilestoneFieldErrors) {
    const first = MILESTONE_FIELDS.find((field) => errors[field]);
    if (first) document.getElementById(`${idPrefix}-${FIELD_IDS[first]}`)?.focus();
  }

  async function submit() {
    if (pending) return;
    setGeneralError(undefined);
    const parsed = milestoneInputSchema.safeParse(values);
    const errors: MilestoneFieldErrors = parsed.success ? {} : flattenMilestoneErrors(parsed.error);
    if (!errors.due_date && values.due_date > projectDueDate) {
      errors.due_date = `Data milestona nie może być późniejsza niż termin projektu (${formatDate(projectDueDate)})`;
    }
    if (!parsed.success || Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }
    setFieldErrors({});
    setPending(true);
    // After a successful save the page reloads; keep the form locked meanwhile so a second click
    // cannot create a duplicate milestone.
    let navigating = false;
    try {
      const result =
        isEdit && milestone
          ? await updateMilestone(projectId, milestone.id, parsed.data)
          : await createMilestone(projectId, parsed.data);
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={milestone ? `Edytuj milestone ${milestone.name}` : "Edytuj milestone"}
          >
            Edytuj
          </Button>
        ) : (
          <Button>Dodaj milestone</Button>
        )}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edytuj milestone" : "Dodaj milestone"}</DialogTitle>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="grid gap-4">
          <Field id={`${idPrefix}-name`} label="Nazwa" error={fieldErrors.name} required>
            <Input
              id={`${idPrefix}-name`}
              name="name"
              value={values.name}
              autoComplete="off"
              onChange={(event) => {
                setValue("name", event.target.value);
              }}
            />
          </Field>
          <Field id={`${idPrefix}-due-date`} label="Data" error={fieldErrors.due_date} required>
            <Input
              id={`${idPrefix}-due-date`}
              name="due_date"
              type="date"
              max={projectDueDate}
              value={values.due_date}
              onChange={(event) => {
                setValue("due_date", event.target.value);
              }}
            />
          </Field>
          {generalError ? <InlineError>{generalError}</InlineError> : null}
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
