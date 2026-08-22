"use client";

import { use } from "react";
import { SaleSubmissionCard } from "@/components/sale-submission-card";

export default function AdminSaleReviewPage({ params }: PageProps<"/admin/sales/[id]">) {
  const { id } = use(params);
  return <SaleSubmissionCard id={id} adminMode />;
}
