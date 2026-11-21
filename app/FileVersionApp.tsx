"use client";

// 한 페이지에서 업로드(S-02) → 분석(S-03) → 이름 변경·내려받기(S-04) 순서로 진행한다
// 파일은 서버로 보내지 않고 브라우저 안에서만 다룬다. 원본은 바꾸지 않고 새 이름의 사본만 내려받는다

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import FilePreview from "./FilePreview";
import Logo from "./Logo";
// 분석 로직은 src/analysis (화면 코드 없음, /check-result와 같은 함수). 규칙은 rules/version-rules.json
import rules from "@/rules/version-rules.json";
import type { Rules } from "@/src/analysis/baseName.ts";
import { analyze, decidingCriterion, type Analysis, type FileResult, type Group } from "@/src/analysis/analyze.ts";
import { rename, type RenameRow, type Scope } from "@/src/analysis/rename.ts";
import { acceptFiles, loadSamples, toInputFiles } from "@/src/analysis/upload.ts";
import { makeDownload } from "@/src/analysis/zip.ts";
import type { InputFile } from "@/src/analysis/types.ts";

type Badge = "최신 후보" | "확인 필요" | "중복" | "직접 선택";
type Item = { input: InputFile; file: File }; // 분석 입력 + 원본 File (미리보기용)

// 안내 메시지 (명세서 4-5, 문구 그대로)
const MSG = {
  M01: "파일을 여기에 끌어다 놓거나 [파일 선택]을 눌러 주세요",
  M02: "비교하려면 파일이 2개 이상 필요해요",
  M03: (name: string) => `'${name}'은 20MB가 넘어서 빼고 올렸어요`,
  M04: "이미 올린 파일이에요",
  M05: (n: number) => `최신 파일을 골라야 하는 그룹이 ${n}개 있어요`,
  M06: "기본 이름은 비워 둘 수 없어요",
  M07: "파일만 올릴 수 있어요",
  M08: (n: number) => `파일 ${n}개를 내려받았어요`,
};

type SortKey = "name" | "date" | "size";
type Toast = { id: number; text: string; kind: "info" | "warn" | "done" };

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

/** 파일 행의 [열기] 버튼. 행 전체가 라디오 label이라 눌러도 최신 파일 선택이 바뀌지 않게 막는다 */
function OpenButton({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="open-btn"
      aria-label={`${name} 열기`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      열기
    </button>
  );
}

export default function FileVersionApp() {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const batchRef = useRef(0);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // 그룹 key → 사용자가 직접 고른 최신 파일 id (F-02-05)
  const [selected, setSelected] = useState<Record<string, string | undefined>>({});
  // 파일이 4개 이상인 그룹 카드를 펼쳤는지
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [showRename, setShowRename] = useState(false);
  const [bases, setBases] = useState<Record<string, string | undefined>>({});
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({});
  const [scope, setScope] = useState<Scope>("latest");

  const [toasts, setToasts] = useState<Toast[]>([]);

  // 분석 화면에서 열어 보는 파일
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewFile = previewId ? (items.find((x) => x.input.id === previewId)?.file ?? null) : null;
  const closePreview = useCallback(() => setPreviewId(null), []);

  // 지금 보고 있는 단계. 한 화면에 한 단계만 보여준다
  const [view, setView] = useState<1 | 2 | 3>(1);

  const inputRef = useRef<HTMLInputElement>(null);
  const runSeq = useRef(0);

  const step = view;

  // 단계가 바뀌면 화면 맨 위로
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  function toast(text: string, kind: Toast["kind"] = "info") {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
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
    setAnalyzing(true);
    await new Promise((r) => setTimeout(r, 300)); // "분석 중..." 상태가 잠깐 보이게
    if (seq !== runSeq.current) return; // 그 사이 목록이 또 바뀜
    const result = analyze(
      list.map((x) => x.input),
      rules as Rules,
    );
    setSelected({}); // D-12: 다시 계산하면 직접 선택은 초기화
    setExpanded({});
    setAnalysis(result);
    setAnalyzing(false);
    if (goNext) setView(2);
  }

  function resetResults() {
    runSeq.current++;
    setView(1);
    setAnalysis(null);
    setAnalyzing(false);
    setSelected({});
    setExpanded({});
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

  async function addFiles(files: File[]) {
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
    const added = inputs.map((input, i) => ({ input, file: accepted[i] }));
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

  // [예시 파일로 해보기]: public/samples/demo 파일을 manifest 날짜로 불러옴 (D-14)
  async function onLoadSamples() {
    if (itemsRef.current.length > 0 && !window.confirm("지금 올린 파일 목록을 비우고 예시 파일을 넣을까요?")) return;
    try {
      const files = await loadSamples();
      resetResults();
      commitItems([]);
      await addFiles(files);
    } catch (err) {
      toast(err instanceof Error ? err.message : "예시 파일을 불러오지 못했어요", "warn");
    }
  }

  function removeOne(id: string) {
    updateItems(items.filter((x) => x.input.id !== id));
  }

  function clearAll() {
    commitItems([]);
    resetResults();
  }

  function restart() {
    clearAll();
    setSort(null);
  }

  const sortedItems = (() => {
    if (!sort) return items;
    const dir = sort.asc ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sort.key === "name") return a.file.name.localeCompare(b.file.name, "ko") * dir;
      if (sort.key === "date") return (a.file.lastModified - b.file.lastModified) * dir;
      return (a.file.size - b.file.size) * dir;
    });
  })();

  function toggleSort(key: SortKey) {
    setSort((s) => (s?.key === key ? { key, asc: !s.asc } : { key, asc: true }));
  }

  function ariaSort(key: SortKey) {
    if (sort?.key !== key) return "none" as const;
    return sort.asc ? ("ascending" as const) : ("descending" as const);
  }

  function sortMark(key: SortKey) {
    if (sort?.key !== key) return "↕";
    return sort.asc ? "▲" : "▼";
  }

  // ---------- 분석 결과 (S-03) ----------

  const nameById = new Map(items.map((x) => [x.input.id, x.file.name]));

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
    const unresolved = analysis.groups.filter((g) => g.status === "확인 필요" && !selected[g.key]).length;
    if (unresolved > 0) {
      toast(MSG.M05(unresolved), "warn");
      return;
    }
    setShowRename(true);
    setView(3);
  }

  // ---------- 이름 변경·내려받기 (S-04, src/analysis/rename·zip) ----------

  const choices = Object.fromEntries(Object.entries(selected).filter(([, v]) => v)) as Record<string, string>;
  const baseNames = Object.fromEntries(Object.entries(bases).filter(([, v]) => v)) as Record<string, string>;
  const rows: RenameRow[] = analysis ? rename(analysis, { scope, choices, baseNames }) : [];
  const included = rows.filter((r) => r.download && r.to);

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
    toast(MSG.M08(result.count), "done");
  }

  // ---------- 화면 ----------

  // 한 번 가 본 단계만 눌러서 이동할 수 있다
  const steps: { n: 1 | 2 | 3; label: string; visible: boolean }[] = [
    { n: 1, label: "업로드", visible: true },
    { n: 2, label: "분석", visible: !!analysis && !analyzing },
    { n: 3, label: "이름 변경", visible: !!analysis && !analyzing && showRename },
  ];

  return (
    <div className="app">
      {/* S-01 상단 헤더 */}
      <header className="header">
        <h1 className="brand-title" aria-label="Filefit 파일핏">
          <Logo size={38} />
          <span className="wordmark" aria-hidden>
            File<span className="wordmark-fit">fit</span>
          </span>
        </h1>
        <nav className="stepper" aria-label="진행 단계">
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
        <p className="trust">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          파일은 서버로 올라가지 않고 내 브라우저 안에서만 처리돼요
        </p>
      </header>

      {/* S-02 STEP 1 파일 업로드 */}
      {view === 1 && (
      <section className="panel" aria-labelledby="s02-title">
        <SectionHead
          id="s02-title"
          title="파일 업로드"
          desc="같은 과제의 여러 버전 파일을 한 번에 올려 주세요. 파일은 이 브라우저 밖으로 나가지 않아요."
        />

        {/* 왼쪽 = 파일 목록, 오른쪽 = 업로드 영역 (폰에서는 업로드 영역이 위) */}
        <div className="upload-grid">
        <div className="upload-list">
          {items.length === 0 ? (
            <div className="list-empty">올린 파일이 여기에 표시돼요</div>
          ) : (
            <>
              <div className="table-head">
                <span className="count">파일 {items.length}개</span>
                <button type="button" className="btn small" onClick={clearAll}>
                  모두 지우기
                </button>
              </div>
              <div className="table-wrap">
                <table className="files">
                  <thead>
                    <tr>
                      <th aria-sort={ariaSort("name")}>
                        <button type="button" className="th-btn" onClick={() => toggleSort("name")}>
                          파일명 <span aria-hidden>{sortMark("name")}</span>
                        </button>
                      </th>
                      <th aria-sort={ariaSort("date")}>
                        <button type="button" className="th-btn" onClick={() => toggleSort("date")}>
                          수정 날짜 <span aria-hidden>{sortMark("date")}</span>
                        </button>
                      </th>
                      <th aria-sort={ariaSort("size")} className="col-size">
                        <button type="button" className="th-btn" onClick={() => toggleSort("size")}>
                          크기 <span aria-hidden>{sortMark("size")}</span>
                        </button>
                      </th>
                      <th className="col-remove">
                        <span className="sr-only">빼기</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((x) => (
                      <tr key={x.input.id}>
                        <td className="name">
                          <span className="name-cell">
                            <FileTypeIcon name={x.file.name} />
                            <span>{x.file.name}</span>
                          </span>
                        </td>
                        <td className="nowrap">{formatDate(x.file.lastModified)}</td>
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
              </div>
            </>
          )}
        </div>

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
          <span className="drop-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
          </span>
          <span className="drop-text">
            {items.length === 0 ? MSG.M01 : "파일을 더 끌어다 놓거나 여기를 눌러 추가할 수 있어요"}
          </span>
          <span className="drop-sub">여러 파일을 한 번에 올릴 수 있어요 · 파일당 20MB까지</span>
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

        <div className="actions">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            파일 선택
          </button>
          <button type="button" className="btn" onClick={onLoadSamples}>
            예시 파일로 해보기
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn primary"
            disabled={items.length < 2 || analyzing}
            onClick={() => runAnalysis(items, true)}
          >
            {analyzing ? "분석 중..." : "분석하기"}
          </button>
          {analysis && !analyzing && (
            <button type="button" className="btn" onClick={() => setView(2)}>
              분석 결과 보기 →
            </button>
          )}
        </div>
        {items.length === 1 && <p className="hint warn">{MSG.M02}</p>}
      </section>
      )}

      {/* S-03 STEP 2 분석 결과 */}
      {view === 2 && analysis && (
        <section className="panel" aria-labelledby="s03-title">
          <SectionHead
            id="s03-title"
            title="분석 결과"
            desc="추천은 후보일 뿐이에요. 최신 파일이 다르면 직접 골라 주세요."
            aside={
              <dl className="stats" aria-label="분석 요약">
                <div className="stat">
                  <dt>그룹</dt>
                  <dd>
                    {analysis.groups.length}
                    <small>개</small>
                  </dd>
                </div>
                <div className="stat">
                  <dt>단독</dt>
                  <dd>
                    {analysis.singles.length}
                    <small>개</small>
                  </dd>
                </div>
                <div className="stat">
                  <dt>중복</dt>
                  <dd>
                    {analysis.duplicates}
                    <small>개</small>
                  </dd>
                </div>
              </dl>
            }
          />

          <div className="panel-body">
          <div className="cards">
            {analysis.groups.map((g) => {
              // 4개 이상이면 위 2개 + "… N개 더" (누르면 펼침)
              const collapsed = g.files.length >= 4 && !expanded[g.key];
              const shown = collapsed ? g.files.slice(0, 2) : g.files;
              return (
              <div className="card" key={g.key}>
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
                  {shown.map((f) => {
                    const checked = !f.duplicateOf && (selected[g.key] ?? g.latestId) === f.id;
                    return (
                      <label className={`file-row ${f.duplicateOf ? "is-dup" : ""}`} key={f.id}>
                        <input
                          type="radio"
                          name={`latest-${g.key}`}
                          checked={checked}
                          disabled={!!f.duplicateOf}
                          onChange={() => choose(g, f.id)}
                        />
                        <span className="file-main">
                          <span className="file-name">{f.name}</span>
                          <span className="file-date">{formatDate(f.lastModified)}</span>
                          {f.duplicateOf && (
                            <span className="dup-note">{nameById.get(f.duplicateOf) ?? "다른 파일"}와 내용이 같아요</span>
                          )}
                        </span>
                        <span className="badges">
                          {badgesFor(g, f).map((b) => (
                            <BadgeLabel key={b} badge={b} />
                          ))}
                        </span>
                        <OpenButton name={f.name} onOpen={() => setPreviewId(f.id)} />
                      </label>
                    );
                  })}
                </fieldset>
                {collapsed && (
                  <button
                    type="button"
                    className="more-btn"
                    onClick={() => setExpanded((e) => ({ ...e, [g.key]: true }))}
                  >
                    … {g.files.length - 2}개 더
                  </button>
                )}
                {g.reason && <p className="reason">추천 이유: {g.reason}</p>}
                {selected[g.key] && (
                  <p className="reason chosen">
                    직접 고른 최신 파일: {g.files.find((f) => f.id === selected[g.key])?.name}
                  </p>
                )}
              </div>
              );
            })}

            {analysis.singles.length > 0 && (
              <div className="card singles">
                <div className="card-head">
                  <h3>단독 파일</h3>
                  <span className="card-count">{analysis.singles.length}개</span>
                </div>
                <p className="hint small">비슷한 이름의 파일이 없어서 그룹으로 묶지 않았어요</p>
                {analysis.singles.map((f) => (
                  <div className={`file-row ${f.duplicateOf ? "is-dup" : ""}`} key={f.id}>
                    <FileTypeIcon name={f.name} />
                    <span className="file-main">
                      <span className="file-name">{f.name}</span>
                      <span className="file-date">{formatDate(f.lastModified)}</span>
                      {f.duplicateOf && (
                        <span className="dup-note">{nameById.get(f.duplicateOf) ?? "다른 파일"}와 내용이 같아요</span>
                      )}
                    </span>
                    <span className="badges">{f.duplicateOf && <BadgeLabel badge="중복" />}</span>
                    <OpenButton name={f.name} onOpen={() => setPreviewId(f.id)} />
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>

          <div className="actions">
            <button type="button" className="btn" onClick={() => setView(1)}>
              ← 이전: 파일 업로드
            </button>
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={goRename} disabled={analyzing}>
              다음: 이름 바꾸기
            </button>
          </div>
        </section>
      )}

      {/* S-04 STEP 3 이름 변경·내려받기 */}
      {view === 3 && analysis && showRename && (
        <section className="panel" aria-labelledby="s04-title">
          <SectionHead
            id="s04-title"
            title="이름 변경·내려받기"
            desc="새 이름 규칙은 기본이름_v번호_수정날짜예요. 그룹의 기본 이름은 직접 고칠 수 있어요."
          />

          <div className="panel-body">
          <div className="base-inputs">
            {analysis.groups.map((g) => {
              const value = drafts[g.key] ?? bases[g.key] ?? g.baseName;
              const empty = !value.trim();
              return (
                <label className="base-input" key={g.key}>
                  <span className="base-label">
                    그룹 · {g.files[0].name} 외 {g.files.length - 1}개
                  </span>
                  <input
                    type="text"
                    value={value}
                    aria-invalid={empty}
                    onChange={(e) => onBaseChange(g, e.target.value)}
                    onBlur={() => onBaseBlur(g)}
                  />
                  {empty && <span className="field-error">{MSG.M06}</span>}
                </label>
              );
            })}
          </div>

          <div className="table-wrap">
            <table className="preview">
              <thead>
                <tr>
                  <th>원래 이름</th>
                  <th aria-hidden />
                  <th>새 이름</th>
                  <th className="nowrap">내려받기</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const off = r.duplicate || !r.to;
                  const inc = r.download && !!r.to;
                  return (
                    <tr key={r.id} className={off ? "excluded" : inc ? "" : "skipped"}>
                      <td className="name">
                        <span className="name-cell">
                          <FileTypeIcon name={r.from} />
                          <span>{r.from}</span>
                        </span>
                      </td>
                      <td aria-hidden>→</td>
                      <td className="name">{r.duplicate ? "제외 (내용이 같은 중복 파일)" : (r.to ?? "—")}</td>
                      <td className="nowrap">
                        <span className={`status ${off ? "status-off" : inc ? "status-on" : "status-skip"}`}>
                          {off ? "제외" : inc ? "포함" : "안 받음"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>

          <div className="actions">
            <fieldset className="scope">
              <legend className="sr-only">내려받을 범위</legend>
              <label>
                <input type="radio" name="scope" checked={scope === "latest"} onChange={() => setScope("latest")} />
                최신 파일만
              </label>
              <label>
                <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
                전체 버전
              </label>
            </fieldset>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setView(2)}>
              ← 이전: 분석 결과
            </button>
            <button type="button" className="btn" onClick={restart}>
              처음부터 다시
            </button>
            <button type="button" className="btn primary" disabled={included.length === 0} onClick={download}>
              내려받기 ({included.length}개)
            </button>
          </div>
          <p className="hint small">원본 파일은 바뀌지 않아요. 새 이름의 사본만 내려받아요.</p>
        </section>
      )}

      <footer className="footer">
        추천은 파일명 → 수정 날짜 순서로 판단한 후보예요. 최종 선택은 직접 확인해 주세요.
      </footer>

      {previewFile && <FilePreview file={previewFile} onClose={closePreview} />}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
