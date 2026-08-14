// WAL checkpoint：备份前调用，把 -wal 内容合并回 forge.db（TRUNCATE）。
// 用法：node lib/db/checkpoint.mjs <registry 数据目录>
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = process.argv[2];
if (!dir) { console.error('用法: node lib/db/checkpoint.mjs <数据目录>'); process.exit(2); }
const dbPath = join(dir, 'forge.db');
if (!existsSync(dbPath)) { console.log('无 forge.db，跳过'); process.exit(0); }
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
console.log('checkpoint 完成：' + dbPath);
