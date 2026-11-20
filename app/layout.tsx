import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "팀플 파일 버전 도우미",
  description: "최종_진짜최종_v3는 이제 그만. 팀 프로젝트 파일 버전 관리 도우미",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto", padding: 16 }}>
        <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <Link href="/">홈</Link>
          <Link href="/upload">업로드</Link>
          <Link href="/history">히스토리</Link>
          <Link href="/compare">비교</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
