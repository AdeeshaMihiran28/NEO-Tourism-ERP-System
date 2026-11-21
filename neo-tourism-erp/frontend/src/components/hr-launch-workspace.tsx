"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useAuth } from "./auth-provider";
import { StatusBadge } from "./status-badge";

type View = "dashboard" | "directory" | "org" | "team" | "calendar" | "company-calendar" | "reports" | "attendance-report" | "onboarding" | "offboarding" | "documents" | "me";
type Employee = { id:string;employeeNumber:string;firstName:string;lastName:string;workEmail:string|null;workPhone?:string|null;phone:string|null;jobTitle:string;employmentType:string;employmentStatus:string;joinDate:string;department:{id:string;name:string};manager:{id:string;firstName:string;lastName:string}|null;attendance?:Array<{status:string}>;leaveRequests?:unknown[];reports?:Employee[];onboardingStatus?:string;offboardingStatus?:string };
type Report = { activeHeadcount:number;employeesJoined:number;employeesTerminated:number;turnoverRate:number;employeesOnLeave:number;pendingLeaveApprovals:number;onboardingInProgress:number;offboardingInProgress:number;turnoverDefinition:string };
type AttendanceReport = { employee:{id:string;employeeNumber:string;firstName:string;lastName:string;department:{name:string}};presentDays:number;absentDays:number;lateDays:number;leaveDays:number;totalHours:number;overtimeHours:number };
type LeaveCalendar = {id:string;leaveType:string;startDate:string;endDate:string;employee:Employee};
type Department = {id:string;name:string};
type DocumentItem = {id:string;fileName:string;category:string;visibility:string;expiryDate:string|null;employee?:Employee;versions?:Array<{version:number}>;acknowledgements?:Array<{status:string}>};
type MyProfile = Employee & {personalEmail:string|null;address:string|null;emergencyContactName:string|null;emergencyContactPhone:string|null;salaryBand:string|null;payRate:string|number|null;payFrequency:string|null;currency:string|null;leaveBalances:Array<{leaveType:string;year:number;openingBalance:string;accrued:string;used:string;remainingBalance:string}>;leaveRequests:Array<{id:string;leaveType:string;startDate:string;endDate:string;status:string}>;attendance:Array<{id:string;date:string;status:string}>;documents:DocumentItem[];onboardingTasks:Array<{id:string;title:string;status:string}>};

export function HrLaunchWorkspace({view}:{view:View}) {
  const {hasPermission}=useAuth();
  const canViewReports=hasPermission("hr.report.view");
  const [data,setData]=useState<unknown>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(true);
  const [search,setSearch]=useState("");
  const [monthOffset,setMonthOffset]=useState(0);
  const [calDept,setCalDept]=useState("");
  const [calLeaveType,setCalLeaveType]=useState("");
  const [calName,setCalName]=useState("");
  const [departments,setDepartments]=useState<Department[]>([]);
  const today=useMemo(()=>new Date().toISOString().slice(0,10),[]);
  const yearStart=`${today.slice(0,4)}-01-01`;
  const monthStart=useMemo(()=>{const d=new Date(`${today.slice(0,7)}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+monthOffset);return d.toISOString().slice(0,10).slice(0,7)+"-01";},[today,monthOffset]);
  const monthEnd=useMemo(()=>{const date=new Date(`${monthStart}T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return date.toISOString().slice(0,10);},[monthStart]);
  const monthLabel=useMemo(()=>new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric"}).format(new Date(`${monthStart}T00:00:00Z`)),[monthStart]);

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try {
      if(view==="dashboard"&&!canViewReports){setData(null);return;}
      const sharedParams=new URLSearchParams({dateFrom:monthStart,dateTo:monthEnd});
      if(calDept)sharedParams.set("departmentId",calDept);
      if(calLeaveType)sharedParams.set("leaveType",calLeaveType);
      const path = view==="dashboard"||view==="reports" ? `/hr/reports?dateFrom=${yearStart}&dateTo=${today}`
        : view==="directory" ? `/hr/directory${search?`?search=${encodeURIComponent(search)}`:""}`
        : view==="org" ? "/hr/org-chart"
        : view==="team" ? "/hr/team"
        : view==="calendar" ? `/hr/leave/calendar?dateFrom=${monthStart}&dateTo=${monthEnd}`
        : view==="company-calendar" ? `/hr/leave/calendar/shared?${sharedParams}`
        : view==="attendance-report" ? `/hr/reports/attendance?dateFrom=${monthStart}&dateTo=${monthEnd}`
        : view==="onboarding"||view==="offboarding" ? "/hr/employees?limit=100"
        : view==="documents" ? hasPermission("hr.document.view_all") ? "/hr/documents/expiring?days=30" : "/hr/documents/my"
        : "/hr/me";
      const result=await apiFetch<unknown>(path);
      setData(result && typeof result==="object" && "data" in result ? (result as {data:unknown}).data : result);
    } catch(caught){setError(caught instanceof ApiError?caught.message:"Unable to load HR workspace.");}
    finally{setBusy(false);}
  },[calDept,calLeaveType,canViewReports,hasPermission,monthEnd,monthStart,search,today,view,yearStart]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  useEffect(()=>{if(view==="company-calendar"){void apiFetch<Department[]>("/departments").then(setDepartments).catch(()=>undefined);}},[view]);
  const companyItems=useMemo(()=>{
    if(view!=="company-calendar"||!calName.trim()||!Array.isArray(data))return data;
    const needle=calName.trim().toLowerCase();
    return (data as LeaveCalendar[]).filter(x=>`${x.employee.firstName} ${x.employee.lastName} ${x.employee.employeeNumber}`.toLowerCase().includes(needle));
  },[calName,data,view]);

  async function save(path:string,body:object,method="PATCH"){
    if(busy)return;setBusy(true);setError("");setMessage("");
    try{await apiFetch(path,{method,body:JSON.stringify(body)});setMessage("Saved successfully.");await load();}
    catch(caught){setError(caught instanceof ApiError?caught.message:"Request failed.");setBusy(false);}
  }
  const titles:Record<View,string>={dashboard:"HR Dashboard",directory:"Company Directory",org:"Organization Chart",team:"My Team",calendar:"Team Leave Calendar","company-calendar":"Company Leave Calendar",reports:"HR Reports","attendance-report":"Attendance & Overtime Report",onboarding:"Onboarding",offboarding:"Offboarding",documents:"Employee Documents",me:"My HR Profile"};
  return <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
    <header><p className="text-sm font-medium text-emerald-700">Human Resources</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">{titles[view]}</h1></header>
    {message&&<p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {error&&<p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {view==="directory"&&<form onSubmit={e=>{e.preventDefault();void load();}} className="mt-5 flex gap-2"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, job title or work email" className="flex-1 rounded-xl border px-3 py-2"/><button disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-2 font-semibold text-white disabled:opacity-50">Search</button></form>}
    {view==="company-calendar"&&<form onSubmit={e=>{e.preventDefault();void load();}} className="mt-5 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_1fr_auto]">
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={()=>setMonthOffset(o=>o-1)} aria-label="Previous month" className="h-10 w-10 rounded-lg border font-bold disabled:opacity-40">‹</button>
        <span className="min-w-32 text-center text-sm font-semibold">{monthLabel}</span>
        <button type="button" disabled={busy} onClick={()=>setMonthOffset(o=>o+1)} aria-label="Next month" className="h-10 w-10 rounded-lg border font-bold disabled:opacity-40">›</button>
        {monthOffset!==0&&<button type="button" onClick={()=>setMonthOffset(0)} className="text-xs font-semibold text-cyan-700">Today</button>}
      </div>
      <select value={calDept} onChange={e=>setCalDept(e.target.value)} aria-label="Department" className="h-10 rounded-lg border px-3 text-sm"><option value="">All departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
      <select value={calLeaveType} onChange={e=>setCalLeaveType(e.target.value)} aria-label="Leave type" className="h-10 rounded-lg border px-3 text-sm"><option value="">All leave types</option>{["ANNUAL","SICK","CASUAL","PARENTAL","UNPAID","OTHER"].map(t=><option key={t} value={t}>{t.charAt(0)+t.slice(1).toLowerCase()}</option>)}</select>
      <input value={calName} onChange={e=>setCalName(e.target.value)} placeholder="Employee name or ID" aria-label="Employee name or ID" className="h-10 rounded-lg border px-3 text-sm"/>
      <button disabled={busy} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Apply</button>
    </form>}
    {busy?<p className="mt-8 rounded-2xl border bg-white p-10 text-center text-slate-500">Loading…</p>:<Content view={view} data={companyItems} canManageOnboarding={hasPermission("hr.onboarding.manage")} canManageOffboarding={hasPermission("hr.offboarding.manage")} save={save}/>} 
  </div>;
}

function Content({view,data,canManageOnboarding,canManageOffboarding,save}:{view:View;data:unknown;canManageOnboarding:boolean;canManageOffboarding:boolean;save:(path:string,body:object,method?:string)=>void}){
  if(view==="dashboard"&&!data)return <p className="mt-6 text-slate-600">Choose an available HR function below.</p>;
  if(view==="dashboard"||view==="reports")return <ReportCards report={data as Report}/>;
  if(view==="org")return <div className="mt-6 space-y-3">{(data as Employee[]??[]).map(node=><OrgNode key={node.id} node={node}/>)}</div>;
  if(view==="me")return <MyProfilePanel profile={data as MyProfile} save={save}/>;
  if(view==="attendance-report")return <AttendanceTable items={data as AttendanceReport[]??[]}/>;
  if(view==="calendar"||view==="company-calendar")return <CalendarTable items={data as LeaveCalendar[]??[]}/>;
  if(view==="documents")return <DocumentTable items={data as DocumentItem[]??[]}/>;
  const employees=data as Employee[]??[];
  if(view==="onboarding"||view==="offboarding")return <EmployeeProcessTable items={employees} kind={view} canManage={view==="onboarding"?canManageOnboarding:canManageOffboarding} save={save}/>;
  return <EmployeeDirectory items={employees} team={view==="team"}/>;
}

function EmployeeDirectory({items,team}:{items:Employee[];team:boolean}){return <section className="mt-6 overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-left text-sm"><thead><tr>{["Employee","Job title","Department","Work email","Work phone","Manager",...(team?["Attendance today","Leave today"]:[])].map(x=><th key={x} className="bg-slate-50 px-4 py-3">{x}</th>)}</tr></thead><tbody>{items.map(x=><tr key={x.id} className="border-t"><td className="px-4 py-3"><Link href={`/hr/employees/${x.id}`} className="font-semibold text-cyan-700">{x.firstName} {x.lastName}</Link><p className="text-xs text-slate-500">{x.employeeNumber}</p></td><td>{x.jobTitle}</td><td>{x.department.name}</td><td>{x.workEmail??"—"}</td><td>{x.workPhone??"—"}</td><td>{x.manager?`${x.manager.firstName} ${x.manager.lastName}`:"—"}</td>{team&&<><td>{x.attendance?.[0]?.status??"Not recorded"}</td><td>{x.leaveRequests?.length?"On leave":"Available"}</td></>}</tr>)}</tbody></table>{!items.length&&<p className="p-10 text-center text-slate-500">No employees found.</p>}</section>}

function OrgNode({node}:{node:Employee}){const [open,setOpen]=useState(true);return <div className="rounded-xl border bg-white p-3"><div className="flex items-center gap-3"><button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} className="h-8 w-8 rounded-lg border">{open?"−":"+"}</button><div className="flex-1"><Link href={`/hr/employees/${node.id}`} className="font-semibold text-cyan-700">{node.firstName} {node.lastName}</Link><p className="text-xs text-slate-500">{node.employeeNumber} · {node.jobTitle} · {node.department.name} · {node.employmentStatus}</p></div></div>{open&&node.reports?.length?<div className="ml-8 mt-3 space-y-3 border-l pl-4">{node.reports.map(child=><OrgNode key={child.id} node={child}/>)}</div>:null}</div>}

function ReportCards({report}:{report:Report}){if(!report)return null;const cards=[["Active Employees",report.activeHeadcount],["New Joiners",report.employeesJoined],["Employees Leaving",report.employeesTerminated],["On Leave Today",report.employeesOnLeave],["Pending Leave Approvals",report.pendingLeaveApprovals],["Onboarding In Progress",report.onboardingInProgress],["Offboarding In Progress",report.offboardingInProgress],["Turnover Rate",`${report.turnoverRate}%`]];return <><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value])=><div key={label} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</div><p className="mt-5 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">{report.turnoverDefinition}</p></>}

function AttendanceTable({items}:{items:AttendanceReport[]}){return <section className="mt-6 overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-left text-sm"><thead><tr>{["Employee","Present","Absent","Late","Leave","Total hours","Potential overtime"].map(x=><th key={x} className="bg-slate-50 px-4 py-3">{x}</th>)}</tr></thead><tbody>{items.map(x=><tr key={x.employee.id} className="border-t"><td className="px-4 py-3">{x.employee.firstName} {x.employee.lastName}<p className="text-xs text-slate-500">{x.employee.department.name}</p></td><td>{x.presentDays}</td><td>{x.absentDays}</td><td>{x.lateDays}</td><td>{x.leaveDays}</td><td>{x.totalHours.toFixed(2)}</td><td>{x.overtimeHours.toFixed(2)}h</td></tr>)}</tbody></table></section>}

function CalendarTable({items}:{items:LeaveCalendar[]}){return <section className="mt-6 rounded-2xl border bg-white p-5"><div className="space-y-3">{items.map(x=><div key={x.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><Link href={`/hr/employees/${x.employee.id}`} className="font-semibold text-cyan-700">{x.employee.firstName} {x.employee.lastName}</Link><p className="text-xs text-slate-500">{x.employee.department.name}</p></div><p className="text-sm">{formatDate(x.startDate)} – {formatDate(x.endDate)}</p><StatusBadge status={x.leaveType}/></div>)}{!items.length&&<p className="text-center text-slate-500">No approved leave this month.</p>}</div></section>}

function EmployeeProcessTable({items,kind,canManage,save}:{items:Employee[];kind:"onboarding"|"offboarding";canManage:boolean;save:(path:string,body:object,method?:string)=>void}){return <section className="mt-6 overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-left text-sm"><thead><tr>{["Employee","Department","Employment","Process","Action"].map(x=><th key={x} className="bg-slate-50 px-4 py-3">{x}</th>)}</tr></thead><tbody>{items.map(x=>{const status=kind==="onboarding"?x.onboardingStatus:x.offboardingStatus;return <tr key={x.id} className="border-t"><td className="px-4 py-3"><Link href={`/hr/employees/${x.id}`} className="font-semibold text-cyan-700">{x.firstName} {x.lastName}</Link></td><td>{x.department.name}</td><td>{x.employmentStatus}</td><td><StatusBadge status={status??"NOT_STARTED"}/></td><td>{canManage&&status==="NOT_STARTED"&&<button onClick={()=>save(`/hr/employees/${x.id}/${kind}/start`,{},"POST")} className="font-semibold text-emerald-700">Start</button>}</td></tr>})}</tbody></table></section>}

function DocumentTable({items}:{items:DocumentItem[]}){return <section className="mt-6 overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-left text-sm"><thead><tr>{["Document","Employee","Category","Visibility","Expiry","Version","Acknowledgement"].map(x=><th key={x} className="bg-slate-50 px-4 py-3">{x}</th>)}</tr></thead><tbody>{items.map(x=><tr key={x.id} className="border-t"><td className="px-4 py-3 font-semibold">{x.fileName}</td><td>{x.employee?`${x.employee.firstName} ${x.employee.lastName}`:"Me"}</td><td>{x.category}</td><td>{x.visibility}</td><td>{x.expiryDate?formatDate(x.expiryDate):"—"}</td><td>{x.versions?.[0]?.version??1}</td><td>{x.acknowledgements?.[0]?.status??"—"}</td></tr>)}</tbody></table></section>}

function MyProfilePanel({profile,save}:{profile:MyProfile;save:(path:string,body:object,method?:string)=>void}){
  const [editing,setEditing]=useState(false);
  if(!profile)return null;
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();save("/hr/me",Object.fromEntries(new FormData(event.currentTarget)));}
  const inputClass="rounded-lg border px-3 py-2.5 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
  return <div className="mt-6 grid gap-5 lg:grid-cols-2">
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold">{profile.firstName} {profile.lastName}</h2><p className="mt-1 text-sm text-slate-500">{profile.employeeNumber} · {profile.jobTitle} · {profile.department.name}</p></div>
        {!editing&&<button type="button" onClick={()=>setEditing(true)} className="shrink-0 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-100">Edit details</button>}
      </div>
      <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Work email</dt><dd className="mt-0.5 font-medium">{profile.workEmail??"—"}</dd></div>
        <div><dt className="text-slate-500">Manager</dt><dd className="mt-0.5 font-medium">{profile.manager?`${profile.manager.firstName} ${profile.manager.lastName}`:"—"}</dd></div>
        <div><dt className="text-slate-500">Status</dt><dd className="mt-0.5"><StatusBadge status={profile.employmentStatus}/></dd></div>
        <div><dt className="text-slate-500">Join date</dt><dd className="mt-0.5 font-medium">{formatDate(profile.joinDate)}</dd></div>
        {(profile.salaryBand ?? profile.payRate) && <><div><dt className="text-slate-500">Salary band</dt><dd className="mt-0.5 font-medium">{profile.salaryBand ?? "—"}</dd></div><div><dt className="text-slate-500">Pay rate</dt><dd className="mt-0.5 font-medium">{profile.payRate ?? "—"}{profile.payFrequency ? ` / ${profile.payFrequency}` : ""}{profile.currency ? ` ${profile.currency}` : ""}</dd></div></>}
      </dl>
      {editing?<form onSubmit={submit} className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Phone<input name="phone" type="tel" autoComplete="tel" defaultValue={profile.phone??""} className={inputClass}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Personal email<input name="personalEmail" type="email" autoComplete="email" defaultValue={profile.personalEmail??""} className={inputClass}/></label>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Address<input name="address" autoComplete="street-address" defaultValue={profile.address??""} className={inputClass}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Emergency contact name<input name="emergencyContactName" defaultValue={profile.emergencyContactName??""} className={inputClass}/></label>
        <label className="grid gap-1.5 text-sm font-medium">Emergency contact phone<input name="emergencyContactPhone" type="tel" defaultValue={profile.emergencyContactPhone??""} className={inputClass}/></label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={()=>setEditing(false)} className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Save changes</button>
        </div>
      </form>:<dl className="mt-6 grid gap-x-6 gap-y-4 border-t pt-5 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Phone</dt><dd className="mt-0.5 font-medium">{profile.phone??"—"}</dd></div>
        <div><dt className="text-slate-500">Personal email</dt><dd className="mt-0.5 font-medium">{profile.personalEmail??"—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">Address</dt><dd className="mt-0.5 font-medium">{profile.address??"—"}</dd></div>
        <div><dt className="text-slate-500">Emergency contact</dt><dd className="mt-0.5 font-medium">{profile.emergencyContactName??"—"}</dd></div>
        <div><dt className="text-slate-500">Emergency contact phone</dt><dd className="mt-0.5 font-medium">{profile.emergencyContactPhone??"—"}</dd></div>
      </dl>}
    </section>
    <section className="space-y-5"><div className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Leave balances</h2>{profile.leaveBalances.map(x=><p key={`${x.year}-${x.leaveType}`} className="mt-2 text-sm">{x.leaveType}: <strong>{x.remainingBalance}</strong> remaining ({x.used} used)</p>)}</div><div className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Onboarding</h2><p className="mt-2 text-sm">{profile.onboardingTasks.filter(x=>x.status==="COMPLETED").length} / {profile.onboardingTasks.length} tasks completed</p>{profile.onboardingTasks.map(x=><p key={x.id} className="mt-2 text-sm">{x.status==="COMPLETED"?"✓":"⚠"} {x.title}</p>)}</div></section>
  </div>
}

function formatDate(value:string){return new Intl.DateTimeFormat("en-GB").format(new Date(value));}
