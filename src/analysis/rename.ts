// F-03 새 이름 만들기(F-03-01), 미리보기 행(F-03-02), 내려받을 범위(F-03-03), 이름 충돌·금지 문자(F-03-05)
import type { Analysis, FileResult, Group } from "./analyze.ts";

export type Scope = "latest" | "all";

// 새 이름의 칸과 순서 (D-42). 칸은 셋 다 꼭 들어감: v번호를 빼면 다시 올렸을 때 순서를 못 맞춤 (D-33)
export type NamePart = "base" | "version" | "date";
export const DEFAULT_PATTERN: NamePart[] = ["base", "version", "date"];

// 칸의 표기 (D-43). 버전 규칙·날짜 규칙(rules/version-rules.json)이 다시 읽을 수 있는 표기만 둔다:
// 다시 올렸을 때 기본 이름에 숫자가 남거나 순서가 바뀌면 안 되므로 (D-33, rename.test.ts에서 모든 조합 확인)
// 빠진 표기: 2026_11_21 (날짜가 맨 끝이면 "_21"이 복사본 표시로 지워짐), 261121 (연도 두 자리는 날짜 규칙이 못 읽음)
export const VERSION_FORMATS = ["v01", "v1", "v001", "V01", "ver01", "ver1", "Ver01", "VER01"] as const;
export const DATE_FORMATS = ["yyyymmdd", "yyyy-mm-dd", "yyyy.mm.dd", "yyyy년m월d일", "mmdd", "mm.dd", "m월d일"] as const;
export type VersionFormat = (typeof VERSION_FORMATS)[number];
export type DateFormat = (typeof DATE_FORMATS)[number];

export function formatVersion(n: number, f: VersionFormat = "v01"): string {
  const two = pad(n);
  const table: Record<VersionFormat, string> = {
    v01: `v${two}`,
    v1: `v${n}`,
    v001: `v${String(n).padStart(3, "0")}`,
    V01: `V${two}`,
    ver01: `ver${two}`,
    ver1: `ver${n}`,
    Ver01: `Ver${two}`,
    VER01: `VER${two}`,
  };
  return table[f] ?? table.v01;
}

// 수정 날짜를 보는 사람의 시간대 기준으로. 한글 표기는 앞의 0 없이 (11월 5일처럼 읽는 대로)
export function formatDate(ms: number, f: DateFormat = "yyyymmdd"): string {
  const d = new Date(ms);
  const [y, mo, dd] = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  const table: Record<DateFormat, string> = {
    yyyymmdd: `${y}${pad(mo)}${pad(dd)}`,
    "yyyy-mm-dd": `${y}-${pad(mo)}-${pad(dd)}`,
    "yyyy.mm.dd": `${y}.${pad(mo)}.${pad(dd)}`,
    "yyyy년m월d일": `${y}년${mo}월${dd}일`,
    mmdd: `${pad(mo)}${pad(dd)}`,
    "mm.dd": `${pad(mo)}.${pad(dd)}`,
    "m월d일": `${mo}월${dd}일`,
  };
  return table[f] ?? table.yyyymmdd;
}

export type RenameOptions = {
  scope?: Scope; // 기본 [최신 파일만]
  choices?: Record<string, string>; // 그룹 key → 사용자가 직접 고른 최신 파일 id (F-02-05)
  baseNames?: Record<string, string>; // 그룹 key → 사용자가 고친 기본 이름 (F-03-02)
  pattern?: NamePart[]; // 이름 칸 순서. 셋을 한 번씩 담지 않았으면 기본 순서
  versionFormat?: VersionFormat; // 기본 v01
  dateFormat?: DateFormat; // 기본 yyyymmdd
};

export type RenameRow = {
  id: string;
  from: string;
  to: string | null; // null = 중복이라 제외, 또는 "확인 필요" 그룹에서 아직 고르지 않음
  duplicate: boolean; // 미리보기에서 회색 "제외"
  download: boolean; // 고른 범위에 들어가 내려받을 파일
};

const FORBIDDEN = /[\\/:*?"<>|]/g;
function pad(n: number) {
  return String(n).padStart(2, "0");
}

export const yyyymmdd = (ms: number) => formatDate(ms, "yyyymmdd");

export const cleanBaseName = (s: string) => s.trim().replace(FORBIDDEN, "_");

const validPattern = (p?: NamePart[]): NamePart[] =>
  p?.length === 3 && DEFAULT_PATTERN.every((x) => p.includes(x)) ? p : DEFAULT_PATTERN;

type NameFormat = { pattern: NamePart[]; versionFormat?: VersionFormat; dateFormat?: DateFormat };

const newName = (base: string, v: number, f: FileResult, fmt: NameFormat) => {
  const part: Record<NamePart, string> = {
    base,
    version: formatVersion(v, fmt.versionFormat),
    date: formatDate(f.lastModified, fmt.dateFormat),
  };
  return `${fmt.pattern.map((p) => part[p]).join("_")}${f.parsed.ext ? `.${f.parsed.ext}` : ""}`;
};

// 그룹 안 번호: 오래된 순 1부터, 최신 파일이 가장 큰 번호. 중복은 뺌 (D-06)
// 직접 고르면 고른 파일이 가장 큰 번호, 나머지는 원래 순서 유지 (D-09)
function numberGroup(g: Group, chosenId: string | undefined): Map<string, number> {
  const ranked = g.files.filter((f) => !f.duplicateOf); // 이미 최신 순
  const latest = chosenId ?? g.latestId;
  if (!latest) return new Map(); // "확인 필요"에서 아직 고르지 않음
  const rest = ranked.filter((f) => f.id !== latest).reverse();
  return new Map([...rest.map((f, i) => [f.id, i + 1] as const), [latest, rest.length + 1]]);
}

export function rename(analysis: Analysis, opts: RenameOptions = {}): RenameRow[] {
  const scope = opts.scope ?? "latest";
  const fmt: NameFormat = { pattern: validPattern(opts.pattern), versionFormat: opts.versionFormat, dateFormat: opts.dateFormat };
  const rows: RenameRow[] = [];

  for (const g of analysis.groups) {
    // 그룹에 없는 파일이나 중복 파일을 골랐으면 무시 (파일 목록이 바뀐 뒤 남은 선택 등)
    const c = opts.choices?.[g.key];
    const chosen = g.files.some((f) => f.id === c && !f.duplicateOf) ? c : undefined;
    const latest = chosen ?? g.latestId;
    const nums = numberGroup(g, chosen);
    // 비우면 화면이 M-06을 띄우고 되돌리지만, 혹시 빈 값이 와도 원래 기본 이름을 쓴다
    const base = cleanBaseName(opts.baseNames?.[g.key] ?? "") || cleanBaseName(g.baseName);
    for (const f of g.files) {
      const v = nums.get(f.id);
      rows.push({
        id: f.id,
        from: f.name,
        to: v ? newName(base, v, f, fmt) : null,
        duplicate: !!f.duplicateOf,
        download: !!v && (scope === "all" || f.id === latest),
      });
    }
  }

  // 단독 파일은 v1, [최신 파일만]에도 포함 (D-11)
  for (const f of analysis.singles) {
    const dup = !!f.duplicateOf;
    const to = dup ? null : newName(cleanBaseName(f.parsed.baseName), 1, f, fmt);
    rows.push({ id: f.id, from: f.name, to, duplicate: dup, download: !dup });
  }

  // 새 이름이 겹치면 뒤에 나온 쪽에 _2, _3 (F-03-05). Windows와 zip은 대소문자를 구분하지 않아서 소문자로 비교
  const used = new Set<string>();
  for (const r of rows) {
    if (!r.to) continue;
    const dot = r.to.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [r.to.slice(0, dot), r.to.slice(dot)] : [r.to, ""];
    let name = r.to;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem}_${i}${ext}`;
    used.add(name.toLowerCase());
    r.to = name;
  }
  return rows;
}
