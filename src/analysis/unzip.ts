// 올린 zip을 브라우저에서 풀어, 안의 문서를 하나씩 올린 것처럼 넘긴다 (D-39). 화면 코드 없음
// 압축 안에 적힌 수정 날짜를 살린다 (버전 판정의 마지막 기준이라서)
import { inflateSync } from "fflate";
import { MAX_SIZE } from "./upload.ts";

export const ZIP_MAX = 100 * 1024 * 1024; // zip 파일 자체의 한도. 풀어 낸 파일은 하나하나 20MB 한도 (MAX_SIZE)

export type Unzipped = { name: string; bytes: Uint8Array; lastModified: number };
export type UnzipResult = {
  files: Unzipped[];
  tooLarge: string[]; // 20MB가 넘어서 뺀 파일 (M-03)
  skipped: string[]; // 암호가 걸렸거나, 못 푸는 압축 방식이거나, zip 안의 zip
};

export const isZip = (name: string) => /\.zip$/i.test(name);

// 파일 이름: UTF-8 표시가 있으면 UTF-8. 없으면 UTF-8로 읽어 보고 깨지면 CP949 (한국어 Windows의 "압축(ZIP) 폴더"가 이렇게 만듦)
export function decodeName(raw: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return new TextDecoder().decode(raw);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return new TextDecoder("euc-kr").decode(raw);
  }
}

// zip의 날짜는 2초 단위 현지 시각
const dosTime = (date: number, time: number) =>
  new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2).getTime();

export function unzipFiles(zip: Uint8Array): UnzipResult {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // 끝에서부터 "목록 끝" 표시(EOCD)를 찾는다. 뒤에 주석이 최대 65535바이트 붙을 수 있음
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip 파일이 아니거나 깨졌어요");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error("ZIP64 형식은 열 수 없어요");

  const out: UnzipResult = { files: [], tooLarge: [], skipped: [] };
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || v.getUint32(p, true) !== 0x02014b50) throw new Error("zip 파일이 깨졌어요");
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const time = v.getUint16(p + 12, true);
    const date = v.getUint16(p + 14, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const path = decodeName(zip.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0).replace(/\\/g, "/");
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);

    // 폴더 구조는 버리고 이름만. 폴더 항목, 맥이 넣는 __MACOSX·숨김 파일(.DS_Store 등)은 조용히 건너뜀
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!name || path.startsWith("__MACOSX/") || name.startsWith(".")) continue;
    if (flags & 1 || (method !== 0 && method !== 8) || isZip(name)) {
      out.skipped.push(name);
      continue;
    }
    if (usize > MAX_SIZE) {
      out.tooLarge.push(name);
      continue;
    }
    if (local + 30 > zip.length || v.getUint32(local, true) !== 0x04034b50) throw new Error("zip 파일이 깨졌어요");
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = zip.subarray(start, start + csize);
    // out 크기를 적힌 크기로 정해 두면 그보다 크게 풀리지 않음 (압축 폭탄 방지)
    const bytes = method === 0 ? data.slice() : usize === 0 ? new Uint8Array(0) : inflateSync(data, { out: new Uint8Array(usize) });
    out.files.push({ name, bytes, lastModified: dosTime(date, time) });
  }
  return out;
}
