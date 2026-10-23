import React, { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/ui/inline-error";
import { PasswordField } from "@/components/auth/PasswordField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { authErrorMessage } from "@/lib/auth-errors";

interface Props {
  serverError?: string | null;
}

export default function SignInForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const serverMessage = authErrorMessage(serverError);

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = "Podaj adres e-mail.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj poprawny adres e-mail.";
    }
    if (!password) {
      next.password = "Podaj hasło.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Field id="email" label="E-mail" error={errors.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearError("email");
          }}
          placeholder="jan@example.com"
        />
      </Field>

      <PasswordField
        id="password"
        label="Hasło"
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        error={errors.password}
        autoComplete="current-password"
        required
      />

      {serverMessage ? <InlineError role="alert">{serverMessage}</InlineError> : null}

      <SubmitButton label="Zaloguj się" pendingLabel="Logowanie…" />
    </form>
  );
}
