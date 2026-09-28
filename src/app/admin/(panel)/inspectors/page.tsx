import { listInspectors } from "@/lib/data";
import InspectorsClient from "./InspectorsClient";

export default async function InspectorsPage() {
  const inspectors = await listInspectors();
  return (
    <>
      <h1>検査員</h1>
      <InspectorsClient inspectors={inspectors} addUrl={process.env.LINE_ADD_FRIEND_URL ?? ""} />
    </>
  );
}
