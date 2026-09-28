import { listStores } from "@/lib/data";
import StoresClient from "./StoresClient";

export default async function StoresPage() {
  const stores = await listStores();
  return (
    <>
      <h1>店舗マスタ</h1>
      <StoresClient stores={stores} />
    </>
  );
}
