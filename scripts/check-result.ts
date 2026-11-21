// /check-result: public/samples의 예시 파일에 분석 함수를 돌려 expected.json과 비교한다. 브라우저 없이 실행
// 분석 함수가 늘어나면 (그룹·추천 → F-02, 새 이름 → F-03) 여기 검사도 늘린다
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import rules from "../rules/version-rules.json" with { type: "json" };
import expected from "../public/samples/expected.json" with { type: "json" };
import manifest from "../public/samples/manifest.json" with { type: "json" };
import { parseName } from "../src/analysis/baseName.ts";

type ExpectedFile = { path: string; baseName?: string; duplicateOf?: string; newName?: string | null };
const ROOT = path.join(import.meta.dirname, "..", "public", "samples");
const dates = manifest as Record<string, { lastModified: string }>;
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

let failures = 0;
for (const sc of expected.scenarios) {
  const errors: string[] = [];
  const files = (sc.files as ExpectedFile[]).map((f) => {
    const full = path.join(ROOT, f.path);
    let bytes = new Uint8Array();
    try {
      bytes = readFileSync(full);
      if (statSync(full).size > 20 * 1024 * 1024) errors.push(`${f.path}: 20MB를 넘어요`);
    } catch {
      errors.push(`${f.path}: 파일이 없어요. npm run samples로 만들어 주세요`);
    }
    if (!dates[f.path]) errors.push(`${f.path}: manifest.json에 수정 날짜가 없어요`);
    return { ...f, name: path.basename(f.path), bytes };
  });

  // F-02-01 기본 이름
  for (const f of files) {
    const got = parseName(f.name, rules).baseName;
    if (f.baseName !== undefined && got !== f.baseName) errors.push(`${f.name}: 기본 이름 '${got}', 기대 '${f.baseName}'`);
  }

  // 예시 파일 자체 검사: duplicateOf로 적은 쌍만 바이트가 같아야 한다
  for (const [i, a] of files.entries()) {
    for (const b of files.slice(i + 1)) {
      const marked = a.duplicateOf === b.name || b.duplicateOf === a.name;
      if (marked !== sameBytes(a.bytes, b.bytes)) {
        errors.push(`${a.name} / ${b.name}: 바이트가 ${marked ? "달라요 (중복이어야 함)" : "같아요 (중복이 아니어야 함)"}`);
      }
    }
  }

  failures += errors.length;
  console.log(`${errors.length ? "✘" : "✔"} ${sc.name}`);
  for (const e of errors) console.log(`    ${e}`);
}

console.log(failures ? `\n실패 ${failures}건` : "\n모두 통과");
process.exit(failures ? 1 : 0);
