// 화면이 File에서 꺼내 분석 함수에 넘기는 값
export type InputFile = {
  id: string;
  name: string;
  size: number;
  lastModified: number; // 수정 날짜 (ms)
  order: number; // 파일 목록 순서 (0부터)
  batch: number; // 몇 번째로 올렸는지. 한 번에 올린 파일은 같은 값 (D-04)
  bytes?: Uint8Array; // 중복 판별용. 없으면 중복 판별에서 빠짐
};
