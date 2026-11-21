// /QA 전체 QA: 규칙 · 단위(F-02-01) · 시나리오(E06~E18 등) · 불변식(fuzz). 브라우저 없이 실행 (npm run qa, SEED=42)
// 기대값은 CLAUDE.md 규칙 표를 사람이 적용해 적는다. 분석 코드로 계산하지 않는다
import rules from "../rules/version-rules.json" with { type: "json" };
import { parseName, splitExt } from "../src/analysis/baseName.ts";
import { analyze } from "../src/analysis/analyze.ts";
import { rename } from "../src/analysis/rename.ts";
import { acceptFiles, MAX_SIZE } from "../src/analysis/upload.ts";
import type { InputFile } from "../src/analysis/types.ts";

type R = { stage: string; id: string; ok: boolean | "skip" | "ask"; detail?: string };
const out: R[] = [];
const check = (stage: string, id: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  out.push({ stage, id, ok, detail: ok ? undefined : `기대 ${JSON.stringify(want)} / 실제 ${JSON.stringify(got)}` });
};
const ask = (stage: string, id: string, detail: string) => out.push({ stage, id, ok: "ask", detail });

// ---------- 규칙 ----------
const kw = Object.fromEntries(rules.keywords.map((k) => [k.word, k.score]));
check("규칙", "키워드·점수 = CLAUDE.md", kw, { 진짜최종본: 40, 진짜최종: 40, 찐최종본: 40, 찐최종: 40, 최종수정본: 30, 최종수정: 30, 최종본: 20, 최종: 20,
  final: 20, 완성본: 20, 완성: 20, 제출본: 20, 제출: 20, 수정본: 10, 수정: 10 });
for (const p of [...rules.copyMarks, ...rules.dates, rules.version, rules.separators]) {
  try { new RegExp(p, "iu"); check("규칙", `정규식 컴파일 ${p.slice(0, 20)}`, true, true); }
  catch (e) { check("규칙", `정규식 컴파일 ${p}`, String(e), "ok"); }
}

// ---------- 단위: 기본 이름 ----------
const base = (n: string) => parseName(n + ".docx", rules).baseName;
const unit: [string, string][] = [
  ["발표자료_진짜최종", "발표자료"], ["발표자료 최종수정", "발표자료"], ["발표자료(1)", "발표자료"],
  ["보고서_v3 복사본", "보고서"], ["기획서_최종_수정", "기획서"],
  ["보고_1120", "보고"], ["정리_2026-11-20", "정리"], ["자료_11.20", "자료"],
  ["실험_1350", "실험1350"], ["설명_VER3", "설명"], ["memo_FINAL", "memo"],
  ["정리본_진짜", "정리본진짜"], ["자료_123", "자료123"], ["최종", "최종"],
  ["보고서 - 복사본 (2)", "보고서"], ["자료 copy", "자료"], ["자료_1", "자료"], ["발표_찐최종", "발표"],
  ["보고서_20261120", "보고서"], ["보고서_v2_1120_1", "보고서"],
  ["발표자료_수정본", "발표자료"], ["발표자료_최종본", "발표자료"], ["발표자료 진짜최종본", "발표자료"], ["발표자료_최종_수정본", "발표자료"], // D-26
];
for (const [i, w] of unit) check("단위", i, base(i), w);
check("단위", "server3 (확인 필요 항목, 지금 값 server3)", base("server3"), "server3");
check("단위", "v2 → 다 지워지면 원래 이름", base("v2"), "v2");
check("단위", "(1) → 다 지워지면 원래 이름", base("(1)"), "(1)");
check("단위", "보고서_v1.2 (소수 버전은 v1만 읽음, 2026-11-21 그대로 두기로 함)", base("보고서_v1.2"), "보고서.2");
check("단위", "최종 (1) → 복사본 표시만 지운 이름 (D-27)", base("최종 (1)"), "최종");

// ---------- 시나리오 ----------
const KST = (d: string) => new Date(`2026-${d}:00+09:00`).getTime();
let uid = 0;
type Spec = { name: string; mtime: string; batch?: number; bytes?: string };
const mk = (specs: Spec[]): InputFile[] =>
  specs.map((s, order) => {
    const bytes = new TextEncoder().encode(s.bytes ?? `${s.name}#${uid++}`);
    return { id: `${s.name}|${s.batch ?? 1}`, name: s.name, size: bytes.length, lastModified: KST(s.mtime), order, batch: s.batch ?? 1, bytes };
  });
const grp = (a: ReturnType<typeof analyze>, b: string) => a.groups.find((g) => g.baseName === b);
const latestName = (a: ReturnType<typeof analyze>, b: string) => grp(a, b)?.files.find((f) => f.id === grp(a, b)?.latestId)?.name ?? null;
const S = "시나리오";

{ // E06 기준 1 > 3
  const a = analyze(mk([{ name: "보고서_v2.docx", mtime: "11-18T10:00" }, { name: "보고서_진짜최종.docx", mtime: "11-20T10:00" }]), rules);
  check(S, "E06 v2가 진짜최종보다 우선", [latestName(a, "보고서"), grp(a, "보고서")?.reason], ["보고서_v2.docx", "파일명에 v2가 있어요"]);
  check(S, "E06 새 이름", rename(a, { scope: "all" }).map((r) => r.to), ["보고서_v2_20261118.docx", "보고서_v1_20261120.docx"]);
}
{ // E07
  const a = analyze(mk([{ name: "정리_20261119.docx", mtime: "11-20T10:00" }, { name: "정리_2026-11-20.docx", mtime: "11-19T10:00" }]), rules);
  check(S, "E07 20261119 < 2026-11-20", [latestName(a, "정리"), grp(a, "정리")?.reason], ["정리_2026-11-20.docx", "파일명의 날짜(2026-11-20)가 가장 늦어요"]);
}
{ // E08
  const a = analyze(mk([{ name: "보고_1120.hwp", mtime: "11-18T10:00" }, { name: "보고_1119.hwp", mtime: "11-20T10:00" }]), rules);
  check(S, "E08 1120 > 1119", [latestName(a, "보고"), grp(a, "보고")?.reason], ["보고_1120.hwp", "파일명의 날짜(1120)가 가장 늦어요"]);
}
{ // E09
  const a = analyze(mk([
    { name: "설명_ver2.pptx", mtime: "11-20T10:00" }, { name: "설명_VER3.pptx", mtime: "11-18T10:00" },
    { name: "memo.txt", mtime: "11-20T10:00" }, { name: "memo_FINAL.txt", mtime: "11-18T10:00" },
  ]), rules);
  check(S, "E09 VER3 대소문자 무시", [latestName(a, "설명"), grp(a, "설명")?.reason], ["설명_VER3.pptx", "파일명에 VER3가 있어요"]);
  check(S, "E09 FINAL 대소문자 무시", [latestName(a, "memo"), grp(a, "memo")?.reason], ["memo_FINAL.txt", "파일명에 'FINAL'이 있어요"]);
}
{ // E10
  const a = analyze(mk([{ name: "발표_최종수정.pptx", mtime: "11-20T10:00" }, { name: "발표_찐최종.pptx", mtime: "11-18T10:00" }]), rules);
  check(S, "E10 찐최종 40점", [latestName(a, "발표"), grp(a, "발표")?.reason], ["발표_찐최종.pptx", "파일명에 '찐최종'이 있어요"]);
}
{ // E11
  const a = analyze(mk([{ name: "정리본_진짜.docx", mtime: "11-20T10:00" }, { name: "정리본.docx", mtime: "11-18T10:00" }]), rules);
  check(S, "E11 진짜 단독은 키워드 아님 → 다른 그룹", [a.groups.length, a.singles.map((f) => f.parsed.baseName)], [0, ["정리본진짜", "정리본"]]);
}
{ // E12
  const a = analyze(mk([
    { name: "자료(2).pdf", mtime: "11-17T10:00" }, { name: "자료_1.pdf", mtime: "11-18T10:00" },
    { name: "자료 copy.pdf", mtime: "11-19T10:00" }, { name: "자료 - 복사본.pdf", mtime: "11-20T10:00" },
  ]), rules);
  check(S, "E12 복사본 표시 4종 한 그룹", [a.groups.length, grp(a, "자료")?.files.length, latestName(a, "자료"), grp(a, "자료")?.decidedBy],
    [1, 4, "자료 - 복사본.pdf", "mtime"]);
}
{ // E13
  const a = analyze(mk([{ name: "자료_123.pdf", mtime: "11-20T10:00" }, { name: "자료.pdf", mtime: "11-18T10:00" }]), rules);
  check(S, "E13 _123은 복사본 표시 아님", a.groups.length, 0);
}
{ // E14 이름 같고 내용 다름, 따로 올림
  const a = analyze(mk([{ name: "보고서.docx", mtime: "11-18T10:00", batch: 1, bytes: "A" }, { name: "보고서.docx", mtime: "11-20T10:00", batch: 2, bytes: "B" }]), rules);
  check(S, "E14 내용 다르면 중복 아님", [a.duplicates, grp(a, "보고서")?.files.length, grp(a, "보고서")?.decidedBy], [0, 2, "mtime"]);
  check(S, "E14 새 이름 겹치지 않음", rename(a, { scope: "all" }).map((r) => r.to).sort(), ["보고서_v1_20261118.docx", "보고서_v2_20261120.docx"]);
}
{ // E15 그룹이 달라도 중복, 따로 올리면 나중 쪽
  const a = analyze(mk([{ name: "보고서_v3.docx", mtime: "11-20T10:00", batch: 1, bytes: "SAME" }, { name: "기획안_최종.docx", mtime: "11-21T10:00", batch: 2, bytes: "SAME" }]), rules);
  check(S, "E15 다른 그룹·나중에 올린 쪽이 중복", a.singles.map((f) => [f.name, !!f.duplicateOf]), [["보고서_v3.docx", false], ["기획안_최종.docx", true]]);
  // D-04: 따로 올렸으면 복사본 표시보다 업로드 순서가 먼저
  const b = analyze(mk([{ name: "자료 - 복사본.pdf", mtime: "11-20T10:00", batch: 1, bytes: "X" }, { name: "자료.pdf", mtime: "11-20T10:00", batch: 2, bytes: "X" }]), rules);
  check(S, "E15b 따로 올리면 복사본 표시가 있어도 먼저 올린 쪽을 남김", grp(b, "자료")?.files.map((f) => [f.name, !!f.duplicateOf]), [["자료 - 복사본.pdf", false], ["자료.pdf", true]]);
}
{ // E16 20MB
  const r = acceptFiles([], [{ name: "big.pdf", size: MAX_SIZE + 1, lastModified: 0 }, { name: "edge.pdf", size: MAX_SIZE, lastModified: 0 }]);
  check(S, "E16 20MB 초과는 빼고 딱 20MB는 받음", [r.tooLarge.map((f) => f.name), r.accepted.map((f) => f.name)], [["big.pdf"], ["edge.pdf"]]);
  const s = acceptFiles([{ name: "a.pdf", size: 1, lastModified: 1 }], [{ name: "a.pdf", size: 1, lastModified: 1 }, { name: "b.pdf", size: 1, lastModified: 1 }, { name: "b.pdf", size: 1, lastModified: 1 }]);
  check(S, "F-01-01 같은 파일 다시 올림(M-04), 한 번에 두 번 놓아도 하나", [s.same.length, s.accepted.length], [2, 1]);
}
{ // E17
  check(S, "E17 확장자 없음", splitExt("README"), ["README", ""]);
  const a = analyze(mk([{ name: "README", mtime: "11-20T10:00" }, { name: "x.pdf", mtime: "11-20T10:00" }]), rules);
  check(S, "E17 확장자 없음 새 이름", rename(a).find((r) => r.from === "README")?.to, "README_v1_20261120");
}
{ // E18
  const a = analyze(mk([{ name: "최종.docx", mtime: "11-20T10:00" }, { name: "최종 (1).docx", mtime: "11-21T10:00" }]), rules);
  check(S, "E18 빈 이름 → 복사본 표시만 지운 이름으로 한 그룹 (D-27)", [a.groups.map((g) => [g.baseName, g.files.length, g.latestId]), a.singles.length], [[["최종", 2, "최종 (1).docx|1"]], 0]);
  check(S, "E18 새 이름", rename(a, { scope: "all" }).map((r) => r.to), ["최종_v2_20261121.docx", "최종_v1_20261120.docx"]);
}
{ // D-09 직접 선택, F-03-05 충돌·금지 문자, D-11 단독 포함
  const a = analyze(mk([
    { name: "발표자료_진짜최종.pptx", mtime: "11-20T10:00" }, { name: "발표자료 최종수정.pptx", mtime: "11-19T10:00" },
    { name: "발표자료_최종.pptx", mtime: "11-18T10:00" }, { name: "발표자료(1).pptx", mtime: "11-17T10:00" },
    { name: "회의록.pptx", mtime: "11-20T10:00" },
  ]), rules);
  const g = a.groups[0];
  const pick = g.files.find((f) => f.name === "발표자료_최종.pptx")!.id;
  check(S, "D-09 고른 파일이 가장 큰 번호", rename(a, { scope: "all", choices: { [g.key]: pick } }).map((r) => [r.from, r.to]),
    [["발표자료_진짜최종.pptx", "발표자료_v3_20261120.pptx"], ["발표자료 최종수정.pptx", "발표자료_v2_20261119.pptx"],
     ["발표자료_최종.pptx", "발표자료_v4_20261118.pptx"], ["발표자료(1).pptx", "발표자료_v1_20261117.pptx"], ["회의록.pptx", "회의록_v1_20261120.pptx"]]);
  check(S, "D-11 [최신 파일만]에 단독 포함", rename(a).filter((r) => r.download).map((r) => r.from), ["발표자료_진짜최종.pptx", "회의록.pptx"]);
  check(S, "F-03-05 금지 문자 → _", rename(a, { baseNames: { [g.key]: 'a/b:c*?"<>|' } })[0].to, "a_b_c_______v4_20261120.pptx");
  // 기본 이름을 단독 파일 이름과 같게 고치면 v1 vs v4라 안 겹침 → 같은 번호가 나오게 만든다
  const b = analyze(mk([{ name: "A_v1.pdf", mtime: "11-20T10:00" }, { name: "A_v2.pdf", mtime: "11-20T11:00" }, { name: "B_v1.pdf", mtime: "11-20T10:00" }, { name: "B_v2.pdf", mtime: "11-20T11:00" }]), rules);
  const keys = Object.fromEntries(b.groups.map((x) => [x.key, "같은이름"]));
  check(S, "F-03-05 이름 겹침 → _2", rename(b, { scope: "all", baseNames: keys }).map((r) => r.to),
    ["같은이름_v2_20261120.pdf", "같은이름_v1_20261120.pdf", "같은이름_v2_20261120_2.pdf", "같은이름_v1_20261120_2.pdf"]);
}
// 메타데이터 M01~M04: D-19 보류
out.push({ stage: S, id: "M01~M04 메타데이터 판정", ok: "skip", detail: "D-19 보류" });

// ---------- 불변식 (fuzz) ----------
const seed = Number(process.env.SEED ?? 42);
let st = seed;
const rnd = () => ((st = (st * 1103515245 + 12345) & 0x7fffffff), st / 0x7fffffff);
const pickr = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const BASES = ["발표자료", "보고서", "기획안", "memo", "회의록"];
const DECOS: (() => string)[] = [
  () => "", () => pickr(["_v", "_V", "_ver", " v"]) + (1 + Math.floor(rnd() * 12)),
  () => pickr(["_1120", "_1119", "_2026-11-18", "_20261117", "_11.21"]),
  () => pickr(["_", " ", "-"]) + pickr(["진짜최종", "찐최종", "최종수정", "최종_수정", "최종", "final", "FINAL", "완성", "제출", "수정"]),
];
const COPY = ["", "", "(1)", " (2)", "_1", " 복사본", " - 복사본", " copy"];
const REASON = [/^파일명에 (v|ver|V|VER)\d+가 있어요$/, /^파일명의 날짜\(.+\)가 가장 늦어요$/, /^파일명에 '.+'이 있어요$/,
  /^수정 날짜가 가장 늦어요\. 카톡에서 받은 순서일 수 있어요$/, /^단서가 같아서 고를 수 없어요\. 직접 골라 주세요$/, /^중복을 빼면 이 파일만 남아요$/];
const FUZZ = 300;
const fails: Record<string, string[]> = {};
const bad = (k: string, m: string) => ((fails[k] ??= []).length < 3 && fails[k].push(m));
for (let t = 0; t < FUZZ; t++) {
  const n = 2 + Math.floor(rnd() * 9);
  const specs: (Spec & { base: string })[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const b = pickr(BASES);
    const [d1, d2] = [...DECOS].sort(() => rnd() - 0.5); // 같은 종류 꾸밈(날짜 2개 등)은 한 이름에 넣지 않음
    const name = b + d1() + d2() + pickr(COPY) + "." + (b === "memo" ? "txt" : pickr(["docx", "pptx"]));
    if (seen.has(name)) continue;
    seen.add(name);
    const dupSrc = specs.length && rnd() < 0.15 ? pickr(specs) : null;
    specs.push({ name, base: b, mtime: `11-${10 + Math.floor(rnd() * 10)}T1${Math.floor(rnd() * 10)}:00`, bytes: dupSrc?.bytes ?? `${name}#${t}` });
  }
  const input = mk(specs);
  const a = analyze(input, rules);
  const rows = rename(a, { scope: "all" });
  const tag = `seed${seed} t${t} [${specs.map((s) => s.name).join(", ")}]`;
  for (const r of rows) {
    if (r.to && (!/^.+_v\d+_\d{8}(_\d+)?\.[^.]+$/.test(r.to) || /[\\/:*?"<>|]/.test(r.to))) bad("I1 새 이름 형식", `${r.to} ${tag}`);
    if (r.duplicate && (r.to || r.download)) bad("I9 중복은 번호·내려받기 없음", `${r.from} ${tag}`);
  }
  for (const g of a.groups) {
    const nd = g.files.filter((f) => !f.duplicateOf);
    const nums = nd.map((f) => rows.find((r) => r.id === f.id)!.to).map((x) => (x ? Number(x.match(/_v(\d+)_/)![1]) : null));
    if (g.status === "확인 필요") { if (nums.some((x) => x !== null) || g.latestId) bad("I4 확인 필요는 선택 없음", tag); continue; }
    const sorted = [...nums].sort((x, y) => x! - y!);
    if (sorted.some((x, i) => x !== i + 1)) bad("I2 번호 1..k", `${g.baseName} ${JSON.stringify(nums)} ${tag}`);
    const latestNum = Number(rows.find((r) => r.id === g.latestId)!.to!.match(/_v(\d+)_/)![1]);
    if (latestNum !== nd.length) bad("I3 최신 후보가 가장 큰 번호", tag);
  }
  for (const r of a.groups.map((g) => g.reason)) if (!REASON.some((re) => re.test(r))) bad("I10 추천 이유 문구 틀", `${r} ${tag}`);
  const tos = rows.flatMap((r) => (r.to ? [r.to.toLowerCase()] : []));
  if (new Set(tos).size !== tos.length) bad("I7 새 이름 안 겹침", tag);
  for (const f of [...a.groups.flatMap((g) => g.files), ...a.singles]) {
    const want = specs.find((s) => s.name === f.name)!.base;
    if (f.parsed.baseName !== want) bad("I8 꾸밈만 다르면 같은 그룹", `${f.name} → '${f.parsed.baseName}' (기대 '${want}')`);
  }
  if (JSON.stringify(analyze(input, rules)) !== JSON.stringify(a)) bad("I6 두 번 돌려도 같음", tag);
  // 바이트가 같은 파일이 있는 그룹은 D-04상 목록 순서에 따라 중복 쪽이 바뀌므로 최신 후보 비교에서 뺌
  const dupBytes = new Set(specs.filter((s) => specs.filter((o) => o.bytes === s.bytes).length > 1).map((s) => `${s.name}|1`));
  const sig = (x: ReturnType<typeof analyze>) => JSON.stringify([
    // 바이트가 같은 파일은 어느 쪽이 중복인지에 따라 그룹·단독 자리가 바뀔 수 있어 빼고 비교
    x.groups.map((g) => [g.key, g.files.map((f) => f.id).filter((id) => !dupBytes.has(id)).sort(), g.decidedBy === "tie" || g.files.some((f) => dupBytes.has(f.id)) ? "-" : g.latestId]).filter((g) => (g[1] as string[]).length).sort(),
    x.singles.map((f) => f.id).filter((id) => !dupBytes.has(id)).sort(), x.duplicates]);
  for (let k = 0; k < 3; k++) {
    const shuffled = [...input].sort(() => rnd() - 0.5).map((f, order) => ({ ...f, order }));
    if (sig(analyze(shuffled, rules)) !== sig(a)) { bad("I5 입력 순서를 섞어도 같음", tag); break; }
  }
}
for (const k of ["I1 새 이름 형식", "I2 번호 1..k", "I3 최신 후보가 가장 큰 번호", "I4 확인 필요는 선택 없음", "I5 입력 순서를 섞어도 같음",
  "I6 두 번 돌려도 같음", "I7 새 이름 안 겹침", "I8 꾸밈만 다르면 같은 그룹", "I9 중복은 번호·내려받기 없음", "I10 추천 이유 문구 틀"])
  out.push({ stage: "불변식", id: k, ok: !fails[k], detail: fails[k]?.join("\n      ") });

// ---------- 출력 ----------
const mark = (o: R["ok"]) => (o === true ? "PASS" : o === false ? "FAIL" : o === "skip" ? "SKIP" : "확인 필요");
for (const r of out) if (r.ok !== true) console.log(`${mark(r.ok)} [${r.stage}] ${r.id}${r.detail ? `\n      ${r.detail}` : ""}`);
const stages = [...new Set(out.map((r) => r.stage))];
for (const s of stages) {
  const c = (o: R["ok"]) => out.filter((r) => r.stage === s && r.ok === o).length;
  console.log(`${s}: PASS ${c(true)} FAIL ${c(false)} SKIP ${c("skip")} 확인필요 ${c("ask")}`);
}
console.log(`seed ${seed}, fuzz ${FUZZ}`);
process.exit(out.some((r) => r.ok === false) ? 1 : 0);
