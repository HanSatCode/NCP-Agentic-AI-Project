"use client";
// 글자를 팀플 파일 이름처럼 썼다 지웠다 한다 (D-49). 기본은 헤더의 서비스 이름 앞부분, ".zip"은 고정
import { useEffect, useState } from "react";

const NAMES = [
  "진짜최종",
  "진짜최종_v2",
  "진짜최종_v2_수정",
  "진짜최종_수정본",
  "진짜최종(1)",
  "진짜최종 - 복사본",
  "진짜진짜최종",
  "진짜진짜진짜최종",
  "찐최종",
  "찐막",
  "찐찐막",
  "최종",
  "최종(1)",
  "최종(2)",
  "최종_final",
  "최종_final_v3",
  "최종수정본",
  "최종_진짜_마지막",
  "최종_이거_제출",
  "final",
  "final_final",
  "FINAL_진짜",
  "제출용",
  "제출용_수정",
  "교수님_피드백_반영",
  "발표자료_1120",
  "발표자료_11월20일",
  "새 문서(3)",
  "이거_건들지마",
  "마지막_수정_진짜",
];
const HOLD = 2200; // 다 쓴 이름을 보여 주는 시간
const TYPE = 130; // 한 글자 쓰는 시간
const ERASE = 60; // 한 글자 지우는 시간

export default function TypingName({ names = NAMES, zip = true }: { names?: string[]; zip?: boolean }) {
  const [text, setText] = useState(names[0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let cur = names[0];
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const target = names[(i + 1) % names.length];
      let delay = TYPE;
      // 다음 이름과 겹치는 앞부분까지만 지우고, 나머지를 한 글자씩 쓴다
      if (!target.startsWith(cur)) {
        cur = cur.slice(0, -1);
        delay = ERASE;
      } else if (cur !== target) {
        cur = target.slice(0, cur.length + 1);
      } else {
        i = (i + 1) % names.length;
        delay = HOLD;
      }
      setText(cur);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, HOLD);
    return () => clearTimeout(timer);
  }, [names]);

  return (
    <>
      {text}
      <span className="wordmark-caret" />
      {zip && <span className="wordmark-fit">.zip</span>}
    </>
  );
}
