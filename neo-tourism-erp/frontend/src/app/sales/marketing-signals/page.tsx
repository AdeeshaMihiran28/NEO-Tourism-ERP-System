import { Suspense } from "react";
import { SalesMarketingSignalForm } from "@/components/sales-marketing-signal-form";

export default function Page() {
  return (
    <Suspense>
      <SalesMarketingSignalForm />
    </Suspense>
  );
}
