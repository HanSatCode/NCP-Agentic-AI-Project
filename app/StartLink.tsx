"use client";
// 소개 화면 → 정리 도구(/start)로 가는 링크. 소개 화면이 살짝 떠오르며 사라진 뒤 넘어가고, /start는 .app의 page-in으로 들어온다
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

const LEAVE_MS = 320; // intro.css의 .intro.is-leaving 시간과 같게

export default function StartLink({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    // 새 탭으로 열기·동작 줄이기 설정이면 평소처럼 바로 이동
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    document.querySelector(".intro")?.classList.add("is-leaving");
    setTimeout(() => router.push("/start"), LEAVE_MS);
  };
  return (
    <Link href="/start" className={className} onClick={go}>
      {children}
    </Link>
  );
}
