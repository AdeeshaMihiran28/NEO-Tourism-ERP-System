"use client";
import { useParams } from "next/navigation";
import { MarketingDealDetail } from "@/components/marketing-deal-detail";
export default function Page(){const {id}=useParams<{id:string}>();return <MarketingDealDetail id={id}/>}
