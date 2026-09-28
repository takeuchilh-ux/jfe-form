import { NextResponse } from "next/server";
import { liffUrl, replyMessage, verifySignature, buttonMessage } from "@/lib/line";
import { db } from "@/lib/supabase";

type LineEvent = { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } };

/** LINE 公式アカウントの Webhook：友だち追加時に基本情報の登録を自動で案内する */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { events = [] } = JSON.parse(raw) as { events?: LineEvent[] };
  for (const ev of events) {
    try {
      if (!ev.replyToken || !ev.source?.userId) continue;
      if (ev.type !== "follow" && !(ev.type === "message" && ev.message?.type === "text")) continue;
      const { data } = await db().from("kensa_inspectors").select("name,approved_at").eq("line_user_id", ev.source.userId).maybeSingle();
      if (!data) {
        // 未登録：友だち追加・メッセージのどちらでも登録を案内
        await replyMessage(ev.replyToken, [registerGuide()]);
      } else if (ev.type === "follow") {
        // ブロック解除などで再度友だち追加された登録済みの方
        await replyMessage(ev.replyToken, [
          { type: "text", text: `${data.name} さん、おかえりなさい。下のメニューからご利用ください。` },
        ]);
      }
    } catch (e) {
      console.error("webhook event error", e);
    }
  }
  return NextResponse.json({ ok: true });
}

function registerGuide() {
  return buttonMessage({
    altText: "検査員の基本情報を登録してください",
    title: "友だち追加ありがとうございます",
    lines: [
      "衛生検査の検査員としてご登録いただくため、基本情報の入力をお願いします。",
      "・お名前（姓・名）\n・電話番号\n・メールアドレス\n・振込先口座（銀行名・支店名・口座番号・口座名義）",
      "登録後、管理者が確認して承認します。",
    ],
    label: "基本情報を登録する",
    uri: liffUrl("/liff/profile"),
  });
}
