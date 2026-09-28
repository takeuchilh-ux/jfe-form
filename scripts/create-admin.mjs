// 管理者アカウントを作成（または パスワードを再設定）します。
// 使い方: node --env-file=.env.local scripts/create-admin.mjs <email> <password> [表示名]
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const [email, password, name = ""] = process.argv.slice(2);
if (!email || !password) {
  console.error("使い方: node --env-file=.env.local scripts/create-admin.mjs <email> <password> [表示名]");
  process.exit(1);
}
if (password.length < 10) {
  console.error("パスワードは 10 文字以上にしてください");
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const password_hash = await bcrypt.hash(password, 10);
const { error } = await db
  .from("kensa_admins")
  .upsert({ email: email.toLowerCase(), password_hash, name: name || email }, { onConflict: "email" });
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`管理者 ${email} を登録しました`);
