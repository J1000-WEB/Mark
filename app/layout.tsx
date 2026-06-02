import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mark1 오프라인 매출 리뷰 대시보드",
  description: "Mark1 신규 데이터 기반 매출 리뷰 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
