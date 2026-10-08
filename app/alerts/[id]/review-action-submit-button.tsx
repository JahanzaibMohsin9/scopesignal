"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle, RotateCw } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type ReviewActionSubmitButtonProps = {
  label: string;
  pendingLabel: string;
  variant?: ButtonProps["variant"];
  icon?: "reclassify";
};

export function ReviewActionSubmitButton({
  label,
  pendingLabel,
  variant = "outline",
  icon,
}: ReviewActionSubmitButtonProps) {
  const { pending } = useFormStatus();
  const visibleLabel = pending ? pendingLabel : label;

  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending}
      aria-live="polite"
      className="min-w-28"
    >
      {pending ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : icon === "reclassify" ? (
        <RotateCw className="h-3.5 w-3.5" />
      ) : null}
      {visibleLabel}
    </Button>
  );
}
