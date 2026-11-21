// 소개 화면 (첫 화면 /): 서비스가 무엇을 해 주는지 처음 온 사람에게 설명하고 [시작하기]로 정리 도구(/start)에 보낸다
// 화면 코드만 있음. 예시 이름·결과는 public/samples/demo와 rename.test.ts의 기대 결과와 같다
import Link from "next/link";
import Logo from "./Logo";
import TypingName from "./TypingName";
import "./intro.css";

const BEFORE = [
  "발표자료(1).pptx",
  "발표자료_최종.pptx",
  "발표자료 최종수정.pptx",
  "발표자료_진짜최종.pptx",
  "보고서_v2.docx",
  "보고서_v3.docx",
  "보고서_v3 복사본.docx",
  "회의록_1115.docx",
];

const AFTER = [
  { group: "발표자료", count: 4, from: "발표자료_진짜최종.pptx", to: "발표자료_v4_20261120.pptx" },
  { group: "보고서", count: 3, from: "보고서_v3.docx", to: "보고서_v2_20261120.docx", note: "복사본 1개는 중복이라 뺌" },
  { group: "회의록", count: 1, from: "회의록_1115.docx", to: "회의록_v1_20261115.docx" },
];

const STEPS = [
  {
    n: 1,
    title: "업로드",
    body: "카카오톡에서 받은 파일을 한꺼번에 끌어다 놓아요. 폴더째 넣어도 되고, 예시 파일로 먼저 해 볼 수도 있어요.",
  },
  {
    n: 2,
    title: "분석",
    body: "이름이 비슷한 파일끼리 묶고, 묶음마다 가장 최신으로 보이는 파일과 그렇게 판단한 이유를 보여 줘요.",
  },
  {
    n: 3,
    title: "이름 변경",
    body: "‘문서이름_v번호_날짜’로 이름을 통일해 zip으로 내려받아요. 최신 파일만 받을지 전체를 받을지 고를 수 있어요.",
  },
];

const CLUES = [
  { name: "버전 번호", ex: ["v2", "v3", "ver.4"], body: "숫자가 클수록 최신으로 봐요." },
  { name: "파일명 날짜", ex: ["1115", "2026-11-20", "11.18"], body: "이름에 적힌 날짜가 늦을수록 최신이에요." },
  { name: "키워드", ex: ["최종", "최종수정", "진짜최종"], body: "‘진짜최종’이 ‘최종’보다 앞서는 식으로 점수를 매겨요." },
  { name: "수정 날짜", ex: ["11월 20일 14:40"], body: "단서가 비슷하면 파일을 마지막으로 고친 시각을 봐요." },
];

export default function Intro() {
  return (
    <div className="intro">
      <header className="intro-nav">
        <Link href="/" className="brand-title" aria-label="진짜최종.zip">
          <Logo size={34} />
          <span className="wordmark" aria-hidden>
            <TypingName />
          </span>
        </Link>
        <Link href="/start" className="btn primary intro-nav-cta">
          시작하기
        </Link>
      </header>

      {/* 첫 화면: 무엇을 해 주는지 + 전후 비교 */}
      <section className="intro-hero">
        <div className="intro-hero-text">
          <p className="intro-eyebrow">팀플 파일 버전 정리</p>
          <h1 className="intro-title">
            최종, 진짜최종, 최종(1)…
            <br />
            <span className="intro-title-accent">어느 게 최신인지</span> 바로 알려 드려요
          </h1>
          <p className="intro-lead">
            카카오톡으로 주고받으며 쌓인 비슷한 파일을 올리면, 같은 문서끼리 묶고 최신 후보를 찾아 이름까지 깔끔하게
            정리해요.
          </p>
          <div className="intro-cta">
            <Link href="/start" className="btn primary">
              지금 정리하기
            </Link>
            <a href="#how" className="btn">
              어떻게 동작하나요?
            </a>
          </div>
          <p className="intro-trust">
            <LockIcon /> 파일은 내 브라우저 안에서만 처리하고 서버로 보내지 않아요
          </p>
        </div>

        <div className="intro-demo" aria-label="정리 전과 후 예시">
          <div className="demo-card">
            <p className="demo-label">정리 전 · 받은 파일 8개</p>
            <ul className="demo-before">
              {BEFORE.map((n) => (
                <li key={n}>
                  <FileIcon />
                  {n}
                </li>
              ))}
            </ul>
          </div>
          <div className="demo-arrow" aria-hidden>
            →
          </div>
          <div className="demo-card is-after">
            <p className="demo-label">정리 후 · 문서 3개</p>
            <ul className="demo-after">
              {AFTER.map((g) => (
                <li key={g.group}>
                  <div className="demo-group">
                    <strong>{g.group}</strong>
                    <span className="demo-count">파일 {g.count}개</span>
                    <span className="demo-badge">최신 후보</span>
                  </div>
                  <p className="demo-from">{g.from}</p>
                  <p className="demo-to">→ {g.to}</p>
                  {g.note && <p className="demo-note">{g.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 3단계 */}
      <section id="how" className="intro-section">
        <h2 className="intro-h2">세 단계면 끝나요</h2>
        <p className="intro-sub">설치도 회원가입도 없어요. 화면을 열고 파일을 놓으면 시작이에요.</p>
        <ol className="intro-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="intro-step">
              <span className="intro-step-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 판단 기준 */}
      <section className="intro-section">
        <h2 className="intro-h2">무엇을 보고 최신이라고 판단하나요?</h2>
        <p className="intro-sub">파일 이름 속 단서 네 가지를 차례로 봐요. 결과 화면에서 어떤 단서로 정했는지 함께 보여 줘요.</p>
        <div className="intro-clues">
          {CLUES.map((c, i) => (
            <div key={c.name} className="intro-clue">
              <p className="intro-clue-order">{i + 1}순위</p>
              <h3>{c.name}</h3>
              <p className="intro-chips">
                {c.ex.map((e) => (
                  <code key={e}>{e}</code>
                ))}
              </p>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
        <div className="intro-notes">
          <p>
            <span className="badge-dup">중복</span> 내용이 똑같은 ‘복사본’, ‘(1)’ 파일은 따로 표시하고 이름 변경에서 빼요.
          </p>
          <p>
            <span className="badge-check">확인 필요</span> 단서만으로 정하기 어려우면 추천하지 않고 직접 고르게 해요. 틀린
            추천보다 솔직한 ‘모르겠어요’가 낫다고 생각했어요.
          </p>
        </div>
      </section>

      {/* 안심 */}
      <section className="intro-section intro-safe">
        <div>
          <h2 className="intro-h2">내 파일은 내 컴퓨터에만 있어요</h2>
          <p className="intro-sub">
            분석과 이름 변경은 모두 브라우저 안에서 일어나요. 파일을 어디에도 올리지 않고, 원본도 바꾸지 않아요.
            정리된 파일은 새 zip으로 받아요.
          </p>
        </div>
        <ul className="intro-safe-list">
          <li>서버로 전송 없음</li>
          <li>원본 파일 그대로</li>
          <li>회원가입 없음</li>
        </ul>
      </section>

      <section className="intro-final">
        <h2>받은 파일함, 지금 정리해 볼까요?</h2>
        <p>파일이 없어도 괜찮아요. 시작 화면의 [예시 파일로 해보기]로 바로 볼 수 있어요.</p>
        <Link href="/start" className="btn primary">
          진짜최종.zip 시작하기
        </Link>
      </section>

      <footer className="intro-footer">© 2026 진짜최종.zip · 예시 파일 이름은 모두 가상이에요</footer>
    </div>
  );
}

function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M4 1.5h5.5L13 5v9.5H4z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}
