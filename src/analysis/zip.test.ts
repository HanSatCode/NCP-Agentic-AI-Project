import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { makeDownload } from "./zip.ts";
import type { RenameRow } from "./rename.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const row = (id: string, to: string | null, download = true): RenameRow => ({ id, from: id, to, duplicate: !to, download });
const sources = new Map([
  ["a", { bytes: enc("AAA"), lastModified: new Date("2026-11-20T12:00:00").getTime() }],
  ["b", { bytes: enc("BBB"), lastModified: new Date("2026-11-19T12:00:00").getTime() }],
]);
const NOW = new Date("2026-11-21T10:00:00").getTime();

test("0개면 null (버튼 비활성)", () => {
  assert.equal(makeDownload([], sources, NOW), null);
  assert.equal(makeDownload([row("a", "x.txt", false), row("b", null, false)], sources, NOW), null);
});

test("1개면 그 파일을 새 이름으로", () => {
  const d = makeDownload([row("a", "발표자료_v4_20261120.pptx"), row("b", "y.txt", false)], sources, NOW)!;
  assert.equal(d.filename, "발표자료_v4_20261120.pptx");
  assert.deepEqual(d.data, enc("AAA"));
  assert.equal(d.count, 1);
});

test("2개 이상이면 정리된파일_오늘날짜.zip, 안에 새 이름과 원래 내용", () => {
  const d = makeDownload([row("a", "발표자료_v4_20261120.pptx"), row("b", "보고서_v2_20261119.docx")], sources, NOW)!;
  assert.equal(d.filename, "정리된파일_20261121.zip");
  assert.equal(d.count, 2);
  const files = unzipSync(d.data);
  assert.deepEqual(Object.keys(files), ["발표자료_v4_20261120.pptx", "보고서_v2_20261119.docx"]);
  assert.deepEqual(files["보고서_v2_20261119.docx"], enc("BBB"));
  // 한글 파일 이름이 Windows 탐색기에서 깨지지 않으려면 UTF-8 표시(일반 플래그 11번 비트)가 있어야 함
  const flags = d.data[6] | (d.data[7] << 8);
  assert.ok(flags & 0x800, "UTF-8 플래그 없음");
});

test("원본이 없으면 알려줌", () => {
  assert.throws(() => makeDownload([row("a", "x.txt"), row("zzz", "y.txt")], sources, NOW), /원본 파일을 찾을 수 없어요/);
});
