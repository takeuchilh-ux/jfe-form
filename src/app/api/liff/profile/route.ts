import { handle, body, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must } from "@/lib/supabase";
import { fullName, parseProfile, PROFILE_KEYS } from "@/lib/profile";

export const GET = handle(async () => {
  const me = await currentInspector({ allowPending: true });
  return must(await db().from("kensa_inspectors").select(PROFILE_KEYS.join(",")).eq("id", me.id).single());
});

/** 基本情報の変更（承認前でも可） */
export const PUT = handle(async (req: Request) => {
  const me = await currentInspector({ allowPending: true });
  const p = parseProfile(await body(req));
  if (typeof p === "string") bad(p);
  must(await db().from("kensa_inspectors").update({ ...p, name: fullName(p) }).eq("id", me.id).select("id"));
  return { ok: true };
});
