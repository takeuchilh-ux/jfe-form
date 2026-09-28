import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { setupRichMenus } from "@/lib/richmenu";

/** 未登録者用・検査員用・研修生用のリッチメニューを作成し、承認済みの人へ区分ごとに割り当てる */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  return setupRichMenus(new URL(req.url).origin);
});
