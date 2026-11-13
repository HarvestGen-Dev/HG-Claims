"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SelectProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  value: string | number;
  onValueChange?: (value: string) => void;
  required?: boolean;
};

const emptyOption = "__empty_select_option__";

function renderOptions(
  children: React.ReactNode,
  required: boolean,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return null;
    if (child.type === "optgroup") {
      return (
        <Menu.Group>
          <Menu.Label className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
            {child.props.label}
          </Menu.Label>
          {renderOptions(child.props.children, required)}
        </Menu.Group>
      );
    }
    if (child.type !== "option") return null;

    const value = String(child.props.value ?? child.props.children);
    if (value === "" && (required || child.props.disabled)) return null;

    return (
      <Menu.Item
        value={value || emptyOption}
        data-option-value={value}
        disabled={child.props.disabled}
        className="relative flex min-h-11 cursor-default select-none items-center rounded-md py-2 pl-3 pr-9 leading-snug outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium"
      >
        <Menu.ItemText>
          <span className="break-words [overflow-wrap:anywhere]">
            {child.props.children}
          </span>
        </Menu.ItemText>
        <Menu.ItemIndicator className="absolute right-3 flex items-center text-primary">
          <Check aria-hidden="true" className="size-4" />
        </Menu.ItemIndicator>
      </Menu.Item>
    );
  });
}

export function Select({
  className,
  children,
  disabled,
  required = false,
  value,
  onValueChange,
  name,
  form,
  ...triggerProps
}: SelectProps) {
  const trigger = React.useRef<HTMLButtonElement>(null);
  const [invalid, setInvalid] = React.useState(false);
  const placeholder = React.Children.toArray(children).find(
    (child): child is React.ReactElement =>
      React.isValidElement(child) &&
      child.type === "option" &&
      child.props.value === "",
  );
  const valueString = String(value ?? "");
  const hasSelectableEmpty =
    !required && placeholder && !placeholder.props.disabled;
  const selected = valueString || (hasSelectableEmpty ? emptyOption : "");

  return (
    <span
      className="contents"
      onInvalidCapture={(event) => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        event.preventDefault();
        setInvalid(true);
        const firstInvalid = event.target.form?.querySelector(":invalid");
        if (firstInvalid === event.target) trigger.current?.focus();
      }}
    >
      <Menu.Root
        value={selected}
        onValueChange={(next) => {
          setInvalid(false);
          onValueChange?.(next === emptyOption ? "" : next);
        }}
        disabled={disabled}
        required={required}
        name={name}
        form={form}
      >
        <Menu.Trigger
          {...triggerProps}
          ref={trigger}
          aria-invalid={
            invalid && !valueString ? true : triggerProps["aria-invalid"]
          }
          data-value={valueString}
          className={cn(
            "form-select flex h-11 min-w-0 max-w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-left text-sm font-normal text-foreground transition-colors hover:border-primary/60 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground",
            invalid && !valueString && "border-destructive",
            className,
          )}
        >
          <span className="min-w-0 truncate">
            <Menu.Value placeholder={placeholder?.props.children} />
          </span>
          <Menu.Icon asChild>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </Menu.Icon>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            data-themed-select-content
            position="popper"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="z-[100] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1.5rem)] max-h-[min(20rem,var(--radix-select-content-available-height))] overflow-hidden rounded-xl border border-border bg-popover text-sm text-popover-foreground shadow-lg"
          >
            <Menu.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
              <ChevronUp aria-hidden="true" className="size-4" />
            </Menu.ScrollUpButton>
            <Menu.Viewport className="p-1">
              {renderOptions(children, required)}
            </Menu.Viewport>
            <Menu.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
              <ChevronDown aria-hidden="true" className="size-4" />
            </Menu.ScrollDownButton>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {invalid && !valueString && (
        <span role="alert" className="sr-only">
          Choose an option.
        </span>
      )}
    </span>
  );
}
