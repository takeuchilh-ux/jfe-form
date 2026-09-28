import "server-only";
import { db, maybe, must } from "./supabase";

export type Settings = {
  test_question_count: number;
  test_daily_limit: number;
  test_pass_score: number;
};

export async function getSettings(): Promise<Settings> {
  return must(await db().from("kensa_settings").select("test_question_count,test_pass_score,test_daily_limit").eq("id", 1).single());
}

export type Store = {
  id: string;
  name: string;
  group_name: string;
  area: string;
  address: string;
  notes: string;
  active: boolean;
};

export type Inspector = {
  id: string;
  name: string;
  last_name: string;
  first_name: string;
  name_kana: string;
  phone: string;
  email: string;
  address: string;
  area: string;
  notes: string;
  active: boolean;
  approved_at: string | null;
  bank_name: string;
  branch_name: string;
  branch_number: string;
  account_type: string;
  account_number: string;
  account_holder: string;
  line_user_id: string | null;
  line_display_name: string;
  linked_at: string | null;
  created_at: string;
};

export type Period = {
  id: string;
  year_month: string;
  status: "draft" | "released" | "closed";
  response_deadline: string | null;
  released_at: string | null;
};

export type InspectionRow = {
  id: string;
  period_id: string;
  store_id: string;
  inspection_date: string;
  time_slot: string;
  required_count: number;
  status: "open" | "completed" | "cancelled";
  notes: string;
  store: { id: string; name: string; group_name: string; area: string; address: string } | null;
  availabilities: { inspector_id: string; answer: "yes" | "no"; comment: string }[];
  assignments: { inspector_id: string; notified_at: string | null }[];
};

export const INSPECTION_SELECT =
  "id,period_id,store_id,inspection_date,time_slot,required_count,status,notes," +
  "store:kensa_stores(id,name,group_name,area,address)," +
  "availabilities:kensa_availabilities(inspector_id,answer,comment)," +
  "assignments:kensa_assignments(inspector_id,notified_at)";

export async function getPeriod(month: string): Promise<Period | null> {
  return maybe(
    await db().from("kensa_periods").select("id,year_month,status,response_deadline,released_at").eq("year_month", month).maybeSingle(),
  );
}

export async function getInspections(periodId: string): Promise<InspectionRow[]> {
  return must(
    await db()
      .from("kensa_inspections")
      .select(INSPECTION_SELECT)
      .eq("period_id", periodId)
      .order("inspection_date")
      .order("time_slot"),
  ) as unknown as InspectionRow[];
}

export async function listInspectors(onlyActive = false): Promise<Inspector[]> {
  let q = db().from("kensa_inspectors").select("*").order("created_at");
  if (onlyActive) q = q.eq("active", true).not("approved_at", "is", null);
  return must(await q) as Inspector[];
}

export async function listStores(onlyActive = false): Promise<Store[]> {
  let q = db().from("kensa_stores").select("id,name,group_name,area,address,notes,active").order("area").order("name");
  if (onlyActive) q = q.eq("active", true);
  return must(await q) as Store[];
}
