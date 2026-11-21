import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { decodeName, unzipFiles } from "./unzip.ts";

const mtime = new Date(2026, 10, 20, 23, 40, 10); // 현지 시각, 2초 단위

test("D-39: zip 안 파일을 이름·내용·수정 날짜 그대로 꺼냄, 폴더는 버리고 숨김·zip 안 zip은 뺌", () => {
  const zip = zipSync({
    "발표자료_최종.pptx": [strToU8("pptx 내용".repeat(50)), { mtime }],
    "팀플/보고서_v2.docx": [strToU8("docx"), { mtime, level: 0 }],
    "팀플/": new Uint8Array(0),
    "__MACOSX/팀플/._보고서_v2.docx": strToU8("x"),
    ".DS_Store": strToU8("x"),
    "옛날자료.zip": strToU8("zip"),
  });
  const r = unzipFiles(zip);
  assert.deepEqual(r.files.map((f) => f.name), ["발표자료_최종.pptx", "보고서_v2.docx"]);
  assert.equal(new TextDecoder().decode(r.files[0].bytes), "pptx 내용".repeat(50));
  assert.equal(new TextDecoder().decode(r.files[1].bytes), "docx");
  assert.equal(r.files[0].lastModified, mtime.getTime());
  assert.deepEqual(r.skipped, ["옛날자료.zip"]);
  assert.deepEqual(r.tooLarge, []);
});

test("D-39: 한국어 Windows zip(UTF-8 표시 없이 CP949 이름)도 한글 이름이 깨지지 않음", () => {
  // ASCII 이름으로 만든 뒤 이름 바이트를 CP949 "보고"(BA B8 B0 ED)로 바꿔치기 (중앙 목록·로컬 머리 둘 다)
  const zip = zipSync({ "abcd.hwp": [strToU8("hwp"), { mtime }] });
  const from = strToU8("abcd");
  const to = [0xba, 0xb8, 0xb0, 0xed];
  for (let i = 0; i + 4 <= zip.length; i++) {
    if (from.every((b, k) => zip[i + k] === b)) to.forEach((b, k) => (zip[i + k] = b));
  }
  assert.deepEqual(unzipFiles(zip).files.map((f) => f.name), ["보고.hwp"]);
  assert.equal(decodeName(strToU8("보고서.docx"), true), "보고서.docx");
});

test("D-39: zip이 아니면 오류", () => {
  assert.throws(() => unzipFiles(strToU8("그냥 글자")), /zip 파일이 아니거나 깨졌어요/);
});
