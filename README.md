# 팀플 파일 버전 도우미

팀 프로젝트에서 파일이 `최종_진짜최종_v3` 식으로 뒤섞이는 문제를 해결하는 버전 관리 도우미입니다.
외부 AI API 없이 해시·diff 같은 일반 로직으로 동작합니다.

## 핵심 기능 (구현 예정)

| 기능 | 설명 |
|------|------|
| 업로드 | 파일 해시(SHA-256)로 변경 여부를 확인하고, 바뀐 경우에만 버전 번호를 자동 부여 |
| 히스토리 | 누가 언제 어떤 버전을 올렸는지 확인 |
| 비교 | 두 버전의 차이 표시 (텍스트·코드 파일 우선) |

## 기술 스택

- Next.js (App Router, TypeScript)
- SQLite: Node 내장 `node:sqlite` 사용 (Node.js 22.13 이상 필요)
- 배포: 네이버클라우드플랫폼(NCP)

## 실행 방법

```bash
npm install
npm run dev     # http://localhost:3000
```

배포용 빌드는 `npm run build` 후 `npm start`.

## 폴더 구조

```
.
├── app/
│   ├── upload/    # 업로드 페이지
│   ├── history/   # 히스토리 페이지
│   ├── compare/   # 비교 페이지
│   └── api/       # API 라우트
├── lib/           # 공통 로직 (DB 연결 등)
├── db/            # 스키마(schema.sql)와 SQLite 파일(app.sqlite, git 제외)
└── storage/       # 업로드된 실제 파일 (git 제외)
```

## DB 스키마

`db/schema.sql` 참고. `lib/db.ts`를 처음 불러올 때 `db/app.sqlite`가 생성되고 스키마가 적용됩니다.

- `files`: 관리 대상 파일 (이름 기준)
- `versions`: 파일의 각 버전 (버전 번호, 해시, 크기, 올린 사람, 메모, 저장 경로, 시각)

## 주의

- `storage/`와 `db/*.sqlite`는 git에 올리지 않습니다. 서버를 옮길 때는 두 곳을 함께 백업하세요.
