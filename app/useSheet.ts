"use client";

// 아래에서 올라오는 시트(폰의 표기 목록·파일 미리보기)의 닫기 애니메이션과 끌어내려 닫기 (D-47)
// close(): 닫히는 애니메이션(.is-closing, ms 동안)을 돌린 뒤 onClose. 동작 줄이기 설정이면 바로 닫음
// handleProps: 시트 위쪽 손잡이에 붙임. 아래로 끌면 시트가 따라 내려오고, 80px 넘게 내리면 닫힘

import { useCallback, useRef, useState } from "react";
import type { PointerEvent } from "react";

export function useSheet(onClose: () => void, ms = 220) {
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const close = useCallback(() => {
    if (timer.current !== undefined) return; // 이미 닫는 중
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setClosing(false);
      onClose();
    }, ms);
  }, [onClose, ms]);

  const release = (shouldClose: boolean) => {
    const el = sheetRef.current;
    drag.current = null;
    if (!el) return;
    el.style.transition = "";
    if (shouldClose) close(); // 닫는 애니메이션은 지금 끌어내린 자리에서 이어서 내려감
    else el.style.transform = "";
  };

  const handleProps = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      drag.current = { y: e.clientY, dy: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const el = sheetRef.current;
      if (!drag.current || !el) return;
      const dy = Math.max(0, e.clientY - drag.current.y);
      drag.current.dy = dy;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
    },
    onPointerUp: () => release((drag.current?.dy ?? 0) > 80),
    onPointerCancel: () => release(false),
  };

  return { closing, close, sheetRef, handleProps };
}
