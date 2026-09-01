import { ModuleHub } from "@/components/module-hub";

export default function Page() {
  return (
    <ModuleHub
      eyebrow="IT Operations"
      title="IT & Asset Management"
      description="Open the appropriate IT workspace for equipment, support or access."
      accent="violet"
      items={[
        { title: "Assets", description: "Manage company equipment and employee assignments.", href: "/it/assets", permissions: ["it.asset.view"] },
        { title: "Support Tickets", description: "Create and manage internal IT support requests.", href: "/it/tickets", permissions: ["it.ticket.view_own", "it.ticket.view_all"] },
        { title: "Access Requests", description: "Request and manage system access.", href: "/it/access-requests", permissions: ["it.access_request.create", "it.access_request.view"] },
      ]}
    />
  );
}

