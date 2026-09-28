import LiffProvider from "@/components/LiffProvider";

export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return <LiffProvider>{children}</LiffProvider>;
}
