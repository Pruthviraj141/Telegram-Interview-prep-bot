"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border border-line bg-surface text-sm text-ink transition-colors placeholder:text-ink-tertiary hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("block text-sm font-medium text-ink", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input className={cn(CONTROL, "h-10 px-3", className)} {...props} />
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-24 resize-y px-3 py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL, "h-10 pl-3 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Exactly one control: `Input`, `Textarea`, `Select`, or a native element. */
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    required?: boolean;
  }>;
}

/**
 * Wires a label, hint, and error to exactly one control so the accessible
 * name and description never drift from the visible text. Callers pass one
 * control child; the ids are generated when not supplied.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const generatedId = React.useId();
  const controlId = htmlFor ?? children.props.id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    required,
  });

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={controlId}>
        {label}
        {required ? (
          <span className="ml-1 text-danger-ink" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-xs leading-relaxed text-ink-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs leading-relaxed text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
