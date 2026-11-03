import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

// Keep native keyboard, validation, and mobile-picker behavior. The shared
// chevron has a fixed inset and reserved space, even with very long options.
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "form-select block h-11 min-w-0 max-w-full rounded-lg border border-input bg-card py-2 pl-3 pr-10 text-sm text-foreground shadow-sm transition-colors hover:border-primary/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Select.displayName = "Select";

export { Select };
