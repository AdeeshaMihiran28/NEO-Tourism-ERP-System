import { HrLaunchWorkspace } from "@/components/hr-launch-workspace";
import { ModuleFunctions } from "@/components/module-hub";

export default function Page() {
  return (
    <>
      <HrLaunchWorkspace view="dashboard" />
      <ModuleFunctions
        accent="emerald"
        description="Open another HR workspace. Sensitive functions remain restricted by role."
        items={[
            { title: "Employees", description: "Search and manage employee records.", href: "/hr/employees", permissions: ["hr.employee.view"] },
            { title: "Directory", description: "Browse approved company contact information.", href: "/hr/directory", permissions: ["hr.directory.view"] },
            { title: "Organization Chart", description: "View reporting relationships.", href: "/hr/org-chart", permissions: ["hr.org_chart.view"] },
            { title: "My Team", description: "Review direct reports and team availability.", href: "/hr/team", permissions: ["hr.team.view"] },
            { title: "My HR Profile", description: "View personal HR details and balances.", href: "/hr/me", permissions: ["hr.leave.view_own"] },
            { title: "Attendance", description: "Record or review attendance.", href: "/hr/attendance", permissions: ["hr.attendance.view", "hr.leave.view_own"] },
            { title: "Leave", description: "Request and review employee leave.", href: "/hr/leave", permissions: ["hr.leave.view_own", "hr.leave.manage"] },
            { title: "Leave Calendar", description: "View approved team leave.", href: "/hr/leave/calendar", permissions: ["hr.leave.calendar.view"] },
            { title: "Company Leave Calendar", description: "See who is on leave across the company.", href: "/hr/leave/company-calendar", permissions: ["hr.leave.view_own"] },
            { title: "Shifts", description: "View or manage working shifts.", href: "/hr/shifts", permissions: ["hr.shift.view"] },
            { title: "Onboarding", description: "Track employee onboarding processes.", href: "/hr/onboarding", permissions: ["hr.onboarding.view"] },
            { title: "Offboarding", description: "Track controlled employee departures.", href: "/hr/offboarding", permissions: ["hr.offboarding.view"] },
            { title: "Documents", description: "Access permitted employee documents.", href: "/hr/documents", permissions: ["hr.document.view_own", "hr.document.view_all"] },
            { title: "Reports", description: "Open HR operational reports.", href: "/hr/reports", permissions: ["hr.report.view"] },
        ]}
      />
    </>
  );
}
