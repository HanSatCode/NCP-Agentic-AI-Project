import { test } from "node:test";
import assert from "node:assert/strict";
import rules from "../../rules/version-rules.json" with { type: "json" };
import { parseName } from "./baseName.ts";

const p = (name: string) => parseName(name, rules);

test("판정 예시: 발표자료 그룹 (키워드 점수)", () => {
  for (const [name, score] of [
    ["발표자료_진짜최종.pptx", 40],
    ["발표자료 최종수정.pptx", 30],
    ["발표자료_최종.pptx", 20],
  ] as const) {
    const r = p(name);
    assert.equal(r.baseName, "발표자료", name);
    assert.equal(r.ext, "pptx");
    assert.equal(r.keyword?.score, score, name);
  }
  const copy = p("발표자료(1).pptx");
  assert.equal(copy.baseName, "발표자료");
  assert.equal(copy.copyMark, "(1)");
  assert.equal(copy.keyword, null);
  assert.equal(copy.version, null); // 복사본 표시는 버전으로 세지 않음 (D-02)
});

test("판정 예시: 보고서 그룹 (버전 번호, 복사본)", () => {
  assert.deepEqual(p("보고서_v3.docx").version, { n: 3, raw: "v3" });
  const dup = p("보고서_v3 복사본.docx");
  assert.equal(dup.baseName, "보고서");
  assert.equal(dup.copyMark, "복사본");
  assert.equal(dup.version?.n, 3);
  assert.equal(p("보고서 ver2.docx").version?.n, 2);
  assert.equal(p("보고서_V12.docx").version?.raw, "V12");
});

test("D-01: 최종_수정은 최종수정 30점, 이유에는 적힌 그대로", () => {
  const r = p("기획서_최종_수정.docx");
  assert.equal(r.baseName, "기획서");
  assert.deepEqual(r.keyword, { word: "최종수정", score: 30, raw: "최종_수정" });
  assert.equal(p("진짜보고서.docx").keyword, null); // "진짜" 단독은 키워드 아님
  assert.equal(p("발표 찐최종.pptx").keyword?.score, 40);
});

test("D-26: 키워드 뒤 '본'까지 지우고 점수는 같음", () => {
  for (const [name, score] of [["발표자료_수정본.pptx", 10], ["발표자료_최종본.pptx", 20], ["발표자료_최종_수정본.pptx", 30], ["발표자료 진짜최종본.pptx", 40]] as const) {
    assert.equal(p(name).baseName, "발표자료", name);
    assert.equal(p(name).keyword?.score, score, name);
  }
  assert.equal(p("발표자료_최종본.pptx").keyword?.raw, "최종본");
  assert.equal(p("정리본.docx").baseName, "정리본"); // "본" 단독은 키워드 아님
});

test("영문은 대소문자 구분 안 함", () => {
  const r = p("report_FINAL_V2.docx");
  assert.equal(r.baseName, "report");
  assert.equal(r.version?.n, 2);
  assert.deepEqual(r.keyword, { word: "final", score: 20, raw: "FINAL" });
  assert.equal(p("review2.docx").version, null); // 단어 속 v는 버전 아님
});

test("파일명 날짜 4가지 모양", () => {
  assert.deepEqual(p("발표_1120.pptx").date, { year: null, month: 11, day: 20, raw: "1120" });
  assert.deepEqual(p("발표_20261120.pptx").date, { year: 2026, month: 11, day: 20, raw: "20261120" });
  assert.deepEqual(p("발표_2026-11-20.pptx").date, { year: 2026, month: 11, day: 20, raw: "2026-11-20" });
  assert.deepEqual(p("발표_11.20.pptx").date, { year: null, month: 11, day: 20, raw: "11.20" });
  for (const n of ["발표_1120", "발표_20261120", "발표_2026-11-20", "발표_11.20"]) {
    assert.equal(p(`${n}.pptx`).baseName, "발표", n);
  }
});

test("D-03: 월·일로 못 읽는 4자리는 날짜 아님", () => {
  const r = p("실험_1350.docx");
  assert.equal(r.date, null);
  assert.equal(r.baseName, "실험1350");
  assert.equal(p("실험_1350_1120.docx").date?.raw, "1120");
  assert.equal(p("보고서_v1.2.docx").date, null); // 버전 뒤 숫자는 날짜로 안 봄
});

test("애매한 경우 (samples/edge)", () => {
  assert.equal(p("회의록(1).hwp").baseName, "회의록");
  assert.equal(p("메모_최종.txt").baseName, "메모");
  assert.equal(p("메모-최종.txt").baseName, "메모");
  const r = p("자료_v2 - 복사본.pdf");
  assert.equal(r.baseName, "자료");
  assert.equal(r.copyMark, "- 복사본");
  assert.equal(p("보고서 - 복사본 (2).docx").baseName, "보고서");
  assert.equal(p("발표_1.pptx").copyMark, "_1");
});

test("빈 이름·확장자 없음", () => {
  const r = p("최종.pptx");
  assert.equal(r.baseName, "최종"); // 다 지워지면 원래 이름
  assert.equal(r.keyword?.score, 20);
  assert.equal(p("README").ext, "");
  assert.equal(p(".env").ext, "");
  assert.equal(p("copy.txt").baseName, "copy"); // 이름 전체가 복사본 표시면 다 지워져서 원래 이름
  assert.equal(p("(1).docx").baseName, "(1)");
  assert.equal(p("최종 (1).pptx").baseName, "최종"); // D-27: 복사본 표시만 지운 이름이라 "최종.pptx"와 한 그룹
  assert.equal(p("final_1.txt").baseName, "final");
});

test("D-33: 정리한 이름(v04)을 다시 올려도 같은 그룹·같은 버전으로 읽음", () => {
  const r = p("발표자료_v04_20261120.pptx");
  assert.equal(r.baseName, "발표자료");
  assert.equal(r.version?.n, 4);
  assert.equal(p("발표자료_v10_20261120.pptx").version?.n, 10);
});

test("D-45 한글 날짜: 11월20일, 2026년 11월 20일을 날짜로 읽고 기본 이름에서 지움", () => {
  const a = p("회의록_11월20일.hwp");
  assert.equal(a.baseName, "회의록");
  assert.deepEqual([a.date?.month, a.date?.day, a.date?.raw], [11, 20, "11월20일"]);
  const b = p("보고서 2026년 1월 5일 최종.docx");
  assert.equal(b.baseName, "보고서");
  assert.deepEqual([b.date?.year, b.date?.month, b.date?.day], [2026, 1, 5]);
  assert.equal(p("발표_13월40일.pptx").date, null); // 월·일로 읽히지 않으면 날짜 아님
});
