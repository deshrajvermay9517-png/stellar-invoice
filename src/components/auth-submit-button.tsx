"use client";

import { useFormStatus } from "react-dom";

export function AuthSubmitButton({ children, pendingLabel }: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className="button-primary" type="submit" disabled={pending} aria-disabled={pending}>
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  );
}
