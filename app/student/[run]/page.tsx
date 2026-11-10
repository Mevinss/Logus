import Entry from "../../Entry";
export default async function Page({
  params,
}: {
  params: Promise<{ run: string }>;
}) {
  return <Entry initialRun={(await params).run} />;
}
