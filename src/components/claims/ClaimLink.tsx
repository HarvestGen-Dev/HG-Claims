import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonVariants, type ButtonProps } from "@/components/ui/button";

/** Navigation with the same appearance and touch target as claim action buttons. */
export function ClaimLink({
  variant = "outline",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonProps["variant"] }) {
  return (
    <Link
      {...props}
      className={buttonVariants({
        variant,
        className: `min-h-11 gap-2 ${className || ""}`,
      })}
    />
  );
}
