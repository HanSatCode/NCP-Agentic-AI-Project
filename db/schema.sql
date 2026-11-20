-- 팀플 파일 버전 도우미 DB 스키마 (SQLite)
-- 모든 문장이 IF NOT EXISTS라서 앱 시작 때마다 실행해도 안전함

-- 관리 대상 파일 (예: "보고서.docx"). 같은 이름으로 올리면 같은 파일의 새 버전으로 봄
CREATE TABLE IF NOT EXISTS files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 파일의 버전 하나 = 업로드 한 번
CREATE TABLE IF NOT EXISTS versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id      INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version_no   INTEGER NOT NULL,           -- 1부터 자동 부여
  sha256       TEXT    NOT NULL,           -- 내용 해시. 직전 버전과 같으면 변경 없음으로 판단
  size_bytes   INTEGER NOT NULL,
  uploader     TEXT    NOT NULL,           -- 올린 사람 이름 (로그인 기능 전까지는 직접 입력)
  memo         TEXT,                       -- 변경 내용 메모 (선택)
  storage_path TEXT    NOT NULL,           -- storage/ 기준 상대 경로
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (file_id, version_no)
);

-- 같은 내용이 이미 올라왔는지 해시로 빠르게 찾기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_versions_file_hash ON versions (file_id, sha256);
