// /check-result: public/samples의 예시 파일에 분석 함수를 돌려 expected.json과 비교한다. 브라우저 없이 실행
// expected.json에 적지 않은 칸은 검사하지 않는다
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import rules from "../rules/version-rules.json" with { type: "json" };
import expected from "../public/samples/expected.json" with { type: "json" };
import manifest from "../public/samples/manifest.json" with { type: "json" };
import { parseName } from "../src/analysis/baseName.ts";
import { findDuplicates } from "../src/analysis/duplicate.ts";
import { analyze } from "../src/analysis/analyze.ts";
import { rename } from "../src/analysis/rename.ts";
import type { InputFile } from "../src/analysis/types.ts";

type ExpectedFile = { path: string; baseName?: string; duplicateOf?: string; newName?: string | null };
type ExpectedGroup = { baseName: string; status: string; latest: string | null; reason?: string };
const ROOT = path.join(import.meta.dirname, "..", "public", "samples");
const dates = manifest as Record<string, { lastModified: string }>;

let failures = 0;
for (const sc of expected.scenarios) {
  const errors: string[] = [];
  const want = sc.files as ExpectedFile[];

  // 시나리오 = 한 번에 올린 파일 묶음 (batch 1), 목록 순서는 expected.json 순서
  const files: InputFile[] = want.map((f, order) => {
    const full = path.join(ROOT, f.path);
    const name = path.basename(f.path);
    let bytes: Uint8Array | undefined;
    try {
      bytes = readFileSync(full);
      if (statSync(full).size > 20 * 1024 * 1024) errors.push(`${f.path}: 20MB를 넘어요`);
    } catch {
      errors.push(`${f.path}: 파일이 없어요. npm run samples로 만들어 주세요`);
    }
    if (!dates[f.path]) errors.push(`${f.path}: manifest.json에 수정 날짜가 없어요`);
    const lastModified = new Date(dates[f.path]?.lastModified ?? 0).getTime();
    return { id: name, name, size: bytes?.length ?? 0, lastModified, order, batch: 1, bytes };
  });

  // F-02-01 기본 이름
  for (const f of want) {
    const name = path.basename(f.path);
    const got = parseName(name, rules).baseName;
    if (f.baseName !== undefined && got !== f.baseName) errors.push(`${name}: 기본 이름 '${got}', 기대 '${f.baseName}'`);
  }

  // F-02-06 중복 (D-04). duplicateOf가 없는 파일은 중복이 아니어야 한다
  const dupOf = findDuplicates(files, rules);
  for (const f of want) {
    const name = path.basename(f.path);
    const got = dupOf.get(name) ?? null;
    const exp = f.duplicateOf ?? null;
    if (got !== exp) errors.push(`${name}: 중복 대상 '${got ?? "없음"}', 기대 '${exp ?? "없음"}'`);
  }

  // F-02-02~04, F-02-07 그룹·최신 후보·추천 이유·단독 파일
  const result = analyze(files, rules);
  const groups = (sc as { groups?: ExpectedGroup[] }).groups;
  if (groups) {
    const gotOrder = result.groups.map((g) => g.baseName).join(", ");
    const wantOrder = groups.map((g) => g.baseName).join(", ");
    if (gotOrder !== wantOrder) errors.push(`그룹 순서 '${gotOrder}', 기대 '${wantOrder}'`);
    for (const w of groups) {
      const g = result.groups.find((g) => g.baseName === w.baseName);
      if (!g) continue;
      if (g.status !== w.status) errors.push(`${w.baseName}: 배지 '${g.status}', 기대 '${w.status}'`);
      if (g.latestId !== w.latest) errors.push(`${w.baseName}: 최신 후보 '${g.latestId}', 기대 '${w.latest}'`);
      if (w.reason !== undefined && g.reason !== w.reason) errors.push(`${w.baseName}: 이유 '${g.reason}', 기대 '${w.reason}'`);
    }
  }
  const singles = (sc as { singles?: string[] }).singles;
  if (singles && result.singles.map((f) => f.name).join(", ") !== singles.join(", ")) {
    errors.push(`단독 파일 '${result.singles.map((f) => f.name).join(", ")}', 기대 '${singles.join(", ")}'`);
  }
  const s = sc as { summary?: string; blockedGroups?: number };
  if (s.summary !== undefined && result.summary !== s.summary) errors.push(`요약 '${result.summary}', 기대 '${s.summary}'`);
  if (s.blockedGroups !== undefined && result.needsChoice !== s.blockedGroups) {
    errors.push(`확인 필요 그룹 ${result.needsChoice}개, 기대 ${s.blockedGroups}개`);
  }

  // F-03-01 새 이름 ([전체 버전] 기준, 직접 선택 없음). null = 중복 제외 또는 아직 고르지 않은 "확인 필요"
  const rows = rename(result, { scope: "all" });
  for (const f of want) {
    if (f.newName === undefined) continue;
    const name = path.basename(f.path);
    const got = rows.find((r) => r.id === name)?.to ?? null;
    if (got !== f.newName) errors.push(`${name}: 새 이름 '${got}', 기대 '${f.newName}'`);
  }

  failures += errors.length;
  console.log(`${errors.length ? "✘" : "✔"} ${sc.name}`);
  for (const e of errors) console.log(`    ${e}`);
}

console.log(failures ? `\n실패 ${failures}건` : "\n모두 통과");
process.exit(failures ? 1 : 0);
