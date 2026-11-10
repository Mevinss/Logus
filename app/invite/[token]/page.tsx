import Entry from "../../Entry";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <Entry invite={(await params).token} />;
}
