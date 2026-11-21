// 게임 테이블 만들기·호환 확장 (기존 데이터를 지우지 않음).
// 사용: npm run db:migrate   (예전 이름 npm run db:game:init 도 같은 동작)
// 처음부터 다시 만들려면 npm run db:init (모든 게임 데이터 삭제)
require('../config');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

/** 열린 연결에 schema.sql을 적용하고, PNG 물고기 종류·색 ENUM과 hue 열을 맞춘다 */
async function prepareSchema(connection) {
  let sql = await fs.readFile(path.join(__dirname, '../sql/schema.sql'), 'utf8');
  sql = sql.replace(/CREATE DATABASE[\s\S]*?;\s*USE aquabit;/, '');
  await connection.query(sql);
  const [columns] = await connection.query("SHOW COLUMNS FROM fish LIKE 'hue'");
  if (!columns.length) await connection.query('ALTER TABLE fish ADD COLUMN hue SMALLINT UNSIGNED NULL');
  const catalog = require('../game/domain/creatures.json');
  const species = [...new Set([...Object.keys(require('../game/domain/creature-aliases.json')), ...Object.keys(catalog)])];
  await connection.query(`ALTER TABLE fish MODIFY species ENUM(${species.map(key => connection.escape(key)).join(',')}) NOT NULL DEFAULT 'gold'`);
  await connection.query("ALTER TABLE fish MODIFY color ENUM('original','orange','coral','lemon','mint','sky','grape') NOT NULL DEFAULT 'original'");

  // 닉네임 중복 금지 (예전 DB에는 이 제약이 없음). 이미 겹치는 닉네임은 뒤에 가입한 쪽에 번호를 붙여 바꾼 뒤 제약을 건다.
  const [nickIndex] = await connection.query("SHOW INDEX FROM users WHERE Key_name = 'uq_users_nickname'");
  if (!nickIndex.length) {
    const [dups] = await connection.query(
      `SELECT u.id, u.nickname FROM users u
        WHERE EXISTS (SELECT 1 FROM users o WHERE o.nickname = u.nickname AND o.id < u.id) ORDER BY u.id`
    );
    for (const d of dups) {
      let n = 2, next;
      do { const tail = String(n++); next = d.nickname.slice(0, 12 - tail.length) + tail; }
      while ((await connection.query('SELECT 1 FROM users WHERE nickname = ?', [next]))[0].length);
      await connection.query('UPDATE users SET nickname = ? WHERE id = ?', [next, d.id]);
      console.log(`  닉네임 중복 정리: ${d.nickname} → ${next} (사용자 ${d.id})`);
    }
    await connection.query('ALTER TABLE users ADD UNIQUE KEY uq_users_nickname (nickname)');
  }

  // 홈페이지 공지: 표가 비어 있으면 data/notices.json을 같은 번호로 가져온다 (기존 /notices/:id 주소 유지)
  const [[{ count }]] = await connection.query('SELECT COUNT(*) AS count FROM site_notices');
  if (!count) {
    let notices = [];
    try { notices = JSON.parse(await fs.readFile(path.join(__dirname, '../data/notices.json'), 'utf8')); } catch { /* 파일 없음 */ }
    for (const n of notices.filter((x) => x && Number.isInteger(x.id))) {
      const body = (Array.isArray(n.body) ? n.body : [n.body]).filter(Boolean).join('\n');
      await connection.query('INSERT INTO site_notices (id, category, title, body, notice_date) VALUES (?, ?, ?, ?, ?)',
        [n.id, n.category || 'notice', n.title, body, n.date]);
    }
    if (notices.length) console.log(`  홈페이지 공지 ${notices.length}개를 data/notices.json에서 가져왔어요.`);
  }
}

async function connect() {
  if (process.env.GAME_DATABASE_ENABLED !== 'true') throw new Error('.env에 GAME_DATABASE_ENABLED=true 설정 후 실행하세요.');
  const { db } = require('../server/game/config');
  const connection = await mysql.createConnection({ ...db, multipleStatements: true });
  await connection.query("SET time_zone = '+00:00'");
  return connection;
}

module.exports = { prepareSchema, connect };

if (require.main === module) {
  (async () => {
    const connection = await connect();
    try {
      await prepareSchema(connection);
      console.log('게임 테이블과 PNG 종 호환 설정을 준비했습니다. 기존 데이터는 삭제하지 않았습니다.');
    } finally { await connection.end(); }
  })().catch(error => { console.error('게임 DB 준비 실패:', error.code || error.message); process.exitCode = 1; });
}
