import { MarketingCampaignDetail } from "@/components/marketing-campaign-detail";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <MarketingCampaignDetail id={id}/>}
