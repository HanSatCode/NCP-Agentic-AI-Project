// F-03 새 이름 만들기(F-03-01), 미리보기 행(F-03-02), 내려받을 범위(F-03-03), 이름 충돌·금지 문자(F-03-05)
import type { Analysis, FileResult, Group } from "./analyze.ts";

export type Scope = "latest" | "all";

export type RenameOptions = {
  scope?: Scope; // 기본 [최신 파일만]
  choices?: Record<string, string>; // 그룹 key → 사용자가 직접 고른 최신 파일 id (F-02-05)
  baseNames?: Record<string, string>; // 그룹 key → 사용자가 고친 기본 이름 (F-03-02)
};

export type RenameRow = {
  id: string;
  from: string;
  to: string | null; // null = 중복이라 제외, 또는 "확인 필요" 그룹에서 아직 고르지 않음
  duplicate: boolean; // 미리보기에서 회색 "제외"
  download: boolean; // 고른 범위에 들어가 내려받을 파일
};

const FORBIDDEN = /[\\/:*?"<>|]/g;
const pad = (n: number) => String(n).padStart(2, "0");

// 수정 날짜를 보는 사람의 시간대 기준 YYYYMMDD로
export function yyyymmdd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export const cleanBaseName = (s: string) => s.trim().replace(FORBIDDEN, "_");

const newName = (base: string, v: number, f: FileResult) =>
  `${base}_v${v}_${yyyymmdd(f.lastModified)}${f.parsed.ext ? `.${f.parsed.ext}` : ""}`;

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
        to: v ? newName(base, v, f) : null,
        duplicate: !!f.duplicateOf,
        download: !!v && (scope === "all" || f.id === latest),
      });
    }
  }

  // 단독 파일은 v1, [최신 파일만]에도 포함 (D-11)
  for (const f of analysis.singles) {
    const dup = !!f.duplicateOf;
    const to = dup ? null : newName(cleanBaseName(f.parsed.baseName), 1, f);
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
