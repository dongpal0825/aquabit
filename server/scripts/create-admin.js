// .env의 ADMIN_USERNAME / ADMIN_PASSWORD로 관리자 계정을 만들거나 비밀번호를 다시 맞춘다.
// 사용: npm run admin:create   (seed도 이 함수를 부른다)
const bcrypt = require('bcrypt');
const { pool } = require('../src/db');
const { admin } = require('../src/config');

async function createAdmin(conn = pool) {
  if (!admin.enabled) return { skipped: 'ADMIN_ENABLED=false' };
  if (!admin.password) return { skipped: 'ADMIN_PASSWORD가 비어 있음' };
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(admin.username)) throw new Error('ADMIN_USERNAME은 영문, 숫자, _ 4~20자여야 해요.');
  const hash = await bcrypt.hash(admin.password, 10);
  await conn.query(
    `INSERT INTO users (username, password_hash, nickname, is_admin) VALUES (?, ?, '관리자', 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_admin = 1`,
    [admin.username, hash]
  );
  return { username: admin.username };
}

module.exports = { createAdmin };

if (require.main === module) {
  createAdmin()
    .then((r) => console.log(r.skipped ? `관리자 계정을 만들지 않았어요 (${r.skipped})` : `관리자 계정 준비 완료: ${r.username}`))
    .catch((e) => { console.error('관리자 계정 생성 실패:', e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
