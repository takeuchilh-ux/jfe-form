import "server-only";
import nodemailer from "nodemailer";

import { ORDER_MAIL_TO as DEFAULT_TO } from "./order";

/** 発注メールの宛先（固定。環境変数 ORDER_MAIL_TO で変更可） */
export const ORDER_MAIL_TO = process.env.ORDER_MAIL_TO?.trim() || DEFAULT_TO;

export function mailConfigured() {
  return !!(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

/** SMTP でメール送信（既定は Gmail。SMTP_USER / SMTP_PASS にアカウントとアプリパスワードを設定） */
export async function sendMail(opts: { to: string; subject: string; text: string; replyTo?: string }) {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("メール送信が未設定です（SMTP_USER / SMTP_PASS）");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM?.trim() || user,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    replyTo: opts.replyTo || undefined,
  });
}
