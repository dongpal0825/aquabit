// 테스트 데이터: 계정 3개, 어항 1개, 과제 2개, 진주 약간
// 사용: npm run db:init && npm run seed
const bcrypt = require('bcrypt');
const { pool, tx } = require('../src/db');

const PASSWORD = 'aquabit123';
const USERS = [
  { username: 'test1', nickname: '민규', pearls: 120, food: 6 },
  { username: 'test2', nickname: '수빈', pearls: 80, food: 3 },
  { username: 'test3', nickname: '지우', pearls: 45, food: 0 },
];
const INVITE_CODE = 'AQUA77';

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000);
  const ymd = (days) => new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);

  await tx(async (c) => {
    const ids = [];
    for (const u of USERS) {
      const [r] = await c.query(
        'INSERT INTO users (username, password_hash, nickname, pearls) VALUES (?, ?, ?, ?)',
        [u.username, hash, u.nickname, u.pearls]
      );
      ids.push(r.insertId);
      await c.query(
        `INSERT INTO transactions (user_id, amount, balance_after, type, description)
         VALUES (?, ?, ?, 'seed', '테스트 지급')`,
        [r.insertId, u.pearls, u.pearls]
      );
      if (u.food) await c.query("INSERT INTO inventory (user_id, item, quantity) VALUES (?, 'food', ?)", [r.insertId, u.food]);
    }
    await c.query("INSERT INTO inventory (user_id, item, quantity) VALUES (?, 'ribbon', 1)", [ids[0]]);

    const [t] = await c.query(
      'INSERT INTO tanks (name, invite_code, owner_id) VALUES (?, ?, ?)', ['클라우드 7팀', INVITE_CODE, ids[0]]
    );
    const tankId = t.insertId;

    // 물고기: 각자 다른 종류/단계/상태
    const fish = [
      { name: '뽀글이', species: 'goldfish', color: 'orange', food: 17, stage: 3, fed: hoursAgo(2), acc: 'ribbon' },
      { name: '파랑이', species: 'tropical', color: 'sky', food: 6, stage: 2, fed: hoursAgo(30), acc: null },
      { name: '빵빵이', species: 'puffer', color: 'lemon', food: 4, stage: 1, fed: hoursAgo(80), acc: null },
    ];
    for (let i = 0; i < 3; i++) {
      await c.query('INSERT INTO tank_members (tank_id, user_id, joined_at) VALUES (?, ?, ?)', [tankId, ids[i], hoursAgo(100 - i)]);
      const f = fish[i];
      await c.query(
        `INSERT INTO fish (tank_id, user_id, name, species, color, accessory, food_total, stage, last_fed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tankId, ids[i], f.name, f.species, f.color, f.acc, f.food, f.stage, f.fed]
      );
    }

    await c.query(
      `INSERT INTO tasks (tank_id, creator_id, assignee_id, title, reward, due_date) VALUES
        (?, ?, ?, 'Apache 리버스 프록시 설정하기', 60, ?),
        (?, ?, ?, 'ERD 그리고 schema.sql 검토', 40, ?)`,
      [tankId, ids[0], ids[1], ymd(3), tankId, ids[0], ids[2], ymd(5)]
    );

    // test1: 어제까지 6일 연속 출석 → 오늘 접속하면 7일 연속 보너스
    const kst = (days) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(now.getTime() + days * 86400000));
    for (let d = 6; d >= 1; d--) {
      await c.query('INSERT INTO attendance (user_id, att_date, streak) VALUES (?, ?, ?)', [ids[0], kst(-d), 7 - d]);
    }

    const chat = [
      [0, '어항 만들었어요! 코드 AQUA77로 들어오세요', 6],
      [1, '들어왔어요. 파랑이 귀엽다', 5],
      [2, '빵빵이 배고파 보이네요 ㅋㅋ', 4],
    ];
    for (const [who, body, h] of chat) {
      await c.query('INSERT INTO messages (tank_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', [tankId, ids[who], body, hoursAgo(h)]);
    }
  });

  console.log('시드 완료');
  console.log(`  계정: ${USERS.map((u) => u.username).join(', ')} / 비밀번호: ${PASSWORD}`);
  console.log(`  어항: 클라우드 7팀 (초대 코드 ${INVITE_CODE}, 대표 test1)`);
  console.log('  test1은 6일 연속 출석 상태 (오늘 접속하면 7일 보너스), 지우의 물고기는 먹이 1개면 성장');
  await pool.end();
})().catch(async (e) => {
  console.error('시드 실패:', e.message);
  if (e.code === 'ER_DUP_ENTRY') console.error('이미 데이터가 있어요. npm run db:init 으로 초기화한 뒤 다시 실행하세요.');
  await pool.end();
  process.exit(1);
});
