import { test } from "node:test";
import assert from "node:assert/strict";
import rules from "../../rules/version-rules.json" with { type: "json" };
import { findDuplicates } from "./duplicate.ts";
import type { InputFile } from "./types.ts";

let n = 0;
const file = (name: string, content: string, batch = 1): InputFile => {
  const bytes = new TextEncoder().encode(content);
  return { id: name, name, size: bytes.length, lastModified: 0, order: n++, batch, bytes };
};
const dups = (files: InputFile[]) => Object.fromEntries(findDuplicates(files, rules));

test("D-04: 한 번에 올리면 복사본 표시가 있는 쪽이 중복", () => {
  // 복사본이 목록에서 앞에 있어도 복사본 쪽이 중복
  assert.deepEqual(dups([file("자료_v2 - 복사본.pdf", "same"), file("자료_v2.pdf", "same")]), {
    "자료_v2 - 복사본.pdf": "자료_v2.pdf",
  });
});

test("D-04: 한 번에 올렸고 복사본 표시가 없으면 목록에서 뒤쪽이 중복", () => {
  assert.deepEqual(dups([file("a.txt", "same"), file("b.txt", "same")]), { "b.txt": "a.txt" });
});

test("D-04: 따로 올렸으면 나중에 올린 쪽이 중복 (복사본 표시보다 먼저 봄)", () => {
  assert.deepEqual(dups([file("보고서 복사본.docx", "same", 1), file("보고서.docx", "same", 2)]), {
    "보고서.docx": "보고서 복사본.docx",
  });
});

test("크기가 같아도 내용이 다르면 중복 아님, 셋이 같으면 둘이 중복", () => {
  assert.deepEqual(dups([file("a.txt", "abc"), file("b.txt", "abd")]), {});
  assert.deepEqual(dups([file("x.txt", "same"), file("y.txt", "same"), file("z.txt", "same")]), {
    "y.txt": "x.txt",
    "z.txt": "x.txt",
  });
});

test("이름이 같아도 내용이 다르면 중복 아님, 그룹이 달라도 같으면 중복", () => {
  assert.deepEqual(dups([file("보고서.docx", "one"), { ...file("보고서.docx", "two"), id: "2" }]), {});
  assert.deepEqual(dups([file("발표.pptx", "same"), file("회의록.hwp", "same")]), { "회의록.hwp": "발표.pptx" });
});

test("바이트가 없는 파일은 판별하지 않음", () => {
  const a = file("a.txt", "same");
  assert.deepEqual(dups([a, { ...file("b.txt", "same"), bytes: undefined }]), {});
});
