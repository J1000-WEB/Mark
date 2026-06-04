import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"오프라인 매출 리뷰 대시보드(소재천) Mark2.8", description:"Mark2.8" };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
