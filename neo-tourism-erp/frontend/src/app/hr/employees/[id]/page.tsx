"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/components/auth-provider";
import { StatusBadge } from "@/components/status-badge";

type Employee = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  organizationLevel: string;
  employmentType: string;
  employmentStatus: string;
  joinDate: string;
  workEmail: string | null;
  phone: string | null;
  salaryBand?: string | null;
  payRate?: string | number | null;
  payFrequency?: string | null;
  currency?: string | null;
  department: { name: string };
  position: { id: string; code: string; title: string } | null;
  manager: { firstName: string; lastName: string } | null;
  onboardingStatus: string;
  offboardingStatus: string;
  user: { email: string; isActive: boolean } | null;
  shifts: { shift: { name: string }; effectiveFrom: string }[];
};
type History = {
  id: string;
  jobTitle: string;
  departmentId: string;
  managerId: string | null;
  employmentType: string;
  employmentStatus: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeType: string;
  reason: string | null;
};
type Task = {
  id: string;
  title: string;
  category: string;
  status: string;
  dueDate: string | null;
  requiresDocument?: boolean;
};
type DocumentItem = {
  id: string;
  fileName: string;
  category: string;
  visibility: string;
  expiryDate: string | null;
};
const tabs = [
  "Overview",
  "Employment",
  "Employment History",
  "Attendance",
  "Leave",
  "Documents",
  "Assets",
  "Access",
  "Onboarding",
  "Offboarding",
] as const;

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [detail, setDetail] = useState<unknown>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiFetch<Employee>(`/hr/employees/${id}`)
      .then(setEmployee)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load employee."),
      );
  }, [id]);
  useEffect(() => {
    let path: string | null = null;
    if (
      tab === "Employment History" &&
      hasPermission("hr.employment_history.view")
    )
      path = `/hr/employees/${id}/employment-history`;
    if (tab === "Documents" && hasPermission("hr.document.view_all"))
      path = `/hr/employees/${id}/documents`;
    if (tab === "Onboarding" && hasPermission("hr.onboarding.view"))
      path = `/hr/employees/${id}/onboarding/tasks`;
    if (tab === "Offboarding" && hasPermission("hr.offboarding.view"))
      path = `/hr/employees/${id}/offboarding/tasks`;
    if (path)
      void apiFetch<unknown>(path)
        .then(setDetail)
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Unable to load section."),
        );
  }, [hasPermission, id, tab]);
  if (error) return <div className="p-8 text-red-700">{error}</div>;
  if (!employee) return <div className="p-8 text-slate-500">Loading…</div>;
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <p className="text-sm font-medium text-emerald-700">Employee profile</p>
      <h1 className="mt-1 text-3xl font-semibold">
        {employee.firstName} {employee.lastName}
      </h1>
      <div className="mt-5 flex gap-2 overflow-x-auto border-b pb-2">
        {tabs.map((name) => (
          <button
            key={name}
            onClick={() => {
              setDetail(null);
              setTab(name);
            }}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === name ? "bg-emerald-700 text-white" : "bg-white text-slate-700"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <section className="mt-5 rounded-2xl border bg-white p-6">
        <ProfileTab
          tab={tab}
          employee={employee}
          detail={detail}
          canSeeCompensation={hasPermission("hr.employee.edit")}
        />
      </section>
    </div>
  );
}

function ProfileTab({
  tab,
  employee,
  detail,
  canSeeCompensation,
}: {
  tab: (typeof tabs)[number];
  employee: Employee;
  detail: unknown;
  canSeeCompensation: boolean;
}) {
  const finalInactive = ["INACTIVE", "TERMINATED"].includes(
    employee.employmentStatus,
  );
  const accessMismatch = finalInactive && employee.user?.isActive;
  if (tab === "Overview" || tab === "Employment") {
    const rows = [
      ["Employee ID", employee.employeeNumber],
      ["Job title", employee.jobTitle],
      ["Organization level", employee.organizationLevel.replaceAll("_", " ")],
      ["Department", employee.department.name],
      [
        "Position",
        employee.position
          ? `${employee.position.code} — ${employee.position.title}`
          : "—",
      ],
      ["Employment type", employee.employmentType],
      ["Status", employee.employmentStatus],
      ["Join date", formatDate(employee.joinDate)],
      ["Work email", employee.workEmail ?? "—"],
      ["Phone", employee.phone ?? "—"],
      [
        "Manager",
        employee.manager
          ? `${employee.manager.firstName} ${employee.manager.lastName}`
          : "—",
      ],
      ["Current shift", employee.shifts[0]?.shift.name ?? "—"],
      ...(canSeeCompensation
        ? [
            ["Salary band", employee.salaryBand ?? "—"],
            [
              "Pay rate",
              employee.payRate != null && employee.payRate !== ""
                ? `${employee.payRate}${employee.payFrequency ? ` / ${employee.payFrequency}` : ""}${employee.currency ? ` ${employee.currency}` : ""}`
                : "—",
            ],
          ]
        : []),
      [
        "ERP access",
        employee.user
          ? `${employee.user.isActive ? "ACTIVE" : "DISABLED"} · ${employee.user.email}`
          : "Not created",
      ],
    ];
    return (
      <>
        {accessMismatch && (
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">
            ERP access is still enabled. IT &amp; Access Management must disable
            this account.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-sm">{value}</p>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (tab === "Employment History")
    return (
      <div className="space-y-3">
        {((detail as History[]) ?? []).map((item) => (
          <div key={item.id} className="rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between">
              <strong>{item.changeType.replaceAll("_", " ")}</strong>
              <StatusBadge status={item.employmentStatus} />
            </div>
            <p className="mt-1 text-sm">
              {item.jobTitle} · {item.employmentType}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Effective {formatDate(item.effectiveFrom)}
              {item.effectiveTo ? ` to ${formatDate(item.effectiveTo)}` : ""}
              {item.reason ? ` · ${item.reason}` : ""}
            </p>
          </div>
        ))}
      </div>
    );
  if (tab === "Documents")
    return (
      <SimpleList
        items={((detail as DocumentItem[]) ?? []).map((item) => ({
          title: item.fileName,
          meta: `${item.category} · ${item.visibility}${item.expiryDate ? ` · expires ${formatDate(item.expiryDate)}` : ""}`,
        }))}
      />
    );
  if (tab === "Onboarding" || tab === "Offboarding") {
    const tasks = (detail as Task[]) ?? [];
    return (
      <>
        <p className="mb-4 text-sm text-slate-600">
          {tasks.filter((x) => x.status === "COMPLETED").length} /{" "}
          {tasks.length} tasks completed ·{" "}
          {tab === "Onboarding"
            ? employee.onboardingStatus
            : employee.offboardingStatus}
        </p>
        {tab === "Offboarding" && (
          <div className="mb-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              ERP access
            </p>
            <p className="mt-1 font-semibold">
              {!employee.user
                ? "NO ERP ACCESS"
                : !employee.user.isActive
                  ? "COMPLETED — Disabled"
                  : finalInactive
                    ? "PENDING — Disable required"
                    : "NOT REQUIRED"}
            </p>
          </div>
        )}
        <SimpleList
          items={tasks.map((item) => ({
            title: item.title,
            meta: `${item.category} · ${item.status}${item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}`,
          }))}
        />
      </>
    );
  }
  return (
    <p className="text-sm text-slate-600">
      This information remains available through the permission-controlled{" "}
      {tab.toLowerCase()} workspace.
    </p>
  );
}
function SimpleList({
  items,
}: {
  items: Array<{ title: string; meta: string }>;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className="rounded-xl bg-slate-50 p-4"
        >
          <p className="font-semibold">{item.title}</p>
          <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
        </div>
      ))}
      {!items.length && (
        <p className="text-sm text-slate-500">
          No records found or this section is not permitted.
        </p>
      )}
    </div>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB").format(new Date(value));
}
