---
name: ship
description: 작업을 커밋하고, 팀원 브랜치를 main에 병합하고, GitHub에 올리고, NGINX 배포 주소에 올린다. 커밋 전 검사(타입·빌드·npm run check), 한국어 커밋 메시지, 충돌 해결(CSS 괄호 확인), 로그인이 필요한 push 안내, 배포 순서를 다룬다. "커밋", "푸시", "올려줘", "main에 합쳐줘", "병합", "배포" 할 때 쓴다.
---

# 커밋 · 병합 · 올리기 · 배포

`CLAUDE.md` 작업 규칙을 따른다: 커밋 메시지는 한국어, 기능 ID를 앞에. AI가 만들었다는 표시(Co-Authored-By, "Generated with")는 넣지 않는다.

## 1. 커밋 전 검사
| 검사 | 명령 | 언제 |
|---|---|---|
| 타입 | `npx tsc --noEmit -p .` | 항상 |
| 분석 결과 | `npm run check` | `src/analysis/`·`rules/`·예시 파일을 고쳤을 때 (필수) |
| 빌드 | `npm run build` | 병합 후, 배포 전, 페이지·라우트를 바꿨을 때 |
| 화면 | `/design-review` | 화면을 고쳤을 때 |

- `git status --short`로 넣을 파일을 확인한다. 비밀(.env 등)·실제 팀플 자료는 넣지 않는다
- 이번 작업과 상관없는 변경이 섞여 있으면 같이 넣을지 먼저 묻는다

## 2. 커밋 메시지
- 형식: `F-02-04 최신 후보 추천 추가`, 결정이면 `D-49 …`, 여러 개면 `F-01·F-02 …`. 아래에 `- ` 줄로 무엇을 왜
- PowerShell에서는 따옴표가 든 메시지를 `-m`으로 넘기면 깨진다. **파일로 넘긴다** (BOM 없이):
```powershell
[IO.File]::WriteAllText("<scratchpad>\msg.txt", $msg)   # Set-Content -Encoding utf8은 BOM이 붙음
git commit -F "<scratchpad>\msg.txt"
```

## 3. 팀원 브랜치 병합
1. `git fetch --all` → `git log --oneline main..origin/<브랜치>`로 들어올 커밋, `git diff --stat main...origin/<브랜치>`로 파일 확인
2. 아직 안 들어온 브랜치가 없는지 `git branch -a`로 같이 본다
3. 앞서 나간 게 없으면 `git merge --ff-only`, 아니면 `git merge --no-ff --no-edit origin/<브랜치>`
4. 충돌 해결
   - **화면 코드**: 양쪽 기능을 다 살린다. 이름·문구는 CLAUDE.md의 결정(예: D-49 서비스 이름)을 따른다
   - **CSS**: 양쪽 규칙을 모두 남기되, 해결 뒤 `{`·`}` 개수가 같은지 센다. 닫는 괄호가 빠지면 뒤 규칙이 `@media` 안에 갇혀 PC에서 안 먹는다
   - 들어온 쪽의 옛 이름·옛 버튼 이름·옛 번호 표기도 찾아서 맞춘다 (`/ux-writing`)
5. 타입·빌드·`npm run check` 통과 후 병합 커밋

## 4. 올리기 (push)
- 이 환경의 git은 GitHub 로그인 창을 띄울 수 없다. push가 `could not read Username`으로 실패하면 사용자에게 아래를 입력해 달라고 한다:
```
! git push origin main
```
- main에 바로 올려도 되는지 확인한 뒤에만 main에 올린다. 안 되면 기능 브랜치에 올리고 PR

## 5. 배포 (http://공인IP/file-version/)
`deploy/nginx.conf` 맨 위 순서대로:
```powershell
$env:BASE_PATH="/file-version"; npm run build      # out/ 에 정적 파일
scp -r out/* <사용자>@<공인IP>:/tmp/file-version/
# 서버: sudo cp -r /tmp/file-version/* /var/www/file-version/ && sudo nginx -t && sudo systemctl reload nginx
```
- 서버 주소·계정은 파일에 쓰지 않는다. 사용자가 직접 입력하게 한다
- 올린 뒤 `/file-version/`(소개)과 `/file-version/start`(정리 도구)를 열고, **http 주소에서 중복 판별**이 되는지 꼭 확인한다 (crypto.subtle은 http에서 안 됨, CLAUDE.md 구현 시 주의)

## 6. 보고
- 커밋 해시와 제목, 올렸는지 여부(안 올렸으면 그 이유와 입력할 명령)
- 변경한 파일 표와 작업에 쓴 "추천안"·"보류" 결정 ID (CLAUDE.md 작업 규칙)
