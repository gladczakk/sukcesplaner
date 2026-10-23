import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface PasswordFieldProps {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: React.ReactNode;
  autoComplete?: string;
  required?: boolean;
}

interface PasswordControlProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

/** Input + visibility toggle. Receives the aria props that `Field` injects into its child and forwards them to the input. */
function PasswordControl({ onChange, ...inputProps }: PasswordControlProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...inputProps}
        type={visible ? "text" : "password"}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="pr-12"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0"
        aria-pressed={visible}
        aria-label={visible ? "Ukryj hasło" : "Pokaż hasło"}
        onClick={() => {
          setVisible((prev) => !prev);
        }}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}

export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  autoComplete,
  required,
}: PasswordFieldProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <PasswordControl
        id={id}
        name={name ?? id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </Field>
  );
}
