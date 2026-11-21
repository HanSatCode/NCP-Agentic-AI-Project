import { test } from "node:test";
import assert from "node:assert/strict";
import rules from "../../rules/version-rules.json" with { type: "json" };
import { analyze, reasonDetail } from "./analyze.ts";
import type { InputFile } from "./types.ts";

// mtime은 "11-20" 같은 날짜, content가 같으면 중복
const make = (list: [name: string, mtime: string, content?: string][]): InputFile[] =>
  list.map(([name, mtime, content], order) => {
    const bytes = new TextEncoder().encode(content ?? `${name}-${order}`);
    return { id: name, name, size: bytes.length, lastModified: new Date(`2026-${mtime}T12:00:00+09:00`).getTime(), order, batch: 1, bytes };
  });
const run = (list: Parameters<typeof make>[0]) => analyze(make(list), rules);
const names = (g: { files: { name: string }[] }) => g.files.map((f) => f.name);

test("판정 예시: 발표자료 그룹은 키워드 순", () => {
  const [g] = run([
    ["발표자료(1).pptx", "11-17"],
    ["발표자료_최종.pptx", "11-18"],
    ["발표자료_진짜최종.pptx", "11-16"], // 수정 날짜가 가장 이르지만 키워드가 먼저
    ["발표자료 최종수정.pptx", "11-19"],
  ]).groups;
  assert.deepEqual(names(g), ["발표자료_진짜최종.pptx", "발표자료 최종수정.pptx", "발표자료_최종.pptx", "발표자료(1).pptx"]);
  assert.equal(g.status, "최신 후보");
  assert.equal(g.latestId, "발표자료_진짜최종.pptx");
  assert.equal(g.reason, "파일명에 '진짜최종'이 있어요");
});

test("기준 순서: 버전 번호 > 파일명 날짜 > 키워드 > 수정 날짜", () => {
  const v = run([["보고서_v3.docx", "11-01"], ["보고서_진짜최종_1130.docx", "11-30"]]).groups[0];
  assert.equal(v.latestId, "보고서_v3.docx");
  assert.equal(v.reason, "파일명에 v3가 있어요");

  const d = run([["보고서_11.20.docx", "11-01"], ["보고서_진짜최종_11.19.docx", "11-30"]]).groups[0];
  assert.equal(d.latestId, "보고서_11.20.docx");
  assert.equal(d.reason, "파일명의 날짜(11.20)가 가장 늦어요");

  const k = run([["보고서_수정.docx", "11-30"], ["보고서_최종.docx", "11-01"]]).groups[0];
  assert.equal(k.latestId, "보고서_최종.docx");

  const m = run([["회의록.hwp", "11-18"], ["회의록(1).hwp", "11-19"]]).groups[0];
  assert.equal(m.latestId, "회의록(1).hwp");
  assert.equal(m.decidedBy, "mtime");
  assert.equal(m.reason, "수정 날짜가 가장 늦어요. 카톡에서 받은 순서일 수 있어요");
});

test("파일명 날짜: 연도가 둘 다 있으면 연도부터, 날짜가 없는 쪽이 더 오래됨", () => {
  const y = run([["계획_20261231.docx", "11-01"], ["계획_20270101.docx", "11-01"]]).groups[0];
  assert.equal(y.latestId, "계획_20270101.docx");
  const none = run([["계획.docx", "11-30"], ["계획_0101.docx", "11-01"]]).groups[0];
  assert.equal(none.latestId, "계획_0101.docx");
});

test("1위 동점이면 확인 필요, 2위 이하 동점은 목록 순서 (D-10)", () => {
  const r = run([["메모_최종.txt", "11-20"], ["메모-최종.txt", "11-20"]]);
  const [g] = r.groups;
  assert.equal(g.status, "확인 필요");
  assert.equal(g.latestId, null);
  assert.equal(g.reason, "단서가 같아서 고를 수 없어요. 직접 골라 주세요");
  assert.equal(r.needsChoice, 1);

  const t = run([["자료_v2.docx", "11-20"], ["자료 (1).docx", "11-20"], ["자료(2).docx", "11-20"]]).groups[0];
  assert.equal(t.status, "최신 후보");
  assert.deepEqual(names(t), ["자료_v2.docx", "자료 (1).docx", "자료(2).docx"]);
});

test("중복은 비교에서 빼고 맨 뒤 (D-06), 하나만 남으면 D-25 문구", () => {
  const [g] = run([
    ["보고서_v3.docx", "11-20", "same"],
    ["보고서_v3 복사본.docx", "11-20", "same"],
    ["보고서_v2.docx", "11-16"],
  ]).groups;
  assert.equal(g.latestId, "보고서_v3.docx");
  assert.deepEqual(names(g), ["보고서_v3.docx", "보고서_v2.docx", "보고서_v3 복사본.docx"]);
  assert.equal(g.files[2].duplicateOf, "보고서_v3.docx");

  const [only] = run([["자료_v2.pdf", "11-19", "x"], ["자료_v2 - 복사본.pdf", "11-19", "x"]]).groups;
  assert.equal(only.status, "최신 후보");
  assert.equal(only.decidedBy, "only");
  assert.equal(only.reason, "중복을 빼면 이 파일만 남아요");
});

test("그룹 분류: 확장자가 다르면 다른 그룹, 대소문자는 같게, 파일 수가 많은 그룹부터, 단독 파일", () => {
  const r = run([
    ["회의록.docx", "11-15"],
    ["보고서.docx", "11-01"],
    ["보고서_최종.DOCX", "11-02"],
    ["발표.pptx", "11-01"],
    ["발표_최종.pptx", "11-02"],
    ["발표_진짜최종.pptx", "11-03"],
    ["보고서.pdf", "11-03"],
  ]);
  assert.deepEqual(r.groups.map((g) => g.baseName), ["발표", "보고서"]);
  assert.deepEqual(r.singles.map((f) => f.name), ["회의록.docx", "보고서.pdf"]);
  assert.equal(r.summary, "그룹 2개 · 단독 2개 · 중복 0개");
});

test("같은 파일 수면 목록에 먼저 나온 그룹부터", () => {
  const r = run([["나_v1.txt", "11-01"], ["가_v1.txt", "11-01"], ["가_v2.txt", "11-01"], ["나_v2.txt", "11-01"]]);
  assert.deepEqual(r.groups.map((g) => g.baseName), ["나", "가"]);
});

test("그룹 파일이 모두 다른 그룹의 중복이면 그룹을 만들지 않고 단독 파일 카드에 중복으로 둠 (F-03-03)", () => {
  const r = run([["A.pptx", "11-01", "X"], ["B.pptx", "11-01", "Y"], ["발표자료_최종.pptx", "11-02", "X"], ["발표자료_진짜최종.pptx", "11-03", "Y"]]);
  assert.equal(r.groups.length, 0);
  assert.deepEqual(r.singles.map((f) => [f.name, !!f.duplicateOf]), [["A.pptx", false], ["B.pptx", false], ["발표자료_최종.pptx", true], ["발표자료_진짜최종.pptx", true]]);
  assert.equal(r.summary, "그룹 0개 · 단독 4개 · 중복 2개");
});

test("D-37 자세한 이유: 정한 단서를 적힌 그대로, 바로 앞 버전 이름, 중복은 앞 버전에서 뺌", () => {
  const v = run([["보고서_v2.docx", "11-01"], ["보고서_v3.docx", "11-02"]]).groups[0];
  assert.match(reasonDetail(v), /번호\(v3\)가 그룹에서 가장 커요/);
  assert.match(reasonDetail(v), /바로 앞 버전은 '보고서_v2\.docx' 파일이에요/);
  const only = run([["자료.docx", "11-01", "같음"], ["자료 - 복사본.docx", "11-01", "같음"]]).groups[0];
  assert.doesNotMatch(reasonDetail(only), /바로 앞 버전/);
  assert.match(reasonDetail(only), /중복이라 비교에서 뺐어요/);
});
