"use client";

// 분석 화면에서 파일 열어 보기
// 이미지·PDF·글자 파일은 브라우저가 바로 보여 주고, docx·pptx는 라이브러리로 그려서 보여 준다
// (docx-preview, @aiden0z/pptx-renderer. 못 그리면 안의 글자만). 그 밖의 형식은 원래 프로그램으로 열어 보라고 안내한다
// 파일은 서버로 보내지 않고 브라우저 안에서만 읽는다
// PreviewBody는 분석 화면 오른쪽 파일 정보에도 쓴다

import { useCallback, useEffect, useRef, useState } from "react";
import { readDocText } from "@/src/analysis/metadata.ts";
import { useSheet } from "./useSheet";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const TEXT_EXT = ["txt", "md", "csv", "tsv", "json", "xml", "html", "htm", "css", "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "log", "yml", "yaml", "sql"];
const MAX_TEXT = 200 * 1024; // 글자 미리보기는 앞부분 200KB까지

type View =
  | { kind: "loading" }
  | { kind: "image"; url: string }
  | { kind: "pdf"; url: string }
  | { kind: "text"; text: string; cut: boolean }
  | { kind: "office" } // docx·pptx를 라이브러리로 그림
  | { kind: "doc"; text: string } // 그리지 못했을 때 docx·pptx에서 꺼낸 글자
  | { kind: "none" };

function extOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** 확장자와 상관없이 내용이 글자인지 앞부분으로 판단 (0 바이트가 있으면 글자가 아님) */
function looksLikeText(bytes: Uint8Array) {
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, n));
    return true;
  } catch {
    // 4096 바이트 경계에서 한글이 잘렸을 수 있으니 조금 줄여서 한 번 더
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, Math.max(0, n - 3)));
      return true;
    } catch {
      return false;
    }
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 파일 내용 미리보기 (팝업·분석 화면 오른쪽 공용) */
export function PreviewBody({ file }: { file: File }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const ext = extOf(file.name);

  // 내용 읽기
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    (async () => {
      if (file.type.startsWith("image/") || IMAGE_EXT.includes(ext)) {
        url = URL.createObjectURL(ext === "svg" ? new Blob([file], { type: "image/svg+xml" }) : file);
        setView({ kind: "image", url });
        return;
      }
      if (file.type === "application/pdf" || ext === "pdf") {
        url = URL.createObjectURL(new Blob([file], { type: "application/pdf" }));
        setView({ kind: "pdf", url });
        return;
      }
      if (ext === "docx" || ext === "pptx") {
        setView({ kind: "office" });
        return;
      }
      // 한글(hwp·hwpx)은 미리보기를 지원하지 않음. 예시 hwp는 글자 파일이라 글자로 보일 수 있어서 먼저 막음
      if (ext === "hwp" || ext === "hwpx") {
        setView({ kind: "none" });
        return;
      }
      const head = new Uint8Array(await file.slice(0, MAX_TEXT).arrayBuffer());
      if (!alive) return;
      if (file.type.startsWith("text/") || TEXT_EXT.includes(ext) || looksLikeText(head)) {
        setView({ kind: "text", text: new TextDecoder("utf-8").decode(head), cut: file.size > MAX_TEXT });
        return;
      }
      setView({ kind: "none" });
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, ext]);

  // 라이브러리가 못 그리면 안의 글자라도 보여 줌
  const officeFailed = useCallback(async () => {
    const text = readDocText(file.name, new Uint8Array(await file.arrayBuffer()));
    setView(text === null ? { kind: "none" } : { kind: "doc", text });
  }, [file]);

  return (
    <div className="viewer-body">
      {view.kind === "office" && <OfficePreview key={file.name + file.size} file={file} ext={ext} onFail={officeFailed} />}
      {view.kind === "loading" && <p className="viewer-empty">파일을 여는 중...</p>}
      {view.kind === "image" && <img className="viewer-image" src={view.url} alt={file.name} />}
      {view.kind === "pdf" && <iframe className="viewer-pdf" src={view.url} title={file.name} />}
      {view.kind === "text" && (
        <>
          <pre className="viewer-text">{view.text || "(내용이 비어 있어요)"}</pre>
          {view.cut && <p className="viewer-note">앞부분 200KB만 보여 드려요</p>}
        </>
      )}
      {view.kind === "doc" && (
        <>
          <pre className="viewer-text viewer-doc">{view.text || "(글자가 없어요)"}</pre>
          <p className="viewer-note">서식과 그림은 빼고 글자만 보여 드려요</p>
        </>
      )}
      {view.kind === "none" && (
        <div className="viewer-empty">
          <p>
            <strong>{ext ? `.${ext}` : "확장자 없는"} 파일은 브라우저에서 바로 볼 수 없어요.</strong>
          </p>
          <p>내 컴퓨터에서 원래 프로그램으로 열어 확인해 주세요.</p>
        </div>
      )}
    </div>
  );
}

/** docx·pptx를 브라우저 안에서 그림. 라이브러리는 이 파일을 볼 때만 불러옴(처음 화면을 무겁게 하지 않음) */
function OfficePreview({ file, ext, onFail }: { file: File; ext: string; onFail: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    let alive = true;
    let viewer: { destroy(): void } | null = null;
    let ro: ResizeObserver | null = null;
    const ctrl = new AbortController();
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        if (!alive) return;
        if (ext === "docx") {
          const { renderAsync } = await import("docx-preview");
          if (!alive) return;
          await renderAsync(buf, el, undefined, { inWrapper: true, breakPages: true, renderComments: false });
          // 쪽 전체 폭(A4 약 800px)이 칸에 들어오게 줄임. 칸 크기가 바뀌면 다시 맞춤
          const wrapper = el.querySelector<HTMLElement>(".docx-wrapper"); // 첫 자식은 라이브러리가 넣은 <style>
          if (wrapper) {
            // 쪽은 가운데 정렬이라 wrapper.scrollWidth로는 왼쪽으로 넘친 폭이 안 잡힘 → 가장 넓은 쪽 폭 + 좌우 여백으로 잼
            const fit = () => {
              wrapper.style.zoom = "1";
              const pages = [...wrapper.querySelectorAll<HTMLElement>("section.docx")];
              const pad = parseFloat(getComputedStyle(wrapper).paddingLeft) * 2;
              const natural = Math.max(0, ...pages.map((p) => p.offsetWidth)) + pad;
              if (natural > 0) wrapper.style.zoom = String(Math.min(1, el.clientWidth / natural));
            };
            fit();
            ro = new ResizeObserver(fit);
            ro.observe(el);
          }
        } else {
          const { PptxViewer, RECOMMENDED_ZIP_LIMITS } = await import("@aiden0z/pptx-renderer");
          if (!alive) return;
          const v = await PptxViewer.open(buf, el, {
            zipLimits: RECOMMENDED_ZIP_LIMITS,
            fitMode: "contain",
            externalMedia: "block", // 파일 안 외부 주소로 요청을 보내지 않음 (브라우저 밖으로 나가는 것 없음)
            scrollContainer: el,
            listOptions: { windowed: true },
            signal: ctrl.signal,
          });
          if (!alive) v.destroy();
          else viewer = v;
        }
        if (alive) setReady(true);
      } catch {
        if (alive) onFail();
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
      ro?.disconnect();
      viewer?.destroy();
      el.replaceChildren();
    };
  }, [file, ext, onFail]);

  return (
    <>
      {!ready && <p className="viewer-empty">미리보기를 만드는 중...</p>}
      {/* 다 그릴 때까지 투명하게만 숨김 (display:none이면 쪽 폭을 잴 수 없음) */}
      <div ref={ref} className={`office-preview office-${ext} ${ready ? "" : "is-drawing"}`} />
    </>
  );
}

export default function FilePreview({ file, onClose: closeNow }: { file: File; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const footCloseRef = useRef<HTMLButtonElement>(null); // 폰은 오른쪽 위 ×를 숨기므로 아래 [닫기]에 포커스
  // 닫을 때 바로 없애지 않고 사라지는 애니메이션 뒤에 닫음. 폰에서는 아래에서 올라오는 시트라 손잡이를 끌어내려도 닫힘
  const { closing, close: onClose, sheetRef, handleProps } = useSheet(closeNow);

  // 열리면 닫기 버튼에 포커스, Esc로 닫기, 뒤 화면 스크롤 막기
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    // 숨긴 요소(offsetParent 없음)에는 포커스가 안 가므로 보이는 닫기 버튼에
    (closeRef.current?.offsetParent ? closeRef.current : footCloseRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className={`viewer-backdrop ${closing ? "is-closing" : ""}`} onClick={onClose}>
      <div
        ref={sheetRef}
        className={`viewer ${closing ? "is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden {...handleProps} />
        <div className="viewer-head">
          <div className="viewer-title-wrap">
            <h3 id="viewer-title" className="viewer-title">
              {file.name}
            </h3>
            <span className="viewer-meta">
              {formatDate(file.lastModified)} · {formatSize(file.size)}
            </span>
          </div>
          <button ref={closeRef} type="button" className="viewer-close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>

        <PreviewBody file={file} />

        <div className="viewer-foot">
          <span className="spacer" />
          <button ref={footCloseRef} type="button" className="btn primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
