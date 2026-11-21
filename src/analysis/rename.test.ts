import { test } from "node:test";
import assert from "node:assert/strict";
import rules from "../../rules/version-rules.json" with { type: "json" };
import { analyze } from "./analyze.ts";
import { rename, type RenameOptions } from "./rename.ts";
import type { InputFile } from "./types.ts";

const make = (list: [name: string, mtime: string, content?: string][]): InputFile[] =>
  list.map(([name, mtime, content], order) => {
    const bytes = new TextEncoder().encode(content ?? `${name}-${order}`);
    return { id: name, name, size: bytes.length, lastModified: new Date(`2026-${mtime}T12:00:00`).getTime(), order, batch: 1, bytes };
  });
const run = (list: Parameters<typeof make>[0], opts?: RenameOptions) => rename(analyze(make(list), rules), opts);
const table = (rows: ReturnType<typeof rename>) => Object.fromEntries(rows.map((r) => [r.from, r.to]));
const downloads = (rows: ReturnType<typeof rename>) => rows.filter((r) => r.download).map((r) => r.to);

const DEMO: Parameters<typeof make>[0] = [
  ["발표자료_진짜최종.pptx", "11-20"],
  ["발표자료 최종수정.pptx", "11-19"],
  ["발표자료_최종.pptx", "11-18"],
  ["발표자료(1).pptx", "11-17"],
  ["보고서_v3.docx", "11-20", "same"],
  ["보고서_v3 복사본.docx", "11-20", "same"],
  ["보고서_v2.docx", "11-16"],
  ["회의록_1115.docx", "11-15"],
];

test("판정 예시 그대로: 번호는 그룹 안 순서, 중복은 제외 (D-06, D-13)", () => {
  assert.deepEqual(table(run(DEMO, { scope: "all" })), {
    "발표자료_진짜최종.pptx": "발표자료_v4_20261120.pptx",
    "발표자료 최종수정.pptx": "발표자료_v3_20261119.pptx",
    "발표자료_최종.pptx": "발표자료_v2_20261118.pptx",
    "발표자료(1).pptx": "발표자료_v1_20261117.pptx",
    "보고서_v3.docx": "보고서_v2_20261120.docx",
    "보고서_v3 복사본.docx": null,
    "보고서_v2.docx": "보고서_v1_20261116.docx",
    "회의록_1115.docx": "회의록_v1_20261115.docx",
  });
});

test("내려받을 범위: 최신 파일만(기본)은 그룹 최신 + 단독 (D-11), 전체는 중복만 빼고", () => {
  assert.deepEqual(downloads(run(DEMO)), ["발표자료_v4_20261120.pptx", "보고서_v2_20261120.docx", "회의록_v1_20261115.docx"]);
  assert.equal(downloads(run(DEMO, { scope: "all" })).length, 7);
  const dup = run(DEMO).find((r) => r.from === "보고서_v3 복사본.docx")!;
  assert.equal(dup.duplicate, true);
  assert.equal(dup.download, false);
});

test("D-09: 직접 고른 파일이 가장 큰 번호, 나머지는 원래 순서", () => {
  const rows = run(DEMO, { scope: "all", choices: { "발표자료.pptx": "발표자료_최종.pptx" } });
  assert.deepEqual(
    rows.filter((r) => r.from.startsWith("발표자료")).map((r) => [r.from, r.to]),
    [
      ["발표자료_진짜최종.pptx", "발표자료_v3_20261120.pptx"],
      ["발표자료 최종수정.pptx", "발표자료_v2_20261119.pptx"],
      ["발표자료_최종.pptx", "발표자료_v4_20261118.pptx"],
      ["발표자료(1).pptx", "발표자료_v1_20261117.pptx"],
    ],
  );
  assert.ok(downloads(run(DEMO, { choices: { "발표자료.pptx": "발표자료_최종.pptx" } })).includes("발표자료_v4_20261118.pptx"));
  // 중복 파일이나 그룹에 없는 파일을 고른 값은 무시
  assert.deepEqual(table(run(DEMO, { scope: "all", choices: { "보고서.docx": "보고서_v3 복사본.docx" } })), table(run(DEMO, { scope: "all" })));
});

test("확인 필요 그룹은 고르기 전까지 새 이름 없음, 고르면 생김", () => {
  const tie: Parameters<typeof make>[0] = [["메모_최종.txt", "11-20"], ["메모-최종.txt", "11-20"]];
  assert.deepEqual(table(run(tie, { scope: "all" })), { "메모_최종.txt": null, "메모-최종.txt": null });
  assert.deepEqual(downloads(run(tie)), []);
  assert.deepEqual(table(run(tie, { scope: "all", choices: { "메모.txt": "메모-최종.txt" } })), {
    "메모_최종.txt": "메모_v1_20261120.txt",
    "메모-최종.txt": "메모_v2_20261120.txt",
  });
});

test("기본 이름 고치기: 금지 문자는 _로, 비우면 원래 이름 (F-03-02, F-03-05)", () => {
  const rows = run(DEMO, { baseNames: { "발표자료.pptx": ' 3조:발표/최종?"본" ' } });
  assert.equal(rows[0].to, "3조_발표_최종__본__v4_20261120.pptx");
  assert.equal(run(DEMO, { baseNames: { "발표자료.pptx": "   " } })[0].to, "발표자료_v4_20261120.pptx");
});

test("새 이름이 겹치면 _2, _3 (대소문자 무시)", () => {
  const files: Parameters<typeof make>[0] = [
    ["보고서_v1.docx", "11-20"],
    ["보고서_v2.docx", "11-20"],
    ["자료_v1.docx", "11-20"],
    ["자료_v2.docx", "11-20"],
    ["메모_v1.docx", "11-20"],
    ["메모_v2.docx", "11-20"],
  ];
  const rows = run(files, { scope: "all", baseNames: { "자료.docx": "보고서", "메모.docx": "보고서" } });
  assert.deepEqual(table(rows), {
    "보고서_v1.docx": "보고서_v1_20261120.docx",
    "보고서_v2.docx": "보고서_v2_20261120.docx",
    "자료_v1.docx": "보고서_v1_20261120_2.docx",
    "자료_v2.docx": "보고서_v2_20261120_2.docx",
    "메모_v1.docx": "보고서_v1_20261120_3.docx",
    "메모_v2.docx": "보고서_v2_20261120_3.docx",
  });
  const cased = run(files.slice(0, 4), { scope: "all", baseNames: { "보고서.docx": "Report", "자료.docx": "report" } });
  assert.equal(table(cased)["자료_v1.docx"], "report_v1_20261120_2.docx");
});

test("확장자 없는 파일", () => {
  assert.deepEqual(table(run([["README", "11-20"], ["README_v2", "11-21"]], { scope: "all" })), {
    README: "README_v1_20261120",
    README_v2: "README_v2_20261121",
  });
});
