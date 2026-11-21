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
