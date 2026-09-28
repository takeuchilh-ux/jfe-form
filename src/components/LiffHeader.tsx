import Link from "next/link";

export default function LiffHeader({ title, back = "/liff" }: { title: string; back?: string | null }) {
  return (
    <div className="liff-header">
      {back && (
        <Link href={back} className="btn sm" aria-label="戻る">
          ‹ 戻る
        </Link>
      )}
      <h1>{title}</h1>
    </div>
  );
}
