"use client";
// 페이지를 넘어갈 때 지금 화면(leave)이 살짝 떠오르며 흐려진 뒤 이동한다. 들어오는 화면은 page-in으로 아래에서 올라온다
// 소개(.intro) → 정리 도구(/start), 정리 도구(.app) 로고 → 소개(/) 양쪽에 쓴다
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

const LEAVE_MS = 320; // globals.css의 .is-leaving 시간과 같게

type Props = {
  href?: string;
  leave?: string; // 흐려질 화면의 선택자
  className?: string;
  children: ReactNode;
  confirm?: () => boolean; // false면 이동하지 않음
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">;

export default function StartLink({ href = "/start", leave = ".intro", confirm, children, ...rest }: Props) {
  const router = useRouter();
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    if (confirm && !confirm()) return e.preventDefault();
    // 새 탭으로 열기·동작 줄이기 설정이면 평소처럼 바로 이동
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    document.querySelector(leave)?.classList.add("is-leaving");
    setTimeout(() => router.push(href), LEAVE_MS);
  };
  return (
    <Link href={href} onClick={go} {...rest}>
      {children}
    </Link>
  );
}
