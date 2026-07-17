import Studio from "@/components/Studio";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = (sp.tab as any) || "overview";
  return <Studio initialTab={tab} />;
}
