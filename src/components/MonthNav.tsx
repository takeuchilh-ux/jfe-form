import Link from "next/link";
import { fmtMonth, shiftMonth } from "@/lib/format";

export default function MonthNav({ month, base }: { month: string; base: string }) {
  return (
    <div className="row">
      <Link className="btn sm" href={`${base}?month=${shiftMonth(month, -1)}`}>
        ◀ 前月
      </Link>
      <strong style={{ minWidth: 110, textAlign: "center" }}>{fmtMonth(month)}</strong>
      <Link className="btn sm" href={`${base}?month=${shiftMonth(month, 1)}`}>
        翌月 ▶
      </Link>
    </div>
  );
}
