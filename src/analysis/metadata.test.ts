import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { readDocMeta, readDocText } from "./metadata.ts";

const core = (body: string) =>
  zipSync({
    "docProps/core.xml": strToU8(
      `<cp:coreProperties xmlns:cp="c" xmlns:dcterms="d" xmlns:xsi="x">${body}</cp:coreProperties>`,
    ),
  });

test("D-30: core.xml에서 처음 만든 시각·저장 시각·저장 횟수를 읽음", () => {
  const m = readDocMeta(
    "a.docx",
    core(
      '<dcterms:created xsi:type="dcterms:W3CDTF">2026-11-10T00:00:00Z</dcterms:created>' +
        '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-11-20T14:40:00Z</dcterms:modified>' +
        "<cp:revision>12</cp:revision>",
    ),
  );
  assert.deepEqual(m, {
    created: Date.parse("2026-11-10T00:00:00Z"),
    saved: Date.parse("2026-11-20T14:40:00Z"),
    revision: 12,
  });
});

test("D-30: 없는 값은 비워 둠", () => {
  assert.deepEqual(readDocMeta("a.pptx", core("<cp:revision>abc</cp:revision>")), {
    created: undefined,
    saved: undefined,
    revision: undefined,
  });
  assert.deepEqual(readDocMeta("a.xlsx", zipSync({ "x.txt": strToU8("x") })), {});
});

test("D-30: 다른 형식이나 깨진 파일은 빈 값", () => {
  assert.deepEqual(readDocMeta("a.hwp", new Uint8Array([1, 2, 3])), {});
  assert.deepEqual(readDocMeta("a.docx", new Uint8Array([1, 2, 3])), {});
});

test("D-30: 예시 파일(pptx)에서 읽힘", () => {
  const bytes = readFileSync(new URL("../../public/samples/demo/발표자료_진짜최종.pptx", import.meta.url));
  const m = readDocMeta("발표자료_진짜최종.pptx", new Uint8Array(bytes));
  assert.equal(m.created, Date.parse("2026-11-10T00:00:00Z"));
  assert.equal(m.saved, Date.parse("2026-11-20T14:40:00Z"));
});

test("미리보기: docx 문단을 줄마다, XML 문자는 되돌림", () => {
  const doc = zipSync({
    "word/document.xml": strToU8(
      '<w:document><w:body><w:p><w:r><w:t>첫 줄 </w:t></w:r><w:r><w:t xml:space="preserve">A&amp;B</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>둘째 줄</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  assert.equal(readDocText("a.docx", doc), "첫 줄 A&B\n둘째 줄");
});

test("미리보기: pptx는 슬라이드 번호 순서대로 (10이 2보다 뒤)", () => {
  const slide = (t: string) => strToU8(`<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`);
  const ppt = zipSync({ "ppt/slides/slide10.xml": slide("열"), "ppt/slides/slide2.xml": slide("둘") });
  assert.equal(readDocText("a.pptx", ppt), "[슬라이드 1]\n둘\n\n[슬라이드 2]\n열");
});

test("미리보기: 다른 형식·깨진 파일은 null, 예시 docx는 읽힘", () => {
  assert.equal(readDocText("a.hwp", new Uint8Array([1])), null);
  assert.equal(readDocText("a.docx", new Uint8Array([1, 2])), null);
  const bytes = readFileSync(new URL("../../public/samples/demo/보고서_v2.docx", import.meta.url));
  assert.equal(readDocText("보고서_v2.docx", new Uint8Array(bytes))?.split("\n")[0], "결과 보고서 2차 수정본입니다.");
});
