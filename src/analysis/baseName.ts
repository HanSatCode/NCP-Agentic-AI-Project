// F-02-01 기본 이름 추출과 버전 단서(번호·날짜·키워드) 읽기. 순서는 CLAUDE.md "기본 이름 만드는 순서" (D-01~D-03)
// 규칙(키워드·점수·패턴)은 rules/version-rules.json에서 받는다. 화면 코드 없음

export type Rules = {
  keywords: { word: string; score: number }[];
  copyMarks: string[];
  dates: string[];
  version: string;
  separators: string;
};

export type ParsedName = {
  name: string;
  stem: string; // 확장자를 뗀 원래 이름
  ext: string; // "" = 확장자 없음
  baseName: string;
  copyMark: string | null; // 지운 복사본 표시. 버전으로 세지 않음 (D-02)
  version: { n: number; raw: string } | null;
  date: { year: number | null; month: number; day: number; raw: string } | null;
  keyword: { word: string; score: number; raw: string } | null;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cut = (s: string, m: RegExpMatchArray) => s.slice(0, m.index) + s.slice(m.index! + m[0].length);

export function splitExt(name: string): [string, string] {
  const i = name.lastIndexOf(".");
  return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, ""];
}

export function parseName(name: string, rules: Rules): ParsedName {
  // 1. 확장자 떼기
  const [stem, ext] = splitExt(name);
  let s = stem;

  // 2. 이름 끝의 복사본 표시. "보고서 - 복사본 (2)"처럼 겹칠 수 있어 더 지울 게 없을 때까지 반복
  //    "(1)"처럼 다 지워져도 지운다. 빈 이름이면 7단계가 원래 이름을 쓴다
  const copyRes = rules.copyMarks.map((p) => new RegExp(p, "iu"));
  for (let changed = true; changed; ) {
    changed = false;
    for (const re of copyRes) {
      const m = s.match(re);
      if (m && m[0]) {
        s = s.slice(0, m.index);
        changed = true;
      }
    }
  }
  const copyMark = stem.slice(s.length).trim() || null;
  const withoutCopy = s.trim(); // 7단계에서 다 지워졌을 때 쓸 이름 (D-27)

  // 3. 파일명 날짜. 월 01~12, 일 01~31로 읽힐 때만 날짜 (D-03, 예: 1350은 날짜 아님)
  let date: ParsedName["date"] = null;
  outer: for (const p of rules.dates) {
    for (const m of s.matchAll(new RegExp(p, "gu"))) {
      const g = m.groups!;
      const month = Number(g.m);
      const day = Number(g.d);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        date = { year: g.y ? Number(g.y) : null, month, day, raw: m[0] };
        s = cut(s, m);
        break outer;
      }
    }
  }

  // 4. 버전 번호 (v2, V2, ver2)
  const vm = s.match(new RegExp(rules.version, "iu"));
  const version = vm ? { n: Number(vm.groups!.n), raw: vm[0] } : null;
  if (vm) s = cut(s, vm);

  // 5. 공백·_·-·괄호 지우기
  const sep = rules.separators;
  s = s.replace(new RegExp(sep, "gu"), "");

  // 6. 키워드: 이 단계 문자열에서 가장 높은 점수 하나 (D-01), 지울 때는 긴 것부터
  const byLength = [...rules.keywords].sort((a, b) => b.word.length - a.word.length);
  const lower = s.toLowerCase();
  let best: Rules["keywords"][number] | null = null;
  for (const k of byLength) {
    if (lower.includes(k.word.toLowerCase()) && (!best || k.score > best.score)) best = k;
  }
  for (const k of byLength) s = s.replace(new RegExp(escape(k.word), "giu"), "");

  // 추천 이유에는 파일명에 적힌 그대로 넣는다 (예: "최종_수정"). 글자 사이 구분자를 허용해 원래 이름에서 찾음
  let keyword: ParsedName["keyword"] = null;
  if (best) {
    const loose = [...best.word].map(escape).join(`${sep}*`);
    const raw = stem.match(new RegExp(loose, "iu"))?.[0] ?? best.word;
    keyword = { word: best.word, score: best.score, raw };
  }

  // 7. 남은 문자열이 기본 이름. 다 지워져 비면 복사본 표시만 지운 이름, 그것도 비면 원래 이름 (D-27)
  //    "최종.docx"와 같은 이름으로 다시 저장해 생긴 "최종 (1).docx"가 한 그룹이 된다
  return { name, stem, ext, baseName: s || withoutCopy || stem, copyMark, version, date, keyword };
}
