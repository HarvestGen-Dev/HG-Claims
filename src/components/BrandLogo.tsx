import React from "react";
import { cn } from "@/lib/utils/cn";

export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  priority?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={cn("block select-none whitespace-nowrap font-heading font-semibold leading-tight -tracking-[0.035em] text-foreground", compact ? "text-[1.0625rem]" : "text-[1.375rem] sm:text-[1.5rem]", className)}>
      Harvest Generation
    </span>
  );
}
