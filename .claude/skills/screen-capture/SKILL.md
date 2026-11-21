---
name: screen-capture
description: 개발 서버를 띄우고 헤드리스 Chrome(없으면 Edge)으로 소개(/)·정리 도구(/start) 화면을 여러 폭으로 캡처해 직접 본다. 동작 줄이기 캡처로 애니메이션이 끝난 상태를 보고, 가장 긴 타이핑 이름으로 줄바꿈을 확인한다. "캡처해줘", "화면 확인", "폭별로 봐줘", "줄바꿈 확인", 화면을 고친 뒤 결과를 보여 줄 때 쓴다.
---

# 화면 캡처 (헤드리스 Chrome)

Windows · PowerShell 기준. 캡처 파일은 세션 임시 폴더(scratchpad)에 두고 저장소에 넣지 않는다.

## 1. 서버
- 3000번 포트가 열려 있는지 본다: `Get-NetTCPConnection -LocalPort 3000 -State Listen`
- 없으면 `npm run dev`를 백그라운드로 띄우고, `Invoke-WebRequest http://localhost:3000/`이 200이 될 때까지 기다린다
- **dev 서버가 켜져 있을 때 `.next` 폴더를 지우지 않는다** (서버가 꺼진다). 타입 검사의 낡은 `.next/types` 오류는 무시하거나 서버를 끄고 지운다

## 2. 찍기
```powershell
$c = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
       "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | ? { Test-Path $_ } | Select-Object -First 1
$d = "<scratchpad 절대 경로>"; New-Item -ItemType Directory -Force $d | Out-Null
foreach ($w in 1280, 1100, 960, 640) {
  Start-Process -Wait -FilePath $c -ArgumentList "--headless=new","--disable-gpu","--hide-scrollbars",
    "--window-size=$w,900","--virtual-time-budget=3000","--screenshot=$d\intro-$w.png","http://localhost:3000/"
}
```
- `Start-Process -Wait`로 실행한다 (`&`로 부르면 끝나기 전에 다음 줄로 넘어감)
- 페이지 전체: 높이를 크게 (`--window-size=800,4000`)
- 정리 도구 헤더: `http://localhost:3000/start`, 높이 300

| 목적 | 더할 인자 |
|---|---|
| 애니메이션이 **끝난** 상태 | `--force-prefers-reduced-motion` |
| 타이핑 중간·자동 강조 | `--virtual-time-budget`을 늘림 (JS 타이머는 진행됨) |

## 3. 알아 둘 한계 (보고에 적는다)
- 헤드리스는 **CSS 애니메이션 시계를 거의 진행시키지 않는다.** 캡처가 애니메이션 중간에서 멈춘 모습이면 동작 줄이기 캡처로 끝 상태를 다시 본다. 움직이는 모습 자체는 "브라우저에서 확인 필요"
- 창 폭 400px 아래는 실제로 더 넓게 그려질 수 있다. 폰 확인은 브라우저 개발자 도구의 모바일 보기나 실기기로
- 타이핑은 첫 이름으로 시작한다. **가장 긴 이름**으로 줄바꿈을 보려면 이름 목록 맨 앞에 잠깐 넣고 찍은 뒤 **원래대로 되돌리고** `git diff`로 되돌린 것을 확인한다

## 4. 보고
- 찍은 그림을 직접 열어 본다 (Read). 본 것만 "확인했다"고 쓴다
- 폭마다 한 줄: 무엇이 맞고 무엇이 이상한지 (잘림, 줄바꿈, 겹침, 빈 곳)
- 사용자에게 그림 경로를 줄 때는 전체 절대 경로로 쓴다
