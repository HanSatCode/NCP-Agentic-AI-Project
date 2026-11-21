import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { readDocMeta } from "./metadata.ts";

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
