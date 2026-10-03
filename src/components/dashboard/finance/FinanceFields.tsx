import type { ReactNode } from "react";

/**
 * Shared form primitives for the Finance submission.
 *
 * Deliberately a sibling of the HR field set rather than a reuse of it: the two
 * submissions are genuinely different forms (HR captures headcount events,
 * Finance captures money), and Finance additionally needs currency formatting and
 * negative-value entry, which HR never has. What they DO share - identical
 * input styling, the same fieldset/record-list shapes - is kept visually
 * identical by matching the HR classes exactly, so the six Finance sections look
 * and behave like the six HR ones.
 */

const inputClass =
  "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/25 outline-none focus:border-butter-dark";

/**
 * Money input.
 *
 * Negative values are deliberately accepted. Finance genuinely has negative
 * amounts - refunds, credit notes, corrections - and the alternative (entering a
 * positive number and explaining the sign in a note) is how bad financial data
 * starts.
 */
export function FinNumberField({
  label,
  value,
  onChange,
  required,
  hint,
  suffix,
  prefix,
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

export function FinTextField({
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

export function FinTextArea({
  label,
  value,
  onChange,
  hint,
  rows = 2,
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

export function FinSelectField<T extends string>({
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
  options: readonly T[] | readonly { value: T; label: string }[];
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
      <select
        className={`${inputClass} appearance-none`}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const val = typeof o === "string" ? o : o.value;
          const text = typeof o === "string" ? o : o.label;
          return (
            <option key={val} value={val}>
              {text}
            </option>
          );
        })}
      </select>
      {hint && <span className="text-[11px] text-ink-soft/40">{hint}</span>}
    </label>
  );
}

export function FinCheckbox({
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

export function FinFieldset({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 rounded-2xl border border-ink/10 bg-white/50 p-4">
      {/* <legend> is the accessible name but is visually hidden: browsers give
          it special layout that draws it across the fieldset's top border. */}
      <legend className="sr-only">{title}</legend>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">{title}</h3>
      {description && <p className="mt-1 text-[11px] text-ink-soft/40">{description}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

export function FinSubheading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`col-span-full text-xs font-semibold text-ink-soft/60 ${className}`}>{children}</div>;
}

/** Repeating-record table shell shared by the revenue, budget, debtor, creditor
 *  and expense lists. */
export function FinRecordList({
  title,
  addLabel,
  onAdd,
  children,
  description,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">{title}</span>
          {description && <p className="mt-1 text-[11px] text-ink-soft/40">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/5"
        >
          + {addLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

export function FinEmptyRow({ text }: { text: string }) {
  return <p className="rounded-xl bg-ink/[0.03] px-3 py-3 text-xs text-ink-soft/40">{text}</p>;
}

export function FinRemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
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

/**
 * A single repeating financial record, laid out as a compact card.
 *
 * The grid is wider than the HR record rows because a financial line carries
 * more independent figures per row (budget, actual, prior period) and cramming
 * them into one table row makes the numbers unreadable on a laptop.
 */
export function FinRecordCard({
  title,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  onRemove: () => void;
  removeLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-ink-soft/70">{title}</span>
        <FinRemoveButton onClick={onRemove} label={removeLabel} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

/** Scrolling container for a long list of records. */
export function FinRecordScroll({ children }: { children: ReactNode }) {
  return <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">{children}</div>;
}
