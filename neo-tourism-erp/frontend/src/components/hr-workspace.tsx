"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useAuth } from "./auth-provider";
import { StatusBadge } from "./status-badge";

type Employee = {
  id: string;
  userId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  organizationLevel: string;
  employmentType: string;
  employmentStatus: string;
  joinDate: string;
  workEmail: string | null;
  archivedAt: string | null;
  salaryBand?: string | null;
  payRate?: string | number | null;
  payFrequency?: string | null;
  currency?: string | null;
  department: { id: string; name: string };
  positionId: string | null;
  position: { id: string; code: string; title: string } | null;
  manager: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
  } | null;
  shifts: Array<{ shift: Shift }>;
};
type Attendance = {
  id: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  workedSeconds: number;
  breakSeconds: number;
  excessBreakSeconds: number | null;
  breakSessionsUsed: number;
  state: "NOT_CHECKED_IN" | "WORKING" | "ON_BREAK" | "CHECKED_OUT";
  workSessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
  }>;
  breaks: Array<{ id: string; startedAt: string; endedAt: string | null }>;
  employee?: Employee;
};
type Leave = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  employee?: Employee;
  approvals?: Array<{
    approvalLevel: "MANAGER" | "HR";
    status: string;
    comment: string | null;
    reviewedAt: string | null;
    approver: { id: string; firstName: string; lastName: string } | null;
  }>;
};
type LeaveBalance = {
  leaveType: string;
  year: number;
  openingBalance: string;
  accrued: string;
  adjusted: string;
  used: string;
  remainingBalance: string;
};
type SharedLeave = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  employee?: Employee;
};
type Shift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
};
type Department = { id: string; name: string };
type PositionOption = {
  id: string;
  code: string;
  title: string;
  isActive: boolean;
};
type ProvisioningResult = {
  employeeNumber: string;
  erpAccount: {
    loginEmail: string;
    state: "PENDING_ACTIVATION";
    roles: string[];
    approvalPending: string[];
    invitation: {
      expiresAt: string;
      delivery: "SENT" | "FAILED" | "NOT_CONFIGURED";
      invitationLink?: string;
    };
  };
};
type List<T> = {
  data: T[];
  pagination: { page: number; total: number; totalPages: number };
};

export function HrWorkspace({
  view,
}: {
  view: "employees" | "attendance" | "leave" | "shifts";
}) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<unknown[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [leaveFilters, setLeaveFilters] = useState({
    leaveType: "",
    status: "",
    from: "",
    to: "",
  });
  const [attendanceFilters, setAttendanceFilters] = useState({
    employee: "",
    status: "",
    from: "",
    to: "",
  });
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [provisioningResult, setProvisioningResult] =
    useState<ProvisioningResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (view === "employees") {
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (search) params.set("search", search);
        if (status) params.set("status", status);
        if (includeArchived) params.set("includeArchived", "true");
        const result = await apiFetch<List<Employee>>(
          `/hr/employees?${params}`,
        );
        setItems(result.data);
        setPages(result.pagination.totalPages || 1);
      } else if (view === "attendance") {
        if (hasPermission("hr.attendance.view")) {
          const params = new URLSearchParams();
          if (attendanceFilters.status)
            params.set("status", attendanceFilters.status);
          if (attendanceFilters.from)
            params.set("dateFrom", attendanceFilters.from);
          if (attendanceFilters.to) params.set("dateTo", attendanceFilters.to);
          // employee free-text stays client-side; server supports employeeId only.
          const query = params.toString() ? `?${params}` : "";
          setItems(await apiFetch<Attendance[]>(`/hr/attendance${query}`));
        } else {
          setItems(await apiFetch<Attendance[]>("/hr/attendance/my"));
        }
      } else if (view === "leave") {
        const [mine, managers, managed] = await Promise.all([
          apiFetch<Leave[]>("/hr/leave/my").catch(() => []),
          hasPermission("hr.leave.manager_approve")
            ? apiFetch<Leave[]>("/hr/leave/manager-requests").catch(() => [])
            : [],
          hasPermission("hr.leave.manage")
            ? apiFetch<Leave[]>("/hr/leave/requests")
            : [],
        ]);
        const queue = [
          ...managers,
          ...managed.filter((x) => !managers.some((y) => y.id === x.id)),
        ];
        setItems([
          ...queue,
          ...mine.filter((x) => !queue.some((y) => y.id === x.id)),
        ]);
        setBalances(
          await apiFetch<LeaveBalance[]>("/hr/leave/balances/my").catch(
            () => [],
          ),
        );
      } else setItems(await apiFetch<Shift[]>("/hr/shifts"));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load HR records.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    attendanceFilters,
    hasPermission,
    includeArchived,
    page,
    search,
    status,
    view,
  ]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => {
    if (view === "employees") {
      void apiFetch<Department[]>("/departments")
        .then(setDepartments)
        .catch(() => undefined);
      void apiFetch<List<Employee>>("/hr/employees?limit=100")
        .then((result) =>
          setEmployeeOptions(
            result.data.filter((employee) => !employee.archivedAt),
          ),
        )
        .catch(() => undefined);
      if (hasPermission("hr.shift.view"))
        void apiFetch<Shift[]>("/hr/shifts")
          .then((records) => setShifts(records.filter((x) => x.isActive)))
          .catch(() => undefined);
      void apiFetch<PositionOption[]>("/positions")
        .then((records) => setPositions(records.filter((x) => x.isActive)))
        .catch(() => undefined);
    }
  }, [hasPermission, view]);
  async function submit(
    path: string,
    body?: object,
    method = "POST",
    successMessage:
      string | ((result: unknown) => string) = "Saved successfully.",
  ) {
    if (busy) return false;
    setBusy(true);
    setMessage("");
    setProvisioningResult(null);
    setError("");
    try {
      const result = await apiFetch<unknown>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (isProvisioningResult(result)) setProvisioningResult(result);
      setMessage(
        typeof successMessage === "function"
          ? successMessage(result)
          : successMessage,
      );
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Request failed.");
      setBusy(false);
      return false;
    }
  }
  const title = {
    employees: "Employees",
    attendance: "Attendance",
    leave: "Leave",
    shifts: "Shifts",
  }[view];
  const visibleItems =
    view === "leave"
      ? (items as Leave[]).filter(
          (leave) =>
            (!leaveFilters.leaveType ||
              leave.leaveType === leaveFilters.leaveType) &&
            (!leaveFilters.status || leave.status === leaveFilters.status) &&
            (!leaveFilters.from ||
              leave.endDate.slice(0, 10) >= leaveFilters.from) &&
            (!leaveFilters.to ||
              leave.startDate.slice(0, 10) <= leaveFilters.to),
        )
      : view === "attendance"
        ? (items as Attendance[]).filter((attendance) => {
            const employee = attendance.employee;
            const identity = employee
              ? `${employee.employeeNumber} ${employee.firstName} ${employee.lastName}`.toLowerCase()
              : "me";
            return (
              (!attendanceFilters.employee ||
                identity.includes(attendanceFilters.employee.toLowerCase())) &&
              (!attendanceFilters.status ||
                attendance.status === attendanceFilters.status) &&
              (!attendanceFilters.from ||
                attendance.date.slice(0, 10) >= attendanceFilters.from) &&
              (!attendanceFilters.to ||
                attendance.date.slice(0, 10) <= attendanceFilters.to)
            );
          })
        : items;
  return (
    <div
      className={`mx-auto px-5 py-8 sm:px-8 ${view === "employees" ? "max-w-[1600px]" : "max-w-7xl"}`}
    >
      <header>
        <p className="text-sm font-medium text-emerald-700">Human Resources</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">{title}</h1>
      </header>
      {message && (
        <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {provisioningResult && (
        <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
          <h2 className="font-semibold">Employee and ERP account created</h2>
          <p className="mt-2">
            Employee ID: <strong>{provisioningResult.employeeNumber}</strong>
          </p>
          <p>
            Login: <strong>{provisioningResult.erpAccount.loginEmail}</strong>
          </p>
          <p>
            Roles:{" "}
            {provisioningResult.erpAccount.roles.join(", ") || "None mapped"}
          </p>
          {!!provisioningResult.erpAccount.approvalPending.length && (
            <p>
              Access review:{" "}
              {provisioningResult.erpAccount.approvalPending.join(", ")}
            </p>
          )}
          <p className="mt-2">
            Account: <strong>PENDING ACTIVATION</strong>
          </p>
          {provisioningResult.erpAccount.invitation.delivery === "SENT" && (
            <p className="mt-2 font-medium text-emerald-800">
              Invitation: EMAIL SENT — a password setup email has been sent
              to {provisioningResult.erpAccount.loginEmail}.
            </p>
          )}
          {provisioningResult.erpAccount.invitation.delivery === "FAILED" && (
            <p className="mt-2 font-medium text-amber-800">
              Invitation: EMAIL DELIVERY FAILED — the account was created,
              but the email could not be delivered. Retry from IT &amp;
              Access Management → User Accounts.
            </p>
          )}
          {provisioningResult.erpAccount.invitation.delivery ===
            "NOT_CONFIGURED" && (
            <p className="mt-2 font-medium text-amber-800">
              Invitation: EMAIL NOT CONFIGURED — contact IT to configure ERP
              email delivery, then resend the invitation from User Accounts.
            </p>
          )}
          {provisioningResult.erpAccount.invitation.invitationLink && (
            <div className="mt-3">
              <p className="font-medium text-amber-800">
                Development debug link (never shown in production):
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  readOnly
                  value={
                    provisioningResult.erpAccount.invitation.invitationLink
                  }
                  className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      provisioningResult.erpAccount.invitation
                        .invitationLink as string,
                    )
                  }
                  className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white"
                >
                  Copy link
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {error && (
        <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {view === "employees" && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              void load();
            }}
            className="mt-6 flex gap-3"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee"
              className="flex-1 rounded-xl border px-3 py-2"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border px-3"
            >
              <option value="">All statuses</option>
              {[
                "ACTIVE",
                "PROBATION",
                "ON_LEAVE",
                "NOTICE_PERIOD",
                "TERMINATED",
                "INACTIVE",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button className="rounded-xl bg-slate-900 px-4 text-white">
              Search
            </button>
            <label className="flex items-center gap-2 rounded-xl border px-3 text-sm">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              Include archived
            </label>
          </form>
          {hasPermission("hr.employee.create") && (
            <EmployeeForm
              departments={departments}
              shifts={shifts}
              employees={employeeOptions}
              onSubmit={(body) => submit("/hr/employees", body)}
            />
          )}
        </>
      )}
      {view === "leave" && (
        <>
          <LeaveForm
            balances={balances}
            submitting={busy}
            onSubmit={(body) =>
              submit("/hr/leave", body, "POST", (result) => {
                const leave = result as Leave;
                return leave.approvals?.some(
                  (approval) => approval.approvalLevel === "MANAGER",
                )
                  ? "Leave request submitted successfully. Waiting for Manager approval."
                  : "Leave request submitted successfully. Waiting for HR approval.";
              })
            }
          />
          {balances.length > 0 && (
            <section className="mt-5 grid gap-3 sm:grid-cols-3">
              {balances.map((x) => (
                <div
                  key={`${x.year}-${x.leaveType}`}
                  className="rounded-xl border bg-white p-4"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    {friendlyLeaveType(x.leaveType)} · {x.year}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Total</dt>
                      <dd className="mt-1 text-xl font-semibold">
                        {leaveTotal(x)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Used</dt>
                      <dd className="mt-1 text-xl font-semibold">{x.used}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Remaining</dt>
                      <dd className="mt-1 text-xl font-semibold text-emerald-700">
                        {x.remainingBalance}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </section>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              setLeaveFilters({
                leaveType: String(values.leaveType ?? ""),
                status: String(values.status ?? ""),
                from: String(values.from ?? ""),
                to: String(values.to ?? ""),
              });
            }}
            className="mt-5 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
          >
            <label className="text-xs font-semibold text-slate-600">
              Leave type
              <select
                name="leaveType"
                className="mt-1.5 h-10 w-full rounded-lg border px-3 text-sm"
              >
                <option value="">All types</option>
                {leaveTypes.map((type) => (
                  <option key={type} value={type}>
                    {friendlyLeaveType(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Status
              <select
                name="status"
                className="mt-1.5 h-10 w-full rounded-lg border px-3 text-sm"
              >
                <option value="">All statuses</option>
                {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {friendlyLeaveType(value)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              From date
              <input
                name="from"
                type="date"
                className="mt-1.5 h-10 w-full rounded-lg border px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              To date
              <input
                name="to"
                type="date"
                className="mt-1.5 h-10 w-full rounded-lg border px-3 text-sm"
              />
            </label>
            <button className="self-end rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              Apply
            </button>
          </form>
        </>
      )}
      {view === "attendance" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            setAttendanceFilters({
              employee: String(values.employee ?? ""),
              status: String(values.status ?? ""),
              from: String(values.from ?? ""),
              to: String(values.to ?? ""),
            });
          }}
          className="mt-5 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
          <input
            name="employee"
            placeholder="Employee name or ID"
            className="h-10 rounded-lg border px-3 text-sm"
          />
          <select name="status" className="h-10 rounded-lg border px-3 text-sm">
            <option value="">All statuses</option>
            {[
              "PRESENT",
              "ABSENT",
              "LATE",
              "HALF_DAY",
              "ON_LEAVE",
              "REMOTE",
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <input
            name="from"
            type="date"
            aria-label="From date"
            className="h-10 rounded-lg border px-3 text-sm"
          />
          <input
            name="to"
            type="date"
            aria-label="To date"
            className="h-10 rounded-lg border px-3 text-sm"
          />
          <button className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
            Apply
          </button>
        </form>
      )}
      {view === "shifts" && hasPermission("hr.shift.manage") && (
        <ShiftForm onSubmit={(body) => submit("/hr/shifts", body)} />
      )}
      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white shadow-sm">
        {busy ? (
          <p className="p-10 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <HrTable
            view={view}
            items={visibleItems}
            canManagerApprove={hasPermission("hr.leave.manager_approve")}
            canHrApprove={hasPermission("hr.leave.hr_approve")}
            canManageLeave={hasPermission("hr.leave.manage")}
            canEditEmployees={hasPermission("hr.employee.edit")}
            canManageEmployeeStatus={hasPermission("hr.employee.status.manage")}
            canCorrectAttendance={hasPermission("hr.attendance.manage")}
            departments={departments}
            shifts={shifts}
            employees={employeeOptions}
            positions={positions}
            editingId={editingId}
            setEditingId={setEditingId}
            action={submit}
          />
        )}
      </section>
      {view === "employees" && pages > 1 && (
        <div className="mt-4 flex justify-end gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 py-2 text-sm">
            {page} / {pages}
          </span>
          <button
            disabled={page === pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function EmployeeForm({
  departments,
  shifts,
  employees,
  onSubmit,
}: {
  departments: Department[];
  shifts: Shift[];
  employees: Employee[];
  onSubmit: (body: object) => Promise<boolean>;
}) {
  const [erpAccessRequired, setErpAccessRequired] = useState(false);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await onSubmit(formValues(form))) {
      form.reset();
      setErpAccessRequired(false);
    }
  }
  const fieldClass =
    "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10";
  const labelClass = "text-xs font-semibold text-slate-600";
  return (
    <details className="group mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold text-slate-900">
            Add employee
          </span>
          <span className="mt-0.5 block text-xs font-normal text-slate-500">
            Create a new employee record and assign their working shift.
          </span>
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-700 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-slate-100 bg-slate-50/40 p-5">
        <form
          onSubmit={handle}
          className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className={labelClass}>
            First name
            <input
              name="firstName"
              required
              placeholder="e.g. John"
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Last name
            <input
              name="lastName"
              required
              placeholder="e.g. Smith"
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Job title
            <input
              name="jobTitle"
              required
              placeholder="e.g. Travel Executive"
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Department
            <select
              name="departmentId"
              required
              defaultValue=""
              className={fieldClass}
            >
              <option value="" disabled>
                Select department
              </option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Organization level
            <select
              name="organizationLevel"
              defaultValue="STAFF"
              className={fieldClass}
            >
              {[
                "STAFF",
                "SUPERVISOR",
                "MANAGER",
                "DEPARTMENT_HEAD",
                "DIRECTOR",
                "OWNER",
              ].map((level) => (
                <option key={level} value={level}>
                  {level.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Manager{" "}
            <span className="font-normal text-slate-400">(optional)</span>
            <select name="managerId" defaultValue="" className={fieldClass}>
              <option value="">No manager</option>
              {employees
                .filter((employee) => employee.employmentStatus === "ACTIVE")
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeNumber} — {employee.firstName}{" "}
                    {employee.lastName}
                  </option>
                ))}
            </select>
          </label>
          <label className={labelClass}>
            Employment type
            <select name="employmentType" className={fieldClass}>
              {[
                "FULL_TIME",
                "PART_TIME",
                "CONTRACT",
                "INTERN",
                "TEMPORARY",
              ].map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Join date
            <input
              type="date"
              name="joinDate"
              required
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Work email{" "}
            <span className="font-normal text-slate-400">(optional)</span>
            <input
              type="email"
              name="workEmail"
              required={erpAccessRequired}
              placeholder="name@company.com"
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Shift
            <select name="shiftId" className={fieldClass}>
              <option value="">No shift assigned</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shiftLabel(shift)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-11 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 sm:col-start-1">
            <input
              name="erpAccessRequired"
              type="checkbox"
              value="true"
              checked={erpAccessRequired}
              onChange={(event) => setErpAccessRequired(event.target.checked)}
              className="h-4 w-4"
            />
            ERP Access Required
          </label>
          {erpAccessRequired && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950 sm:col-span-1 lg:col-span-3">
              <p className="font-semibold">Secure ERP provisioning</p>
              <p className="mt-1">
                Login uses the work email. Access roles can be assigned later
                from IT &amp; Access Management.
              </p>
              <p className="mt-1">
                A single-use password setup invitation is emailed to the
                employee automatically.
              </p>
            </div>
          )}
          <div className="flex justify-end border-t border-slate-200 pt-4 sm:col-span-2 lg:col-span-4">
            <button className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/20">
              Create employee
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}
const leaveTypes = ["ANNUAL", "SICK", "CASUAL", "PARENTAL", "UNPAID", "OTHER"];

function LeaveForm({
  balances,
  submitting,
  onSubmit,
}: {
  balances: LeaveBalance[];
  submitting: boolean;
  onSubmit: (body: object) => Promise<boolean>;
}) {
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [colleaguesOff, setColleaguesOff] = useState<SharedLeave[] | null>(
    null,
  );
  const [ownEmployeeId, setOwnEmployeeId] = useState<string | null>(null);
  const days = requestedLeaveDays(startDate, endDate);
  const invalidRange = Boolean(startDate && endDate && days === 0);
  const year = Number(startDate.slice(0, 4)) || new Date().getFullYear();
  const balance = balances.find(
    (item) => item.leaveType === leaveType && item.year === year,
  );
  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ id: string }>("/hr/me")
      .then((profile) => {
        if (!cancelled) setOwnEmployeeId(profile.id);
      })
      .catch(() => {
        if (!cancelled) setOwnEmployeeId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!startDate || !endDate || invalidRange) return;
    let cancelled = false;
    void apiFetch<SharedLeave[]>(
      `/hr/leave/calendar/shared?dateFrom=${startDate}&dateTo=${endDate}`,
    )
      .then((result) => {
        if (!cancelled)
          setColleaguesOff(
            result.filter((item) => item.employee?.id !== ownEmployeeId),
          );
      })
      .catch(() => {
        if (!cancelled) setColleaguesOff(null);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, invalidRange, ownEmployeeId]);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalidRange) return;
    const form = event.currentTarget;
    if (await onSubmit(Object.fromEntries(new FormData(form)))) {
      form.reset();
      setLeaveType("ANNUAL");
      setStartDate("");
      setEndDate("");
    }
  }
  return (
    <details className="group mt-5 overflow-hidden rounded-2xl border bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span>Request leave</span>
        <span className="text-xl transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <form
        onSubmit={handle}
        className="grid gap-4 border-t bg-slate-50/40 p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label className="text-xs font-semibold text-slate-600">
          Leave type
          <select
            name="leaveType"
            value={leaveType}
            onChange={(event) => setLeaveType(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border px-3 text-sm"
          >
            {leaveTypes.map((type) => (
              <option key={type} value={type}>
                {friendlyLeaveType(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Start date
          <input
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setColleaguesOff(null);
            }}
            className="mt-1.5 h-11 w-full rounded-xl border px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          End date
          <input
            name="endDate"
            type="date"
            required
            min={startDate || undefined}
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setColleaguesOff(null);
            }}
            className="mt-1.5 h-11 w-full rounded-xl border px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">
          Reason
          <textarea
            name="reason"
            required
            maxLength={1000}
            rows={3}
            placeholder="Briefly explain your leave request"
            className="mt-1.5 w-full resize-y rounded-xl border p-3 text-sm"
          />
        </label>
        <div className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200 sm:col-span-2">
          <p>
            <span className="text-slate-500">Balance: </span>
            {leaveType === "UNPAID" || leaveType === "OTHER" ? (
              "Not applicable"
            ) : balance ? (
              <strong>{balance.remainingBalance} days remaining</strong>
            ) : (
              `No ${friendlyLeaveType(leaveType)} balance for ${year}`
            )}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Requested: </span>
            <strong>
              {days} {days === 1 ? "day" : "days"}
            </strong>
          </p>
          {invalidRange && (
            <p className="mt-2 text-red-700">
              End date cannot be before start date.
            </p>
          )}
          {colleaguesOff !== null && colleaguesOff.length > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-800">
              <strong>
                {colleaguesOff.length}{" "}
                {colleaguesOff.length === 1 ? "colleague" : "colleagues"} on
                leave in this period:
              </strong>{" "}
              {colleaguesOff
                .slice(0, 5)
                .map(
                  (item) =>
                    `${item.employee?.firstName ?? ""} ${item.employee?.lastName ?? ""}`.trim() ||
                    item.employee?.employeeNumber ||
                    "Unknown",
                )
                .join(", ")}
              {colleaguesOff.length > 5 &&
                ` and ${colleaguesOff.length - 5} more`}
              .{" "}
              <a
                href="/hr/leave/company-calendar"
                className="font-semibold underline"
              >
                View calendar
              </a>
            </p>
          )}
        </div>
        <button
          disabled={submitting || invalidRange}
          className="self-end rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Leave Request"}
        </button>
      </form>
    </details>
  );
}
function ShiftForm({ onSubmit }: { onSubmit: (body: object) => void }) {
  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
  }
  return (
    <form
      onSubmit={handle}
      className="mt-5 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-4"
    >
      <input
        name="name"
        required
        placeholder="Shift name"
        className="rounded-lg border p-2"
      />
      <input
        name="startTime"
        type="time"
        required
        className="rounded-lg border p-2"
      />
      <input
        name="endTime"
        type="time"
        required
        className="rounded-lg border p-2"
      />
      <button className="rounded-lg bg-emerald-700 text-white">
        Add shift
      </button>
    </form>
  );
}

function HrTable({
  view,
  items,
  canManagerApprove,
  canHrApprove,
  canManageLeave,
  canEditEmployees,
  canManageEmployeeStatus,
  canCorrectAttendance,
  departments,
  shifts,
  employees,
  positions,
  editingId,
  setEditingId,
  action,
}: {
  view: string;
  items: unknown[];
  canManagerApprove: boolean;
  canHrApprove: boolean;
  canManageLeave: boolean;
  canEditEmployees: boolean;
  canManageEmployeeStatus: boolean;
  canCorrectAttendance: boolean;
  departments: Department[];
  shifts: Shift[];
  employees: Employee[];
  positions: PositionOption[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  action: (path: string, body?: object, method?: string) => Promise<boolean>;
}) {
  const { user } = useAuth();
  const [viewingLeave, setViewingLeave] = useState<Leave | null>(null);
  const [viewingAttendance, setViewingAttendance] = useState<Attendance | null>(
    null,
  );
  const [rejectingLeave, setRejectingLeave] = useState<{
    leave: Leave;
    level: "MANAGER" | "HR" | "LEGACY";
  } | null>(null);
  if (!items.length)
    return (
      <p className="p-10 text-center text-sm text-slate-500">
        No records found.
      </p>
    );
  if (view === "employees")
    return (
      <table className="w-full table-fixed text-left text-[13px]">
        <colgroup>
          <col className="w-[10%]" />
          <col className="w-[11%]" />
          <col className="w-[10%]" />
          <col className="w-[11%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead className="border-b border-slate-200 bg-slate-50/80">
          <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {[
              "Employee ID",
              "Name",
              "Job Title",
              "Department",
              "Shift",
              "Organization Level",
              "Manager",
              "Employment Status",
              "Actions",
            ].map((h) => (
              <th key={h} className="whitespace-normal px-2 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(items as Employee[]).map((employee) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              departments={departments}
              shifts={shifts}
              employees={employees}
              positions={positions}
              canEdit={canEditEmployees}
              canManageStatus={canManageEmployeeStatus}
              editing={editingId === employee.id}
              setEditing={setEditingId}
              action={action}
            />
          ))}
        </tbody>
      </table>
    );
  if (view === "attendance")
    return (
      <>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Employee",
                "Date",
                "Check In",
                "Break Used",
                "Break Sessions",
                "Exceed Time",
                "Check Out",
                "Net Worked",
                "Status",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="bg-slate-50 px-3 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(items as Attendance[]).map((attendance) => (
              <tr key={attendance.id} className="border-t">
                <td className="px-3 py-3">
                  {attendance.employee ? (
                    <>
                      <span className="font-medium">
                        {attendance.employee.firstName}{" "}
                        {attendance.employee.lastName}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {attendance.employee.employeeNumber}
                      </span>
                    </>
                  ) : (
                    "Me"
                  )}
                </td>
                <td className="whitespace-nowrap px-3">
                  {formatDate(attendance.date)}
                </td>
                <td className="px-3">{formatTime(attendance.checkInAt)}</td>
                <td className="px-3">
                  {formatSeconds(attendance.breakSeconds)}
                </td>
                <td className="px-3">{attendance.breakSessionsUsed}</td>
                <td className="px-3 font-medium text-red-600">
                  {attendance.excessBreakSeconds === null
                    ? "—"
                    : formatSeconds(attendance.excessBreakSeconds)}
                </td>
                <td className="px-3">{formatTime(attendance.checkOutAt)}</td>
                <td className="px-3">
                  {formatSeconds(attendance.workedSeconds)}
                </td>
                <td className="px-3">
                  <StatusBadge status={attendanceLabel(attendance)} />
                </td>
                <td className="px-3">
                  <button
                    type="button"
                    onClick={() => setViewingAttendance(attendance)}
                    className="font-semibold text-cyan-700 hover:text-cyan-900"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {viewingAttendance && (
          <AttendanceDetails
            attendance={viewingAttendance}
            canCorrect={canCorrectAttendance}
            onClose={() => setViewingAttendance(null)}
            onCorrect={async (body) => {
              const saved = await action(
                `/hr/attendance/${viewingAttendance.id}`,
                body,
                "PATCH",
              );
              if (saved) setViewingAttendance(null);
            }}
          />
        )}
      </>
    );
  if (view === "leave")
    return (
      <>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Employee",
                "Type",
                "Dates",
                "Days",
                "Reason",
                "Approvals",
                "Status",
                "Actions",
              ].map((h) => (
                <th key={h} className="bg-slate-50 px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(items as Leave[]).map((leave) => {
              const manager = leave.approvals?.find(
                (approval) => approval.approvalLevel === "MANAGER",
              );
              const hr = leave.approvals?.find(
                (approval) => approval.approvalLevel === "HR",
              );
              const configured = Boolean(leave.approvals?.length);
              const own = !leave.employee || leave.employee.userId === user?.id;
              const hrActionable =
                hr?.status === "PENDING" &&
                (!manager || manager.status === "APPROVED");
              return (
                <tr key={leave.id} className="border-t align-top">
                  <td className="px-4 py-3 font-medium">
                    {leave.employee
                      ? `${leave.employee.firstName} ${leave.employee.lastName}`
                      : "Me"}
                    {leave.employee && (
                      <p className="text-xs font-normal text-slate-500">
                        {leave.employee.employeeNumber}
                      </p>
                    )}
                  </td>
                  <td>{friendlyLeaveType(leave.leaveType)}</td>
                  <td className="whitespace-nowrap">
                    {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                  </td>
                  <td className="whitespace-nowrap">
                    {requestedLeaveDays(
                      leave.startDate.slice(0, 10),
                      leave.endDate.slice(0, 10),
                    )}{" "}
                    days
                  </td>
                  <td className="max-w-48 truncate" title={leave.reason}>
                    {leave.reason}
                  </td>
                  <td className="min-w-44 text-xs">
                    <ApprovalStage
                      label="Manager"
                      status={
                        manager?.status ??
                        (leave.employee?.manager
                          ? "NOT REQUIRED"
                          : "NOT ASSIGNED")
                      }
                      approval={manager}
                    />
                    <ApprovalStage
                      label="HR"
                      status={
                        hr?.status === "PENDING" &&
                        manager?.status === "PENDING"
                          ? "WAITING"
                          : (hr?.status ?? "NOT REQUIRED")
                      }
                      approval={hr}
                    />
                  </td>
                  <td>
                    <StatusBadge status={leave.status} />
                  </td>
                  <td>
                    <div className="flex min-w-32 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingLeave(leave)}
                        className="text-cyan-700"
                      >
                        View
                      </button>
                      {leave.status === "PENDING" && own && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Cancel this pending leave request?",
                              )
                            )
                              void action(`/hr/leave/${leave.id}/cancel`);
                          }}
                          className="text-amber-700"
                        >
                          Cancel
                        </button>
                      )}
                      {leave.status === "PENDING" &&
                        !own &&
                        canManagerApprove &&
                        manager?.status === "PENDING" && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Approve this request as Manager?",
                                  )
                                )
                                  void action(
                                    `/hr/leave/${leave.id}/manager-approve`,
                                    {},
                                  );
                              }}
                              className="text-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRejectingLeave({ leave, level: "MANAGER" })
                              }
                              className="text-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      {leave.status === "PENDING" &&
                        !own &&
                        canHrApprove &&
                        hrActionable && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Give final HR approval to this request?",
                                  )
                                )
                                  void action(
                                    `/hr/leave/${leave.id}/hr-approve`,
                                    {},
                                  );
                              }}
                              className="text-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRejectingLeave({ leave, level: "HR" })
                              }
                              className="text-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      {leave.status === "PENDING" &&
                        !own &&
                        canManageLeave &&
                        !configured && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Approve this legacy leave request?",
                                  )
                                )
                                  void action(
                                    `/hr/leave/${leave.id}/approve`,
                                    {},
                                  );
                              }}
                              className="text-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRejectingLeave({ leave, level: "LEGACY" })
                              }
                              className="text-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {viewingLeave && (
          <LeaveDetails
            leave={viewingLeave}
            onClose={() => setViewingLeave(null)}
          />
        )}
        {rejectingLeave && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-leave-title"
              onSubmit={async (event) => {
                event.preventDefault();
                const reason = String(
                  new FormData(event.currentTarget).get("reason") ?? "",
                );
                const path =
                  rejectingLeave.level === "MANAGER"
                    ? `/hr/leave/${rejectingLeave.leave.id}/manager-reject`
                    : rejectingLeave.level === "HR"
                      ? `/hr/leave/${rejectingLeave.leave.id}/hr-reject`
                      : `/hr/leave/${rejectingLeave.leave.id}/reject`;
                const success = await action(
                  path,
                  rejectingLeave.level === "LEGACY"
                    ? { notes: reason }
                    : { reason },
                );
                if (success) setRejectingLeave(null);
              }}
              className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            >
              <h2
                id="reject-leave-title"
                className="text-xl font-semibold text-slate-950"
              >
                Reject leave request
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                A rejection reason is required and will be visible in the
                request history.
              </p>
              <label className="mt-5 block text-sm font-semibold text-slate-700">
                Reason
                <textarea
                  name="reason"
                  required
                  maxLength={1000}
                  rows={4}
                  autoFocus
                  className="mt-2 w-full rounded-xl border p-3 font-normal"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingLeave(null)}
                  className="border text-slate-700"
                >
                  Cancel
                </button>
                <button className="bg-red-700 text-white">
                  Reject Request
                </button>
              </div>
            </form>
          </div>
        )}
      </>
    );
  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr>
          {["Name", "Start", "End", "Status"].map((h) => (
            <th key={h} className="bg-slate-50 px-4 py-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(items as Shift[]).map((x) => (
          <tr key={x.id} className="border-t">
            <td className="px-4 py-3">{x.name}</td>
            <td>{x.startTime}</td>
            <td>{x.endTime}</td>
            <td>{x.isActive ? "Active" : "Inactive"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type LeaveApproval = NonNullable<Leave["approvals"]>[number];

function AttendanceDetails({
  attendance,
  canCorrect,
  onClose,
  onCorrect,
}: {
  attendance: Attendance;
  canCorrect: boolean;
  onClose: () => void;
  onCorrect: (body: object) => Promise<void>;
}) {
  const employee = attendance.employee;
  const timeline = [
    ...attendance.workSessions.flatMap((session, index) => [
      {
        at: session.startedAt,
        label: `Work session ${index + 1} started`,
      },
      ...(session.endedAt
        ? [{ at: session.endedAt, label: `Work session ${index + 1} ended` }]
        : []),
    ]),
    ...attendance.breaks.flatMap((session, index) => [
      { at: session.startedAt, label: `Break ${index + 1} started` },
      ...(session.endedAt
        ? [{ at: session.endedAt, label: `Break ${index + 1} ended` }]
        : []),
    ]),
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-details-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Attendance · {formatDate(attendance.date)}
            </p>
            <h2
              id="attendance-details-title"
              className="mt-1 text-2xl font-semibold"
            >
              {employee
                ? `${employee.firstName} ${employee.lastName}`
                : "My attendance"}
            </h2>
            {employee && (
              <p className="mt-1 text-sm text-slate-500">
                {employee.employeeNumber}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border text-slate-600"
          >
            Close
          </button>
        </div>
        <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              Break Used
            </dt>
            <dd className="mt-1 font-semibold">
              {formatSeconds(attendance.breakSeconds)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              Exceed Time
            </dt>
            <dd className="mt-1 font-semibold text-red-600">
              {attendance.excessBreakSeconds === null
                ? "—"
                : formatSeconds(attendance.excessBreakSeconds)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">
              Net Worked
            </dt>
            <dd className="mt-1 font-semibold">
              {formatSeconds(attendance.workedSeconds)}
            </dd>
          </div>
        </dl>
        <ol className="mt-5 space-y-2 border-l border-slate-200 pl-5">
          {timeline.map((event, index) => (
            <li key={`${event.at}-${event.label}-${index}`} className="text-sm">
              <span className="font-semibold">{formatTime(event.at)}</span>
              <span className="ml-3 text-slate-600">{event.label}</span>
            </li>
          ))}
        </ol>
        {!timeline.length && (
          <p className="mt-5 text-sm text-slate-500">
            No session events recorded.
          </p>
        )}
        {canCorrect && (
          <details className="mt-6 rounded-xl border p-4">
            <summary className="cursor-pointer font-semibold">
              Correct attendance
            </summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                void onCorrect({
                  ...(values.get("checkInAt") && {
                    checkInAt: new Date(
                      String(values.get("checkInAt")),
                    ).toISOString(),
                  }),
                  ...(values.get("checkOutAt") && {
                    checkOutAt: new Date(
                      String(values.get("checkOutAt")),
                    ).toISOString(),
                  }),
                  status: values.get("status"),
                  notes: values.get("notes"),
                });
              }}
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <label className="text-xs font-semibold text-slate-600">
                Check in
                <input
                  name="checkInAt"
                  type="datetime-local"
                  defaultValue={dateTimeInput(attendance.checkInAt)}
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Check out
                <input
                  name="checkOutAt"
                  type="datetime-local"
                  defaultValue={dateTimeInput(attendance.checkOutAt)}
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Status
                <select
                  name="status"
                  defaultValue={attendance.status}
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                >
                  {[
                    "PRESENT",
                    "ABSENT",
                    "LATE",
                    "HALF_DAY",
                    "ON_LEAVE",
                    "REMOTE",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Correction reason
                <textarea
                  name="notes"
                  required
                  maxLength={500}
                  rows={3}
                  className="mt-1 w-full rounded-lg border p-2 text-sm"
                />
              </label>
              <button className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white sm:col-span-2">
                Save correction
              </button>
            </form>
          </details>
        )}
      </section>
    </div>
  );
}

function ApprovalStage({
  label,
  status,
  approval,
}: {
  label: string;
  status: string;
  approval?: LeaveApproval;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <span className="font-semibold">{label}:</span>{" "}
      {status.replaceAll("_", " ")}
      {approval?.approver && (
        <span className="block text-slate-500">
          By {approval.approver.firstName} {approval.approver.lastName}
          {approval.reviewedAt
            ? ` · ${formatDateTime(approval.reviewedAt)}`
            : ""}
        </span>
      )}
      {approval?.status === "REJECTED" && approval.comment && (
        <span className="block text-red-700">Reason: {approval.comment}</span>
      )}
    </div>
  );
}

function LeaveDetails({
  leave,
  onClose,
}: {
  leave: Leave;
  onClose: () => void;
}) {
  const manager = leave.approvals?.find(
    (approval) => approval.approvalLevel === "MANAGER",
  );
  const hr = leave.approvals?.find(
    (approval) => approval.approvalLevel === "HR",
  );
  const details = [
    [
      "Employee",
      leave.employee
        ? `${leave.employee.firstName} ${leave.employee.lastName}`
        : "Me",
    ],
    ["Employee ID", leave.employee?.employeeNumber ?? "—"],
    ["Leave type", friendlyLeaveType(leave.leaveType)],
    ["Dates", `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`],
    [
      "Requested days",
      String(
        requestedLeaveDays(
          leave.startDate.slice(0, 10),
          leave.endDate.slice(0, 10),
        ),
      ),
    ],
    ["Reason", leave.reason],
    ["Submitted at", formatDateTime(leave.createdAt)],
    [
      "Manager",
      leave.employee?.manager
        ? `${leave.employee.manager.firstName} ${leave.employee.manager.lastName}`
        : "Not assigned",
    ],
  ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-details-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Leave request
            </p>
            <h2
              id="leave-details-title"
              className="mt-1 text-2xl font-semibold text-slate-950"
            >
              Request details
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leave details"
            className="border text-slate-600"
          >
            Close
          </button>
        </div>
        <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div
              key={label}
              className={label === "Reason" ? "sm:col-span-2" : ""}
            >
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </dt>
              <dd className="mt-1 text-sm text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <ApprovalStage
            label="Manager decision"
            status={
              manager?.status ??
              (leave.employee?.manager ? "NOT REQUIRED" : "NOT ASSIGNED")
            }
            approval={manager}
          />
          <ApprovalStage
            label="HR decision"
            status={
              hr?.status === "PENDING" && manager?.status === "PENDING"
                ? "WAITING"
                : (hr?.status ?? "NOT REQUIRED")
            }
            approval={hr}
          />
        </div>
        {leave.status === "REJECTED" && leave.reviewNotes && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            <strong>Rejection reason:</strong> {leave.reviewNotes}
          </p>
        )}
        <div className="mt-5">
          <StatusBadge status={leave.status} />
        </div>
      </section>
    </div>
  );
}

function EmployeeRow({
  employee,
  departments,
  shifts,
  employees,
  positions,
  canEdit,
  canManageStatus,
  editing,
  setEditing,
  action,
}: {
  employee: Employee;
  departments: Department[];
  shifts: Shift[];
  employees: Employee[];
  positions: PositionOption[];
  canEdit: boolean;
  canManageStatus: boolean;
  editing: boolean;
  setEditing: (id: string | null) => void;
  action: (path: string, body?: object, method?: string) => Promise<boolean>;
}) {
  const currentShift = employee.shifts[0]?.shift;
  return (
    <>
      <tr className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
        <td className="whitespace-nowrap px-2 py-3 align-middle">
          <Link
            className="font-semibold text-cyan-700 transition-colors hover:text-cyan-900 hover:underline"
            href={`/hr/employees/${employee.id}`}
          >
            {employee.employeeNumber}
          </Link>
        </td>
        <td className="break-words px-2 py-3 align-middle font-medium text-slate-900">
          {employee.firstName} {employee.lastName}
        </td>
        <td className="break-words px-2 py-3 align-middle text-slate-700">
          {employee.jobTitle}
        </td>
        <td className="break-words px-2 py-3 align-middle text-slate-700">
          {employee.department.name}
        </td>
        <td className="break-words px-2 py-3 align-middle text-slate-700">
          {currentShift ? (
            <div>
              <p className="font-medium text-slate-800">{currentShift.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {currentShift.startTime}–{currentShift.endTime}
              </p>
            </div>
          ) : (
            <span className="text-slate-400">Not assigned</span>
          )}
        </td>
        <td className="break-words px-2 py-3 align-middle text-slate-700">
          {employee.organizationLevel.replaceAll("_", " ")}
        </td>
        <td className="break-words px-2 py-3 align-middle text-slate-700">
          {employee.manager
            ? `${employee.manager.firstName} ${employee.manager.lastName}`
            : "—"}
        </td>
        <td className="whitespace-nowrap px-2 py-3 align-middle">
          <StatusBadge
            status={
              employee.archivedAt ? "ARCHIVED" : employee.employmentStatus
            }
          />
        </td>
        <td className="px-2 py-3 align-middle">
          {!employee.archivedAt && (
            <span className="flex flex-nowrap gap-1 whitespace-nowrap">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(editing ? null : employee.id)}
                  className="inline-flex h-8 w-12 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 px-1 text-[10px] font-semibold text-cyan-800 transition-colors hover:border-cyan-300 hover:bg-cyan-100"
                >
                  Edit
                </button>
              )}
              {canManageStatus && employee.employmentStatus === "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Deactivate ${employee.firstName} ${employee.lastName}?`,
                      )
                    )
                      void action(
                        `/hr/employees/${employee.id}/status`,
                        { status: "INACTIVE" },
                        "PATCH",
                      );
                  }}
                  className="inline-flex h-8 w-[76px] items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-1 text-[10px] font-semibold text-amber-800 transition-colors hover:border-amber-300 hover:bg-amber-100"
                >
                  Deactivate
                </button>
              )}
              {canManageStatus && employee.employmentStatus === "INACTIVE" && (
                <button
                  type="button"
                  onClick={() =>
                    void action(
                      `/hr/employees/${employee.id}/status`,
                      { status: "ACTIVE" },
                      "PATCH",
                    )
                  }
                  className="inline-flex h-8 w-[76px] items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
                >
                  Reactivate
                </button>
              )}
              {canManageStatus && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Archive ${employee.firstName} ${employee.lastName}?\n\nEmployee ID: ${employee.employeeNumber}\n\nHistorical HR, attendance, leave and audit records will be preserved.`,
                      )
                    )
                      void action(
                        `/hr/employees/${employee.id}/archive`,
                        undefined,
                        "PATCH",
                      );
                  }}
                  className="inline-flex h-8 w-[60px] items-center justify-center rounded-lg border border-rose-200 bg-white px-1 text-[10px] font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-50"
                >
                  Archive
                </button>
              )}
            </span>
          )}
        </td>
      </tr>
      {editing && (
        <tr className="border-t bg-slate-50">
          <td colSpan={9} className="p-4">
            <EmployeeEditForm
              employee={employee}
              departments={departments}
              shifts={shifts}
              employees={employees}
              positions={positions}
              cancel={() => setEditing(null)}
              save={async (body) => {
                const saved = await action(
                  `/hr/employees/${employee.id}`,
                  body,
                  "PATCH",
                );
                if (saved) setEditing(null);
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function EmployeeEditForm({
  employee,
  departments,
  shifts,
  employees,
  positions,
  cancel,
  save,
}: {
  employee: Employee;
  departments: Department[];
  shifts: Shift[];
  employees: Employee[];
  positions: PositionOption[];
  cancel: () => void;
  save: (body: object) => Promise<void>;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(formValues(event.currentTarget));
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="text-xs font-semibold text-slate-600">
        Employee ID
        <input
          value={employee.employeeNumber}
          readOnly
          className="mt-1 w-full rounded-lg border bg-slate-100 p-2"
        />
      </label>
      <input
        name="firstName"
        required
        defaultValue={employee.firstName}
        className="rounded-lg border p-2"
      />
      <input
        name="lastName"
        required
        defaultValue={employee.lastName}
        className="rounded-lg border p-2"
      />
      <input
        name="jobTitle"
        required
        defaultValue={employee.jobTitle}
        className="rounded-lg border p-2"
      />
      <select
        name="departmentId"
        required
        defaultValue={employee.department.id}
        className="rounded-lg border p-2"
      >
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
      <select
        name="organizationLevel"
        defaultValue={employee.organizationLevel}
        className="rounded-lg border p-2"
      >
        {[
          "STAFF",
          "SUPERVISOR",
          "MANAGER",
          "DEPARTMENT_HEAD",
          "DIRECTOR",
          "OWNER",
        ].map((level) => (
          <option key={level} value={level}>
            {level.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <select
        name="managerId"
        defaultValue={employee.manager?.id ?? ""}
        className="rounded-lg border p-2"
      >
        <option value="">No manager</option>
        {employees
          .filter((candidate) => candidate.id !== employee.id)
          .map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.employeeNumber} — {candidate.firstName}{" "}
              {candidate.lastName}
            </option>
          ))}
      </select>
      <select
        name="employmentType"
        defaultValue={employee.employmentType}
        className="rounded-lg border p-2"
      >
        {["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "TEMPORARY"].map(
          (type) => (
            <option key={type}>{type}</option>
          ),
        )}
      </select>
      <select
        name="positionId"
        defaultValue={employee.positionId ?? ""}
        className="rounded-lg border p-2"
        title="Job position (drives ERP access)"
      >
        <option value="">No position</option>
        {positions.map((position) => (
          <option key={position.id} value={position.id}>
            {position.code} — {position.title}
          </option>
        ))}
      </select>
      <input
        name="joinDate"
        type="date"
        required
        defaultValue={employee.joinDate.slice(0, 10)}
        className="rounded-lg border p-2"
      />
      <input
        name="workEmail"
        type="email"
        defaultValue={employee.workEmail ?? ""}
        placeholder="Work email"
        className="rounded-lg border p-2"
      />
      <select
        name="shiftId"
        defaultValue={employee.shifts[0]?.shift.id ?? ""}
        className="rounded-lg border p-2"
      >
        <option value="">No shift assigned</option>
        {shifts.map((shift) => (
          <option key={shift.id} value={shift.id}>
            {shiftLabel(shift)}
          </option>
        ))}
      </select>
      <input
        name="salaryBand"
        maxLength={40}
        defaultValue={employee.salaryBand ?? ""}
        placeholder="Salary band"
        className="rounded-lg border p-2"
      />
      <input
        name="payRate"
        type="number"
        min={0}
        step="0.01"
        defaultValue={employee.payRate ?? ""}
        placeholder="Pay rate"
        className="rounded-lg border p-2"
      />
      <select
        name="payFrequency"
        defaultValue={employee.payFrequency ?? ""}
        className="rounded-lg border p-2"
      >
        <option value="">Pay frequency not set</option>
        {["HOURLY", "DAILY", "MONTHLY"].map((frequency) => (
          <option key={frequency} value={frequency}>
            {frequency}
          </option>
        ))}
      </select>
      <input
        name="currency"
        maxLength={3}
        defaultValue={employee.currency ?? ""}
        placeholder="Currency (e.g. LKR)"
        onChange={(event) => {
          event.target.value = event.target.value.toUpperCase();
        }}
        className="rounded-lg border p-2"
      />
      <div className="flex gap-2 lg:col-span-4">
        <button className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded-lg border px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function formValues(form: HTMLFormElement) {
  return Object.fromEntries(
    [...new FormData(form)]
      .filter(
        ([key, value]) =>
          value !== "" || key === "managerId" || key === "positionId",
      )
      .map(([key, value]) => [
        key,
        key === "erpAccessRequired"
          ? value === "true"
          : (key === "managerId" || key === "positionId") && value === ""
            ? null
            : value,
      ]),
  );
}

function isProvisioningResult(value: unknown): value is ProvisioningResult {
  return Boolean(
    value &&
    typeof value === "object" &&
    "employeeNumber" in value &&
    "erpAccount" in value &&
    value.erpAccount &&
    typeof value.erpAccount === "object" &&
    "invitation" in value.erpAccount,
  );
}

function shiftLabel(shift: Shift) {
  return `${shift.name} — ${shift.startTime}–${shift.endTime}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB").format(new Date(value));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
function friendlyLeaveType(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function requestedLeaveDays(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) return 0;
  return (
    Math.floor(
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
        86400000,
    ) + 1
  );
}
function leaveTotal(balance: LeaveBalance) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(
    Number(balance.openingBalance) +
      Number(balance.accrued) +
      Number(balance.adjusted),
  );
}
function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
}
function formatSeconds(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function attendanceLabel(attendance: Attendance) {
  if (
    attendance.excessBreakSeconds !== null &&
    attendance.excessBreakSeconds > 0
  )
    return "BREAK_EXCEEDED";
  if (attendance.state === "WORKING") return "WORKING";
  if (attendance.state === "ON_BREAK") return "ON_BREAK";
  if (attendance.checkInAt && !attendance.checkOutAt) return "MISSING_CHECKOUT";
  return attendance.status;
}

function dateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
