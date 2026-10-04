import type { ReactNode } from "react";

/**
 * Shared form primitives for the Operations submission.
 *
 * Operations captures seven different registers, and each one is the same shape
 * of thing: a table of rows, each row a set of typed columns, with add and
 * remove. Rather than seven hand-written tables that drift apart, the sections
 * describe their columns and this file renders them.
 *
 * The look matches the HR and Finance field sets exactly, so a manager moving
 * between submission screens sees the same controls in the same places.
 *
 * Two rules the components enforce structurally rather than by convention:
 *
 *  1. NOTHING DERIVED IS EDITABLE. There is no percentage input here at all.
 *     Attendance rates, completion rates and dropout rates are computed from the
 *     rows in the table, because a typed rate and the register behind it can
 *     disagree, and then nobody can tell which one the board was shown.
 *
 *  2. COUNTS THAT WERE NOT COUNTED STAY EMPTY. Number fields hold `null` until
 *     something is typed, and render blank. A blank cell is "not known"; a zero
 *     would read as "nobody attended", which is a completely different claim.
 */

const inputClass =
  "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/25 outline-none focus:border-butter-dark";

export function OpsTextField({
  label,
  value,
  onChange,
  required,
  hint,
  placeholder,
  type = "text",
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  type?: "text" | "date";
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
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

export function OpsNumberField({
  label,
  value,
  onChange,
  required,
  hint,
  suffix,
  prefix,
  step = "1",
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  required?: boolean;
  hint?: string;
  suffix?: string;
  prefix?: string;
  step?: string | number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft/60">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <div className="flex items-center gap-2">
        {prefix && <span className="shrink-0 text-xs text-ink-soft/50">{prefix}</span>}
        <input
          type="number"
          step={step}
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

export function OpsSelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
  hint,
  allowBlank = true,
  blankLabel = "Not set",
  wide,
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  onChange: (value: T | "") => void;
  required?: boolean;
  hint?: string;
  allowBlank?: boolean;
  blankLabel?: string;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-soft/60">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T | "")}>
        {allowBlank && <option value="">{blankLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <span className="text-[11px] text-ink-soft/40">{hint}</span>}
    </label>
  );
}

export function OpsCheckbox({
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
    <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-ink/[0.03] px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-ink/20 accent-ink"
      />
      <span className="text-xs text-ink-soft/70">
        {label}
        {hint && <span className="block text-[11px] text-ink-soft/40">{hint}</span>}
      </span>
    </label>
  );
}

export function OpsTextArea({
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

export function OpsFieldset({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft/50">{description}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** A derived figure. Read-only by construction: Operations never types one. */
export function OpsReadout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-[11px] text-ink-soft/45">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
      {hint && <p className="text-[11px] text-ink-soft/40">{hint}</p>}
    </div>
  );
}

/**
 * A table of records driven by a column description.
 *
 * `rows` are the actual records, `columns` describe how to render each field,
 * and the component owns nothing: no state, no derived figures, no formatting
 * decisions. That keeps the seven registers consistent by construction, and it
 * means a column added to a register is a one-line change rather than an edit in
 * two places.
 */
export function OpsRecordTable<T extends { id: string }>({
  rows,
  columns,
  onUpdate,
  onRemove,
  onAdd,
  addLabel,
  emptyText,
}: {
  rows: T[];
  columns: {
    key: string;
    label: string;
    required?: boolean;
    render: (row: T, patch: (value: never) => void) => ReactNode;
  }[];
  onUpdate: (id: string, patch: Partial<T>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  addLabel: string;
  emptyText: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 ? (
        <p className="rounded-xl bg-ink/[0.03] px-3 py-3 text-xs text-ink-soft/50">{emptyText}</p>
      ) : (
        rows.map((row, index) => (
          <div
            key={row.id}
            role="group"
            aria-label={`Row ${index + 1}`}
            className="rounded-xl border border-ink/10 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/40">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {columns.map((c) => (
                <div key={c.key}>{c.render(row, (patch) => onUpdate(row.id, patch as Partial<T>))}</div>
              ))}
            </div>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={onAdd}
        className="self-start rounded-xl border border-ink/15 px-3 py-2 text-xs font-semibold text-ink hover:bg-ink/[0.04]"
      >
        + {addLabel}
      </button>
    </div>
  );
}