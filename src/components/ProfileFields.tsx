"use client";

export type ProfileForm = {
  last_name: string;
  first_name: string;
  phone: string;
  email: string;
  address: string;
  bank_name: string;
  branch_name: string;
  branch_number: string;
  account_type: string;
  account_number: string;
  account_holder: string;
};

export const EMPTY_PROFILE: ProfileForm = {
  last_name: "",
  first_name: "",
  phone: "",
  email: "",
  address: "",
  bank_name: "",
  branch_name: "",
  branch_number: "",
  account_type: "普通",
  account_number: "",
  account_holder: "",
};

/** 検査員の基本情報フォーム（LIFF の登録・変更と管理画面で共用） */
export default function ProfileFields({ value: v, onChange }: { value: ProfileForm; onChange: (patch: Partial<ProfileForm>) => void }) {
  const input = (k: keyof ProfileForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field" key={k}>
      <span>{label}</span>
      <input type="text" value={v[k]} onChange={(e) => onChange({ [k]: e.target.value })} {...props} />
    </label>
  );
  return (
    <>
      <h3>お名前・連絡先</h3>
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <div className="grow">{input("last_name", "姓 *", { required: true, autoComplete: "family-name" })}</div>
        <div className="grow">{input("first_name", "名 *", { required: true, autoComplete: "given-name" })}</div>
      </div>
      {input("phone", "電話番号 *", { type: "tel", inputMode: "tel", required: true, autoComplete: "tel", placeholder: "090-1234-5678" })}
      {input("email", "メールアドレス *", { type: "email", inputMode: "email", required: true, autoComplete: "email" })}
      {input("address", "住所（交通費の経路検索の出発地に使います）", { autoComplete: "street-address" })}

      <h3 className="mt">振込先口座</h3>
      {input("bank_name", "銀行名 *", { required: true, placeholder: "例: 横浜銀行" })}
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <div className="grow">{input("branch_name", "支店名 *", { required: true })}</div>
        <div style={{ width: 110 }}>{input("branch_number", "支店番号", { inputMode: "numeric", maxLength: 3, placeholder: "3桁" })}</div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <label className="field" style={{ width: 110 }}>
          <span>種別 *</span>
          <select value={v.account_type} onChange={(e) => onChange({ account_type: e.target.value })}>
            <option>普通</option>
            <option>当座</option>
          </select>
        </label>
        <div className="grow">{input("account_number", "口座番号 *", { inputMode: "numeric", maxLength: 7, required: true, placeholder: "7桁" })}</div>
      </div>
      {input("account_holder", "口座名義（カタカナ）*", { required: true, placeholder: "例: ヤマダ タロウ" })}
    </>
  );
}
