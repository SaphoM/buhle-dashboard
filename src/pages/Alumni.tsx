import { useSearchParams } from "react-router-dom";
import { DepartmentDashboard } from "../components/dashboard/DepartmentDashboard";

/**
 * Academy & Alumni - one dashboard, one owner.
 *
 * Academy (programmes, intakes, assessments, certification) and Alumni (the
 * graduate tracer study) are a single learner pipeline: Academy's certification
 * register is where a learner becomes a graduate, and that graduate is who the
 * Alumni tracer study reaches six months later. They are reported by the same
 * manager, so they share a page.
 *
 * Each keeps its own KPIs, cycle, risks and submission, so neither department's
 * figures can leak into the other's. The active tab lives in the URL
 * (?view=alumni) so a link can land on either.
 */
const TABS = [
  {
    key: "academy",
    label: "Academy",
    department: "Academy" as const,
    description: "Programme accreditation, intakes, assessment outcomes and certification.",
  },
  {
    key: "alumni",
    label: "Alumni",
    department: "Alumni" as const,
    description: "Graduate employment, business sustainability and engagement.",
  },
];

export function Alumni() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.key === params.get("view")) ?? TABS[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Academy &amp; Alumni</h1>
          <p className="text-sm text-ink-soft/60">
            The learner pipeline from programme intake through certification to graduate outcomes.
          </p>
        </div>
        <div role="tablist" aria-label="Academy and Alumni" className="flex gap-1 rounded-full bg-ink/[0.06] p-1">
          {TABS.map((tab) => {
            const selected = tab.key === active.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setParams(tab.key === TABS[0].key ? {} : { view: tab.key }, { replace: true })}
                className={`rounded-full px-5 py-1.5 text-sm font-semibold transition ${
                  selected ? "bg-ink text-butter" : "text-ink-soft/70 hover:bg-ink/5"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">
        <DepartmentDashboard
          key={active.department}
          department={active.department}
          description={active.description}
          embedded
        />
      </div>
    </div>
  );
}
