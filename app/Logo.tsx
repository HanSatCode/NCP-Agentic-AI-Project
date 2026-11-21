// 파일핏 로고 마크
// 뒤의 파란 종이 = 여러 버전 파일, 앞의 남색 종이 + 체크 = 정리된 최신 파일 하나 (Fit)
// app/icon.svg (브라우저 탭 아이콘)와 같은 모양이다. 고칠 때 두 곳을 같이 고친다

export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="10" y="2" width="18" height="23" rx="4.5" fill="#2554d8" />
      <rect x="4" y="7" width="18" height="23" rx="4.5" fill="#0f1729" />
      <path d="M8.5 18.5l3.2 3.2 6-6.4" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
