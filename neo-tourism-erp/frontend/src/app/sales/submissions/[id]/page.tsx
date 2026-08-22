"use client";

import { use } from "react";
import { SaleSubmissionCard } from "@/components/sale-submission-card";

export default function SaleSubmissionPage({ params }: PageProps<"/sales/submissions/[id]">) {
  const { id } = use(params);
  return <SaleSubmissionCard id={id} />;
}
