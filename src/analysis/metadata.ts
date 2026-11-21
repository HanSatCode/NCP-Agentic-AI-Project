// 업로드 목록에 보여 줄 문서 안 기록. 표시만 하고 최신 후보 순위에는 쓰지 않는다 (D-30)
// docx·pptx·xlsx: 압축 파일 안 docProps/core.xml (처음 만든 시각·저장 시각·저장 횟수). 다른 형식은 빈 값
import { strFromU8, unzipSync } from "fflate";

export type DocMeta = {
  created?: number; // 처음 만든 시각 (ms)
  saved?: number; // 문서 안 마지막 저장 시각 (ms). 파일 속성의 수정 날짜와 다름
  revision?: number; // 저장 횟수
};

const OOXML = new Set(["docx", "pptx", "xlsx"]);

// shortcut: hwpx는 문서 정보 파일 위치를 확인한 뒤 추가. 태그 접두어는 Office가 쓰는 cp·dcterms만 읽음
export function readDocMeta(name: string, bytes: Uint8Array): DocMeta {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (!OOXML.has(ext)) return {};
  let xml: string;
  try {
    const core = unzipSync(bytes, { filter: (f) => f.name === "docProps/core.xml" })["docProps/core.xml"];
    if (!core) return {};
    xml = strFromU8(core);
  } catch {
    return {}; // 깨졌거나 이름만 docx인 파일
  }
  const tag = (t: string) => xml.match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`))?.[1].trim();
  const time = (s?: string) => {
    const n = s ? Date.parse(s) : NaN;
    return Number.isNaN(n) ? undefined : n;
  };
  const rev = Number(tag("cp:revision"));
  return {
    created: time(tag("dcterms:created")),
    saved: time(tag("dcterms:modified")),
    revision: Number.isInteger(rev) && rev > 0 ? rev : undefined,
  };
}

// 미리보기용으로 docx·pptx 안의 글자만 꺼낸다 (서식·그림은 버림). 다른 형식이나 못 읽으면 null
// pptx는 슬라이드 순서대로 "[슬라이드 n]" 머리글을 붙인다
// shortcut: 표·머리글·메모 등은 빠짐. 미리보기 이상으로 쓰게 되면(D-23 내용 비교) 제대로 된 파서로 바꾼다
export function readDocText(name: string, bytes: Uint8Array): string | null {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const isDocx = ext === "docx";
  if (!isDocx && ext !== "pptx") return null;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => (isDocx ? f.name === "word/document.xml" : /^ppt\/slides\/slide\d+\.xml$/.test(f.name)),
    });
  } catch {
    return null;
  }
  const textOf = (xml: string, p: string, t: string) =>
    xml
      .split(`</${p}>`)
      .map((para) => [...para.matchAll(new RegExp(`<${t}(?: [^>]*)?>([^<]*)</${t}>`, "g"))].map((m) => m[1]).join(""))
      .filter((line) => line.trim())
      .map(unescapeXml)
      .join("\n");
  if (isDocx) {
    const doc = files["word/document.xml"];
    return doc ? textOf(strFromU8(doc), "w:p", "w:t") : null;
  }
  const slides = Object.keys(files).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!slides.length) return null;
  return slides.map((k, i) => `[슬라이드 ${i + 1}]\n${textOf(strFromU8(files[k]), "a:p", "a:t")}`).join("\n\n");
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e]!);
