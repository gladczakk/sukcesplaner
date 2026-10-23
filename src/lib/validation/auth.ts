import { z } from "zod";

// No `@/` imports: loaded by `node --experimental-strip-types --test` (scripts/auth-errors.test.mjs).
/** Credentials posted by the sign-in and sign-up forms; a failure redirects with `?error=invalid_input`. */
export const authCredentialsSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  password: z.string().min(1).max(256),
});

export type AuthCredentials = z.output<typeof authCredentialsSchema>;
