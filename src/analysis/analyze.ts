// F-02 분석: 그룹 분류(F-02-02), 버전 비교(F-02-03), 최신 후보와 추천 이유(F-02-04), 단독 파일(F-02-07)
// 화면은 파일을 더하거나 뺄 때마다 이 함수를 다시 부른다 (D-12)
import { parseName, type ParsedName, type Rules } from "./baseName.ts";
import { findDuplicates } from "./duplicate.ts";
import type { InputFile } from "./types.ts";

export type FileResult = InputFile & {
  parsed: ParsedName;
  duplicateOf: string | null; // 같은 내용인 남길 파일 id ("중복" 배지)
};

export type Criterion = "version" | "date" | "keyword" | "mtime";

export type Group = {
  key: string;
  baseName: string;
  ext: string;
  files: FileResult[]; // 최신 순, 중복 파일은 맨 뒤
  status: "최신 후보" | "확인 필요";
  latestId: string | null; // "확인 필요"면 null
  decidedBy: Criterion | "tie" | "only"; // only = 중복을 빼면 하나만 남음
  reason: string;
};

export type Analysis = {
  groups: Group[]; // 파일 수가 많은 그룹부터
  singles: FileResult[];
  duplicates: number;
  needsChoice: number; // "확인 필요" 그룹 수 (M-05)
  summary: string;
};

const CRITERIA: Criterion[] = ["version", "date", "keyword", "mtime"];

type DateClue = ParsedName["date"];
function compareDates(a: DateClue, b: DateClue): number {
  if (!a || !b) return (a ? 1 : 0) - (b ? 1 : 0); // 날짜가 없으면 가장 오래된 것으로 봄
  if (a.year && b.year && a.year !== b.year) return a.year - b.year;
  return a.month * 100 + a.day - (b.month * 100 + b.day);
}

// a가 더 최신이면 양수
function compareBy(c: Criterion, a: FileResult, b: FileResult): number {
  switch (c) {
    case "version":
      return (a.parsed.version?.n ?? 0) - (b.parsed.version?.n ?? 0);
    case "date":
      return compareDates(a.parsed.date, b.parsed.date);
    case "keyword":
      return (a.parsed.keyword?.score ?? 0) - (b.parsed.keyword?.score ?? 0);
    case "mtime":
      return a.lastModified - b.lastModified;
  }
}

// 기준 1에서 갈리면 뒤 기준은 보지 않는다. 모두 같으면 null (동점)
export function decidingCriterion(a: FileResult, b: FileResult): Criterion | null {
  return CRITERIA.find((c) => compareBy(c, a, b) !== 0) ?? null;
}

// 최신 순 정렬. 동점은 목록 순서 (D-10)
export function rank(files: FileResult[]): FileResult[] {
  return [...files].sort((a, b) => {
    const c = decidingCriterion(a, b);
    return c ? -compareBy(c, a, b) : a.order - b.order;
  });
}

// 추천 이유 문구 틀 (CLAUDE.md). 번호·날짜·키워드는 파일명에 적힌 그대로
export function reasonText(by: Group["decidedBy"], top: FileResult): string {
  switch (by) {
    case "version":
      return `파일명에 ${top.parsed.version!.raw}가 있어요`;
    case "date":
      return `파일명의 날짜(${top.parsed.date!.raw})가 가장 늦어요`;
    case "keyword":
      return `파일명에 '${top.parsed.keyword!.raw}'이 있어요`;
    case "mtime":
      return "수정 날짜가 가장 늦어요. 카톡에서 받은 순서일 수 있어요"; // D-05
    case "tie":
      return "단서가 같아서 고를 수 없어요. 직접 골라 주세요";
    case "only":
      return "중복을 빼면 이 파일만 남아요"; // D-25
  }
}

function makeGroup(key: string, files: FileResult[]): Group {
  const nonDup = files.filter((f) => !f.duplicateOf);
  // shortcut: 그룹 안 파일이 모두 다른 그룹 파일의 중복이면 중복까지 넣어 순위를 매김. 실제로 생기면 문구를 따로 정한다
  const candidates = rank(nonDup.length ? nonDup : files);
  const dups = nonDup.length ? files.filter((f) => f.duplicateOf) : [];
  const [top, second] = candidates;
  const by: Group["decidedBy"] = second ? (decidingCriterion(top, second) ?? "tie") : "only";
  return {
    key,
    baseName: top.parsed.baseName,
    ext: top.parsed.ext,
    files: [...candidates, ...dups],
    status: by === "tie" ? "확인 필요" : "최신 후보",
    latestId: by === "tie" ? null : top.id,
    decidedBy: by,
    reason: reasonText(by, top),
  };
}

export function analyze(input: InputFile[], rules: Rules): Analysis {
  const dupOf = findDuplicates(input, rules);
  const files: FileResult[] = [...input]
    .sort((a, b) => a.order - b.order)
    .map((f) => ({ ...f, parsed: parseName(f.name, rules), duplicateOf: dupOf.get(f.id) ?? null }));

  // 기본 이름 + 확장자가 같은 파일끼리. 확장자 대소문자는 구분하지 않음 (PPTX = pptx)
  const byKey = new Map<string, FileResult[]>();
  for (const f of files) {
    const key = `${f.parsed.baseName}.${f.parsed.ext.toLowerCase()}`;
    byKey.set(key, [...(byKey.get(key) ?? []), f]);
  }

  const groups: Group[] = [];
  const singles: FileResult[] = [];
  for (const [key, list] of byKey) {
    if (list.length === 1) singles.push(list[0]);
    else groups.push(makeGroup(key, list));
  }
  const firstOrder = (g: Group) => Math.min(...g.files.map((f) => f.order));
  groups.sort((a, b) => b.files.length - a.files.length || firstOrder(a) - firstOrder(b)); // 같은 수면 목록에 먼저 나온 그룹부터

  return {
    groups,
    singles,
    duplicates: dupOf.size,
    needsChoice: groups.filter((g) => g.status === "확인 필요").length,
    summary: `그룹 ${groups.length}개 · 단독 ${singles.length}개 · 중복 ${dupOf.size}개`,
  };
}
