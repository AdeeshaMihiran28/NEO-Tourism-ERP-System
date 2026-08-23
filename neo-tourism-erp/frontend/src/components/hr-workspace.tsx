"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useAuth } from "./auth-provider";

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string; jobTitle: string; employmentType: string; employmentStatus: string; joinDate: string; department: { id: string; name: string } };
type Attendance = { id: string; date: string; checkInAt: string | null; checkOutAt: string | null; status: string; employee?: Employee };
type Leave = { id: string; leaveType: string; startDate: string; endDate: string; reason: string; status: string; employee?: Employee };
type Shift = { id: string; name: string; startTime: string; endTime: string; isActive: boolean };
type Department = { id: string; name: string };
type List<T> = { data: T[]; pagination: { page: number; total: number; totalPages: number } };

export function HrWorkspace({ view }: { view: "employees" | "attendance" | "leave" | "shifts" }) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<unknown[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      if (view === "employees") {
        const params = new URLSearchParams({ page: String(page), limit: "20" }); if (search) params.set("search", search); if (status) params.set("status", status);
        const result = await apiFetch<List<Employee>>(`/hr/employees?${params}`); setItems(result.data); setPages(result.pagination.totalPages || 1);
      } else if (view === "attendance") {
        const path = hasPermission("hr.attendance.view") ? "/hr/attendance" : "/hr/attendance/my"; setItems(await apiFetch<Attendance[]>(path));
      } else if (view === "leave") {
        const mine = await apiFetch<Leave[]>("/hr/leave/my");
        const queue = hasPermission("hr.leave.manage") ? await apiFetch<Leave[]>("/hr/leave/requests") : []; setItems([...queue, ...mine.filter((mineItem) => !queue.some((item) => item.id === mineItem.id))]);
      } else setItems(await apiFetch<Shift[]>("/hr/shifts"));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Unable to load HR records."); }
    finally { setBusy(false); }
  }, [hasPermission, page, search, status, view]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { if (view === "employees") void apiFetch<Department[]>("/departments").then(setDepartments).catch(() => undefined); }, [view]);

  async function submit(path: string, body?: object, method = "POST") {
    setMessage(""); setError("");
    try { await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined }); setMessage("Saved successfully."); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Request failed."); }
  }

  const title = { employees: "Employees", attendance: "Attendance", leave: "Leave", shifts: "Shifts" }[view];
  return <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
    <header><p className="text-sm font-medium text-emerald-700">Human Resources</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">{title}</h1></header>
    {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {view === "employees" && <>
      <form onSubmit={(event) => { event.preventDefault(); setPage(1); void load(); }} className="mt-6 flex gap-3"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" className="flex-1 rounded-xl border border-slate-300 px-3 py-2"/><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-300 px-3"><option value="">All statuses</option>{["ACTIVE","ON_LEAVE","NOTICE_PERIOD","TERMINATED","INACTIVE"].map((x)=><option key={x}>{x}</option>)}</select><button className="rounded-xl bg-slate-900 px-4 text-white">Search</button></form>
      {hasPermission("hr.employee.create") && <EmployeeForm departments={departments} onSubmit={(body) => submit("/hr/employees", body)} />}
    </>}
    {view === "attendance" && <div className="mt-6 flex gap-3"><button onClick={() => submit("/hr/attendance/check-in")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Check In</button><button onClick={() => submit("/hr/attendance/check-out")} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Check Out</button></div>}
    {view === "leave" && <LeaveForm onSubmit={(body) => submit("/hr/leave", body)} />}
    {view === "shifts" && hasPermission("hr.shift.manage") && <ShiftForm onSubmit={(body) => submit("/hr/shifts", body)} />}
    <section className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">{busy ? <p className="p-10 text-center text-sm text-slate-500">Loading…</p> : <HrTable view={view} items={items} canManageLeave={hasPermission("hr.leave.manage")} action={submit} />}</section>
    {view === "employees" && pages > 1 && <div className="mt-4 flex justify-end gap-2"><button disabled={page===1} onClick={()=>setPage((p)=>p-1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span className="px-2 py-2 text-sm">{page} / {pages}</span><button disabled={page===pages} onClick={()=>setPage((p)=>p+1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
  </div>;
}

function EmployeeForm({ departments, onSubmit }: { departments: Department[]; onSubmit: (body: object) => void }) {
  function handle(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); onSubmit(Object.fromEntries(data)); event.currentTarget.reset(); }
  return <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Add employee</summary><form onSubmit={handle} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input name="firstName" required placeholder="First name" className="rounded-lg border p-2"/><input name="lastName" required placeholder="Last name" className="rounded-lg border p-2"/><input name="jobTitle" required placeholder="Job title" className="rounded-lg border p-2"/><select name="departmentId" required className="rounded-lg border p-2"><option value="">Department</option>{departments.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select><select name="employmentType" className="rounded-lg border p-2">{["FULL_TIME","PART_TIME","CONTRACT","INTERN","TEMPORARY"].map(x=><option key={x}>{x}</option>)}</select><input type="date" name="joinDate" required className="rounded-lg border p-2"/><input type="email" name="workEmail" placeholder="Work email" className="rounded-lg border p-2"/><button className="rounded-lg bg-emerald-700 p-2 font-semibold text-white">Create</button></form></details>;
}
function LeaveForm({ onSubmit }: { onSubmit: (body: object) => void }) { function handle(e: FormEvent<HTMLFormElement>) { e.preventDefault(); onSubmit(Object.fromEntries(new FormData(e.currentTarget))); e.currentTarget.reset(); } return <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Request leave</summary><form onSubmit={handle} className="mt-4 grid gap-3 sm:grid-cols-4"><select name="leaveType" className="rounded-lg border p-2">{["ANNUAL","SICK","CASUAL","UNPAID","OTHER"].map(x=><option key={x}>{x}</option>)}</select><input name="startDate" type="date" required className="rounded-lg border p-2"/><input name="endDate" type="date" required className="rounded-lg border p-2"/><input name="reason" required placeholder="Reason" className="rounded-lg border p-2"/><button className="rounded-lg bg-emerald-700 p-2 text-white">Submit</button></form></details>; }
function ShiftForm({ onSubmit }: { onSubmit: (body: object) => void }) { function handle(e: FormEvent<HTMLFormElement>) { e.preventDefault(); onSubmit(Object.fromEntries(new FormData(e.currentTarget))); e.currentTarget.reset(); } return <form onSubmit={handle} className="mt-5 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-4"><input name="name" required placeholder="Shift name" className="rounded-lg border p-2"/><input name="startTime" type="time" required className="rounded-lg border p-2"/><input name="endTime" type="time" required className="rounded-lg border p-2"/><button className="rounded-lg bg-emerald-700 text-white">Add shift</button></form>; }

function HrTable({ view, items, canManageLeave, action }: { view: string; items: unknown[]; canManageLeave: boolean; action: (path: string, body?: object, method?: string) => void }) {
  if (!items.length) return <p className="p-10 text-center text-sm text-slate-500">No records found.</p>;
  if (view === "employees") return <table className="min-w-full text-left text-sm"><thead><tr>{["Employee No","Name","Job Title","Department","Type","Status","Join Date"].map(h=><th key={h} className="bg-slate-50 px-4 py-3">{h}</th>)}</tr></thead><tbody>{(items as Employee[]).map(x=><tr key={x.id} className="border-t"><td className="px-4 py-3"><Link className="font-semibold text-cyan-700" href={`/hr/employees/${x.id}`}>{x.employeeNumber}</Link></td><td>{x.firstName} {x.lastName}</td><td>{x.jobTitle}</td><td>{x.department.name}</td><td>{x.employmentType}</td><td>{x.employmentStatus}</td><td>{formatDate(x.joinDate)}</td></tr>)}</tbody></table>;
  if (view === "attendance") return <table className="min-w-full text-left text-sm"><thead><tr>{["Employee","Date","Check In","Check Out","Status","Hours"].map(h=><th key={h} className="bg-slate-50 px-4 py-3">{h}</th>)}</tr></thead><tbody>{(items as Attendance[]).map(x=><tr key={x.id} className="border-t"><td className="px-4 py-3">{x.employee ? `${x.employee.firstName} ${x.employee.lastName}` : "Me"}</td><td>{formatDate(x.date)}</td><td>{formatTime(x.checkInAt)}</td><td>{formatTime(x.checkOutAt)}</td><td>{x.status}</td><td>{hours(x.checkInAt,x.checkOutAt)}</td></tr>)}</tbody></table>;
  if (view === "leave") return <table className="min-w-full text-left text-sm"><thead><tr>{["Employee","Type","Dates","Reason","Status","Actions"].map(h=><th key={h} className="bg-slate-50 px-4 py-3">{h}</th>)}</tr></thead><tbody>{(items as Leave[]).map(x=><tr key={x.id} className="border-t"><td className="px-4 py-3">{x.employee ? `${x.employee.firstName} ${x.employee.lastName}` : "Me"}</td><td>{x.leaveType}</td><td>{formatDate(x.startDate)} – {formatDate(x.endDate)}</td><td>{x.reason}</td><td>{x.status}</td><td>{canManageLeave && x.status==="PENDING" && <span className="flex gap-2"><button onClick={()=>action(`/hr/leave/${x.id}/approve`,{})} className="text-emerald-700">Approve</button><button onClick={()=>action(`/hr/leave/${x.id}/reject`,{})} className="text-red-700">Reject</button></span>}</td></tr>)}</tbody></table>;
  return <table className="min-w-full text-left text-sm"><thead><tr>{["Name","Start","End","Status"].map(h=><th key={h} className="bg-slate-50 px-4 py-3">{h}</th>)}</tr></thead><tbody>{(items as Shift[]).map(x=><tr key={x.id} className="border-t"><td className="px-4 py-3">{x.name}</td><td>{x.startTime}</td><td>{x.endTime}</td><td>{x.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody></table>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB").format(new Date(value)); }
function formatTime(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
function hours(start: string | null, end: string | null) { return start && end ? `${((new Date(end).getTime()-new Date(start).getTime())/3600000).toFixed(1)}h` : "—"; }
