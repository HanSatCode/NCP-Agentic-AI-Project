// F-02-06 중복 파일 판별. 크기가 같은 파일끼리만 바이트를 직접 비교한다 (D-17: crypto.subtle은 http 배포 주소에서 안 됨)
import { parseName, type Rules } from "./baseName.ts";
import type { InputFile } from "./types.ts";

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// 돌려주는 값: 중복 파일 id → 남길 파일 id. 그룹이 달라도 판별한다
// 남길 파일 (D-04): 먼저 올린 쪽 → 한 번에 올렸으면 복사본 표시가 없는 쪽 → 목록에서 앞쪽
export function findDuplicates(files: InputFile[], rules: Rules): Map<string, string> {
  const bySize = new Map<number, InputFile[]>();
  for (const f of files) {
    if (!f.bytes) continue;
    bySize.set(f.size, [...(bySize.get(f.size) ?? []), f]);
  }

  const dupOf = new Map<string, string>();
  for (const sameSize of bySize.values()) {
    const clusters: InputFile[][] = [];
    for (const f of sameSize) {
      const c = clusters.find((c) => sameBytes(c[0].bytes!, f.bytes!));
      if (c) c.push(f);
      else clusters.push([f]);
    }
    for (const c of clusters) {
      if (c.length < 2) continue;
      const hasCopy = (f: InputFile) => (parseName(f.name, rules).copyMark ? 1 : 0);
      const [keep, ...rest] = c.sort((a, b) => a.batch - b.batch || hasCopy(a) - hasCopy(b) || a.order - b.order);
      for (const f of rest) dupOf.set(f.id, keep.id);
    }
  }
  return dupOf;
}
