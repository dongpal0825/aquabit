// sql/schema.sql 을 실행해 테이블을 (다시) 만든다. 기존 데이터는 지워진다.
// 사용: npm run db:init
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'sql', 'schema.sql'), 'utf8')
    .replace(/CREATE DATABASE[\s\S]*?;\s*USE \w+;/, `USE \`${db.database}\`;`);
  const conn = await mysql.createConnection({ ...db, multipleStatements: true });
  await conn.query("SET time_zone = '+00:00'");
  await conn.query(sql);
  // 서버가 켜져 있어도 안전하도록 세션 테이블은 지우지 않고 비우기만 한다 (로그인은 모두 풀림)
  await conn.query('TRUNCATE TABLE sessions').catch(() => {});
  await conn.end();
  console.log(`스키마를 만들었어요: ${db.database}`);
})().catch((e) => {
  console.error('스키마 생성 실패:', e.message);
  process.exit(1);
});
