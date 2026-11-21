"use client";
// 소개 첫 화면 오른쪽의 정리 전 → 후 예시. "정리 후" 묶음에 마우스를 올리거나 누르면 "정리 전"에서 그 묶음의 파일만 밝아진다.
// 아무것도 안 만지면 묶음이 저절로 넘어가고, 한 번 만지면 멈춘다. 예시 결과는 public/samples/expected.json과 같다
import { useEffect, useState } from "react";

type Mark = "latest" | "dup";
// 시연용 예시 24개 (public/samples/demo)를 카톡에서 받은 순서처럼 섞어 둠. 단독 파일 3개는 "단독"으로 묶어 보여 줌
const BEFORE: { name: string; group: string; mark?: Mark }[] = [
  { name: "보고서_v2.docx", group: "보고서" },
  { name: "기획안_1112.pptx", group: "기획안" },
  { name: "발표자료(1).pptx", group: "발표자료" },
  { name: "설문지_ver1.docx", group: "설문지" },
  { name: "회의록_1115.docx", group: "단독" },
  { name: "대본.hwp", group: "대본" },
  { name: "발표자료_최종.pptx", group: "발표자료" },
  { name: "포스터.pdf", group: "포스터" },
  { name: "자료조사.docx", group: "자료조사", mark: "latest" },
  { name: "보고서_v3 복사본.docx", group: "보고서", mark: "dup" },
  { name: "기획안_1114.pptx", group: "기획안" },
  { name: "설문지_ver2.docx", group: "설문지" },
  { name: "대본_수정본.hwp", group: "대본" },
  { name: "역할분담.hwp", group: "단독" },
  { name: "포스터 (1).pdf", group: "포스터" },
  { name: "발표자료_진짜최종.pptx", group: "발표자료", mark: "latest" },
  { name: "보고서_v3.docx", group: "보고서", mark: "latest" },
  { name: "자료조사 - 복사본.docx", group: "자료조사", mark: "dup" },
  { name: "기획안_1118 수정.pptx", group: "기획안", mark: "latest" },
  { name: "대본_찐최종.hwp", group: "대본", mark: "latest" },
  { name: "설문지_ver3_최종.docx", group: "설문지", mark: "latest" },
  { name: "참고문헌.pdf", group: "단독" },
  { name: "포스터 (2).pdf", group: "포스터", mark: "latest" },
  { name: "발표자료 최종수정.pptx", group: "발표자료" },
];

// 새 이름은 public/samples/expected.json의 결과와 같다
const AFTER = [
  { group: "발표자료", count: 4, to: "발표자료_v04_20261120.pptx" },
  { group: "보고서", count: 3, to: "보고서_v02_20261120.docx" },
  { group: "기획안", count: 3, to: "기획안_v03_20261118.pptx" },
  { group: "설문지", count: 3, to: "설문지_v03_20261114.docx" },
  { group: "대본", count: 3, to: "대본_v03_20261117.hwp" },
  { group: "포스터", count: 3, to: "포스터_v03_20261120.pdf" },
  { group: "자료조사", count: 2, to: "자료조사_v01_20261113.docx" },
  { group: "단독", count: 3, to: "회의록_v01_20261115.docx 외 2개" },
];
const CYCLE_MS = 2800;

export default function IntroDemo() {
  const [active, setActive] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // 안 만지는 동안 묶음을 차례로 보여 줌 (동작 줄이기 설정이면 안 움직임)
  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    const show = () => setActive(AFTER[i++ % AFTER.length].group);
    const first = setTimeout(show, 1200);
    const timer = setInterval(show, CYCLE_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [touched]);

  const pick = (group: string | null) => {
    setTouched(true);
    setActive(group);
  };

  return (
    <div className="intro-demo" aria-label="정리 전과 후 예시" data-active={active ? "" : undefined}>
      <div className="demo-card">
        <p className="demo-label">정리 전 · 파일 24개</p>
        <ul className="demo-before">
          {BEFORE.map((f, i) => (
            <li
              key={f.name}
              style={{ "--i": i } as React.CSSProperties}
              title={f.mark === "latest" ? `${f.name} (최신)` : f.mark === "dup" ? `${f.name} (중복)` : f.name}
              className={active === f.group ? `is-on${f.mark ? ` is-${f.mark}` : ""}` : active ? "is-off" : undefined}
            >
              <span className="demo-name">{f.name}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* 묶음이 바뀔 때마다 key가 바뀌어 화살표가 한 번 밀려 나감 */}
      <div key={active ?? "none"} className="demo-arrow" aria-hidden>
        →
      </div>
      <div className="demo-card is-after">
        <p className="demo-label">정리 후 · 문서 10개 <span className="demo-hint">눌러 보세요</span></p>
        <ul className="demo-after" onMouseLeave={() => touched && setActive(null)}>
          {AFTER.map((g, i) => (
            <li
              key={g.group}
              style={{ "--i": i } as React.CSSProperties}
              tabIndex={0}
              aria-pressed={active === g.group}
              className={active === g.group ? "is-on" : undefined}
              onMouseEnter={() => pick(g.group)}
              onFocus={() => pick(g.group)}
              onClick={() => pick(g.group)}
            >
              <div className="demo-group">
                <strong>{g.group === "단독" ? "단독 파일" : g.group}</strong>
                <span className="demo-count">{g.count}개</span>
              </div>
              <p className="demo-to">→ {g.to}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
