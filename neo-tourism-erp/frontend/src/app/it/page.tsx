import { ModuleHub } from "@/components/module-hub";

export default function Page() {
  return (
    <ModuleHub
      eyebrow="IT Operations"
      title="IT & Access Management"
      description="Manage company assets, technical support, system access, user accounts and ERP permissions."
      accent="violet"
      items={[
        {
          title: "Assets",
          description: "Manage company equipment and employee assignments.",
          href: "/it/assets",
          permissions: ["it.asset.view"],
        },
        {
          title: "Support Tickets",
          description: "Create and manage internal IT support requests.",
          href: "/it/tickets",
          permissions: ["it.ticket.view_own", "it.ticket.view_all"],
        },
        {
          title: "Access Requests",
          description: "Request and manage system access.",
          href: "/it/access-requests",
          permissions: ["it.access_request.create", "it.access_request.view"],
        },
        {
          title: "User Accounts",
          description:
            "Manage employee ERP accounts, login access, account status and assigned roles.",
          href: "/it/users",
          permissions: ["user.view"],
        },
        {
          title: "Roles & Permissions",
          description:
            "Manage ERP roles and the permissions assigned to each role.",
          href: "/it/roles",
          permissions: ["role.view"],
        },
        {
          title: "Position Access",
          description:
            "Map approved job positions to automatic and approval-required ERP roles.",
          href: "/it/positions",
          permissions: ["role.view"],
        },
      ]}
    />
  );
}
