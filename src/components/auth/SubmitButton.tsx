import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  label: string;
  pendingLabel: string;
  pending: boolean;
}

export function SubmitButton({ label, pendingLabel, pending }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
