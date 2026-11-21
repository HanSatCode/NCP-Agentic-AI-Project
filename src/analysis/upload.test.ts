import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import rules from "../../rules/version-rules.json" with { type: "json" };
import { acceptFiles, fileKey, loadSamples, MAX_SIZE, toInputFiles } from "./upload.ts";
import { analyze } from "./analyze.ts";
import { rename } from "./rename.ts";
import { makeDownload } from "./zip.ts";

const f = (name: string, size = 10, lastModified = 1000) => ({ name, size, lastModified });

test("F-01-01: 이름·크기·수정일이 모두 같으면 같은 파일 (M-04)", () => {
  const r = acceptFiles([f("a.txt")], [f("a.txt"), f("a.txt", 11), f("a.txt", 10, 2000), f("b.txt")]);
  assert.deepEqual(r.same.map(fileKey), ["a.txt|10|1000"]);
  assert.equal(r.accepted.length, 3);
});

test("F-01-01: 한 번에 같은 파일을 두 번 놓으면 하나만", () => {
  const r = acceptFiles([], [f("a.txt"), f("a.txt")]);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.same.length, 1);
});

test("F-01-04: 20MB 초과는 빼고, 딱 20MB는 받음 (M-03)", () => {
  const r = acceptFiles([], [f("big.pptx", MAX_SIZE + 1), f("ok.pptx", MAX_SIZE)]);
  assert.deepEqual(r.tooLarge.map((x) => x.name), ["big.pptx"]);
  assert.deepEqual(r.accepted.map((x) => x.name), ["ok.pptx"]);
});

test("toInputFiles: 순서·batch·바이트를 채움", async () => {
  const files = [new File(["hello"], "a.txt", { lastModified: 5 }), new File(["hi"], "b.txt", { lastModified: 6 })];
  const input = await toInputFiles(files, 3, 2);
  assert.deepEqual(
    input.map(({ id, order, batch, size }) => ({ id, order, batch, size })),
    [
      { id: "a.txt|5|5", order: 3, batch: 2, size: 5 },
      { id: "b.txt|2|6", order: 4, batch: 2, size: 2 },
    ],
  );
  assert.deepEqual(input[0].bytes, new TextEncoder().encode("hello"));
});

// public/을 웹 서버처럼 돌려주는 가짜 fetch
const ROOT = path.join(import.meta.dirname, "..", "..", "public");
const fakeFetch = (async (url: string) => {
  const file = path.join(ROOT, ...decodeURIComponent(url).split("/").filter(Boolean));
  return existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 });
}) as typeof fetch;

test("F-01-03: 예시 파일 8개를 manifest 수정 날짜로 불러옴 (D-14)", async () => {
  const files = await loadSamples(fakeFetch);
  assert.equal(files.length, 8);
  assert.equal(files[0].name, "발표자료_진짜최종.pptx");
  assert.equal(files[0].lastModified, new Date("2026-11-20T23:40:00+09:00").getTime());
  assert.equal(files[0].size, readFileSync(path.join(ROOT, "samples", "demo", "발표자료_진짜최종.pptx")).length);
  await assert.rejects(loadSamples(fakeFetch, "/없는폴더/"), /예시 파일 목록을 불러오지 못했어요/);
});

test("F-01-03: 하위 경로에 배포하면 예시 파일 주소에도 그 경로가 붙음", async () => {
  const urls: string[] = [];
  const prefixed = ((url: string) => {
    urls.push(url);
    return fakeFetch(url.replace(/^\/file-version/, ""));
  }) as typeof fetch;
  process.env.NEXT_PUBLIC_BASE_PATH = "/file-version";
  try {
    assert.equal((await loadSamples(prefixed)).length, 8);
  } finally {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  }
  assert.ok(urls.every((u) => u.startsWith("/file-version/samples/")), urls[0]);
});

test("시연 흐름: 예시 불러오기 → 분석 → 이름 변경 → 최신 파일만 내려받기", async () => {
  const files = await loadSamples(fakeFetch);
  const { accepted } = acceptFiles([], files);
  const result = analyze(await toInputFiles(accepted, 0, 1), rules);
  assert.equal(result.summary, "그룹 2개 · 단독 1개 · 중복 1개");

  const rows = rename(result);
  const sources = new Map(result.groups.flatMap((g) => g.files).concat(result.singles).map((x) => [x.id, { bytes: x.bytes!, lastModified: x.lastModified }]));
  const d = makeDownload(rows, sources, new Date("2026-11-21T12:00:00").getTime())!;
  assert.equal(d.filename, "정리된파일_20261121.zip");
  assert.equal(d.count, 3);
});
