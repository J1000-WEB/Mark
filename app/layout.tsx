import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "GENERAL IDEA 오프라인 대시보드 Mark4.2",
  description: "GENERAL IDEA offline dashboard Mark4.2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
