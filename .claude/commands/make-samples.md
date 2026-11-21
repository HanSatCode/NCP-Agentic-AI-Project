---
description: 예시 파일을 만들고 수정 날짜를 manifest.json에 맞춘다
---
1. `npm run samples`를 실행한다. `public/samples/manifest.json`의 파일을 만들고 디스크 수정 날짜를 맞춘다.
2. 파일을 더하거나 바꿀 때는 `manifest.json`(수정 날짜·가명 작성자)과 `scripts/make-samples.ts`의 CONTENT(본문)를 함께 고치고, `public/samples/expected.json`에 기대 결과를 적는다.
3. 실제 이름이나 개인정보는 쓰지 않는다. 작성자도 가명이다 (D-16).
4. 끝나면 `npm run check`로 확인한다.
