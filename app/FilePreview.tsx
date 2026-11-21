"use client";

// 분석 화면에서 파일 열어 보기
// 이미지·PDF·글자 파일은 바로 미리 보고, 그 밖의 형식(pptx, docx 등)은 원본을 내려받아 열게 한다
// 파일은 서버로 보내지 않고 브라우저 안에서만 읽는다

import { useEffect, useRef, useState } from "react";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const TEXT_EXT = ["txt", "md", "csv", "tsv", "json", "xml", "html", "htm", "css", "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "log", "yml", "yaml", "sql"];
const MAX_TEXT = 200 * 1024; // 글자 미리보기는 앞부분 200KB까지

type View =
  | { kind: "loading" }
  | { kind: "image"; url: string }
  | { kind: "pdf"; url: string }
  | { kind: "text"; text: string; cut: boolean }
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

export default function FilePreview({ file, onClose }: { file: File; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const closeRef = useRef<HTMLButtonElement>(null);
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

  // 열리면 닫기 버튼에 포커스, Esc로 닫기, 뒤 화면 스크롤 막기
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
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

  function downloadOriginal() {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="viewer-backdrop" onClick={onClose}>
      <div
        className="viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewer-title"
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className="viewer-body">
          {view.kind === "loading" && <p className="viewer-empty">파일을 여는 중...</p>}
          {view.kind === "image" && <img className="viewer-image" src={view.url} alt={file.name} />}
          {view.kind === "pdf" && <iframe className="viewer-pdf" src={view.url} title={file.name} />}
          {view.kind === "text" && (
            <>
              <pre className="viewer-text">{view.text || "(내용이 비어 있어요)"}</pre>
              {view.cut && <p className="viewer-note">앞부분 200KB만 보여주고 있어요</p>}
            </>
          )}
          {view.kind === "none" && (
            <div className="viewer-empty">
              <p>
                <strong>{ext ? `.${ext}` : "확장자 없는"} 파일은 브라우저에서 바로 볼 수 없어요.</strong>
              </p>
              <p>원본을 내려받아서 프로그램으로 열어 주세요.</p>
            </div>
          )}
        </div>

        <div className="viewer-foot">
          <span className="viewer-note">원본 이름 그대로 내려받아요</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={downloadOriginal}>
            원본 내려받기
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
