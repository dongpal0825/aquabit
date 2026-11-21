// 게임 테이블을 모두 지우고 처음부터 다시 만든다. 기존 게임 데이터(계정, 어항, 채팅 등)는 모두 삭제된다.
// 사용: npm run db:init   → 이어서 npm run seed 로 테스트 데이터
// 데이터를 지우지 않고 테이블만 맞추려면 npm run db:migrate
const { prepareSchema, connect } = require('./init-community-db.cjs');

const GAME_TABLES = ['feedings', 'attendance', 'inventory', 'transactions', 'tasks', 'messages', 'fish', 'tank_members', 'tanks', 'users'];

(async () => {
  const connection = await connect();
  try {
    await connection.query(`DROP TABLE IF EXISTS ${GAME_TABLES.join(', ')}`);
    await prepareSchema(connection);
    // 서버가 켜져 있어도 안전하도록 세션 테이블은 지우지 않고 비우기만 한다 (로그인은 모두 풀림)
    await connection.query('TRUNCATE TABLE game_sessions').catch(() => {});
    console.log(`게임 테이블을 새로 만들었어요: ${connection.config.database}`);
  } finally { await connection.end(); }
})().catch((e) => {
  console.error('스키마 생성 실패:', e.code || e.message);
  process.exitCode = 1;
});
