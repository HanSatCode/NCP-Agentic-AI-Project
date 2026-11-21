// F-01 업로드: 같은 파일 다시 올림(F-01-01, M-04), 20MB 초과(F-01-04, M-03), 예시 파일 불러오기(F-01-03, D-14)
// 화면 코드 없음. 화면은 받은 결과로 목록과 안내 문구를 띄운다
import type { InputFile } from "./types.ts";

export const MAX_SIZE = 20 * 1024 * 1024;

type FileLike = { name: string; size: number; lastModified: number };

// 이름·크기·수정일이 같으면 같은 파일 (F-01-01). 같은 파일은 다시 못 올리니 분석용 id로도 쓴다
export const fileKey = (f: FileLike) => `${f.name}|${f.size}|${f.lastModified}`;

export type Accepted<T> = {
  accepted: T[];
  same: T[]; // M-04 "이미 올린 파일이에요"
  tooLarge: T[]; // M-03 "'파일명'은 20MB가 넘어서 빼고 올렸어요"
};

// existing: 이미 목록에 있는 파일, incoming: 새로 고르거나 놓은 파일. 한 번에 같은 파일을 두 번 놓아도 하나만 받음
export function acceptFiles<T extends FileLike>(existing: FileLike[], incoming: T[]): Accepted<T> {
  const seen = new Set(existing.map(fileKey));
  const out: Accepted<T> = { accepted: [], same: [], tooLarge: [] };
  for (const f of incoming) {
    if (f.size > MAX_SIZE) out.tooLarge.push(f);
    else if (seen.has(fileKey(f))) out.same.push(f);
    else {
      seen.add(fileKey(f));
      out.accepted.push(f);
    }
  }
  return out;
}

// 받은 파일을 분석 입력으로. startOrder = 지금 목록 길이, batch = 몇 번째로 올렸는지 (D-04)
// shortcut: 중복 판별을 위해 모든 파일 바이트를 메모리에 읽음. 큰 파일을 많이 올려 느려지면 크기가 같은 파일만 읽도록 바꾼다
export async function toInputFiles(files: File[], startOrder: number, batch: number): Promise<InputFile[]> {
  return Promise.all(
    files.map(async (f, i) => ({
      id: fileKey(f),
      name: f.name,
      size: f.size,
      lastModified: f.lastModified,
      order: startOrder + i,
      batch,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}

// [체험하기]: public/samples/manifest.json의 demo 파일을 받아 manifest의 수정 날짜를 넣은 File로 만든다 (D-14)
// base: 하위 경로에 배포하면 앞에 그 경로가 붙는다 (next.config.ts의 NEXT_PUBLIC_BASE_PATH)
export async function loadSamples(
  fetchFn: typeof fetch = fetch,
  base = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/samples/`,
): Promise<File[]> {
  const res = await fetchFn(`${base}manifest.json`);
  if (!res.ok) throw new Error("예시 파일 목록을 불러오지 못했어요");
  const manifest = (await res.json()) as Record<string, { lastModified: string }>;

  const demo = Object.entries(manifest).filter(([p]) => p.startsWith("demo/"));
  return Promise.all(
    demo.map(async ([p, e]) => {
      const r = await fetchFn(base + p.split("/").map(encodeURIComponent).join("/"));
      if (!r.ok) throw new Error(`예시 파일을 불러오지 못했어요: ${p}`);
      const name = p.slice(p.lastIndexOf("/") + 1);
      return new File([await r.arrayBuffer()], name, { lastModified: new Date(e.lastModified).getTime() });
    }),
  );
}
