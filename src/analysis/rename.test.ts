import { test } from "node:test";
import assert from "node:assert/strict";
import rules from "../../rules/version-rules.json" with { type: "json" };
import { analyze } from "./analyze.ts";
import { DATE_FORMATS, rename, VERSION_FORMATS, type NamePart, type RenameOptions } from "./rename.ts";
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
    "발표자료_진짜최종.pptx": "발표자료_v04_20261120.pptx",
    "발표자료 최종수정.pptx": "발표자료_v03_20261119.pptx",
    "발표자료_최종.pptx": "발표자료_v02_20261118.pptx",
    "발표자료(1).pptx": "발표자료_v01_20261117.pptx",
    "보고서_v3.docx": "보고서_v02_20261120.docx",
    "보고서_v3 복사본.docx": null,
    "보고서_v2.docx": "보고서_v01_20261116.docx",
    "회의록_1115.docx": "회의록_v01_20261115.docx",
  });
});

test("내려받을 범위: 최신 파일만(기본)은 그룹 최신 + 단독 (D-11), 전체는 중복만 빼고", () => {
  assert.deepEqual(downloads(run(DEMO)), ["발표자료_v04_20261120.pptx", "보고서_v02_20261120.docx", "회의록_v01_20261115.docx"]);
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
      ["발표자료_진짜최종.pptx", "발표자료_v03_20261120.pptx"],
      ["발표자료 최종수정.pptx", "발표자료_v02_20261119.pptx"],
      ["발표자료_최종.pptx", "발표자료_v04_20261118.pptx"],
      ["발표자료(1).pptx", "발표자료_v01_20261117.pptx"],
    ],
  );
  assert.ok(downloads(run(DEMO, { choices: { "발표자료.pptx": "발표자료_최종.pptx" } })).includes("발표자료_v04_20261118.pptx"));
  // 중복 파일이나 그룹에 없는 파일을 고른 값은 무시
  assert.deepEqual(table(run(DEMO, { scope: "all", choices: { "보고서.docx": "보고서_v3 복사본.docx" } })), table(run(DEMO, { scope: "all" })));
});

test("확인 필요 그룹은 고르기 전까지 새 이름 없음, 고르면 생김", () => {
  const tie: Parameters<typeof make>[0] = [["메모_최종.txt", "11-20"], ["메모-최종.txt", "11-20"]];
  assert.deepEqual(table(run(tie, { scope: "all" })), { "메모_최종.txt": null, "메모-최종.txt": null });
  assert.deepEqual(downloads(run(tie)), []);
  assert.deepEqual(table(run(tie, { scope: "all", choices: { "메모.txt": "메모-최종.txt" } })), {
    "메모_최종.txt": "메모_v01_20261120.txt",
    "메모-최종.txt": "메모_v02_20261120.txt",
  });
});

test("기본 이름 고치기: 금지 문자는 _로, 비우면 원래 이름 (F-03-02, F-03-05)", () => {
  const rows = run(DEMO, { baseNames: { "발표자료.pptx": ' 3조:발표/최종?"본" ' } });
  assert.equal(rows[0].to, "3조_발표_최종__본__v04_20261120.pptx");
  assert.equal(run(DEMO, { baseNames: { "발표자료.pptx": "   " } })[0].to, "발표자료_v04_20261120.pptx");
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
    "보고서_v1.docx": "보고서_v01_20261120.docx",
    "보고서_v2.docx": "보고서_v02_20261120.docx",
    "자료_v1.docx": "보고서_v01_20261120_2.docx",
    "자료_v2.docx": "보고서_v02_20261120_2.docx",
    "메모_v1.docx": "보고서_v01_20261120_3.docx",
    "메모_v2.docx": "보고서_v02_20261120_3.docx",
  });
  const cased = run(files.slice(0, 4), { scope: "all", baseNames: { "보고서.docx": "Report", "자료.docx": "report" } });
  assert.equal(table(cased)["자료_v1.docx"], "report_v01_20261120_2.docx");
});

test("확장자 없는 파일", () => {
  assert.deepEqual(table(run([["README", "11-20"], ["README_v2", "11-21"]], { scope: "all" })), {
    README: "README_v01_20261120",
    README_v2: "README_v02_20261121",
  });
});

test("중복만 남은 그룹은 내려받지 않음 (F-03-03)", () => {
  const f = (name: string, b: string, order: number) => ({ id: name, name, size: 1, lastModified: 0, order, batch: 1, bytes: new TextEncoder().encode(b) });
  const a = analyze([f("A.pptx", "X", 0), f("B.pptx", "Y", 1), f("발표자료_최종.pptx", "X", 2), f("발표자료_진짜최종.pptx", "Y", 3)], rules);
  assert.deepEqual(rename(a).filter((r) => r.download).map((r) => r.from), ["A.pptx", "B.pptx"]);
});

test("D-42 이름 칸 순서: 날짜를 앞으로, 잘못된 순서는 기본, 바꾼 이름을 다시 올려도 같은 그룹·같은 순서", () => {
  const files: Parameters<typeof make>[0] = [["발표자료_최종.pptx", "11-18"], ["발표자료_진짜최종.pptx", "11-20"]];
  const dateFirst = run(files, { scope: "all", pattern: ["date", "base", "version"] });
  assert.deepEqual(table(dateFirst), {
    "발표자료_진짜최종.pptx": "20261120_발표자료_v02.pptx",
    "발표자료_최종.pptx": "20261118_발표자료_v01.pptx",
  });
  // 셋을 한 번씩 담지 않으면(번호 빠짐·중복) 기본 순서
  const bad = run(files, { scope: "all", pattern: ["base", "date", "date"] });
  assert.equal(table(bad)["발표자료_진짜최종.pptx"], "발표자료_v02_20261120.pptx");
  // D-33: 정리한 이름을 다시 올려도 기본 이름이 같고 v 번호 순서대로. 수정 날짜를 거꾸로(v02가 더 이르게) 줘도 v 번호가 이김
  const again = run(dateFirst.map((r, i) => [r.to!, `11-0${i + 1}`] as [string, string]), { scope: "all", pattern: ["date", "base", "version"] });
  assert.deepEqual(table(again), {
    "20261120_발표자료_v02.pptx": "20261101_발표자료_v02.pptx",
    "20261118_발표자료_v01.pptx": "20261102_발표자료_v01.pptx",
  });
});

test("D-43 표기 바꾸기: 버전·날짜 표기가 이름에 들어감", () => {
  const files: Parameters<typeof make>[0] = [["보고서_v2.docx", "11-05"], ["보고서_v3.docx", "11-20"]];
  const t = table(run(files, { scope: "all", versionFormat: "ver01", dateFormat: "yyyy-mm-dd" }));
  assert.equal(t["보고서_v3.docx"], "보고서_ver02_2026-11-20.docx");
  assert.equal(table(run(files, { scope: "all", versionFormat: "v1", dateFormat: "mmdd" }))["보고서_v2.docx"], "보고서_v1_1105.docx");
});

test("D-43 모든 순서·표기 조합: 정리한 이름을 다시 올려도 같은 기본 이름, v 번호 순서 그대로 (D-33)", () => {
  const orders: NamePart[][] = [
    ["base", "version", "date"], ["base", "date", "version"], ["version", "base", "date"],
    ["version", "date", "base"], ["date", "base", "version"], ["date", "version", "base"],
  ];
  // 1월 5일: 한 자리 월·일(1월5일, 2026년1월5일)도 다시 읽히는지
  const files: Parameters<typeof make>[0] = [["발표자료_최종.pptx", "11-18"], ["발표자료(1).pptx", "01-05"], ["발표자료_진짜최종.pptx", "11-20"]];
  for (const pattern of orders) {
    for (const versionFormat of VERSION_FORMATS) {
      for (const dateFormat of DATE_FORMATS) {
        const opts = { scope: "all" as const, pattern, versionFormat, dateFormat };
        const first = run(files, opts);
        // 다시 올릴 때 수정 날짜를 거꾸로 줘서, 순서가 v 번호로만 정해지는지 확인
        const again = analyze(make(first.map((r, i) => [r.to!, `11-0${i + 1}`] as [string, string])), rules);
        const label = `${pattern.join("-")} ${versionFormat} ${dateFormat}`;
        assert.equal(again.groups.length, 1, `${label}: 한 그룹이어야 해요 (${first.map((r) => r.to).join(", ")})`);
        assert.equal(again.groups[0].baseName, "발표자료", label);
        assert.deepEqual(again.groups[0].files.map((f) => f.parsed.version?.n), [3, 2, 1], label);
      }
    }
  }
});
