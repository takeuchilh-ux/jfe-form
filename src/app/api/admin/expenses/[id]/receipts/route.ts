import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must, RECEIPT_BUCKET } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/** 領収書画像の署名付き URL（10 分有効）を返す */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const exp = must(await db().from("kensa_expenses").select("receipt_paths").eq("id", id).single());
  const paths = (exp.receipt_paths ?? []) as string[];
  if (!paths.length) return { urls: [] };
  const signed = must(await db().storage.from(RECEIPT_BUCKET).createSignedUrls(paths, 600));
  return { urls: signed.map((s) => s.signedUrl).filter(Boolean) };
});
