import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/session";
import AdminNav from "@/components/AdminNav";
import ResponsiveTables from "@/components/ResponsiveTables";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <div className="admin-shell">
      <AdminNav name={admin.name} />
      <main className="admin-main">{children}</main>
      <ResponsiveTables />
    </div>
  );
}
