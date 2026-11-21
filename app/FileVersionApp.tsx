"use client";

// 한 페이지에서 업로드(S-02) → 분석(S-03) → 이름 변경·내려받기(S-04) 순서로 진행한다
// 파일은 서버로 보내지 않고 브라우저 안에서만 다룬다. 원본은 바꾸지 않고 새 이름의 사본만 내려받는다

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import Link from "next/link";
import FilePreview, { PreviewBody } from "./FilePreview";
import { useSheet } from "./useSheet";
import Logo from "./Logo";
import TypingName from "./TypingName";
// 분석 로직은 src/analysis (화면 코드 없음, /check-result와 같은 함수). 규칙은 rules/version-rules.json
import rules from "@/rules/version-rules.json";
import type { Rules } from "@/src/analysis/baseName.ts";
import { analyze, decidingCriterion, reasonDetail, type Analysis, type FileResult, type Group } from "@/src/analysis/analyze.ts";
import {
  DATE_FORMATS,
  DEFAULT_PATTERN,
  formatDate as formatNameDate,
  formatVersion,
  rename,
  VERSION_FORMATS,
  type DateFormat,
  type NamePart,
  type RenameRow,
  type Scope,
  type VersionFormat,
} from "@/src/analysis/rename.ts";
import { acceptFiles, loadSamples, toInputFiles } from "@/src/analysis/upload.ts";
import { isZip, unzipFiles, ZIP_MAX } from "@/src/analysis/unzip.ts";
import { makeDownload, zipName } from "@/src/analysis/zip.ts";
import { readDocMeta, type DocMeta } from "@/src/analysis/metadata.ts";
import type { InputFile } from "@/src/analysis/types.ts";

type Badge = "최신 후보" | "확인 필요" | "중복" | "직접 선택";
type Item = { input: InputFile; file: File; meta: DocMeta }; // 분석 입력 + 원본 File (미리보기용) + 문서 안 기록 (표시만, D-30)

// 안내 메시지 (명세서 4-5, 문구 그대로)
const MSG = {
  M01: "파일을 여기에 끌어다 놓거나 눌러서 골라 주세요", // D-31
  M02: "비교하려면 파일이 2개 이상 필요해요",
  M03: (name: string) => `'${name}'은 20MB가 넘어서 빼고 올렸어요`,
  M04: "이미 올린 파일이에요",
  M05: (n: number) => `최신 파일을 골라야 하는 그룹이 ${n}개 있어요`,
  M06: "기본 이름은 비워 둘 수 없어요",
  M07: "파일만 올릴 수 있어요",
  // zip 올리기 (D-39)
  M09: (zip: string, n: number) => `'${zip}' 안의 파일 ${n}개는 열 수 없어서 빼고 올렸어요`,
  M10: (zip: string) => `'${zip}'은 풀 수 없어서 빼고 올렸어요`,
  M11: (zip: string) => `'${zip}' 안에 올릴 파일이 없어요`,
  M12: (zip: string) => `'${zip}'은 100MB가 넘어서 빼고 올렸어요`,
};

type SortKey = "name" | "date" | "created" | "saved" | "size";
type Toast = { id: number; text: string; kind: "info" | "warn" | "done"; leaving?: boolean };

function formatDate(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 파일이 브라우저 밖으로 나가지 않는다는 안내. PC는 하단바 왼쪽, 좁은 화면은 헤더에 (globals.css) */
function TrustNote({ className }: { className: string }) {
  return (
    <p className={`trust ${className}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      파일은 서버에 올라가지 않고, 이 브라우저 안에서만 처리돼요
    </p>
  );
}

const SINGLES = "__singles"; // 분석 화면 칩: 단독 파일

/** 좌우로 밀어서 넘기는 칩 줄. 스크롤 막대는 숨기고, 넘치는 쪽 가장자리를 흐리게.
 *  마우스: 끌기·휠로 좌우 이동, 터치: 손가락으로 밀기 */
function ChipScroller({ label, active, children }: { label: string; active: string | null; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current!;
    const update = () =>
      setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  // 고른 칩이 바뀌었는데 가려져 있으면 보이게 옆으로 밀어 줌 (손으로 밀 때는 건드리지 않음)
  useEffect(() => {
    ref.current?.querySelector(".is-active")?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [active]);
  return (
    <div
      ref={ref}
      className={`chips ${edge.left ? "fade-left" : ""} ${edge.right ? "fade-right" : ""}`}
      role="group"
      aria-label={label}
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) ref.current!.scrollLeft += e.deltaY;
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") drag.current = { x: e.clientX, left: ref.current!.scrollLeft, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
        if (d.moved) ref.current!.scrollLeft = d.left - (e.clientX - d.x);
      }}
      onPointerUp={() => setTimeout(() => (drag.current = null))}
      onPointerLeave={() => (drag.current = null)}
      onClickCapture={(e) => {
        // 끌어서 넘긴 거면 칩이 눌리지 않게
        if (drag.current?.moved) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      {children}
    </div>
  );
}

/** 다음 단계로 가는 버튼의 → (마우스를 올리면 앞으로 살짝) */
/** 글자가 바뀌면 새 글자가 살짝 떠오르며 나타나게. k가 바뀔 때마다 안쪽을 새로 그려서 애니메이션이 다시 돎.
 *  (key는 형제끼리에서만 먹으므로 바깥 span 안에 key 달린 span을 둠) */
function Swap({ k, children }: { k: string | number; children: React.ReactNode }) {
  return (
    <span className="swap-wrap">
      <span key={k} className="swap swap-inline">
        {children}
      </span>
    </span>
  );
}

/** 화면 폭 조건(미디어 쿼리)이 맞는지. 창 크기가 바뀌면 다시 그림 */
function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** 나타났다 사라지는 요소를 사라질 때 바로 지우지 않고 ms 동안 남겨 둠 → 그동안 .is-leaving으로 사라지는 애니메이션 */
function usePresence(show: boolean, ms = 260) {
  const [kept, setKept] = useState(show);
  useEffect(() => {
    if (show) {
      setKept(true);
      return;
    }
    const t = window.setTimeout(() => setKept(false), ms);
    return () => window.clearTimeout(t);
  }, [show, ms]);
  return { mounted: show || kept, leaving: !show && kept };
}

/** 문장 속 파일명의 띄어쓰기에서 줄이 갈리지 않게 (줄바꿈 없는 공백) */
const keepTogether = (name: string) => name.replace(/ /g, " ");

/** 숫자가 0(또는 이전 값)에서 목표 값까지 0.6초 동안 올라감 (2단계 요약 숫자). 동작 줄이기 설정이면 바로 목표 값 */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      setShown(Math.round(a + (value - a) * (1 - (1 - p) ** 3))); // 끝에서 천천히
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return <span className="count-up">{shown}</span>;
}

/** 글자가 바뀌는 버튼(분석하기 → 분석 중 → 끝났어요, 내려받기 → 요청했어요)의 크기를 처음부터 가장 긴 문구에 맞춤.
 *  모든 문구를 같은 칸에 겹쳐 그려 두고(안 보이게) 지금 문구만 보여 줌. 지금 문구는 바뀔 때마다 새로 그려서 체크 애니메이션이 다시 돎 */
function StableLabel({ states, current = 0 }: { states: React.ReactNode[]; current?: number }) {
  return (
    <span className="stable-label">
      {/* 하단바 주 버튼은 단계마다 같은 폭: 가장 긴 문구(내려받기 완료)를 늘 크기 재는 데 넣음 */}
      {[...states, WIDEST_PRIMARY].map((s, i) => (
        <span key={i} className="stable-sizer" aria-hidden>
          {s}
        </span>
      ))}
      <span key={`on-${current}`} className="stable-on">
        {states[current]}
      </span>
    </span>
  );
}

function CheckMark() {
  return (
    <svg className="btn-check" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
const WIDEST_PRIMARY = (
  <>
    <CheckMark />
    다운로드를 요청했어요!
  </>
);

/** [내려받기] 아이콘: 아래 화살표 + 받침. 올리면 화살표가 살짝 내려감 */
function DownloadIcon() {
  return (
    <svg className="btn-down" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path className="btn-down-arrow" d="M12 4v11M7 10.5l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="btn-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/** 목록이 차례로 나타나게 하는 순번 (globals.css의 --i) */
function stagger(i: number) {
  return { "--i": i } as React.CSSProperties;
}

const BADGE_CLASS: Record<Badge, string> = {
  "최신 후보": "badge-green",
  "확인 필요": "badge-yellow",
  중복: "badge-gray",
  "직접 선택": "badge-blue",
};

function BadgeLabel({ badge }: { badge: Badge }) {
  return <span className={`badge ${BADGE_CLASS[badge]}`}>{badge}</span>;
}

/** 확장자 아이콘. 색은 파일 종류 구분용 (문서·발표·표·PDF·이미지·기타) */
const EXT_KIND: Record<string, string> = {
  doc: "doc", docx: "doc", hwp: "doc", hwpx: "doc", txt: "doc", md: "doc", rtf: "doc",
  ppt: "slide", pptx: "slide", key: "slide",
  xls: "sheet", xlsx: "sheet", csv: "sheet",
  pdf: "pdf",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
};

/** 내용이 바뀌어 높이가 달라지면 예전 높이에서 새 높이로 부드럽게 바꿈 (아래 목록이 툭 밀리지 않게).
 *  CSS는 auto 높이끼리 애니메이션을 못 해서, 그릴 때마다 높이를 재어 두고 달라지면 Web Animations로 이어 줌.
 *  창 크기 등으로 바뀐 높이는 애니메이션 없이 기억만 함 (ResizeObserver) */
function useSmoothHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const last = useRef<number | null>(null);
  const anim = useRef<Animation | null>(null);
  const watch = useRef<{ el: T; ro: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (watch.current && watch.current.el !== el) {
      watch.current.ro.disconnect();
      watch.current = null;
    }
    if (!el) {
      last.current = null;
      return;
    }
    if (!watch.current) {
      const ro = new ResizeObserver(() => {
        if (anim.current?.playState !== "running") last.current = el.offsetHeight;
      });
      ro.observe(el);
      watch.current = { el, ro };
    }
    anim.current?.cancel(); // 하던 애니메이션을 멈춰야 실제 새 높이를 잴 수 있음
    const now = el.offsetHeight;
    const prev = last.current;
    last.current = now;
    if (prev === null || Math.abs(prev - now) < 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    anim.current = el.animate([{ height: `${prev}px` }, { height: `${now}px` }], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  });
  useEffect(() => () => watch.current?.ro.disconnect(), []);
  return ref;
}

/** 한 줄에 안 들어가는 글자는 왼쪽으로만 흘러가며 뒷부분을 보여 주고, 처음으로 돌아가 다시 (단방향).
 *  들어가면 가만히 있음. 칸 폭이나 글꼴이 바뀌면 다시 잼 */
function SlideText({ text, className = "" }: { text: string; className?: string }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const o = outer.current!;
    const i = inner.current!;
    const measure = () => setShift(Math.max(0, Math.ceil(i.offsetWidth - o.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [text]);
  const style = shift
    ? ({ "--shift": `-${shift}px`, "--dur": `${(3 + shift / 40).toFixed(1)}s` } as React.CSSProperties)
    : undefined;
  return (
    <span ref={outer} className={`slide-text ${shift ? "is-sliding" : ""} ${className}`} style={style} title={shift ? text : undefined}>
      <span ref={inner} className="slide-inner">
        {text}
      </span>
    </span>
  );
}

const PART_LABEL: Record<NamePart, string> = { base: "기본 이름", version: "버전 번호", date: "수정 날짜" };
const VERSION_HINT: Record<VersionFormat, string> = {
  v01: "두 자리 (기본)",
  v1: "한 자리",
  v001: "세 자리",
  V01: "대문자 V",
  ver01: "ver",
  ver1: "ver 한 자리",
  Ver01: "Ver",
  VER01: "VER 대문자",
};
// 한 자리 번호는 10개부터 탐색기 정렬이 섞임 (v10이 v2보다 앞)
const ONE_DIGIT: VersionFormat[] = ["v1", "ver1"];
const V1_WARN =
  "번호가 한 자리면 파일 탐색기가 글자 순서로 정렬해서, 버전이 10개를 넘을 때 v10이 v2보다 앞에 와요. 두 자리(v01)로 쓰면 순서대로 보여요.";

/** 노란 세모 경고. 누르면 말풍선으로 이유를 보여 주고, 바깥을 누르거나 Esc면 닫힘.
 *  다른 버튼(표기 항목·버전 칸) 안에 넣으면 누를 때 그 버튼까지 눌리므로 늘 옆에 따로 둠 */
function WarnTip({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span className="warn-tip" ref={ref}>
      <button
        type="button"
        className="warn-icon"
        aria-label="경고 이유 보기"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
          <path d="M12 3.2 22 20.5H2z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 9.5v5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="17.6" r="1.2" fill="#fff" />
        </svg>
      </button>
      {open && (
        <span className="warn-bubble" role="status">
          {label}
        </span>
      )}
    </span>
  );
}
const DATE_HINT: Record<DateFormat, string> = {
  yyyymmdd: "붙여 쓰기 (기본)",
  "yyyy-mm-dd": "- 로 나누기",
  "yyyy.mm.dd": ". 으로 나누기",
  "yyyy년m월d일": "한글로",
  mmdd: "월·일만",
  "mm.dd": "월·일만, . 으로",
  "m월d일": "월·일만, 한글로",
};

/** 새 이름 모양: 칸 순서(D-42) + 버전·날짜 표기(D-43) */
type NameFmt = { pattern: NamePart[]; versionFormat: VersionFormat; dateFormat: DateFormat };
const DEFAULT_FMT: NameFmt = { pattern: DEFAULT_PATTERN, versionFormat: "v01", dateFormat: "yyyymmdd" };

/** STEP 3 "이름 모양": 칸을 끌면 순서가 바뀌고(D-42), 끌지 않고 누르면 표기 고르기가 열림(D-43).
 *  마우스·터치는 포인터로 끌기, 키보드는 ←/→로 옮기고 Enter로 표기 고르기 */
function PatternEditor({ value, onChange, maxVersions }: { value: NameFmt; onChange: (f: NameFmt) => void; maxVersions: number }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<NamePart | null>(null);
  const [focusPart, setFocusPart] = useState<NamePart | null>(null);
  const [menu, setMenu] = useState<NamePart | null>(null);
  // 표기 목록 닫기: 사라지는 애니메이션 뒤에 닫음. 폰에서는 아래에서 올라오는 시트라 손잡이를 끌어내려도 닫힘
  const closeMenuNow = useCallback(() => setMenu(null), []);
  const sheet = useSheet(closeMenuNow, 200);
  const movedRef = useRef(false); // 이번에 누른 동안 자리를 옮겼으면 클릭(표기 고르기)으로 치지 않음
  const pattern = value.pattern;

  const move = (part: NamePart, to: number) => {
    const next = pattern.filter((p) => p !== part);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, part);
    if (next.join() === pattern.join()) return;
    movedRef.current = true;
    setMenu(null);
    onChange({ ...value, pattern: next });
  };

  // 자리를 옮기면 React가 DOM 노드를 옮기면서 포커스가 풀릴 수 있어 다시 줌
  useEffect(() => {
    if (focusPart) rowRef.current?.querySelector<HTMLElement>(`[data-part="${focusPart}"]`)?.focus();
  }, [pattern, focusPart]);

  // 칸이 옮겨지면 예전 자리에서 새 자리로 미끄러지게 (FLIP: 그리기 전에 옛 위치만큼 밀어 두고 0으로 되돌림)
  const lastPos = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rowRef.current?.querySelectorAll<HTMLElement>("[data-cell]").forEach((el) => {
      const now = { x: el.offsetLeft, y: el.offsetTop }; // offset은 transform의 영향을 안 받아서 애니메이션 중에도 실제 자리
      const prev = lastPos.current.get(el.dataset.cell!);
      if (prev && !still && (prev.x !== now.x || prev.y !== now.y)) {
        el.animate([{ transform: `translate(${prev.x - now.x}px, ${prev.y - now.y}px)` }, { transform: "none" }], {
          duration: 280,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
      lastPos.current.set(el.dataset.cell!, now);
    });
  }, [pattern]);

  // 끄는 동안 포인터가 다른 칸의 가운데를 넘으면 그 자리로. 칸이 DOM에서 옮겨지면 포인터 캡처가 풀릴 수 있어 window에서 받음
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const chips = Array.from(rowRef.current!.querySelectorAll<HTMLElement>("[data-part]")).filter((el) => el.dataset.part !== dragging);
      const to = chips.filter((el) => {
        const r = el.getBoundingClientRect();
        return e.clientX > r.left + r.width / 2;
      }).length;
      move(dragging, to);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  // 표기 고르기는 바깥을 누르거나 Esc면 닫힘
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !rowRef.current?.contains(e.target as Node)) sheet.close();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const sample = (part: NamePart, f: string) =>
    part === "version" ? formatVersion(4, f as VersionFormat) : formatNameDate(Date.now(), f as DateFormat);
  const current = (part: NamePart) => (part === "version" ? value.versionFormat : value.dateFormat);
  const options = (part: NamePart): readonly string[] => (part === "version" ? VERSION_FORMATS : DATE_FORMATS);
  const hint = (part: NamePart, f: string) => (part === "version" ? VERSION_HINT[f as VersionFormat] : DATE_HINT[f as DateFormat]);
  // 한 자리 번호인데 버전이 10개 이상인 그룹이 실제로 있으면 버전 칸에 경고 표시 (D-43)
  const v1Risk = ONE_DIGIT.includes(value.versionFormat) && maxVersions >= 10;
  const isDefault =
    pattern.join() === DEFAULT_FMT.pattern.join() && value.versionFormat === DEFAULT_FMT.versionFormat && value.dateFormat === DEFAULT_FMT.dateFormat;

  return (
    <div className="pattern">
      <span className="pattern-label">이름 모양</span>
      <div className="pattern-row" ref={rowRef} role="list" aria-label="새 이름의 칸 순서예요. 칸을 끌거나 화살표 키로 옮기고, 눌러서 표기를 고를 수 있어요">
        {pattern.map((part, i) => (
          <span key={part} className="pattern-cell" role="listitem" data-cell={part}>
            <button
              type="button"
              data-part={part}
              className={`pattern-chip part-${part} ${dragging === part ? "is-dragging" : ""} ${menu === part ? "is-open" : ""} ${part === "version" && v1Risk ? "has-warn" : ""}`}
              aria-label={`${PART_LABEL[part]}, ${i + 1}번째 칸. 화살표 키로 옮길 수 있어요`}
              aria-haspopup={part === "base" ? undefined : "menu"}
              aria-expanded={part === "base" ? undefined : menu === part}
              onPointerDown={(e) => {
                e.preventDefault(); // 끄는 동안 글자가 선택되지 않게
                movedRef.current = false;
                setDragging(part);
              }}
              onClick={() => {
                if (movedRef.current || part === "base") return;
                if (menu === part) sheet.close();
                else setMenu(part);
              }}
              onFocus={() => setFocusPart(part)}
              onBlur={() => setFocusPart(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") move(part, i - 1);
                if (e.key === "ArrowRight") move(part, i + 1);
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
                <circle cx="9" cy="6" r="1.6" />
                <circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" />
                <circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" />
                <circle cx="15" cy="18" r="1.6" />
              </svg>
              {PART_LABEL[part]}
              {part !== "base" && (
                <>
                  <span className="pattern-fmt">
                    <Swap k={current(part)}>{sample(part, current(part))}</Swap>
                  </span>
                  <svg className="pattern-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </>
              )}
            </button>
            {/* 버전 칸 오른쪽 위 모서리에 붙는 경고 (칸 버튼 밖이라 눌러도 표기 고르기가 안 열림) */}
            {part === "version" && v1Risk && <WarnTip label={V1_WARN} />}
            {menu === part && (
              <>
              {/* 폰에서만 보이는 어두운 뒤판: 누르면 닫힘 (globals.css) */}
              <div
                className={`sheet-backdrop ${sheet.closing ? "is-closing" : ""}`}
                aria-hidden
                onPointerDown={(e) => {
                  e.preventDefault();
                  sheet.close();
                }}
              />
              <div
                ref={sheet.sheetRef}
                className={`pattern-menu ${sheet.closing ? "is-closing" : ""}`}
                role="menu"
                aria-label={`${PART_LABEL[part]} 표기`}
              >
                <div className="sheet-handle" aria-hidden {...sheet.handleProps} />
                {options(part).map((f) => (
                  <div key={f} className="pattern-menu-row" role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={current(part) === f}
                      className={current(part) === f ? "is-on" : ""}
                      onClick={() => {
                        onChange(part === "version" ? { ...value, versionFormat: f as VersionFormat } : { ...value, dateFormat: f as DateFormat });
                        sheet.close();
                      }}
                    >
                      <span className="pattern-menu-sample">{sample(part, f)}</span>
                      <span className="pattern-menu-hint">{hint(part, f)}</span>
                    </button>
                    {part === "version" && ONE_DIGIT.includes(f as VersionFormat) && <WarnTip label={V1_WARN} />}
                  </div>
                ))}
              </div>
              </>
            )}
          </span>
        ))}
        <span className="pattern-sep" aria-hidden>
          .확장자
        </span>
      </div>
      {/* 늘 그려 두고 바뀐 게 있을 때만 보이게 (나타나고 사라질 때 모두 애니메이션). 숨으면 visibility로 탭 순서에서도 빠짐 */}
      <button type="button" className={`pattern-reset ${isDefault ? "" : "is-shown"}`} aria-hidden={isDefault} onClick={() => onChange(DEFAULT_FMT)}>
        원래대로
      </button>
    </div>
  );
}

/** 드롭 영역에 부채꼴로 펼쳐 보여 줄 형식 (팀플에서 자주 오가는 것) */
const DROP_FAN = ["pptx", "docx", "hwp", "pdf", "xlsx"];

function FileTypeIcon({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const kind = EXT_KIND[ext] ?? "etc";
  return (
    <span className={`ftype ftype-${kind}`} aria-hidden>
      {ext ? ext.slice(0, 4).toUpperCase() : "FILE"}
    </span>
  );
}

function SectionHead({ title, desc, id, aside }: { title: string; desc: string; id: string; aside?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div className="section-title">
        <h2 id={id}>{title}</h2>
        <p className="desc">{desc}</p>
      </div>
      {aside}
    </div>
  );
}

/** 스크롤 막대를 숨긴 대신, 아래에 내용이 더 있으면 아래쪽 흐림 + "아래에 더 있어요"를 띄운다. 누르면 한 화면 내려감
 *  한 번 내려 보면 스크롤할 수 있다는 걸 안 것이므로 알약은 다시 띄우지 않는다 (흐림만 남김) */
function Scrollable({ className, grow, children }: { className: string; grow?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current!;
    const update = () => {
      // 16px 미만은 무시: 행이 떠오르는 애니메이션(10px) 동안 잠깐 넘쳐 보여서 표시가 깜빡이지 않게
      setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 16);
      if (el.scrollTop > 0) setScrolled(true);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // 창 크기·행 추가·카드 펼침으로 높이가 바뀌어도 다시 계산
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return (
    <div className={`scroll-area ${grow ? "grow" : ""} ${more ? "has-more" : ""} ${scrolled ? "scrolled" : ""}`}>
      <div ref={ref} className={className}>
        {children}
      </div>
      <button
        type="button"
        className="scroll-hint"
        onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.8, behavior: "smooth" })}
      >
        아래에 더 있어요
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

export default function FileVersionApp() {
  const [items, setItems] = useState<Item[]>([]);
  const m02 = usePresence(items.length === 1);
  const narrow = useMedia("(max-width: 860px)"); // 2단계 오른쪽 미리보기 칸을 그릴지 (넓을 때만) // M-02 "파일이 2개 이상 필요해요": 나타나고 사라질 때 애니메이션
  const itemsRef = useRef<Item[]>([]);
  const batchRef = useRef(0);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // [분석하기]를 눌렀을 때 버튼 안에서: 분석 중(1초) → "분석이 완료되었어요!" → STEP 2로. 그동안 업로드 화면은 못 만짐
  const [overlay, setOverlay] = useState<null | "loading" | "done">(null);
  const busy = overlay !== null;
  // 그룹 key → 사용자가 직접 고른 최신 파일 id (F-02-05)
  const [selected, setSelected] = useState<Record<string, string | undefined>>({});
  // 분석 화면 오른쪽에 정보를 보여 줄 파일 (행을 누르면 바뀜. 최신 파일 선택과는 따로)
  const [focusId, setFocusId] = useState<string | null>(null);
  // 분석 화면 왼쪽에 보여 줄 그룹 (위쪽 칩으로 고름). SINGLES = 단독 파일
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const [showRename, setShowRename] = useState(false);
  const [bases, setBases] = useState<Record<string, string | undefined>>({});
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({});
  // STEP 3: 기본 이름은 평소엔 글자, 연필을 누른 그룹 하나만 입력칸 (D-40). Esc면 고치기 전 이름으로
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editStartRef = useRef("");
  const ESCAPED = "\u0000esc"; // editStartRef에 넣는 표시: Esc로 닫음
  const [scope, setScope] = useState<Scope>("latest");
  const [dlSent, setDlSent] = useState(false); // [내려받기]를 누른 뒤 잠깐 초록 (D-46)
  const dlTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(dlTimer.current), []);
  // iOS Safari는 터치 이벤트를 듣는 곳이 있어야 :active(누를 때 표시)를 그림 (globals.css의 터치 화면 구역)
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  const [nameFmt, setNameFmt] = useState<NameFmt>(DEFAULT_FMT); // 새 이름 칸 순서·표기 (D-42, D-43)

  const [toasts, setToasts] = useState<Toast[]>([]);

  // 분석 화면에서 열어 보는 파일
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewFile = previewId ? (items.find((x) => x.input.id === previewId)?.file ?? null) : null;
  const closePreview = useCallback(() => setPreviewId(null), []);

  // 지금 보고 있는 단계. 한 화면에 한 단계만 보여준다
  const [view, setView] = useState<1 | 2 | 3>(1);
  // 단계가 바뀐 방향. 폰에서 다음 단계는 오른쪽에서, [이전]으로 돌아가면 왼쪽에서 밀려 들어옴 (globals.css, D-47)
  const prevViewRef = useRef(view);
  const dirRef = useRef<"fwd" | "back">("fwd");
  if (prevViewRef.current !== view) {
    dirRef.current = view > prevViewRef.current ? "fwd" : "back";
    prevViewRef.current = view;
  }
  // 빼는 중인 파일: 행이 옆으로 밀리며 접히는 애니메이션(0.26초) 뒤에 실제로 뺌
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  // 하단바 높이만큼 본문 아래를 비워 둠 (폰에서 버튼이 여러 줄이 되면 높이가 바뀜)
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current!;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  const runSeq = useRef(0);

  const step = view;

  // 단계가 바뀌면 화면 맨 위로
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  function toast(text: string, kind: Toast["kind"] = "info") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    // 바로 지우면 뚝 사라지므로, 먼저 사라지는 애니메이션(0.3초)을 돌리고 끝나면 지움
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 3700);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  function commitItems(next: Item[]) {
    itemsRef.current = next;
    setItems(next);
  }

  // ---------- 분석 (F-02, src/analysis) ----------

  async function runAnalysis(list: Item[], goNext = false) {
    if (list.length < 2) {
      resetResults(); // D-07: 1개가 되면 결과를 숨기고 [분석하기] 아래에 M-02
      return;
    }
    const seq = ++runSeq.current;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setAnalyzing(true);
    if (goNext) setOverlay("loading");
    // 분석은 금방 끝나지만, 눌렀을 때는 1초 동안 "분석 중"을 보여 줘서 무언가 했다는 느낌을 줌. 목록만 바뀐 다시 계산은 짧게
    await wait(goNext ? 1000 : 300);
    if (seq !== runSeq.current) return; // 그 사이 목록이 또 바뀜
    const result = analyze(
      list.map((x) => x.input),
      rules as Rules,
    );
    setSelected({}); // D-12: 다시 계산하면 직접 선택은 초기화
    setActiveGroup(null);
    setFocusId(null);
    setAnalysis(result);
    setAnalyzing(false);
    if (goNext) {
      setOverlay("done");
      await wait(900);
      if (seq !== runSeq.current) return;
      setOverlay(null);
      setView(2);
    }
  }

  function resetResults() {
    runSeq.current++;
    setOverlay(null);
    setView(1);
    setAnalysis(null);
    setAnalyzing(false);
    setSelected({});
    setFocusId(null);
    setShowRename(false);
    setBases({});
    setDrafts({});
    setScope("latest");
  }

  function updateItems(next: Item[]) {
    commitItems(next);
    // D-12: 분석 후에 파일을 더하거나 빼면 다시 계산
    if (analysis || analyzing) void runAnalysis(next);
  }

  // ---------- 업로드 (F-01, src/analysis/upload) ----------

  // zip은 브라우저에서 풀어 안의 파일을 대신 올림 (D-39). 안 파일의 20MB 한도·같은 파일 검사는 아래 acceptFiles가 그대로 함
  async function expandZips(files: File[]): Promise<File[]> {
    const out: File[] = [];
    for (const f of files) {
      if (!isZip(f.name)) {
        out.push(f);
        continue;
      }
      if (f.size > ZIP_MAX) {
        toast(MSG.M12(f.name), "warn");
        continue;
      }
      try {
        const r = unzipFiles(new Uint8Array(await f.arrayBuffer()));
        for (const name of r.tooLarge) toast(MSG.M03(name), "warn");
        if (r.skipped.length) toast(MSG.M09(f.name, r.skipped.length), "warn");
        if (!r.files.length && !r.tooLarge.length && !r.skipped.length) toast(MSG.M11(f.name), "warn");
        out.push(...r.files.map((x) => new File([x.bytes as Uint8Array<ArrayBuffer>], x.name, { lastModified: x.lastModified })));
      } catch {
        toast(MSG.M10(f.name), "warn");
      }
    }
    return out;
  }

  async function addFiles(picked: File[]) {
    const files = await expandZips(picked);
    const current = itemsRef.current;
    const { accepted, same, tooLarge } = acceptFiles(
      current.map((x) => x.file),
      files,
    );
    for (const f of tooLarge) toast(MSG.M03(f.name), "warn");
    if (same.length) toast(MSG.M04, "warn");
    if (!accepted.length) return;
    // 한 번에 올린 파일은 같은 batch (D-04: 중복 배지를 어느 쪽에 붙일지 정할 때 씀)
    const inputs = await toInputFiles(accepted, current.length, ++batchRef.current);
    const added = inputs.map((input, i) => ({ input, file: accepted[i], meta: readDocMeta(input.name, input.bytes!) }));
    updateItems([...itemsRef.current, ...added]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files: File[] = [];
    let hadFolder = false;
    const dtItems = Array.from(e.dataTransfer.items ?? []);
    if (dtItems.length) {
      for (const item of dtItems) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          hadFolder = true;
          continue;
        }
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    } else {
      files.push(...Array.from(e.dataTransfer.files));
    }
    if (hadFolder) toast(MSG.M07, "warn");
    if (files.length) void addFiles(files);
  }

  // [체험하기]: public/samples/demo 파일을 manifest 날짜로 불러옴 (D-14, D-36)
  async function onLoadSamples() {
    if (itemsRef.current.length > 0 && !window.confirm("지금 목록을 비우고 예시 파일로 바꿀까요?")) return;
    try {
      const files = await loadSamples();
      resetResults();
      commitItems([]);
      await addFiles(files);
    } catch (err) {
      toast(err instanceof Error ? err.message : "예시 파일을 불러오지 못했어요", "warn");
    }
  }

  // 빼는 행에 사라지는 애니메이션을 먼저 돌리고, 끝나면 실제로 목록에서 뺌 (동작 줄이기 설정이면 바로)
  function leaveThen(ids: string[], done: () => void) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    setLeaving((s) => new Set([...s, ...ids]));
    window.setTimeout(() => {
      done();
      setLeaving((s) => new Set([...s].filter((x) => !ids.includes(x))));
    }, 260);
  }

  function removeOne(id: string) {
    // 애니메이션 동안 다른 파일이 더해지거나 빠질 수 있어 지금 목록(itemsRef)에서 뺌
    leaveThen([id], () => updateItems(itemsRef.current.filter((x) => x.input.id !== id)));
  }

  function clearAll() {
    leaveThen(
      itemsRef.current.map((x) => x.input.id),
      () => {
        commitItems([]);
        resetResults();
      },
    );
  }

  const sortedItems = (() => {
    if (!sort) return items;
    const dir = sort.asc ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sort.key === "name") return a.file.name.localeCompare(b.file.name, "ko") * dir;
      const num = (x: Item) =>
        sort.key === "date" ? x.file.lastModified : sort.key === "size" ? x.file.size : (x.meta[sort.key as keyof DocMeta] ?? 0);
      return (num(a) - num(b)) * dir;
    });
  })();

  function toggleSort(key: SortKey) {
    setSort((s) => (s?.key === key ? { key, asc: !s.asc } : { key, asc: true }));
  }

  function ariaSort(key: SortKey) {
    if (sort?.key !== key) return "none" as const;
    return sort.asc ? ("ascending" as const) : ("descending" as const);
  }

  // 열 제목: 누르면 정렬. title은 마우스를 올리면 보이는 설명
  function sortTh(key: SortKey, label: string, className = "", title?: string) {
    return (
      <th aria-sort={ariaSort(key)} className={className}>
        <button type="button" className="th-btn" title={title} onClick={() => toggleSort(key)}>
          {label} <span aria-hidden>{sortMark(key)}</span>
        </button>
      </th>
    );
  }

  function sortMark(key: SortKey) {
    if (sort?.key !== key) return "↕";
    return sort.asc ? "▲" : "▼";
  }

  // ---------- 분석 결과 (S-03) ----------

  const nameById = new Map(items.map((x) => [x.input.id, x.file.name]));
  const metaById = new Map(items.map((x) => [x.input.id, x.meta]));
  // STEP 2 파일 행의 날짜 칸: 1단계 표와 같은 순서 (수정 날짜 · 만든 시각 · 저장 시각, D-30. 표시만 하고 순위에는 안 씀)
  // 칸이 좁아서 연도는 빼고, 마우스를 올리면 전체 날짜
  const dateCell = (ts: number | undefined, className = "") => (
    <span className={`file-cell ${className}`} title={ts ? formatDate(ts) : undefined}>
      {ts ? formatDate(ts).slice(5) : "—"}
    </span>
  );
  const dateCells = (id: string, lastModified: number) => (
    <>
      {dateCell(lastModified)}
      {dateCell(metaById.get(id)?.created, "col-meta")}
      {dateCell(metaById.get(id)?.saved, "col-meta")}
    </>
  );
  const gridHead = (
    <div className="file-grid-head">
      <span />
      <span>파일명</span>
      <span title="파일에 기록된 수정 날짜예요. 카톡으로 받은 파일은 받은 시각일 수 있어요">수정 날짜</span>
      <span className="col-meta" title="문서 안에 기록된 처음 만든 시각이에요 (docx·pptx·xlsx만 있어요)">만든 시각</span>
      <span className="col-meta" title="문서 안에 기록된 마지막 저장 시각이에요 (docx·pptx·xlsx만 있어요)">저장 시각</span>
      <span />
    </div>
  );

  // 왼쪽에 보여 줄 그룹: 고른 칩, 없으면 첫 그룹 (그룹이 없으면 단독 파일)
  const activeKey =
    analysis && (analysis.groups.some((g) => g.key === activeGroup) || (activeGroup === SINGLES && analysis.singles.length))
      ? activeGroup
      : (analysis?.groups[0]?.key ?? (analysis?.singles.length ? SINGLES : null));
  const activeG = analysis?.groups.find((g) => g.key === activeKey);
  const reasonRef = useSmoothHeight<HTMLDivElement>(); // 추천 이유 상자 높이가 바뀌면 아래 목록도 부드럽게 밀리게

  // 칩을 누르면 그 그룹을 보여 주고, 오른쪽도 그 그룹의 최신 후보(단독이면 첫 파일)로
  function openGroup(key: string) {
    setActiveGroup(key);
    const g = analysis?.groups.find((x) => x.key === key);
    setFocusId(g ? (g.latestId ?? g.files[0].id) : (analysis?.singles[0]?.id ?? null));
  }

  // 오른쪽에 보여 줄 파일: 누른 파일, 없으면 첫 그룹의 최신 후보
  const resultFiles = analysis ? [...analysis.groups.flatMap((g) => g.files), ...analysis.singles] : [];
  const focusResult =
    resultFiles.find((f) => f.id === focusId) ??
    resultFiles.find((f) => f.id === analysis?.groups[0]?.latestId) ??
    resultFiles[0];
  const focusItem = items.find((x) => x.input.id === focusResult?.id);

  // 파일 행: 누르면 오른쪽에 그 파일을 보여 줌. 폰·태블릿은 오른쪽 칸이 없어서 팝업으로 연다
  // hasRadio: 라디오가 있으면 키보드는 라디오로 오가고(onFocus), 없으면 행 자체가 버튼
  function rowProps(id: string, hasRadio: boolean) {
    const show = (fromRadio: boolean) => {
      setFocusId(id);
      if (!fromRadio && window.matchMedia("(max-width: 860px)").matches) setPreviewId(id);
    };
    return {
      onClick: (e: React.MouseEvent) => show((e.target as HTMLElement).tagName === "INPUT"),
      ...(hasRadio
        ? {}
        : {
            role: "button",
            tabIndex: 0,
            "aria-label": `${nameById.get(id) ?? "파일"} 정보 보기`,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                show(false);
              }
            },
          }),
    };
  }

  function badgesFor(g: Group, f: FileResult): Badge[] {
    if (f.duplicateOf) return ["중복"];
    const list: Badge[] = [];
    if (f.id === g.latestId) list.push("최신 후보");
    // 1위 동점: 1위와 모든 기준이 같은 파일에 "확인 필요" (고르기 전까지)
    if (g.status === "확인 필요" && !selected[g.key] && decidingCriterion(g.files[0], f) === null) list.push("확인 필요");
    if (selected[g.key] === f.id && f.id !== g.latestId) list.push("직접 선택");
    return list;
  }

  function choose(g: Group, id: string) {
    setSelected((s) => ({ ...s, [g.key]: id === g.latestId ? undefined : id }));
  }

  function goRename() {
    if (!analysis) return;
    // D-08: "확인 필요" 그룹을 모두 고를 때까지 STEP 3으로 못 감
    const unresolved = analysis.groups.filter((g) => g.status === "확인 필요" && !selected[g.key]);
    if (unresolved.length > 0) {
      toast(MSG.M05(unresolved.length), "warn");
      openGroup(unresolved[0].key); // 칩으로 나뉘어 안 보일 수 있으니 고를 그룹을 바로 보여 줌
      return;
    }
    setShowRename(true);
    setView(3);
  }

  // ---------- 이름 변경·내려받기 (S-04, src/analysis/rename·zip) ----------

  const choices = Object.fromEntries(Object.entries(selected).filter(([, v]) => v)) as Record<string, string>;
  const baseNames = Object.fromEntries(Object.entries(bases).filter(([, v]) => v)) as Record<string, string>;
  const rows: RenameRow[] = analysis ? rename(analysis, { scope, choices, baseNames, ...nameFmt }) : [];
  const included = rows.filter((r) => r.download && r.to);
  const sizeById = new Map(items.map((x) => [x.input.id, x.input.size]));

  function onBaseChange(g: Group, value: string) {
    setDrafts((d) => ({ ...d, [g.key]: value }));
    if (value.trim()) setBases((b) => ({ ...b, [g.key]: value.trim() }));
  }

  function onBaseBlur(g: Group) {
    const draft = drafts[g.key];
    if (draft !== undefined && !draft.trim()) {
      toast(MSG.M06, "warn"); // 비우면 안내 후 이전 이름으로 되돌림
      setDrafts((d) => ({ ...d, [g.key]: undefined }));
    }
  }

  function download() {
    const sources = new Map(items.map((x) => [x.input.id, { bytes: x.input.bytes!, lastModified: x.input.lastModified }]));
    const result = makeDownload(rows, sources);
    if (!result) return;
    saveBlob(new Blob([result.data as BlobPart]), result.filename);
    // M-08 알림은 띄우지 않고 버튼의 "다운로드를 요청했어요!"로 대신함 (D-46)
    // 버튼도 잠깐 초록으로 "다운로드를 요청했어요!" (브라우저가 실제로 저장을 마쳤는지는 알 수 없어서 "요청"으로 씀)
    setDlSent(true);
    window.clearTimeout(dlTimer.current);
    dlTimer.current = window.setTimeout(() => setDlSent(false), 2500);
  }

  // ---------- 화면 ----------

  // 한 번 가 본 단계만 눌러서 이동할 수 있다
  const steps: { n: 1 | 2 | 3; label: string; visible: boolean }[] = [
    { n: 1, label: "파일 업로드", visible: true },
    { n: 2, label: "파일 분석", visible: !!analysis && !analyzing },
    { n: 3, label: "이름 변경", visible: !!analysis && !analyzing && showRename },
  ];

  return (
    <div className="app">
      {/* S-01 상단 헤더 */}
      <header className="header">
        {/* 서비스 이름 "진짜최종.zip" (D-49): 팀플 파일 이름 습관을 그대로 이름으로. ".zip"만 파랑, 아래 한 줄 설명 */}
        <h1 className="brand-title">
          {/* 로고를 누르면 첫 화면(소개)으로. 올린 파일이 있으면 목록이 사라지므로 먼저 묻는다 */}
          <Link
            href="/"
            className="brand-link"
            aria-label="진짜최종.zip, 소개 화면으로"
            title="소개 화면으로"
            onClick={(e) => {
              if (items.length > 0 && !window.confirm("소개 화면으로 가면 올린 파일 목록이 사라져요. 이동할까요?"))
                e.preventDefault();
            }}
          >
            <Logo size={38} />
            <span className="brand-text">
              <span className="wordmark" aria-hidden>
                <TypingName />
              </span>
              <span className="brand-tagline">비슷한 파일을 올리면 최신 버전을 찾아 이름을 정리해 드려요</span>
            </span>
          </Link>
        </h1>
        <nav className="stepper" aria-label="진행 단계" inert={busy}>
          {steps.map((s) => {
            const state = step === s.n ? "current" : s.n < step ? "done" : "todo";
            return (
              <button
                key={s.n}
                type="button"
                className={`stepper-item ${state}`}
                aria-current={step === s.n ? "step" : undefined}
                disabled={!s.visible}
                onClick={() => setView(s.n)}
              >
                <span className="stepper-num" aria-hidden>
                  {state === "done" ? "✓" : s.n}
                </span>
                <span className="stepper-label">{s.label}</span>
              </button>
            );
          })}
        </nav>
        <TrustNote className="trust-top" />
      </header>

      {/* S-02 STEP 1 파일 업로드 */}
      {view === 1 && (
      <section className="panel" data-dir={dirRef.current} aria-labelledby="s02-title" inert={busy}>
        <SectionHead
          id="s02-title"
          title="파일 업로드"
          desc="같은 과제의 여러 버전을 한꺼번에 올려 주세요. 올린 파일은 이 브라우저 밖으로 나가지 않아요."
        />

        {/* 왼쪽 = 파일 목록, 오른쪽 = 업로드 영역 (폰에서는 업로드 영역이 위) */}
        {/* 파일이 없으면 업로드 영역이 폭 전체, 파일이 생기면 왼쪽에 목록이 펼쳐짐 */}
        <div className={`upload-grid ${items.length === 0 ? "is-empty" : ""}`}>
        <div className="upload-list">
          {items.length > 0 && (
            <>
              <div className="table-head">
                <span className="count">
                  파일 <Swap k={items.length}>{items.length}</Swap>개
                </span>
                <button type="button" className="btn small danger" onClick={clearAll}>
                  모두 지우기
                </button>
              </div>
              <Scrollable className="table-wrap">
                <table className="files">
                  <thead>
                    <tr>
                      {sortTh("name", "파일명")}
                      {sortTh("date", "수정 날짜", "col-date", "파일에 기록된 수정 날짜예요. 카톡으로 받은 파일은 받은 시각일 수 있어요")}
                      {sortTh("created", "만든 시각", "col-meta", "문서 안에 기록된 처음 만든 시각이에요 (docx·pptx·xlsx만 있어요)")}
                      {sortTh("saved", "저장 시각", "col-meta", "문서 안에 기록된 마지막 저장 시각이에요 (docx·pptx·xlsx만 있어요)")}
                      {sortTh("size", "크기", "col-size")}
                      <th className="col-remove">
                        <span className="sr-only">빼기</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((x, i) => (
                      <tr key={x.input.id} style={stagger(i)} className={leaving.has(x.input.id) ? "is-leaving" : undefined}>
                        <td className="name">
                          <span className="name-cell">
                            <FileTypeIcon name={x.file.name} />
                            <span className="name-text" title={x.file.name}>
                              {x.file.name}
                            </span>
                          </span>
                        </td>
                        <td className="nowrap col-date">{formatDate(x.file.lastModified)}</td>
                        <td className="nowrap col-meta">{x.meta.created ? formatDate(x.meta.created) : "—"}</td>
                        <td className="nowrap col-meta">{x.meta.saved ? formatDate(x.meta.saved) : "—"}</td>
                        <td className="nowrap col-size">{formatSize(x.file.size)}</td>
                        <td className="col-remove">
                          <button
                            type="button"
                            className="remove"
                            aria-label={`${x.file.name} 빼기`}
                            onClick={() => removeOne(x.input.id)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scrollable>
            </>
          )}
        </div>

        <div className="upload-side">
        <div
          className={`dropzone ${dragOver ? "drag" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
          }}
          onDrop={onDrop}
        >
          {/* 여러 형식을 올릴 수 있다는 걸 보여 주는 부채꼴 종이들. 가운데가 맨 위 */}
          <span className="drop-fan" aria-hidden>
            {DROP_FAN.map((ext, n) => {
              const i = n - (DROP_FAN.length - 1) / 2;
              return (
                <span key={ext} className="fan-slot" style={{ "--i": i, zIndex: 10 - Math.abs(i) } as React.CSSProperties}>
                  <span className="fan-card">
                    <FileTypeIcon name={`a.${ext}`} />
                  </span>
                </span>
              );
            })}
          </span>
          <span className="drop-text">
            <Swap k={items.length === 0 ? "empty" : "more"}>
              {items.length === 0 ? MSG.M01 : "더 올리려면 여기에 끌어다 놓거나 눌러 주세요"}
            </Swap>
          </span>
          <span className="drop-sub">여러 파일이나 zip도 한 번에 올릴 수 있어요 · 파일 하나에 20MB까지</span>
        </div>
        </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

      </section>
      )}

      {/* S-03 STEP 2 분석 결과 */}
      {view === 2 && analysis && (
        <section className="panel" data-dir={dirRef.current} aria-labelledby="s03-title">
          <SectionHead
            id="s03-title"
            title="분석 결과"
            desc="추천은 후보예요. 실제 최신 파일이 다르면 직접 골라 주세요."
            aside={
              <dl className="stats" aria-label="분석 요약">
                <div className="stat">
                  <dt>그룹</dt>
                  <dd>
                    <CountUp value={analysis.groups.length} />
                    <small>개</small>
                  </dd>
                </div>
                <div className="stat">
                  <dt>단독</dt>
                  <dd>
                    <CountUp value={analysis.singles.length} />
                    <small>개</small>
                  </dd>
                </div>
                <div className="stat">
                  <dt>중복</dt>
                  <dd>
                    <CountUp value={analysis.duplicates} />
                    <small>개</small>
                  </dd>
                </div>
              </dl>
            }
          />

          {/* 왼쪽: 그룹별 파일 목록 (모두 펼침, D-32). 오른쪽: 누른 파일의 정보와 미리보기 */}
          <div className="result-grid">
          <div className="result-list">
          <ChipScroller label="그룹 고르기" active={activeKey}>
            {analysis.groups.map((g) => {
              const needs = g.status === "확인 필요" && !selected[g.key];
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`chip ${g.key === activeKey ? "is-active" : ""}`}
                  data-ext={g.ext.toLowerCase()} // 고르면 그 형식의 대표 색으로 채움 (globals.css)
                  aria-pressed={g.key === activeKey}
                  onClick={() => openGroup(g.key)}
                >
                  {needs && <span className="chip-dot" title="확인 필요" aria-label="확인 필요" />}
                  <span>
                    {g.baseName}
                    {g.ext && <span className="chip-ext">.{g.ext}</span>}
                  </span>
                  <span className="chip-count">
                    <Swap k={g.files.length}>{g.files.length}</Swap>
                  </span>
                </button>
              );
            })}
            {analysis.singles.length > 0 && (
              <button
                type="button"
                className={`chip ${activeKey === SINGLES ? "is-active" : ""}`}
                aria-pressed={activeKey === SINGLES}
                onClick={() => openGroup(SINGLES)}
              >
                단독 파일
                <span className="chip-count">
                  <Swap k={analysis.singles.length}>{analysis.singles.length}</Swap>
                </span>
              </button>
            )}
          </ChipScroller>
          {/* 추천 이유는 칩과 목록 사이에 (카드 아래에 두면 파일이 많을 때 스크롤해야 보임) */}
          {activeG && (() => {
            // 추천과 다른 파일을 고르면 추천 이유 자리를 "직접 골랐어요"로 바꿔 씀 (D-44).
            // choose()가 추천 파일을 다시 고르면 선택을 지우므로, 선택이 있으면 곧 추천과 다르다는 뜻
            const pickedName = activeG.files.find((f) => f.id === selected[activeG.key])?.name;
            const latestName = activeG.files.find((f) => f.id === activeG.latestId)?.name;
            const own = !!pickedName;
            return (
              // 색은 배지와 같게: 직접 선택 파랑, 확인 필요 노랑, 최신 후보 초록
              <div ref={reasonRef} className={`reason-bar ${own ? "is-chosen" : activeG.status === "확인 필요" ? "is-check" : ""}`} key={activeG.key}>
                <span className="reason-icon" aria-hidden>
                  {own ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18h6" />
                      <path d="M10 21h4" />
                      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
                    </svg>
                  )}
                </span>
                <div className="reason-body">
                  <span className="reason-label">{own ? "직접 선택" : "추천 이유"}</span>
                  {/* key: 추천 ↔ 직접 선택, 직접 고른 파일끼리 바꿀 때도 새로 그려서 나타나는 애니메이션이 돎 */}
                  {own ? (
                    <div className="reason-content" key={`own-${selected[activeG.key]}`}>
                      <p className="reason-text">&apos;{keepTogether(pickedName!)}&apos; 파일을 직접 골랐어요.</p>
                      <p className="reason-detail">
                        {latestName
                          ? `추천은 '${keepTogether(latestName)}' 파일이었지만, 고른 파일을 최신으로 보고 가장 큰 번호를 붙여요.`
                          : "단서로는 고를 수 없던 그룹이라, 고른 파일을 최신으로 보고 가장 큰 번호를 붙여요."}
                      </p>
                    </div>
                  ) : (
                    <div className="reason-content" key="rec">
                      {/* 문구 틀(CLAUDE.md)에는 마침표가 없어서 화면에서만 붙임. 아래 자세한 설명과 문장 모양을 맞춤 */}
                      <p className="reason-text">{activeG.reason}.</p>
                      <p className="reason-detail">{reasonDetail(activeG)}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <Scrollable className="panel-body" grow>
          {/* key: 칩을 바꾸면 카드를 새로 그려서 나타나는 애니메이션이 돎 */}
          <div className="cards" key={activeKey ?? ""}>
            {analysis.groups.filter((g) => g.key === activeKey).map((g, gi) => (
              <div className="card" key={g.key} style={stagger(gi)}>
                <div className="card-head">
                  <FileTypeIcon name={g.files[0].name} />
                  <h3>
                    {g.baseName}
                    {g.ext && <span className="ext">.{g.ext}</span>}
                  </h3>
                  <span className="card-count">{g.files.length}개</span>
                </div>
                <fieldset>
                  <legend className="sr-only">{g.baseName} 그룹의 최신 파일 고르기</legend>
                  <div className="file-grid">
                  {gridHead}
                  {g.files.map((f) => {
                    const checked = !f.duplicateOf && (selected[g.key] ?? g.latestId) === f.id;
                    return (
                      <div
                        className={`file-row ${f.duplicateOf ? "is-dup" : ""} ${f.id === focusResult?.id ? "is-focused" : ""}`}
                        key={f.id}
                        {...rowProps(f.id, !f.duplicateOf)}
                      >
                        <input
                          type="radio"
                          name={`latest-${g.key}`}
                          aria-label={`${f.name}을 최신 파일로 고르기`}
                          checked={checked}
                          disabled={!!f.duplicateOf}
                          onChange={() => choose(g, f.id)}
                          onFocus={() => setFocusId(f.id)}
                        />
                        <span className="file-main">
                          <SlideText className="file-name" text={f.name} />
                          {f.duplicateOf && (
                            <span className="dup-note">&apos;{nameById.get(f.duplicateOf) ?? "다른"}&apos; 파일과 내용이 같아요</span>
                          )}
                        </span>
                        {dateCells(f.id, f.lastModified)}
                        <span className="badges">
                          {badgesFor(g, f).map((b) => (
                            <BadgeLabel key={b} badge={b} />
                          ))}
                        </span>
                      </div>
                    );
                  })}
                  </div>
                </fieldset>
              </div>
            ))}

            {activeKey === SINGLES && (
              <div className="card singles">
                <div className="card-head">
                  <h3>단독 파일</h3>
                  <span className="card-count">{analysis.singles.length}개</span>
                </div>
                <p className="hint small">비슷한 이름의 파일이 없어서 그룹으로 묶지 않았어요</p>
                <div className="file-grid">
                {gridHead}
                {analysis.singles.map((f) => (
                  <div
                    className={`file-row ${f.duplicateOf ? "is-dup" : ""} ${f.id === focusResult?.id ? "is-focused" : ""}`}
                    key={f.id}
                    {...rowProps(f.id, false)}
                  >
                    <FileTypeIcon name={f.name} />
                    <span className="file-main">
                      <SlideText className="file-name" text={f.name} />
                      {f.duplicateOf && (
                        <span className="dup-note">&apos;{nameById.get(f.duplicateOf) ?? "다른"}&apos; 파일과 내용이 같아요</span>
                      )}
                    </span>
                    {dateCells(f.id, f.lastModified)}
                    <span className="badges">{f.duplicateOf && <BadgeLabel badge="중복" />}</span>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
          </Scrollable>
          </div>

          {/* 860px 이하에서는 아예 그리지 않음: 숨긴(display:none) 칸에서 미리보기를 다시 그리면
              브라우저가 페이지를 맨 위로 올려 버림. 폰은 행을 누르면 팝업으로 봄 */}
          {!narrow && (
          <aside className="file-detail" aria-label="파일 정보">
            {focusResult && focusItem && (
              <div className="detail-inner" key={focusResult.id}>
                <div className="detail-head">
                  <FileTypeIcon name={focusResult.name} />
                  <h3 className="detail-title">{focusResult.name}</h3>
                  <span className="detail-meta">
                    {formatSize(focusResult.size)} · {formatDate(focusResult.lastModified)}
                  </span>
                </div>
                <div className="detail-preview">
                  <PreviewBody file={focusItem.file} />
                </div>
              </div>
            )}
          </aside>
          )}
          </div>

        </section>
      )}

      {/* S-04 STEP 3 이름 변경·내려받기 */}
      {view === 3 && analysis && showRename && (
        <section className="panel" data-dir={dirRef.current} aria-labelledby="s04-title">
          <SectionHead
            id="s04-title"
            title="이름 변경"
            desc="번호는 오래된 버전부터 v01, v02…로 붙여요. 이름 모양의 칸은 끌어서 순서를 바꾸고, 기본 이름은 눌러서 고칠 수 있어요."
          />

          {/* 왼쪽: 이름 모양 + 한 줄에 그룹 하나 (기본 이름 → 받을 파일, D-40·D-42). 오른쪽: 실제로 받을 파일 미리보기 (D-41) */}
          <div className="result-grid">
          <div className="result-list">
          <PatternEditor
            value={nameFmt}
            onChange={setNameFmt}
            maxVersions={Math.max(0, ...analysis.groups.map((g) => g.files.filter((f) => !f.duplicateOf).length))}
          />
          <div className="rename-head" aria-hidden>
            <span>기본 이름</span>
            <span>새 이름</span>
            <span>원래 이름</span>
          </div>
          <Scrollable className="panel-body" grow>
          <ul className="rename-list">
            {analysis.groups.map((g, gi) => {
              const value = drafts[g.key] ?? bases[g.key] ?? g.baseName;
              const empty = !value.trim();
              const mine = rows.filter((r) => g.files.some((f) => f.id === r.id));
              const pickId = selected[g.key] ?? g.latestId;
              const main = mine.find((r) => r.id === pickId);
              const older = mine.filter((r) => r.id !== pickId && !r.duplicate && r.to).length; // 이전 버전 수 (범위와 상관없이)
              const dups = mine.filter((r) => r.duplicate).length;
              return (
                <li className="rename-line" key={g.key} style={stagger(gi)}>
                  <FileTypeIcon name={g.files[0].name} />
                  {editingKey === g.key ? (
                    <input
                      type="text"
                      className="base-input"
                      aria-label={`${g.baseName} 그룹의 기본 이름`}
                      value={value}
                      aria-invalid={empty}
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => onBaseChange(g, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          onBaseChange(g, editStartRef.current);
                          editStartRef.current = ESCAPED;
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={() => {
                        // Esc로 되돌린 직후엔 빈칸 검사를 건너뜀 (아직 지운 값이 state에 남아 있어서 M-06이 잘못 뜸)
                        if (editStartRef.current !== ESCAPED) onBaseBlur(g);
                        setEditingKey(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="base-name"
                      aria-label={`기본 이름 '${value}' 고치기`}
                      onClick={() => {
                        editStartRef.current = value;
                        setEditingKey(g.key);
                      }}
                    >
                      {/* key로 바뀔 때 새로 그림 (Swap으로 감싸면 inline-block이라 긴 이름의 …가 안 붙음) */}
                      <span className="base-name-text swap" key={value}>
                        {value}
                      </span>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>
                  )}
                  <span className="rename-arrow" aria-hidden>
                    →
                  </span>
                  {/* 새 이름이 바뀌면 떠오르며 바뀜. 기본 이름을 치는 동안은 글자마다 출렁이지 않게 다시 그리지 않음 */}
                  <SlideText
                    key={editingKey === g.key ? "editing" : (main?.to ?? "")}
                    className="rename-to swap"
                    text={main?.to ?? "—"}
                  />
                  <span className="rename-sub">
                    <span className="rename-from swap" title={main?.from} key={main?.from}>
                      <span className="sub-label">원래 이름 </span>
                      {main?.from}
                    </span>
                    {/* 이전 버전·중복은 작은 알약으로. 문장은 마우스를 올리면(title)·화면 낭독기(aria-label)로.
                        이전 버전 알약은 늘 그려 두고 "이전 버전도 함께 받기"를 켜고 끌 때 펼쳐지고 접히게 */}
                    {older > 0 && (
                      <span
                        className={`rename-note reveal ${scope === "all" ? "is-shown" : ""}`}
                        aria-hidden={scope !== "all"}
                        title={`이전 버전 ${older}개도 함께 받아요`}
                      >
                        <span aria-label={`이전 버전 ${older}개도 함께 받아요`}>이전 {older}개</span>
                      </span>
                    )}
                    {dups > 0 && (
                      <span className="rename-note is-dup" title={`중복 ${dups}개는 빼요`}>
                        <span aria-label={`중복 ${dups}개는 빼요`}>중복 {dups}개 제외</span>
                      </span>
                    )}
                  </span>
                  {empty && <span className="field-error">{MSG.M06}</span>}
                </li>
              );
            })}
            {analysis.singles.map((f, i) => {
              const r = rows.find((x) => x.id === f.id);
              return (
                <li className="rename-line" key={f.id} style={stagger(analysis.groups.length + i)}>
                  <FileTypeIcon name={f.name} />
                  <span className="single-tag">단독 파일</span>
                  <span className="rename-arrow" aria-hidden>
                    →
                  </span>
                  <SlideText
                    key={r?.to ?? "off"}
                    className={`rename-to swap ${r?.to ? "" : "is-off"}`}
                    text={r?.to ?? "중복 파일이라 받지 않아요"}
                  />
                  <span className="rename-sub">
                    <span className="rename-from" title={f.name}>
                      <span className="sub-label">원래 이름 </span>
                      {f.name}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          </Scrollable>
          </div>

          <aside className="download-panel" aria-label="받을 파일">
            <h3 className="dl-title">받을 파일</h3>
            <div className="dl-summary">
              <FileTypeIcon name={included.length === 1 ? included[0].to! : "a.zip"} />
              <div className="dl-summary-text">
                {(() => {
                  const dlName = included.length === 0 ? "받을 파일이 없어요" : included.length === 1 ? included[0].to! : zipName();
                  const meta = `파일 ${included.length}개 · ${formatSize(included.reduce((s, r) => s + (sizeById.get(r.id) ?? 0), 0))}`;
                  return (
                    <>
                      <SlideText key={dlName} className="dl-name swap" text={dlName} />
                      <span className="dl-meta">
                        <Swap k={meta}>{meta}</Swap>
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
            {/* F-03-03 범위 선택: 꺼짐 = [최신 파일만](기본), 켜짐 = [전체 버전] (D-41) */}
            <label className="dl-check">
              <input type="checkbox" checked={scope === "all"} onChange={(e) => setScope(e.target.checked ? "all" : "latest")} />
              <span>
                이전 버전도 함께 받기
                <small>
                  <Swap k={scope}>{scope === "all" ? "v01부터 모든 버전을 순서대로 받아요" : "그룹마다 최신 파일만 받아요"}</Swap>
                </small>
              </span>
            </label>
            <ul className="dl-files" key={scope}>
              {included.map((r, i) => (
                <li key={r.id} style={stagger(i)}>
                  <FileTypeIcon name={r.to!} />
                  <SlideText key={r.to!} className="swap" text={r.to!} />
                </li>
              ))}
            </ul>
            <p className="hint small">원본은 그대로 두고, 새 이름을 붙인 사본만 내려받아요.</p>
          </aside>
          </div>
        </section>
      )}


      {/* 하단바: 단계마다 버튼을 화면 아래에 고정 */}
      <div className="bottom-bar" ref={barRef}>
        <TrustNote className="trust-bar" />
        {/* key: 단계가 바뀌면 버튼 묶음을 새로 그려서 나타나는 애니메이션이 돎 (앞으로·뒤로 모두) */}
        <div className="actions" key={view}>
          {view === 1 && (
            <>
              {m02.mounted && <p className={`hint warn ${m02.leaving ? "is-leaving" : "swap"}`}>{MSG.M02}</p>}
              <span className="spacer" />
              {/* [체험하기] = 예시 파일 불러오기 (F-01-03, D-36) */}
              <button type="button" className="btn" disabled={analyzing || busy} onClick={onLoadSamples}>
                체험하기
              </button>
              <button
                type="button"
                className={`btn primary ${overlay === "done" ? "is-done" : ""}`}
                disabled={items.length < 2 || analyzing || busy}
                aria-busy={analyzing}
                onClick={() => runAnalysis(items, true)}
              >
                <StableLabel
                  current={overlay === "done" ? 2 : analyzing ? 1 : 0}
                  states={[
                    <>
                      분석하기
                      <ArrowIcon />
                    </>,
                    <>
                      <span className="btn-spinner" aria-hidden />
                      분석 중...
                    </>,
                    <>
                      <CheckMark />
                      분석이 끝났어요!
                    </>,
                  ]}
                />
              </button>
            </>
          )}
          {view === 2 && analysis && (
            <>
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setView(1)}>
                이전
              </button>
              <button type="button" className="btn primary" onClick={goRename} disabled={analyzing}>
                <StableLabel
                  states={[
                    <>
                      이름 바꾸기
                      <ArrowIcon />
                    </>,
                  ]}
                />
              </button>
            </>
          )}
          {view === 3 && analysis && showRename && (
            <>
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setView(2)}>
                이전
              </button>
              {/* 개수는 오른쪽 "받을 파일"에 있으니 버튼은 아이콘만. 누르면 잠깐 초록 (D-46) */}
              <button
                type="button"
                className={`btn primary ${dlSent ? "is-sent" : ""}`}
                disabled={included.length === 0}
                onClick={download}
              >
                <StableLabel
                  current={dlSent ? 1 : 0}
                  states={[
                    <>
                      내려받기
                      <DownloadIcon />
                    </>,
                    <>
                      <CheckMark />
                      다운로드를 요청했어요!
                    </>,
                  ]}
                />
              </button>
            </>
          )}
        </div>
      </div>

      {previewFile && <FilePreview file={previewFile} onClose={closePreview} />}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind} ${t.leaving ? "is-leaving" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
