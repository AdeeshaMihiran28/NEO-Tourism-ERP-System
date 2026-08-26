"use client";
import { useParams } from "next/navigation";
import { MarketingContentDetail } from "@/components/marketing-content-detail";
export default function Page(){const {id}=useParams<{id:string}>();return <MarketingContentDetail id={id}/>}
