# 파일 버전 정리

비슷한 파일을 올리면 최신 버전을 찾아 이름을 정리해 드려요.

카톡으로 팀플을 하다 쌓인 `최종`, `진짜최종`, `(1)` 같은 파일을 한 번에 올리면, 파일명·버전 표기·수정 날짜를 비교해 최신 후보를 추천하고 `기본이름_v번호_YYYYMMDD.확장자`로 이름을 바꿔 내려받게 해 줍니다.
파일은 브라우저에서만 처리하고 서버에 저장하지 않습니다.

## 기능

| 기능 | 설명 |
|------|------|
| 업로드·목록 (F-01) | 여러 파일을 한 번에 올리고 파일명·수정 날짜 확인 |
| 분석 (F-02) | 비슷한 이름끼리 묶고, 최신 후보 추천과 이유 표시, 내용이 같은 중복 표시 |
| 이름 변경·내려받기 (F-03) | 날짜와 버전 번호가 들어간 이름으로 바꿔 내려받기 |

자세한 규칙은 `CLAUDE.md`를 참고하세요.

## 기술 스택

- Next.js (App Router, TypeScript)
- Node.js 22.18 이상
- 배포: 네이버클라우드플랫폼(NCP), http

## 실행 방법

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 분석 함수 테스트
npm run samples # 예시 파일 만들기 + 수정 날짜 맞추기 (clone 뒤 끌어다 놓기 시연 전에)
npm run check   # 예시 파일로 분석 결과 검사 (/check-result)
npm run qa      # 전체 QA: 규칙·기본 이름·애매한 경우·무작위 파일명 검사 (/QA, SEED=숫자로 바꿔 돌리기)
```

## 배포 (NGINX, http://공인IP/file-version/)

서버 기능이 없어서(파일은 브라우저에서만 처리) 정적 파일로 빌드해 NGINX가 바로 서빙한다. Node는 서버에 필요 없다.

```powershell
$env:BASE_PATH="/file-version"; npm run build   # out/ 폴더가 생김
# Git Bash: MSYS_NO_PATHCONV=1 BASE_PATH=/file-version npm run build  (안 붙이면 경로가 C:/Program Files/Git/...로 바뀜)
scp -r out/* <사용자>@<공인IP>:/tmp/file-version/
```

서버에서는 `out/` 내용을 `/var/www/file-version/`에 복사하고, `deploy/nginx.conf`의 location을 80번 포트 server 블록에 붙인 뒤 `sudo nginx -t && sudo systemctl reload nginx`.
