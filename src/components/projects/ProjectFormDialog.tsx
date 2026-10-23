import { useState, type SubmitEvent } from "react";
import { Plus } from "lucide-react";

import { useProjectApi } from "@/components/hooks/use-project-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LIFE_AREA_OPTIONS } from "@/lib/life-areas";
import { flattenProjectErrors, projectInputSchema, type ProjectFieldErrors } from "@/lib/validation/project";
import type { Project } from "@/types";

type EditableProject = Pick<Project, "id" | "name" | "description" | "life_area" | "due_date">;

interface ProjectFormDialogProps {
  mode: "create" | "edit";
  project?: EditableProject;
}

interface FormValues {
  name: string;
  due_date: string;
  life_area: string;
  description: string;
}

const FIELD_ORDER = ["name", "due_date", "life_area", "description"] as const;
const FIELD_IDS: Record<(typeof FIELD_ORDER)[number], string> = {
  name: "name",
  due_date: "due-date",
  life_area: "life-area",
  description: "description",
};

function initialValues(project?: EditableProject): FormValues {
  return {
    name: project?.name ?? "",
    due_date: project?.due_date ?? "",
    life_area: project?.life_area ?? LIFE_AREA_OPTIONS[0].value,
    description: project?.description ?? "",
  };
}

export default function ProjectFormDialog({ mode, project }: ProjectFormDialogProps) {
  const { createProject, updateProject } = useProjectApi();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(project));
  const [fieldErrors, setFieldErrors] = useState<ProjectFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const isEdit = mode === "edit";
  const idPrefix = isEdit ? "edit-project" : "create-project";

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (next) {
      setValues(initialValues(project));
      setFieldErrors({});
      setGeneralError(undefined);
    }
    setOpen(next);
  }

  function setValue(key: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function focusFirstInvalid(errors: ProjectFieldErrors) {
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (first) document.getElementById(`${idPrefix}-${FIELD_IDS[first]}`)?.focus();
  }

  async function submit() {
    if (pending) return;
    setGeneralError(undefined);
    const parsed = projectInputSchema.safeParse(values);
    if (!parsed.success) {
      const errors = flattenProjectErrors(parsed.error);
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }
    setFieldErrors({});
    setPending(true);
    // After a successful save the browser navigates; keep the form locked meanwhile so a second click
    // cannot create a duplicate project.
    let navigating = false;
    try {
      const result =
        isEdit && project ? await updateProject(project.id, parsed.data) : await createProject(parsed.data);
      switch (result.status) {
        case "ok":
          navigating = true;
          if (isEdit) window.location.reload();
          else window.location.assign(`/projects/${result.project.id}`);
          return;
        case "fieldErrors":
          setFieldErrors(result.fieldErrors);
          focusFirstInvalid(result.fieldErrors);
          if (Object.keys(result.fieldErrors).length === 0) setGeneralError(result.error);
          break;
        case "notFound":
          setGeneralError("Nie znaleziono projektu. Odśwież stronę.");
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
          <Button variant="secondary">Edytuj</Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" />
            Dodaj projekt
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edytuj projekt" : "Dodaj projekt"}</DialogTitle>
          <DialogDescription>Nazwa, termin i obszar życia są wymagane. Opis jest opcjonalny.</DialogDescription>
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
          <Field id={`${idPrefix}-due-date`} label="Termin" error={fieldErrors.due_date} required>
            <Input
              id={`${idPrefix}-due-date`}
              name="due_date"
              type="date"
              value={values.due_date}
              onChange={(event) => {
                setValue("due_date", event.target.value);
              }}
            />
          </Field>
          <Field id={`${idPrefix}-life-area`} label="Obszar życia" error={fieldErrors.life_area} required>
            <Select
              id={`${idPrefix}-life-area`}
              name="life_area"
              value={values.life_area}
              options={LIFE_AREA_OPTIONS}
              onChange={(value) => {
                setValue("life_area", value);
              }}
            />
          </Field>
          <Field id={`${idPrefix}-description`} label="Opis" error={fieldErrors.description}>
            <Textarea
              id={`${idPrefix}-description`}
              name="description"
              value={values.description}
              onChange={(event) => {
                setValue("description", event.target.value);
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
