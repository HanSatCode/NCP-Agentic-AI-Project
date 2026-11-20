// SQLite 연결. Node 내장 node:sqlite를 써서 네이티브 빌드가 필요한 추가 패키지를 두지 않음
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

export const db = new DatabaseSync(path.join(root, "db", "app.sqlite"));
db.exec("PRAGMA foreign_keys = ON;");
db.exec(readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
