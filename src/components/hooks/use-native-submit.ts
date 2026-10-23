import { useEffect, useState } from "react";

/** Pending state for a native `<form method="POST">`; `useFormStatus` only reports React form actions. */
export function useNativeSubmit() {
  const [submitting, setSubmitting] = useState(false);

  // The back/forward cache restores the page with the old state; unlock the button then.
  useEffect(() => {
    const unlock = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitting(false);
    };
    window.addEventListener("pageshow", unlock);
    return () => {
      window.removeEventListener("pageshow", unlock);
    };
  }, []);

  return {
    submitting,
    startSubmit: () => {
      setSubmitting(true);
    },
  };
}
