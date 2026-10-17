import { handle } from "@/lib/api";
import { HttpError } from "@/lib/session";
import { sendReminders } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** 毎日夕方に Vercel Cron から呼ばれ、明日の検査の担当者へ LINE でリマインドする */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "unauthorized");
  const r = await sendReminders();
  console.log("reminders", JSON.stringify(r));
  return r;
});
