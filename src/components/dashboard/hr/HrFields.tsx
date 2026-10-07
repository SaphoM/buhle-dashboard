import type { ReactNode } from "react";
import type { Department } from "../../../types";
import { SelectChevron } from "../../common/SelectChevron";

/**
 * Small shared form primitives for the HR submission. They exist so the six
 * sections stay visually and behaviourally identical to each other and to the
 * rest of the app, rather than each section inventing its own inputs.
 */

const inputClass =
  "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/25 outline-none focus:border-butter-dark";

export function HrNumberField({
  label,
  value,
  onChange,
  required,
  hint,
  suffix,
  prefix,
  min = 0,
  step = "any",
  disabled,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  required?: boolean;
  hint?: string;
  suffix?: string;
  prefix?: string;
  min?: number;
  step?: string | number;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-xs font-medium text-ink-soft/60">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <div className="flex items-center gap-2">
        {prefix && <span className="shrink-0 text-xs text-ink-soft/50">{prefix}</span>}
        <input
          type="number"
          step={step}
          min={min}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClass}
          value={value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
        {suffix && <span className="shrink-0 text-xs text-ink-soft/50">{suffix}</span>}
      </div>
      {hint && <span className="text-[11px] text-ink-soft/40">{hint}</span>}
    </label>
  );
}

export function HrTextField({
  label,
  value,
  onChange,
  required,
  hint,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  type?: "text" | "date";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft/60">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-[11px] text-ink-soft/40">{hint}</span>}
    </label>
  );
}

export function HrTextArea({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft/60">{label}</span>
      <textarea
        rows={rows}
        placeholder={placeholder}
        className={`${inputClass} resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-[11px] text-ink-soft/40">{hint}</span>}
    </label>
  );
}

export function HrSelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
  hint,
  placeholder = "Select…",
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  onChange: (value: T) => void;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft/60">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <div className="relative">
        <select
          className={`${inputClass} appearance-none pr-9`}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
      {hint && <span className="text-[11px] text-ink-soft/40">{hint}</span>}
    </label>
  );
}

export function HrCheckbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink/20 accent-ink"
      />
      <span>
        <span className="text-xs font-medium text-ink-soft/70">{label}</span>
        {hint && <span className="block text-[11px] text-ink-soft/40">{hint}</span>}
      </span>
    </label>
  );
}

/** Titled group of fields inside a section. */
export function HrFieldset({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-2xl border border-ink/10 bg-white/50 p-4">
      {/*
        The <legend> stays as the fieldset's accessible name, but visually
        hidden. Browsers give <legend> special layout that renders it *on* the
        fieldset's border, so a visible one sits across the top edge instead of
        inside the padding. The visible title is an ordinary heading below.
      */}
      <legend className="sr-only">{title}</legend>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">{title}</h3>
      {description && <p className="mt-1 text-[11px] text-ink-soft/40">{description}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/** Sub-heading inside a fieldset, for blocks that span the full grid. */
export function HrSubheading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`col-span-full text-xs font-semibold text-ink-soft/60 ${className}`}>{children}</div>;
}

export const DEPARTMENT_OPTIONS: readonly Department[] = [
  "Executive",
  "Finance",
  "Operations",
  "Commercial Farming",
  "Human Resources",
  "Marketing",
  "Academy",
  "Alumni",
];

/** Repeating-record table shell shared by the movement/training/vacancy lists. */
export function HrRecordList({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">{title}</span>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/5"
        >
          + {addLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

export function HrEmptyRow({ text }: { text: string }) {
  return <p className="rounded-xl bg-ink/[0.03] px-3 py-3 text-xs text-ink-soft/40">{text}</p>;
}

export function HrRemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-8 w-8 shrink-0 rounded-full text-xs text-ink-soft/40 hover:bg-rose-50 hover:text-rose-600"
    >
      ✕
    </button>
  );
}