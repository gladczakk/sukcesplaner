import React, { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/ui/inline-error";
import { PasswordField } from "@/components/auth/PasswordField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useNativeSubmit } from "@/components/hooks/use-native-submit";
import { authErrorMessage } from "@/lib/auth-errors";
import { plural } from "@/lib/format";

const MIN_PASSWORD_LENGTH = 6;

interface Props {
  serverError?: string | null;
  /** Prefix for element ids; lets the same form render more than once on a page (kitchen sink). */
  idPrefix?: string;
}

export default function SignUpForm({ serverError, idPrefix = "" }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const { submitting, startSubmit } = useNativeSubmit();
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
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`;
    }

    if (!confirmPassword) {
      next.confirmPassword = "Powtórz hasło.";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła nie są takie same.";
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
      return;
    }
    startSubmit();
  }

  const remaining = MIN_PASSWORD_LENGTH - password.length;
  const passwordHint =
    !errors.password && password.length > 0 && remaining > 0
      ? `Jeszcze ${remaining} ${plural(remaining, ["znak", "znaki", "znaków"])}`
      : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Field id={`${idPrefix}email`} label="E-mail" error={errors.email} required>
        <Input
          id={`${idPrefix}email`}
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
        id={`${idPrefix}password`}
        name="password"
        label="Hasło"
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        error={errors.password}
        hint={passwordHint}
        autoComplete="new-password"
        required
      />

      <PasswordField
        id={`${idPrefix}confirmPassword`}
        label="Powtórz hasło"
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        error={errors.confirmPassword}
        autoComplete="new-password"
        required
      />

      {serverMessage ? <InlineError role="alert">{serverMessage}</InlineError> : null}

      <SubmitButton label="Utwórz konto" pendingLabel="Tworzenie konta…" pending={submitting} />
    </form>
  );
}
