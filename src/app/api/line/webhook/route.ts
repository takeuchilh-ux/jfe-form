import { NextResponse } from "next/server";
import { liffUrl, replyMessage, verifySignature, buttonMessage } from "@/lib/line";
import { db } from "@/lib/supabase";

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } };

/** LINE 公式アカウントの Webhook（友だち追加時の案内など） */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { events = [] } = JSON.parse(raw) as { events?: LineEvent[] };
  for (const ev of events) {
    try {
      if (!ev.replyToken || !ev.source?.userId) continue;
      if (ev.type === "follow") {
        await replyMessage(ev.replyToken, [welcome()]);
      } else if (ev.type === "message" && ev.message?.type === "text") {
        const { data } = await db().from("kensa_inspectors").select("id").eq("line_user_id", ev.source.userId).maybeSingle();
        // 未連携の方にだけ連携方法を案内（連携済みの方への自動返信はしない）
        if (!data) await replyMessage(ev.replyToken, [welcome()]);
      }
    } catch (e) {
      console.error("webhook event error", e);
    }
  }
  return NextResponse.json({ ok: true });
}

function welcome() {
  return buttonMessage({
    altText: "検査員アカウントの連携をお願いします",
    title: "友だち追加ありがとうございます",
    lines: ["管理者からお知らせした「連携コード」を入力して、検査員アカウントと LINE を連携してください。"],
    label: "連携する",
    uri: liffUrl("/liff"),
  });
}
