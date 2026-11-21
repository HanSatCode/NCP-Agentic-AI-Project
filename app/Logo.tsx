// Filefit 로고 마크: 열린 폴더와 안에 든 종이 두 장 (선 아이콘, 배경 없음)
// 색은 글자색(currentColor)을 따라 화면의 남색으로 보인다
// app/icon.svg (브라우저 탭 아이콘)와 같은 모양이다. 고칠 때 두 곳을 같이 고친다

export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 뒤판과 탭 */}
      <path d="M5 14V3.5h10l2.5 2.5H27V14" />
      {/* 안에 든 종이 두 장 */}
      <path d="M8.5 14V7.5h14V14" />
      <path d="M11 14v-3.5h9V14" />
      {/* 열린 앞판 */}
      <path d="M2.5 14h27l-2.6 14.5H5.1z" />
    </svg>
  );
}
