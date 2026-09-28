import { thisMonthJst } from "./format";

/** searchParams の month を検証（不正なら当月） */
export async function monthParam(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const m = (await searchParams).month;
  return typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : thisMonthJst();
}
