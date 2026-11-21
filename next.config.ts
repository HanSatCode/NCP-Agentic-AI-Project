import type { NextConfig } from "next";

// 브라우저에서만 처리하므로(D-17) 정적 파일로 내보내 NGINX가 바로 서빙한다 (npm run build → out/)
// 하위 경로 배포: BASE_PATH=/file-version npm run build. NGINX 설정은 deploy/nginx.conf
const basePath = process.env.BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath }, // fetch 주소(예시 파일)에도 하위 경로를 붙이기 위해
};

export default config;
