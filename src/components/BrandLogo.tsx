import React from "react";
import { cn } from "@/lib/utils/cn";

export function BrandLogo({
  className,
}: {
  className?: string;
  priority?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex shrink-0 select-none items-center text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100", className)}>
      Harvest Generation
    </span>
  );
}
