import { MarketingPulseDashboard } from "@/components/marketing-pulse-dashboard";
import { ModuleFunctions } from "@/components/module-hub";

export default function Page() {
  return (
    <>
      <MarketingPulseDashboard />
      <ModuleFunctions
        accent="violet"
        description="Open another Marketing workspace. Available functions are based on your role."
        items={[
        { title: "NEO LAUNCH", description: "Create and manage live deals and offers.", href: "/marketing/deals", permissions: ["marketing.deal.view"] },
        { title: "NEO FLOW", description: "Plan and move creative content through production.", href: "/marketing/content", permissions: ["marketing.content.view"] },
        { title: "NEO GREENLIGHT", description: "Review and approve Marketing content.", href: "/marketing/approvals", permissions: ["marketing.approval.view"] },
        { title: "NEO PLAN", description: "Manage the smart Marketing calendar.", href: "/marketing/calendar", permissions: ["marketing.calendar.view"] },
        { title: "NEO SIGNAL", description: "Review performance and attribution.", href: "/marketing/performance", permissions: ["marketing.signal.view"] },
        { title: "NEO RADAR", description: "Explore Sales and Marketing intelligence.", href: "/marketing/radar", permissions: ["marketing.radar.view"] },
        { title: "NEO STUDIO", description: "Open the NeoTrio creative hub.", href: "/marketing/neotrio", permissions: ["marketing.neotrio.view"] },
        ]}
      />
    </>
  );
}
