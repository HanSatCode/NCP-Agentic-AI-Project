// 소개 화면 (첫 화면 /): 서비스가 무엇을 해 주는지 처음 온 사람에게 설명하고 [시작하기]로 정리 도구(/start)에 보낸다
// 화면 코드만 있음. 예시 이름·결과는 public/samples/demo와 rename.test.ts의 기대 결과와 같다
import Link from "next/link";
import Logo from "./Logo";
import TypingName from "./TypingName";
import StartLink from "./StartLink";
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
  { group: "발표자료", count: 4, from: "발표자료_진짜최종.pptx", to: "발표자료_v04_20261120.pptx" },
  { group: "보고서", count: 3, from: "보고서_v3.docx", to: "보고서_v02_20261120.docx", note: "내용이 같은 복사본 1개는 뺐어요" },
  { group: "회의록", count: 1, from: "회의록_1115.docx", to: "회의록_v01_20261115.docx" },
];

const STEPS = [
  {
    n: 1,
    title: "올리기",
    body: "카톡에서 받은 파일을 한 번에 끌어다 놓아요. zip 파일도 그대로 올릴 수 있어요. 파일이 없으면 예시 파일로 먼저 해 볼 수 있어요.",
  },
  {
    n: 2,
    title: "분석",
    body: "이름이 비슷한 파일끼리 묶고, 묶음마다 최신으로 보이는 파일을 골라 그 이유와 함께 보여 드려요.",
  },
  {
    n: 3,
    title: "이름 바꾸기",
    body: "‘문서이름_v번호_날짜’ 모양으로 이름을 바꿔 내려받아요. 최신 파일만 받을지, 이전 버전도 함께 받을지 고를 수 있어요.",
  },
];

// 첫 화면 제목 "최종, 진짜최종, ○○…"의 ○○ 자리에 차례로 쓰는 이름
const HERO_NAMES = ["최종(1)", "최종수정본", "찐최종", "찐막", "진짜진짜최종", "최종_final", "final_final", "제출용_수정", "새 문서(3)", "이거_건들지마"];

const CLUES = [
  { name: "버전 번호", ex: ["v2", "V3", "ver4"], body: "번호가 클수록 최신이에요." },
  { name: "파일명 날짜", ex: ["1115", "2026-11-20", "11월20일"], body: "이름에 적힌 날짜가 늦을수록 최신이에요." },
  { name: "키워드", ex: ["최종", "최종수정", "진짜최종"], body: "‘최종’보다 ‘최종수정’, ‘최종수정’보다 ‘진짜최종’을 최신으로 봐요." },
  {
    name: "수정 날짜",
    ex: ["11월 20일 14:40"],
    body: "이름으로 가릴 수 없을 때만 봐요. 카톡에서 받은 시각일 수도 있어서 맨 마지막에 봐요.",
  },
];

export default function Intro() {
  return (
    <div className="intro">
      <header className="intro-nav">
        <Link href="/" className="brand-title" aria-label="진짜최종.zip">
          <Logo size={34} />
          <span className="wordmark" aria-hidden>
            진짜최종<span className="wordmark-fit">.zip</span>
          </span>
        </Link>
      </header>

      {/* 첫 화면: 무엇을 해 주는지 + 전후 비교 */}
      <section className="intro-hero">
        <div className="intro-hero-text">
          <p className="intro-eyebrow">팀플 파일 버전 정리</p>
          <h1 className="intro-title">
            {/* 세 번째 이름을 썼다 지웠다 한다. 화면 읽기 프로그램에는 고정 문장 */}
            <span className="sr-only">최종, 진짜최종, 최종(1)…</span>
            {/* 바뀌는 이름이 줄 사이를 오가지 않게 한 덩어리로 묶고, 폰에서는 이름 앞에서 줄을 바꿈 */}
            <span aria-hidden>
              최종, 진짜최종, <br className="intro-br-phone" />
              <span className="intro-nowrap">
                <TypingName names={HERO_NAMES} zip={false} />…
              </span>
            </span>
            <br />
            <span className="intro-nowrap intro-title-accent">어느 게 최신인지</span>{" "}
            <span className="intro-nowrap">찾아 드려요</span>
          </h1>
          <p className="intro-lead">
            카톡으로 주고받다 쌓인 파일을 한 번에 올려 주세요. 같은 문서끼리 묶고, 최신으로 보이는 파일을 골라 이름까지
            정리해 드려요.
          </p>
          <div className="intro-cta">
            <StartLink className="btn primary">
              지금 정리하기
            </StartLink>
            <a href="#how" className="btn">
              어떻게 하는지 보기
            </a>
          </div>
          <p className="intro-trust">
            <LockIcon /> 파일은 서버로 보내지 않고 내 브라우저에서만 다뤄요
          </p>
        </div>

        <div className="intro-demo" aria-label="정리 전과 후 예시">
          <div className="demo-card">
            <p className="demo-label">정리 전 · 파일 8개</p>
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
        <p className="intro-sub">설치도 회원가입도 필요 없어요. 주소를 열고 파일을 끌어다 놓으면 돼요.</p>
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
        <h2 className="intro-h2">무엇을 보고 최신을 고르나요?</h2>
        <p className="intro-sub">
          아래 네 가지 단서를 순서대로 봐요. 앞의 단서로 정해지면 뒤는 보지 않아요. 어떤 단서로 골랐는지는 결과 화면에서
          알려 드려요.
        </p>
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
            <span className="badge-dup">중복</span> 내용이 똑같은 파일은 ‘중복’으로 표시하고, 내려받을 때 빼요.
          </p>
          <p>
            <span className="badge-check">확인 필요</span> 단서가 똑같아서 고를 수 없으면 억지로 추천하지 않아요. 이때는 직접
            골라 주세요.
          </p>
        </div>
      </section>

      {/* 안심 */}
      <section className="intro-section intro-safe">
        <div>
          <h2 className="intro-h2">내 파일은 내 컴퓨터에만 있어요</h2>
          <p className="intro-sub">
            분석도 이름 바꾸기도 모두 브라우저 안에서 해요. 파일을 어디에도 올리지 않고, 원본도 그대로 둬요. 정리한
            파일은 새로 내려받아요.
          </p>
        </div>
        <ul className="intro-safe-list">
          <li>서버로 보내지 않아요</li>
          <li>원본은 그대로예요</li>
          <li>회원가입이 없어요</li>
        </ul>
      </section>

      <section className="intro-final">
        <h2>쌓인 팀플 파일, 지금 정리해 볼까요?</h2>
        <p>파일이 없어도 괜찮아요. 시작 화면의 [체험하기]를 누르면 예시 파일로 해 볼 수 있어요.</p>
        <StartLink className="btn primary">
          정리 시작하기
        </StartLink>
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
