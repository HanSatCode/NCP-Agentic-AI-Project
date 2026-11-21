// F-03-04 내려받기: 1개면 그 파일, 2개 이상이면 정리된파일_YYYYMMDD.zip. 원본은 바꾸지 않고 새 이름의 사본만 만든다
// 파일을 실제로 저장하게 하는 부분(Blob, <a download>)은 화면 코드에서 한다
import { zipSync, type Zippable } from "fflate";
import type { RenameRow } from "./rename.ts";
import { yyyymmdd } from "./rename.ts";

export type Download = { filename: string; data: Uint8Array; count: number };

// 2개 이상일 때 내려받는 zip 이름. STEP 3 오른쪽 "받을 파일"에도 같은 이름을 보여 줌
export const zipName = (now = Date.now()) => `정리된파일_${yyyymmdd(now)}.zip`;
type Source = { bytes: Uint8Array; lastModified: number };

// rows: rename() 결과, sources: 파일 id → 원본 바이트와 수정 날짜, now: zip 이름에 넣을 오늘 날짜
export function makeDownload(rows: RenameRow[], sources: Map<string, Source>, now = Date.now()): Download | null {
  const picked = rows.filter((r) => r.download && r.to);
  if (picked.length === 0) return null; // 0개면 [내려받기] 비활성

  const src = (r: RenameRow) => {
    const s = sources.get(r.id);
    if (!s) throw new Error(`원본 파일을 찾을 수 없어요: ${r.from}`);
    return s;
  };

  if (picked.length === 1) return { filename: picked[0].to!, data: src(picked[0]).bytes, count: 1 };

  // 압축 안 파일에도 원래 수정 날짜를 남긴다. docx·pptx는 이미 압축된 형식이라 다시 압축하지 않음 (level 0, 브라우저가 덜 멈춤)
  const entries: Zippable = {};
  for (const r of picked) {
    const s = src(r);
    entries[r.to!] = [s.bytes, { mtime: new Date(s.lastModified) }];
  }
  return { filename: zipName(now), data: zipSync(entries, { level: 0 }), count: picked.length };
}
