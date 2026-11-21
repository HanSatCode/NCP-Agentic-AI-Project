# 진짜최종.zip

비슷한 파일을 올리면 최신 버전을 찾아 이름을 정리해 드려요.

카톡으로 팀플을 하다 쌓인 `최종`, `진짜최종`, `(1)` 같은 파일을 한 번에 올려 주세요. 파일명·버전 표기·수정 날짜를 비교해 최신 후보를 추천하고, 그 이유도 함께 보여 드려요. 정리한 파일은 `기본이름_v번호_YYYYMMDD.확장자` 이름으로 내려받아요.
파일은 브라우저 안에서만 다루고 서버로 보내지 않아요.

## 화면

| 주소 | 화면 |
|------|------|
| `/` | 소개: 무엇을 해 주는지(정리 전 → 후 예시)와 무엇을 보고 최신을 고르는지 |
| `/start` | 정리 도구: ① 파일 업로드 → ② 파일 분석 → ③ 이름 변경 |

## 기능

| 기능 | 설명 |
|------|------|
| 업로드·목록 (F-01) | 여러 파일이나 zip을 한 번에 올리고 파일명·수정 날짜를 확인해요. 파일이 없으면 [체험하기]로 예시 파일 24개를 넣어 볼 수 있어요 |
| 분석 (F-02) | 비슷한 이름끼리 묶고, 최신 후보와 그 이유를 보여 줘요. 내용이 같은 중복 파일도 표시해요 |
| 이름 변경·내려받기 (F-03) | 날짜와 버전 번호가 들어간 이름으로 바꿔 내려받아요. 이름 모양(칸 순서·표기)도 고를 수 있어요 |

## 문서

| 문서 | 내용 |
|------|------|
| `CLAUDE.md` | 기능·판정 규칙·화면 구성·결정 사항 |
| `DESIGN.md` | 색·글자·간격·움직임·줄바꿈·말투 |
| `.claude/skills/` | 작업 스킬: `QA`, `design-review`, `ux-writing`, `screen-capture`, `ship` |
| `docs/spec.md` | 기능 명세서 (참고) |

## 기술 스택

- Next.js (App Router, TypeScript)
- Node.js 22.18 이상
- 배포: 네이버클라우드플랫폼(NCP), http

## 실행 방법

```bash
npm install
npm run dev     # http://localhost:3000 (소개), http://localhost:3000/start (정리 도구)
npm test        # 분석 함수 테스트
npm run samples # 예시 파일 만들기 + 수정 날짜 맞추기 (clone 뒤 끌어다 놓기 시연 전에)
npm run check   # 예시 파일로 분석 결과 검사 (/check-result)
npm run qa      # 전체 QA: 규칙·기본 이름·애매한 경우·무작위 파일명 검사 (/QA, SEED=숫자로 바꿔 돌리기)
```

## 배포 (NGINX, http://공인IP/file-version/)

서버 기능이 없어서(파일은 브라우저에서만 다룸) 정적 파일로 빌드해 NGINX가 바로 보내 줘요. 서버에 Node는 필요 없어요.

```powershell
$env:BASE_PATH="/file-version"; npm run build   # out/ 폴더가 생겨요
# Git Bash: MSYS_NO_PATHCONV=1 BASE_PATH=/file-version npm run build  (안 붙이면 경로가 C:/Program Files/Git/...로 바뀌어요)
scp -r out/* <사용자>@<공인IP>:/tmp/file-version/
```

서버에서는 `out/` 내용을 `/var/www/file-version/`에 복사하고, `deploy/nginx.conf`의 location을 80번 포트 server 블록에 붙인 뒤 `sudo nginx -t && sudo systemctl reload nginx`를 실행해요.
올린 뒤 `/file-version/`(소개)과 `/file-version/start`(정리 도구)를 열어 보고, http 주소에서 중복 판별이 되는지 꼭 확인해요.
