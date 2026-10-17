import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { sendReminders } from "@/lib/schedule";

/** 明日の検査のリマインドを今すぐ送る（送信済みの人には送らない） */
export const POST = handle(async () => {
  await requireAdmin();
  return sendReminders();
});
