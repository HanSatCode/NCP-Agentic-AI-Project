// /make-samples: public/samples/manifest.json에 적힌 예시 파일을 만들고 수정 날짜를 맞춘다 (D-14, D-16)
// 같은 입력이면 항상 같은 바이트가 나와서, 다시 돌려도 git 변경이 생기지 않는다. clone 뒤 끌어다 놓기 시연 전에 한 번 돌린다
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import manifest from "../public/samples/manifest.json" with { type: "json" };

type Entry = { lastModified: string; author?: string };
const ROOT = path.join(import.meta.dirname, "..", "public", "samples");

// 파일별 본문. copyOf는 바이트까지 같은 사본 (중복 판별용)
const CONTENT: Record<string, { text: string } | { copyOf: string }> = {
  "demo/발표자료_진짜최종.pptx": { text: "팀플 발표 - 진짜 최종본 (결론 슬라이드 추가)" },
  "demo/발표자료 최종수정.pptx": { text: "팀플 발표 - 최종 수정본 (그래프 수정)" },
  "demo/발표자료_최종.pptx": { text: "팀플 발표 - 최종본" },
  "demo/발표자료(1).pptx": { text: "팀플 발표 - 초안" },
  "demo/보고서_v3.docx": { text: "결과 보고서 3차 수정본입니다." },
  "demo/보고서_v3 복사본.docx": { copyOf: "demo/보고서_v3.docx" },
  "demo/보고서_v2.docx": { text: "결과 보고서 2차 수정본입니다." },
  "demo/회의록_1115.docx": { text: "11월 15일 회의록: 역할 분담과 발표 일정" },
  "demo/기획안_1112.pptx": { text: "기획안 - 11월 12일 첫 회의 정리" },
  "demo/기획안_1114.pptx": { text: "기획안 - 11월 14일 주제 확정" },
  "demo/기획안_1118 수정.pptx": { text: "기획안 - 11월 18일 일정표 수정" },
  "demo/설문지_ver1.docx": { text: "설문지 1차: 문항 10개" },
  "demo/설문지_ver2.docx": { text: "설문지 2차: 문항 12개로 늘림" },
  "demo/설문지_ver3_최종.docx": { text: "설문지 3차 최종: 응답 보기 정리" },
  "demo/대본.hwp": { text: "발표 대본 초안 (hwp 형식은 만들 수 없어 텍스트로 대신함)" },
  "demo/대본_수정본.hwp": { text: "발표 대본 수정본 (hwp 형식은 만들 수 없어 텍스트로 대신함)" },
  "demo/대본_찐최종.hwp": { text: "발표 대본 찐최종 (hwp 형식은 만들 수 없어 텍스트로 대신함)" },
  "demo/포스터.pdf": { text: "Poster draft A" },
  "demo/포스터 (1).pdf": { text: "Poster draft B" },
  "demo/포스터 (2).pdf": { text: "Poster draft C" },
  "demo/자료조사.docx": { text: "자료 조사: 선행 연구 5편 요약" },
  "demo/자료조사 - 복사본.docx": { copyOf: "demo/자료조사.docx" },
  "demo/역할분담.hwp": { text: "역할 분담표 (hwp 형식은 만들 수 없어 텍스트로 대신함)" },
  "demo/참고문헌.pdf": { text: "References" },
  "edge/기획서_최종_수정.docx": { text: "기획서 최종 수정본" },
  "edge/기획서_최종.docx": { text: "기획서 최종본" },
  "edge/회의록.hwp": { text: "회의록 초안 (hwp 형식은 만들 수 없어 텍스트로 대신함)" },
  "edge/회의록(1).hwp": { text: "회의록 수정본 (hwp 형식은 만들 수 없어 텍스트로 대신함)" },
  "edge/메모_최종.txt": { text: "메모 A: 발표 순서 정리" },
  "edge/메모-최종.txt": { text: "메모 B: 자료 조사 목록" },
  "edge/실험_1350.docx": { text: "13시 50분 실험 기록" },
  "edge/자료_v2.pdf": { text: "Jaryo v2" },
  "edge/자료_v2 - 복사본.pdf": { copyOf: "edge/자료_v2.pdf" },
};

// 미리보기가 비어 보이지 않게 채우는 본문. 파일마다 시작 문단을 돌려서 버전끼리 조금씩 다르게 보이게 함
const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.",
  "Praesent blandit dolor. Sed non quam. In vel mi sit amet augue congue elementum. Morbi in ipsum sit amet pede facilisis laoreet. Donec lacus nunc, viverra nec, blandit vel, egestas et, augue. Vestibulum tincidunt malesuada tellus.",
  "Phasellus ultrices nulla quis nibh. Quisque a lectus. Donec consectetuer ligula vulputate sem tristique cursus. Nam nulla quam, gravida non, commodo a, sodales sit amet, nisi. Pellentesque fermentum dolor aliquam quam lectus.",
];
const lorem = (title: string) => {
  const k = title.length % LOREM.length;
  const r = [...LOREM.slice(k), ...LOREM.slice(0, k)];
  return [...r, ...r.slice(1)]; // 두 바퀴: A4 한 쪽을 거의 채움
};

const ZIP_TIME = new Date("2026-11-01T00:00:00Z"); // 압축 안 파일 시각을 고정해서 결과 바이트를 매번 같게 함
const xml = (s: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument";

const rels = (list: [id: string, type: string, target: string][]) =>
  xml(`<Relationships xmlns="${NS_PKG}">${list
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join("")}</Relationships>`);

const contentTypes = (overrides: [part: string, type: string][]) =>
  xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    overrides.map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join("") +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);

// 작성자는 가명만 (D-16)
const core = (title: string, e: Entry) =>
  xml(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(title)}</dc:title><dc:creator>${esc(e.author ?? "가명")}</dc:creator><cp:lastModifiedBy>${esc(e.author ?? "가명")}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">2026-11-10T00:00:00Z</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date(e.lastModified).toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:modified></cp:coreProperties>`);

const pkgRels = (main: string) =>
  rels([
    ["rId1", `${NS_REL}/officeDocument`, main],
    ["rId2", `${NS_PKG}/metadata/core-properties`, "docProps/core.xml"],
  ]);

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { mtime: ZIP_TIME });

function makeDocx(text: string, e: Entry) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  return zip({
    "[Content_Types].xml": contentTypes([["/word/document.xml", `${CT}.wordprocessingml.document.main+xml`]]),
    "_rels/.rels": pkgRels("word/document.xml"),
    "docProps/core.xml": core(text, e),
    "word/document.xml": xml(`<w:document xmlns:w="${W}"><w:body>` +
      `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${esc(text)}</w:t></w:r></w:p>` +
      lorem(text).map((p) => `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:t>${esc(p)}</w:t></w:r></w:p>`).join("") +
      `<w:sectPr/></w:body></w:document>`),
  });
}

const P_NS = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;
const EMPTY_TREE = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>`;
const x3 = (s: string) => s + s + s;
const THEME = xml(`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements>` +
  `<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
  `<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
  ["4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"].map((c, i) => `<a:accent${i + 1}><a:srgbClr val="${c}"/></a:accent${i + 1}>`).join("") +
  `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>` +
  `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
  `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
  `<a:fmtScheme name="Office"><a:fillStyleLst>${x3(`<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`)}</a:fillStyleLst>` +
  `<a:lnStyleLst>${x3(`<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`)}</a:lnStyleLst>` +
  `<a:effectStyleLst>${x3(`<a:effectStyle><a:effectLst/></a:effectStyle>`)}</a:effectStyleLst>` +
  `<a:bgFillStyleLst>${x3(`<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`)}</a:bgFillStyleLst></a:fmtScheme>` +
  `</a:themeElements></a:theme>`);

function makePptx(text: string, e: Entry) {
  const pml = `${CT}.presentationml`;
  // 슬라이드 3장: 제목 + 문장마다 글머리 한 줄
  const paras = lorem(text);
  const slides = [text, "주요 내용", "정리"].map((title, i) => ({ title, bullets: paras[i].split(/(?<=\.) /) }));
  const box = (id: number, y: number, cy: number, body: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="762000" y="${y}"/><a:ext cx="10668000" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${body}</p:txBody></p:sp>`;
  const run = (t: string, sz: number, bold = false) =>
    `<a:p><a:pPr><a:spcAft><a:spcPts val="900"/></a:spcAft></a:pPr><a:r><a:rPr lang="ko-KR" sz="${sz}"${bold ? ' b="1"' : ""}/><a:t>${esc(t)}</a:t></a:r></a:p>`;
  const slideParts = Object.fromEntries(slides.flatMap((s, i) => [
    [`ppt/slides/slide${i + 1}.xml`, xml(`<p:sld ${P_NS}><p:cSld><p:spTree>${EMPTY_TREE}` +
      box(2, 571500, 1143000, run(s.title, 3600, true)) +
      box(3, 1905000, 4572000, s.bullets.map((b) => run(`• ${b}`, 2000)).join("")) +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)],
    [`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([["rId1", `${NS_REL}/slideLayout`, "../slideLayouts/slideLayout1.xml"]])],
  ]));
  return zip({
    "[Content_Types].xml": contentTypes([
      ["/ppt/presentation.xml", `${pml}.presentation.main+xml`],
      ...slides.map((_, i): [string, string] => [`/ppt/slides/slide${i + 1}.xml`, `${pml}.slide+xml`]),
      ["/ppt/slideLayouts/slideLayout1.xml", `${pml}.slideLayout+xml`],
      ["/ppt/slideMasters/slideMaster1.xml", `${pml}.slideMaster+xml`],
      ["/ppt/theme/theme1.xml", `${CT}.theme+xml`],
    ]),
    "_rels/.rels": pkgRels("ppt/presentation.xml"),
    "docProps/core.xml": core(text, e),
    "ppt/presentation.xml": xml(`<p:presentation ${P_NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`).join("")}</p:sldIdLst>` +
      `<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": rels([
      ["rId1", `${NS_REL}/slideMaster`, "slideMasters/slideMaster1.xml"],
      ...slides.map((_, i): [string, string, string] => [`rId${2 + i}`, `${NS_REL}/slide`, `slides/slide${i + 1}.xml`]),
      [`rId${2 + slides.length}`, `${NS_REL}/theme`, "theme/theme1.xml"],
    ]),
    "ppt/slideMasters/slideMaster1.xml": xml(`<p:sldMaster ${P_NS}><p:cSld><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>` +
      `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
      `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": rels([
      ["rId1", `${NS_REL}/slideLayout`, "../slideLayouts/slideLayout1.xml"],
      ["rId2", `${NS_REL}/theme`, "../theme/theme1.xml"],
    ]),
    "ppt/slideLayouts/slideLayout1.xml": xml(`<p:sldLayout ${P_NS} type="blank"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>` +
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": rels([["rId1", `${NS_REL}/slideMaster`, "../slideMasters/slideMaster1.xml"]]),
    ...slideParts,
    "ppt/theme/theme1.xml": THEME,
  });
}

// 한 쪽짜리 PDF. 한글 글꼴을 넣지 않으려고 본문은 영문
function makePdf(text: string) {
  const pdfStr = (s: string) => `(${s.replace(/[\\()]/g, "\\$&")})`;
  const wrap = (p: string) => p.split(" ").reduce<string[]>((lines, w) => {
    const last = lines.length - 1;
    if (last >= 0 && (lines[last] + " " + w).length <= 85) lines[last] += " " + w;
    else lines.push(w);
    return lines;
  }, []);
  const body = lorem(text).flatMap((p) => [...wrap(p), ""]);
  // ' 연산자 = 다음 줄로 내려가서 글자 쓰기 (줄 간격 TL)
  const stream = `BT /F1 22 Tf 72 720 Td ${pdfStr(text)} Tj /F1 11 Tf 16 TL T* ${body.map((l) => `${pdfStr(l)} '`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return strToU8(out);
}

function build(file: string, e: Entry): Uint8Array {
  const spec = CONTENT[file];
  if (!spec) throw new Error(`본문이 없어요: ${file}`);
  if ("copyOf" in spec) return build(spec.copyOf, (manifest as Record<string, Entry>)[spec.copyOf]);
  const ext = path.extname(file);
  if (ext === ".docx") return makeDocx(spec.text, e);
  if (ext === ".pptx") return makePptx(spec.text, e);
  if (ext === ".pdf") return makePdf(spec.text);
  return strToU8([spec.text, ...lorem(spec.text)].join("\n\n")); // txt, hwp
}

for (const [file, e] of Object.entries(manifest as Record<string, Entry>)) {
  const out = path.join(ROOT, file);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, build(file, e));
  const t = new Date(e.lastModified);
  utimesSync(out, t, t);
  console.log(`${file}  ${e.lastModified}`);
}
