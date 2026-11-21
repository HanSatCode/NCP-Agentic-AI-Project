import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "파일 버전 정리",
  description: "비슷한 파일을 올리면 최신 버전을 찾아 이름을 정리해 드려요",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto", padding: 16 }}>
        <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <Link href="/">홈</Link>
          <Link href="/upload">업로드</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
