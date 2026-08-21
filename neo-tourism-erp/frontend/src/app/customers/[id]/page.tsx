import { CustomerProfile } from "@/components/customer-profile";

export default async function CustomerPage({
  params,
}: PageProps<"/customers/[id]">) {
  const { id } = await params;
  return <CustomerProfile customerId={id} />;
}
