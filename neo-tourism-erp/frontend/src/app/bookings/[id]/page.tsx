"use client";

import { use } from "react";
import { BookingWorkspace } from "@/components/booking-workspace";

export default function BookingDetailPage({ params }: PageProps<"/bookings/[id]">) {
  const { id } = use(params);
  return <BookingWorkspace id={id} />;
}
